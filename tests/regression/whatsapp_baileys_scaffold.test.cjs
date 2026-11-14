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
    id: 'delivery-id',
    status: 'pending',
  });
  assert.deepEqual(calls[0], ['rate', keyUser.apiKeyId]);
  assert.deepEqual(calls[1], [tenantId, body, 'request-1234', keyUser.apiKeyId]);
  assert.throws(() => controller.sendMessage({ role: 'USER', tenantId }, 'request-1234', body), { status: 403 });
  assert.throws(() => controller.sendMessage({ ...keyUser, apiKeyEnvironment: 'test' }, 'request-1234', body), { status: 403 });
  assert.throws(() => controller.sendMessage(keyUser, 'short', body), { status: 400 });
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
  const auth = read('apps/api/src/modules/auth/auth.service.ts');
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
