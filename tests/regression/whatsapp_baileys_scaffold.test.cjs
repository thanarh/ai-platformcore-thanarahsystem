require('../../apps/api/node_modules/reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { WhatsappController, TenantWhatsappController } =
  require('../../apps/api/dist/modules/whatsapp/whatsapp.controller');
const { WhatsappService } = require('../../apps/api/dist/modules/whatsapp/whatsapp.service');
const { JwtAuthGuard } = require('../../apps/api/dist/common/guards/jwt-auth.guard');
const { AuthService } = require('../../apps/api/dist/modules/auth/auth.service');
const {
  decryptWhatsappData,
  encryptWhatsappData,
  whatsappEncryptionKey,
} = require('../../apps/api/dist/modules/whatsapp/whatsapp.crypto');

const tenantId = '222222222222222222222222';

test('Admin platform and tenant session actions use separate scopes', async () => {
  const calls = [];
  const service = {
    getSessionStatus: async key => ({ available: false, state: 'disconnected', key }),
    startPlatformConnection: async () => ({ state: 'connecting', scope: 'platform' }),
    startTenantConnection: async id => ({ state: 'connecting', scope: id }),
    disconnect: async key => ({ success: true, key }),
  };
  const admin = new WhatsappController(service);
  const tenant = new TenantWhatsappController(service, {});
  assert.equal((await admin.getPlatformStatus()).key, 'platform');
  assert.deepEqual(await admin.connectPlatform(), { state: 'connecting', scope: 'platform' });
  assert.deepEqual(await tenant.connectTenant({ tenantId }), { state: 'connecting', scope: tenantId });
  assert.deepEqual(await tenant.disconnectTenant({ tenantId }), { success: true, key: `tenant:${tenantId}` });
});

test('Tenant message API enforces role, scope, live environment and idempotency', async () => {
  const calls = [];
  const service = {
    enqueueMessage: async (...args) => {
      calls.push(args);
      return { id: 'delivery-id', status: 'pending' };
    },
    getDelivery: async (...args) => args,
  };
  const keys = { consumeRateLimit: async id => calls.push(['rate', id]) };
  const controller = new TenantWhatsappController(service, keys);
  const body = { to: '+966501234567', type: 'text', text: 'مرحبًا', consentReference: 'consent-1042' };
  const keyUser = {
    tenantId,
    apiKeyId: '333333333333333333333333',
    isApiKeyAuth: true,
    apiKeyScopes: ['whatsapp:send'],
    apiKeyEnvironment: 'live',
  };
  assert.deepEqual(await controller.sendMessage(keyUser, 'request-1234', body), {
    ok: true,
    delivery: { id: 'delivery-id', status: 'pending' },
  });
  assert.deepEqual(calls[0], ['rate', keyUser.apiKeyId]);
  assert.deepEqual(calls[1], [tenantId, body, 'request-1234', keyUser.apiKeyId]);
  await assert.rejects(() => controller.sendMessage({ role: 'USER', tenantId }, 'request-1234', body), { status: 403 });
  await assert.rejects(() => controller.sendMessage({ ...keyUser, apiKeyEnvironment: 'test' }, 'request-1234', body), { status: 403 });
  await assert.rejects(() => controller.sendMessage(keyUser, 'short', body), { status: 400 });
});

test('API keys reach only messaging, status, and consent routes allowed by scope', async () => {
  const keyService = { validateKey: async () => ({
    scopes: ['whatsapp:send'], createdBy: '111111111111111111111111',
    tenantId, environment: 'live',
  }) };
  const guard = new JwtAuthGuard({ getAllAndOverride: () => false }, keyService);
  const request = { headers: { 'x-api-key': 'test-key' }, path: '/api/whatsapp/messages', method: 'POST' };
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  assert.equal(await guard.canActivate(context), true);
  assert.equal(request.user.tenantId, tenantId);
  request.path = `/api/whatsapp/messages/${'a'.repeat(24)}`;
  request.method = 'GET';
  assert.equal(await guard.canActivate(context), true);
  request.path = '/api/whatsapp/consents';
  request.method = 'POST';
  await assert.rejects(() => guard.canActivate(context), { status: 403 });
  request.path = '/api/ai/chat';
  await assert.rejects(() => guard.canActivate(context), { status: 403 });
});

test('Baileys payload validation requires international phone, consent and safe media', () => {
  const service = new WhatsappService({}, {}, {}, {});
  assert.deepEqual(service.validateMessage({
    to: '+966501234567',
    type: 'text',
    text: 'رسالة تجريبية',
    consentReference: 'consent-1042',
  }), {
    to: '966501234567',
    type: 'text',
    text: 'رسالة تجريبية',
    consentReference: 'consent-1042',
  });
  assert.throws(() => service.validateMessage({
    to: '0501234567', type: 'text', text: 'test', consentReference: 'consent-1042',
  }), { status: 400 });
  assert.throws(() => service.validateMessage({
    to: '+966501234567', type: 'text', text: 'test', consentReference: '',
  }), { status: 400 });
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
  assert.equal(service.validateMessage({
    to: '+966501234567',
    type: 'image',
    media: { mimeType: 'image/png', base64: png },
    consentReference: 'consent-1042',
  }).type, 'image');
  assert.throws(() => service.validateMessage({
    to: '+966501234567',
    type: 'image',
    media: { mimeType: 'image/png', base64: Buffer.from('not an image').toString('base64') },
    consentReference: 'consent-1042',
  }), { status: 400 });
});

test('Stored WhatsApp data uses authenticated encryption with fresh nonces', () => {
  const key = whatsappEncryptionKey('unit-test-session-secret-that-is-long-enough');
  const first = encryptWhatsappData('credential material', key);
  const second = encryptWhatsappData('credential material', key);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /credential material/);
  assert.equal(decryptWhatsappData(first, key), 'credential material');
  assert.throws(() => decryptWhatsappData(first, whatsappEncryptionKey('different-unit-test-secret-long-enough')));
});

