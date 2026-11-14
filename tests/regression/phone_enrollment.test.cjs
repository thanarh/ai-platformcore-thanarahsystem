require('../../apps/api/node_modules/reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PhoneEnrollmentService } = require('../../apps/api/dist/modules/auth/phone-enrollment.service');
const { AuthService } = require('../../apps/api/dist/modules/auth/auth.service');
const { normalizeAuthPhone } = require('../../apps/api/dist/modules/auth/phone-number');
const { roleAfterPhoneVerification } = require('../../apps/api/dist/modules/auth/phone-admin-policy');
const { Role } = require('../../apps/api/dist/common/decorators/roles.decorator');
const { WhatsappService } = require('../../apps/api/dist/modules/whatsapp/whatsapp.service');
process.env.SESSION_SECRET = 'test-only-otp-secret-not-an-application-credential';
const PHONE = '+966501234567';
const details = { firstName: 'Test', lastName: 'User' };

function harness(existing = null) {
  const state = { rows: [], proofs: [], sent: [], budgets: [], confirmations: 0 };
  const challenges = {
    findOne: (filter) => ({ sort: async () => [...state.rows].reverse().find((row) => row.phoneHash === filter.phoneHash) }),
    create: async (row) => {
      const saved = { _id: String(state.rows.length), ...row };
      state.rows.push(saved); return saved;
    },
    deleteOne: async ({ _id }) => { state.rows = state.rows.filter((row) => row._id !== _id); },
    updateMany: async ({ phoneHash }, { $set }) => {
      state.rows.filter((row) => row.phoneHash === phoneHash && !row.usedAt).forEach((row) => Object.assign(row, $set));
    },
    findOneAndUpdate: async (filter) => {
      const row = [...state.rows].reverse().find((row) => row.phoneHash === filter.phoneHash
        && row.purpose === filter.purpose && !row.usedAt
        && row.expiresAt > filter.expiresAt.$gt && row.attempts < filter.attempts.$lt);
      if (!row) return null;
      row.attempts++; return { ...row };
    },
    updateOne: async ({ _id, expiresAt }, { $set }) => {
      const row = state.rows.find((row) => row._id === _id && !row.usedAt && row.expiresAt > expiresAt.$gt);
      if (!row) return { modifiedCount: 0 };
      Object.assign(row, $set); return { modifiedCount: 1 };
    },
  };
  const enrollments = {
    create: async (row) => { state.proofs.push(row); return row; },
  };
  const users = {
    findAnyByPhone: async () => existing,
    confirmPhoneOwnership: async (user, role) => {
      state.confirmations++; return { ...user, role, isPhoneVerified: true };
    },
    ensureTenantOwnerRole: async (user) => user,
  };
  const whatsapp = {
    consumeBudget: async (...args) => state.budgets.push(args),
    sendPlatformOtp: async (phone, code) => state.sent.push({ phone, code }),
  };
  const service = new PhoneEnrollmentService(users, {}, whatsapp, challenges, enrollments, {});
  return { service, state, whatsapp, challenges };
}

test('Country normalization handles national numbers, Arabic digits, and shared dialing codes', () => {
  assert.equal(normalizeAuthPhone('050 123 4567', 'SA'), PHONE);
  assert.equal(normalizeAuthPhone('+٩٦٦٥٠١٢٣٤٥٦٧', 'SA'), PHONE);
  assert.equal(normalizeAuthPhone('(416) 555-0123', 'CA'), '+14165550123');
  assert.equal(normalizeAuthPhone('(202) 555-0123', 'US'), '+12025550123');
  assert.throws(() => normalizeAuthPhone('+14165550123', 'US'), { status: 400 });
  assert.throws(() => normalizeAuthPhone('+966501234567', 'US'), { status: 400 });
  assert.throws(() => normalizeAuthPhone('123', 'SA'), { status: 400 });
  assert.throws(() => normalizeAuthPhone('+966501234567', 'ZZ'), { status: 400 });
  assert.throws(() => normalizeAuthPhone('call +966501234567'), { status: 400 });
  assert.throws(() => normalizeAuthPhone('+966501234567 ext 3'), { status: 400 });
});

test('Only exact verified admin phones are promoted, while owners and existing roles stay intact', () => {
  for (const phone of ['+966532441566', '+966536384171']) {
    assert.equal(roleAfterPhoneVerification(phone, Role.TENANT_OWNER), Role.ADMIN);
    assert.equal(roleAfterPhoneVerification(phone, Role.OWNER), Role.OWNER);
  }
  assert.equal(roleAfterPhoneVerification('+966532441567', Role.USER), Role.USER);
  assert.equal(roleAfterPhoneVerification(PHONE, Role.ADMIN), Role.ADMIN);
  assert.equal(roleAfterPhoneVerification('+96653', Role.USER), Role.USER);
});

for (const purpose of ['login', 'register']) {
  for (const exists of [true, false]) {
    test(`${purpose}: ${exists ? 'existing' : 'new'} phone receives real transport invocation with no account disclosure`, async () => {
      const { service, state } = harness(exists ? { isActive: true, role: Role.USER } : null);
      const result = await service.requestCode(PHONE, purpose, 'test-client', 'SA');
      assert.equal(state.sent.length, 1);
      assert.match(state.sent[0].code, /^\d{6}$/);
      assert.equal(result.code, undefined);
      assert.equal(result.userExists, undefined);
      assert.equal(result.expiresInSeconds, 300);
      assert.equal(state.budgets.length, 4);
      assert.notEqual(state.rows[0].codeHash, state.sent[0].code);
      const verified = await service.verifyCode({ phone: PHONE, code: state.sent[0].code, purpose });
      assert.equal(verified.next, exists ? 'authenticated' : 'complete_registration');
      assert.equal(verified.accessToken, undefined);
      if (!exists) {
        assert.match(verified.enrollmentToken, /^[\w-]{43}$/);
        assert.notEqual(state.proofs[0].tokenHash, verified.enrollmentToken);
        assert.equal(state.proofs[0].phoneNumber, PHONE);
      } else assert.equal(state.confirmations, 1);
      await assert.rejects(() => service.verifyCode({ phone: PHONE, code: state.sent[0].code, purpose }), { status: 401 });
    });
  }
}

test('Wrong codes, expiry, and exhausted attempts cannot issue an enrollment proof', async () => {
  const { service, state } = harness();
  await service.requestCode(PHONE, 'register', 'ip');
  const code = state.sent[0].code;
  const wrong = code === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(() => service.verifyCode({ phone: PHONE, code: wrong, purpose: 'register' }), { status: 401 });
  }
  await assert.rejects(() => service.verifyCode({ phone: PHONE, code, purpose: 'register' }), { status: 401 });
  state.rows[0].attempts = 0;
  state.rows[0].expiresAt = new Date(Date.now() - 1);
  await assert.rejects(() => service.verifyCode({ phone: PHONE, code, purpose: 'register' }), { status: 401 });
  assert.equal(state.proofs.length, 0);
  assert.equal(state.confirmations, 0);
});

