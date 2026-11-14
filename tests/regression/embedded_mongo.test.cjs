require('../../apps/api/node_modules/reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const mongoose = require('../../apps/api/node_modules/mongoose');
const {
  EmbeddedIntegrationSchema, EmbeddedIdentitySchema, EmbeddedBootstrapSchema, EmbeddedSessionSchema,
} = require('../../apps/api/dist/modules/embedded/schemas/embedded.schema');
const { EmbeddedService } = require('../../apps/api/dist/modules/embedded/embedded.service');
const { EmbeddedSessionsService } = require('../../apps/api/dist/modules/embedded/embedded-sessions.service');
const { Role } = require('../../apps/api/dist/common/decorators/roles.decorator');

test('Mongo enforces one-use bootstraps, stable tenant identity, per-user sessions, and immediate key revocation', {
  skip: process.env.EMBEDDED_MONGO_TEST !== '1',
  timeout: 120_000,
}, async () => {
  if (!process.env.MONGODB_URI) throw new Error('The isolated integration test requires MongoDB.');
  const dbName = `thn_emb_test_${randomBytes(10).toString('hex')}`;
  const connection = mongoose.createConnection(process.env.MONGODB_URI, {
    dbName, serverSelectionTimeoutMS: 15_000,
  });
  try {
    try { await connection.asPromise(); }
    catch { throw new Error('Cannot connect to the isolated embedded integration database.'); }
    const integrations = connection.model('EmbeddedIntegration', EmbeddedIntegrationSchema.clone());
    const identities = connection.model('EmbeddedIdentity', EmbeddedIdentitySchema.clone());
    const bootstraps = connection.model('EmbeddedBootstrap', EmbeddedBootstrapSchema.clone());
    const sessions = connection.model('EmbeddedSession', EmbeddedSessionSchema.clone());
    await Promise.all([integrations.init(), identities.init(), bootstraps.init(), sessions.init()]);
    const sessionService = new EmbeddedSessionsService(integrations, sessions, {
      findById: async () => ({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', isActive: true, isPhoneVerified: true, tenantId: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: Role.ADMIN }),
    }, { findById: async () => ({ isActive: true, status: 'active' }) });
    const app = new EmbeddedService(integrations, identities, bootstraps, sessions, connection, sessionService);
    const integrationId = new mongoose.Types.ObjectId();
    const ownerTenant = new mongoose.Types.ObjectId();
    const key = `thn_embed_${randomBytes(32).toString('base64url')}`;
    await integrations.create({
      _id: integrationId, tenantId: ownerTenant, createdBy: new mongoose.Types.ObjectId(),
      name: 'Isolated fixture', allowedOrigins: ['https://one.example', 'https://two.example'],
      keyHash: createHash('sha256').update(key).digest('hex'), keyPrefix: 'thn_embed_test…',
    });
    const bootstrapFor = (externalUserId, origin = 'https://one.example') =>
      app.bootstrap(integrationId.toString(), key, { externalUserId, origin });

    try {
      await app.config(integrationId.toString(), 'https://other.example');
      assert.fail('An origin outside the allowlist must be rejected.');
    } catch (error) { assert.equal(error.status, 403); }
    await assert.rejects(() => app.bootstrap(integrationId.toString(), key, {
      externalUserId: 'person-1', origin: 'https://one.example/path',
    }), { status: 400 });
    const badKey = `${key.slice(0, -1)}${key.endsWith('a') ? 'b' : 'a'}`;
    await assert.rejects(() => app.bootstrap(integrationId.toString(), badKey, {
      externalUserId: 'person-1', origin: 'https://one.example',
    }), { status: 401 });

    const firstBootstrap = await bootstrapFor('partner-user-1');
    const secondBootstrap = await bootstrapFor('partner-user-2', 'https://two.example');
    assert.doesNotMatch(firstBootstrap.framePath, new RegExp(firstBootstrap.code));
    assert.equal(firstBootstrap.expiresInSeconds, 60);
    const first = await app.exchange(integrationId.toString(), {
      code: firstBootstrap.code, nonce: firstBootstrap.nonce, origin: 'https://one.example',
    });
    const second = await app.exchange(integrationId.toString(), {
      code: secondBootstrap.code, nonce: secondBootstrap.nonce, origin: 'https://two.example',
    });
    assert.equal(first.next, 'verify_phone');
    assert.equal(second.next, 'verify_phone');
    assert.notEqual(first.onboardingToken, second.onboardingToken);
    assert.equal(await sessions.countDocuments({ integrationId }), 2);
    await assert.rejects(() => app.exchange(integrationId.toString(), {
      code: firstBootstrap.code, nonce: firstBootstrap.nonce, origin: 'https://one.example',
    }), { status: 401 });
    await assert.rejects(() => app.exchange(integrationId.toString(), {
      code: secondBootstrap.code, nonce: secondBootstrap.nonce, origin: 'https://one.example',
    }), { status: 401 });

    const tenantId = new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
    const userId = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
    const subjectHash = createHash('sha256').update(`${integrationId.toString()}\0partner-user-existing`).digest('hex');
    await identities.create({ integrationId, subjectHash, tenantId, userId });
    const existingBootstrap = await bootstrapFor('partner-user-existing');
    const connected = await app.exchange(integrationId.toString(), {
      code: existingBootstrap.code, nonce: existingBootstrap.nonce, origin: 'https://one.example',
    });
    assert.equal(connected.next, 'authenticated');
    assert.equal(connected.user.tenantId, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(connected.user.role, Role.TENANT_OWNER);
    assert.equal(connected.user.isEmbedded, true);
    assert.equal(connected.user.embeddedIntegrationId, integrationId.toString());
    const priorSession = await sessions.findOne({ accessHash: createHash('sha256').update(connected.accessToken).digest('hex') });
    assert.ok(priorSession);

    const rotated = await app.rotate(integrationId.toString(), ownerTenant.toString());
    assert.ok(rotated.key);
    await assert.rejects(() => sessionService.authenticate(connected.accessToken), { status: 401 });
    await assert.rejects(() => app.bootstrap(integrationId.toString(), key, {
      externalUserId: 'partner-user-1', origin: 'https://one.example',
    }), { status: 401 });
    await app.revoke(integrationId.toString(), ownerTenant.toString());
    await assert.rejects(() => app.bootstrap(integrationId.toString(), rotated.key, {
      externalUserId: 'partner-user-1', origin: 'https://one.example',
    }), { status: 401 });
  } finally {
    try {
      if (connection.readyState === 1 && connection.name === dbName && /^thn_emb_test_[a-f0-9]{20}$/.test(dbName)) {
        await connection.dropDatabase();
      }
    } finally { await connection.close(); }
  }
});