test('Phone OTP, opt-out, encryption and queue contracts are present without a Cloud fallback', () => {
  const app = read('apps/api/src/app.module.ts');
  const auth = read('apps/api/src/modules/auth/auth.service.ts')
    + read('apps/api/src/modules/auth/phone-enrollment.service.ts');
  const whatsapp = read('apps/api/src/modules/whatsapp/whatsapp.service.ts');
  const pkg = read('package.json');
  assert.match(app, /WhatsappModule/);
  assert.match(pkg, /"@whiskeysockets\/baileys"/);
  assert.match(auth, /requestPhoneCode/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(whatsapp, /messages\.upsert/);
  assert.match(whatsapp, /WHATSAPP_RECIPIENT_CONSENT_REQUIRED/);
  assert.match(whatsapp, /findOneAndUpdate/);
  assert.doesNotMatch(app, /CloudModule|whatsapp-cloud/);
});

test('Queue stores one encrypted message and returns the same delivery for identical retries', async () => {
  const key = whatsappEncryptionKey('isolated-unit-test-encryption-key-32-plus');
  let row;
  const deliveryModel = {
    findOne: async () => row || null,
    create: async data => {
      row = { ...data, _id: '444444444444444444444444', attempts: 0 };
      return row;
    },
  };
  const consentModel = { findOne: async query => (
    query.tenantId.toString() === tenantId ? { reference: 'consent-1042' } : null
  ) };
  const sessionModel = { findOne: () => ({
    lean: async () => ({ enabled: true, lastConnectedAt: new Date() }),
  }) };
  const service = new WhatsappService(sessionModel, {}, deliveryModel, consentModel, {});
  service.encryptionKey = () => key;
  service.consumeBudget = async () => undefined;
  const input = { to: '+966501234567', type: 'text', text: 'private payload', consentReference: 'consent-1042' };
  const first = await service.enqueueMessage(tenantId, input, 'operation-1042');
  const second = await service.enqueueMessage(tenantId, input, 'operation-1042');
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'pending');
  assert.doesNotMatch(row.encryptedPayload, /private payload/);
  assert.equal(JSON.parse(decryptWhatsappData(row.encryptedPayload, key)).text, 'private payload');
  await assert.rejects(
    () => service.enqueueMessage(tenantId, { ...input, text: 'different' }, 'operation-1042'),
    { status: 409 },
  );
});

test('Unlinked tenants and missing consent cannot enqueue a delivery', async () => {
  const key = whatsappEncryptionKey('isolated-unit-test-encryption-key-32-plus');
  const service = new WhatsappService(
    { findOne: () => ({ lean: async () => null }) },
    {},
    { findOne: async () => null },
    { findOne: async () => null },
    {},
  );
  service.encryptionKey = () => key;
  const input = { to: '+966501234567', type: 'text', text: 'test', consentReference: 'consent-1042' };
  await assert.rejects(() => service.enqueueMessage(tenantId, input, 'operation-1042'), { status: 403 });
  service.consentModel.findOne = async () => ({ reference: 'consent-1042' });
  await assert.rejects(() => service.enqueueMessage(tenantId, input, 'operation-1042'), { status: 503 });
});