test('A code is purpose-bound and concurrent verification only succeeds once', async () => {
  const { service, state } = harness();
  await service.requestCode(PHONE, 'register', 'ip');
  const payload = { phone: PHONE, code: state.sent[0].code, purpose: 'register' };
  await assert.rejects(() => service.verifyCode({ ...payload, purpose: 'login' }), { status: 401 });
  const results = await Promise.allSettled([service.verifyCode(payload), service.verifyCode(payload)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(state.proofs.length, 1);
});

test('Resend cooldown applies across login/register; resend invalidates the previous code', async () => {
  const { service, state } = harness();
  await service.requestCode(PHONE, 'register', 'ip');
  await assert.rejects(() => service.requestCode(PHONE, 'login', 'ip'), { status: 429 });
  state.rows[0].lastSentAt = new Date(Date.now() - 61_000);
  await service.requestCode(PHONE, 'login', 'ip');
  await assert.rejects(() => service.verifyCode({
    phone: PHONE, code: state.sent[0].code, purpose: 'register',
  }), { status: 401 });
  assert.equal(state.rows[0].usedAt instanceof Date, true);
});

test('Sender failures are explicit, remove the unsent challenge, and never claim success', async () => {
  const { service, state, whatsapp } = harness();
  whatsapp.sendPlatformOtp = async () => { throw new Error('simulated unlinked sender'); };
  await assert.rejects(() => service.requestCode(PHONE, 'register', 'ip'), { status: 503 });
  assert.equal(state.rows.length, 0);
  whatsapp.consumeBudget = async () => { const error = new Error('quota'); error.status = 429; throw error; };
  await assert.rejects(() => service.requestCode(PHONE, 'register', 'ip'), { status: 429 });
});

test('Admin promotion requires correct OTP and never reactivates disabled accounts', async () => {
  const { service, state } = harness({ isActive: true, role: Role.USER });
  await service.requestCode('+966532441566', 'login', 'ip');
  await assert.rejects(() => service.verifyCode({ phone: '+966532441566', code: 'bad', purpose: 'login' }), { status: 400 });
  assert.equal(state.confirmations, 0);
  const result = await service.verifyCode({ phone: '+966532441566', code: state.sent[0].code, purpose: 'login' });
  assert.equal(result.user.role, Role.ADMIN);
  const disabled = harness({ isActive: false, role: Role.ADMIN });
  await disabled.service.requestCode(PHONE, 'login', 'ip');
  await assert.rejects(() => disabled.service.verifyCode({
    phone: PHONE, code: disabled.state.sent[0].code, purpose: 'login',
  }), { status: 403 });
  assert.equal(disabled.state.confirmations, 0);
});

test('Registration requires a proof and rejects phone/role overrides and incomplete optional credentials', async () => {
  const { service } = harness();
  for (const data of [
    { ...details }, { ...details, enrollmentToken: 'x'.repeat(43), phone: PHONE },
    { ...details, enrollmentToken: 'x'.repeat(43), role: Role.ADMIN },
    { ...details, enrollmentToken: 'x'.repeat(43), email: 'test@example.invalid' },
    { ...details, enrollmentToken: 'x'.repeat(43), password: 'Password123' },
  ]) {
    await assert.rejects(() => service.completeRegistration(data));
  }
});

test('Legacy email registration cannot bypass verified mobile enrollment', async () => {
  const { service } = harness();
  const auth = new AuthService({}, {}, {}, {}, {}, service);
  await assert.rejects(() => auth.register({
    ...details, email: 'legacy@example.invalid', password: 'Test-password-123',
  }), { status: 401 });
});

test('Baileys checks WhatsApp registration and send acknowledgment instead of inventing delivery', async () => {
  const service = new WhatsappService({}, {}, {}, {}, {});
  let exists = false;
  let acknowledged = false;
  let sends = 0;
  service.getSessionStatus = async () => ({ available: true });
  service.sockets.set('platform', {
    onWhatsApp: async () => [{ exists }],
    sendMessage: async () => { sends++; return acknowledged ? { key: { id: 'mock-provider-id' } } : undefined; },
  });
  await assert.rejects(() => service.sendPlatformOtp(PHONE, '123456'), { status: 400 });
  assert.equal(sends, 0);
  exists = true;
  await assert.rejects(() => service.sendPlatformOtp(PHONE, '123456'), { status: 503 });
  acknowledged = true;
  await service.sendPlatformOtp(PHONE, '123456');
  service.sockets.clear();
  await assert.rejects(() => service.sendPlatformOtp(PHONE, '123456'), { status: 503 });
});
