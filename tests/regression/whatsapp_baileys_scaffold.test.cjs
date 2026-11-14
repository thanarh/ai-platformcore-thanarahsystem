require('../../apps/api/node_modules/reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {
  WhatsappController, TenantWhatsappController,
} = require('../../apps/api/dist/modules/whatsapp/whatsapp.controller');
const { JwtAuthGuard } = require('../../apps/api/dist/common/guards/jwt-auth.guard');

test('Admin and tenant readiness surfaces report real blocked capability state', () => {
  const admin = new WhatsappController().getReadiness();
  const tenant = new TenantWhatsappController().getTenantReadiness();
  for (const result of [admin, tenant]) {
    assert.equal(result.available, false);
    assert.equal(result.integration, 'baileys');
    assert.equal(result.state, 'blocked');
    assert.equal(result.reason, 'package_security_policy');
    assert.equal(result.capabilities.linkSession, false);
    assert.equal(result.capabilities.receiveMessages, false);
    assert.equal(result.capabilities.sendMessages, false);
    assert.equal(result.capabilities.sendMedia, false);
  }
  assert.equal(tenant.capabilities.deliverVerificationCodes, false);
});

test('Readiness is not backed by Baileys or Meta Cloud, and no fake session data exists', () => {
  const app = read('apps/api/src/app.module.ts');
  const controller = read('apps/api/src/modules/whatsapp/whatsapp.controller.ts');
  const pkg = read('apps/api/package.json');
  assert.match(app, /WhatsappModule/);
  assert.doesNotMatch(app, /CloudModule|whatsapp-cloud/);
  assert.doesNotMatch(pkg, /"@whiskeysockets\/baileys"/);
  assert.doesNotMatch(controller, /QRCode|qrCode|sessionData|socket\.send/);
});

test('Dedicated messaging keys can reach only the reserved send API', async () => {
  const keyService = { validateKey: async () => ({
    scopes: ['whatsapp:send'], createdBy: '111111111111111111111111',
    tenantId: '222222222222222222222222', environment: 'live',
  }) };
  const guard = new JwtAuthGuard({ getAllAndOverride: () => false }, keyService);
  const request = { headers: { 'x-api-key': 'test-key' }, path: '/api/whatsapp/messages' };
  const context = { getHandler: () => null, getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }) };
  assert.equal(await guard.canActivate(context), true);
  assert.equal(request.user.tenantId, '222222222222222222222222');
  request.path = '/api/ai/chat';
  await assert.rejects(() => guard.canActivate(context), { status: 403 });
});

test('Reserved API authenticates scope/idempotency but always fails closed with 503', () => {
  const controller = new TenantWhatsappController();
  for (const user of [
    { role: 'OWNER' },
    { role: 'TENANT_OWNER' },
    { isApiKeyAuth: true, apiKeyScopes: ['whatsapp:send'], apiKeyEnvironment: 'live' },
  ]) {
    assert.throws(() => controller.sendMessage(user, 'request-1234', {}), error =>
      error.status === 503 && error.getResponse().code === 'WHATSAPP_TRANSPORT_BLOCKED');
  }
  assert.throws(() => controller.sendMessage({ role: 'USER' }, 'request-1234', {}), { status: 403 });
  assert.throws(() => controller.sendMessage(
    { isApiKeyAuth: true, apiKeyScopes: ['whatsapp:send'], apiKeyEnvironment: 'test' }, 'request-1234', {}),
  { status: 403 });
  assert.throws(() => controller.sendMessage(
    { role: 'OWNER' }, 'short', {}), { status: 400 });
});

test('Scaffold docs never claim sends, verification OTP or media upload are available', () => {
  const docs = read('docs/whatsapp-baileys-scaffold.md');
  assert.match(docs, /always returns HTTP 503/i);
  assert.match(docs, /does not enqueue/i);
  assert.match(docs, /login verification codes/i);
  assert.match(docs, /not yet implemented/i);
});