test('Status lookup always includes the caller tenant and excludes other tenants', async () => {
  let filter;
  const service = new WhatsappService({}, {}, {
    findOne: async query => { filter = query; return null; },
  }, {}, {});
  await assert.rejects(() => service.getDelivery(tenantId, '444444444444444444444444'), { status: 404 });
  assert.equal(filter.tenantId.toString(), tenantId);
  assert.equal(filter._id, '444444444444444444444444');
});

test('Verified existing phone receives a normal authenticated session', async () => {
  const user = { _id: { toString: () => '111111111111111111111111' }, isPhoneVerified: true };
  const users = {
    updateLastLogin: async () => undefined,
    updateRefreshToken: async () => undefined,
    toPublic: () => ({ phoneNumber: '+966501234567' }),
  };
  const auth = new AuthService(users, {}, {}, {}, {}, {
    verifyCode: async () => ({ next: 'authenticated', user }),
  });
  auth.generateTokens = async () => ({ accessToken: 'test-access', refreshToken: 'test-refresh' });
  const payload = { phone: '+966501234567', code: '123456', purpose: 'login' };
  const result = await auth.verifyPhoneCode(payload);
  assert.equal(result.accessToken, 'test-access');
  assert.equal(result.code, undefined);
  assert.equal(result.next, 'authenticated');
});

test('Verified new phone receives only an enrollment proof, never login tokens', async () => {
  const enrollment = { next: 'complete_registration', enrollmentToken: 'opaque-test-proof' };
  const auth = new AuthService({}, {}, {}, {}, {}, {
    verifyCode: async () => enrollment,
  });
  const result = await auth.verifyPhoneCode({
    phone: '+966501234567', code: '123456', purpose: 'login',
  });
  assert.deepEqual(result, enrollment);
  assert.equal(result.accessToken, undefined);
});

test('Persistent usage buckets reject an exhausted quota without bypassing limits', async () => {
  const service = new WhatsappService({}, {}, {}, {}, {
    findOneAndUpdate: async () => { const error = new Error('duplicate bucket'); error.code = 11000; throw error; },
  });
  await assert.rejects(() => service.consumeBudget('unit-test', 1, 60), { status: 429 });
});

test('Session restoration saves the complete encrypted credentials, not a partial update', async () => {
  const encryptionKey = whatsappEncryptionKey('isolated-unit-test-encryption-key-32-plus');
  let row = null;
  const sessionModel = {
    findOneAndUpdate: (_filter, update) => ({
      select: async () => {
        row ??= { ...update.$setOnInsert };
        return { ...row };
      },
    }),
    updateOne: async (_filter, update) => { Object.assign(row, update.$set || {}); },
    findOne: () => ({ lean: async () => row }),
  };
  let capturedConfig;
  let callbacks;
  const factory = config => {
    capturedConfig = config;
    callbacks = {};
    return {
      ev: { on: (name, callback) => { callbacks[name] = callback; } },
      end: () => undefined,
    };
  };
  const makeService = () => {
    const service = new WhatsappService(sessionModel, {}, {}, {}, {});
    service.encryptionKey = () => encryptionKey;
    service.socketFactory = factory;
    return service;
  };
  const first = makeService();
  await first.startPlatformConnection();
  capturedConfig.auth.creds.registered = true;
  await callbacks['creds.update']({ registered: true });
  const stored = JSON.parse(decryptWhatsappData(row.encryptedCreds, encryptionKey));
  assert.equal(stored.registered, true);
  assert.ok(stored.noiseKey);
  assert.ok(stored.signedIdentityKey);
  assert.doesNotMatch(row.encryptedCreds, /noiseKey/);
  await first.onModuleDestroy();
  const restarted = makeService();
  await restarted.startPlatformConnection();
  assert.equal(capturedConfig.auth.creds.registered, true);
  assert.ok(capturedConfig.auth.creds.noiseKey.private instanceof Uint8Array);
  await restarted.onModuleDestroy();
});

test('Arabic integration guide JavaScript example is syntactically valid', () => {
  const { spawnSync } = require('node:child_process');
  const guide = read('docs/WHATSAPP_API_IMPLEMENTATION_GUIDE_AR.md');
  const scripts = [...guide.matchAll(/```js\n([\s\S]*?)```/g)];
  assert.ok(scripts.length > 0);
  for (const [, script] of scripts) {
    const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], {
      input: script, encoding: 'utf8',
    });
    assert.equal(checked.status, 0, checked.stderr);
  }
});
