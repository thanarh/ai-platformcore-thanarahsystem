// Opt-in integration test: creates and drops ONLY a randomly named test database.
// Uses the configured connection without printing credentials or contacting WhatsApp.
require('../../apps/api/node_modules/reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const mongoose = require('../../apps/api/node_modules/mongoose');
const { PhoneEnrollmentService } = require('../../apps/api/dist/modules/auth/phone-enrollment.service');
const { UsersService } = require('../../apps/api/dist/modules/users/users.service');
const { TenantsService } = require('../../apps/api/dist/modules/tenants/tenants.service');
const { UserSchema } = require('../../apps/api/dist/modules/users/schemas/user.schema');
const { TenantSchema } = require('../../apps/api/dist/modules/tenants/schemas/tenant.schema');
const { WhatsappOtpChallengeSchema } = require('../../apps/api/dist/modules/auth/schemas/whatsapp-otp-challenge.schema');
const { PhoneEnrollmentSchema } = require('../../apps/api/dist/modules/auth/schemas/phone-enrollment.schema');
const { Role } = require('../../apps/api/dist/common/decorators/roles.decorator');
process.env.SESSION_SECRET = 'isolated-mongo-test-only-otp-secret-for-tests';

test('Real MongoDB atomically creates one phone account and workspace, with proof replay and rollback protection', {
  skip: process.env.PHONE_ENROLLMENT_MONGO_TEST !== '1',
  timeout: 120_000,
}, async (t) => {
  if (!process.env.MONGODB_URI) throw new Error('The opt-in test requires a configured MongoDB connection.');
  const dbName = `thn_phone_test_${randomBytes(10).toString('hex')}`;
  const connection = mongoose.createConnection(process.env.MONGODB_URI, {
    dbName, serverSelectionTimeoutMS: 15_000,
  });
  try {
    try { await connection.asPromise(); }
    catch { throw new Error('Cannot connect to the isolated MongoDB test database.'); }
    const usersModel = connection.model('User', UserSchema.clone());
    const tenantsModel = connection.model('Tenant', TenantSchema.clone());
    const challenges = connection.model('WhatsappOtpChallenge', WhatsappOtpChallengeSchema.clone());
    const proofs = connection.model('PhoneEnrollment', PhoneEnrollmentSchema.clone());
    await Promise.all([usersModel.init(), tenantsModel.init(), challenges.init(), proofs.init()]);
    const users = new UsersService(usersModel);
    const tenants = new TenantsService(tenantsModel);
    let sentCode = '';
    const whatsapp = {
      consumeBudget: async () => {},
      sendPlatformOtp: async (_phone, code) => { sentCode = code; },
    };
    const service = new PhoneEnrollmentService(users, tenants, whatsapp, challenges, proofs, connection);
    const details = { firstName: 'Isolated', lastName: 'Test' };
    const issueProof = async (phone) => {
      await challenges.updateMany({}, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });
      await service.requestCode(phone, 'register', 'test-runner');
      return service.verifyCode({ phone, code: sentCode, purpose: 'register' });
    };
    const mintProof = async (phoneNumber, expiresAt = new Date(Date.now() + 60_000)) => {
      const enrollmentToken = randomBytes(32).toString('base64url');
      await proofs.create({
        tokenHash: createHash('sha256').update(enrollmentToken).digest('hex'),
        phoneNumber, expiresAt,
      });
      return enrollmentToken;
    };

    await t.test('Concurrent completion of the same proof creates one account and one tenant', async () => {
      const proof = await issueProof('+966501234567');
      assert.equal(proof.next, 'complete_registration');
      const results = await Promise.allSettled([
        service.completeRegistration({ ...details, enrollmentToken: proof.enrollmentToken }),
        service.completeRegistration({ ...details, enrollmentToken: proof.enrollmentToken }),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(await usersModel.countDocuments(), 1);
      assert.equal(await tenantsModel.countDocuments(), 1);
      const user = await usersModel.findOne();
      assert.equal(user.isPhoneVerified, true);
      assert.equal(user.role, Role.TENANT_OWNER);
      assert.equal(user.email, undefined);
      assert.equal(user.passwordHash, undefined);
      await assert.rejects(() => service.completeRegistration({ ...details, enrollmentToken: proof.enrollmentToken }), { status: 401 });
      const existing = await issueProof('+966501234567');
      assert.equal(existing.next, 'authenticated');
      assert.equal(await tenantsModel.countDocuments(), 1);
    });

    await t.test('Two separately verified proofs for the same number cannot duplicate a tenant', async () => {
      const first = await mintProof('+966501234568');
      const second = await mintProof('+966501234568');
      const results = await Promise.allSettled([first, second].map((enrollmentToken) =>
        service.completeRegistration({ ...details, enrollmentToken })));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(await usersModel.countDocuments(), 2);
      assert.equal(await tenantsModel.countDocuments(), 2);
    });

    await t.test('A failed account write rolls back the tenant and proof, allowing a safe retry', async () => {
      const proof = await mintProof('+966501234569');
      const original = users.createPhoneUser.bind(users);
      users.createPhoneUser = async () => { throw new Error('Simulated write failure'); };
      await assert.rejects(() => service.completeRegistration({ ...details, enrollmentToken: proof }), /Simulated write failure/);
      assert.equal(await tenantsModel.countDocuments(), 2);
      users.createPhoneUser = original;
      await service.completeRegistration({ ...details, enrollmentToken: proof });
      assert.equal(await usersModel.countDocuments(), 3);
      assert.equal(await tenantsModel.countDocuments(), 3);
    });

    await t.test('Expired proofs and changed phones cannot create any records', async () => {
      const expired = await mintProof('+966501234570', new Date(Date.now() - 1000));
      await assert.rejects(() => service.completeRegistration({ ...details, enrollmentToken: expired }), { status: 401 });
      const proof = await mintProof('+966501234571');
      await assert.rejects(() => service.completeRegistration({
        ...details, enrollmentToken: proof, phone: '+966532441566',
      }), { status: 400 });
      assert.equal(await tenantsModel.countDocuments(), 3);
    });

    await t.test('The two admin numbers are promoted only after proof, and an existing owner is preserved', async () => {
      const tenant = await tenantsModel.findOne();
      await usersModel.create({
        ...details, phoneNumber: '+966532441566', isPhoneVerified: false,
        role: Role.USER, tenantId: tenant._id,
      });
      const existing = await issueProof('+966532441566');
      assert.equal(existing.next, 'authenticated');
      assert.equal(existing.user.role, Role.ADMIN);
      assert.equal(existing.user.isPhoneVerified, true);
      const newAdmin = await issueProof('+966536384171');
      const user = await service.completeRegistration({ ...details, enrollmentToken: newAdmin.enrollmentToken });
      assert.equal(user.role, Role.ADMIN);
      user.role = Role.OWNER; await user.save();
      const ownerLogin = await issueProof('+966536384171');
      assert.equal(ownerLogin.user.role, Role.OWNER);
    });

    await t.test('Optional email/password work, and an email conflict preserves the proof for correction', async () => {
      const proof = await mintProof('+966501234572');
      const credentials = { email: 'isolated@example.invalid', password: 'Test-only-password-123' };
      const user = await service.completeRegistration({ ...details, ...credentials, enrollmentToken: proof });
      assert.equal(user.phoneNumber, '+966501234572');
      assert.equal(await users.validatePassword(credentials.password, user.passwordHash), true);
      assert.equal((await users.findByEmail(credentials.email))._id.toString(), user._id.toString());
      const tenantCount = await tenantsModel.countDocuments();
      const nextProof = await mintProof('+966501234573');
      await assert.rejects(() => service.completeRegistration({
        ...details, ...credentials, enrollmentToken: nextProof,
      }), { status: 409 });
      assert.equal(await tenantsModel.countDocuments(), tenantCount);
      await service.completeRegistration({
        ...details, ...credentials, email: 'corrected@example.invalid', enrollmentToken: nextProof,
      });
      assert.equal(await tenantsModel.countDocuments(), tenantCount + 1);
    });
  } finally {
    try {
      if (connection.readyState === 1 && connection.name === dbName && /^thn_phone_test_[a-f0-9]{20}$/.test(dbName)) {
        await connection.dropDatabase();
      }
    } finally { await connection.close(); }
  }
});
