require('../../apps/api/node_modules/reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertEmbeddedOrigin, assertEmbeddedRoute, embeddedRole, embeddedHash, embeddedToken, normalizeEmbeddedOrigin,
} = require('../../apps/api/dist/modules/embedded/embedded.policy');
const { Role } = require('../../apps/api/dist/common/decorators/roles.decorator');

test('Embed origins are exact HTTPS origins, never broad hosts or paths', () => {
  assert.equal(normalizeEmbeddedOrigin('https://partner.example/'), 'https://partner.example');
  assert.equal(normalizeEmbeddedOrigin('https://partner.example:9443'), 'https://partner.example:9443');
  assert.throws(() => normalizeEmbeddedOrigin('https://partner.example/app'), { status: 400 });
  assert.throws(() => normalizeEmbeddedOrigin('https://*.partner.example'), { status: 400 });
  assert.throws(() => normalizeEmbeddedOrigin('javascript:alert(1)'), { status: 400 });
  assert.throws(() => normalizeEmbeddedOrigin('https://user:pass@partner.example'), { status: 400 });
  assert.throws(() => normalizeEmbeddedOrigin('http://partner.example'), { status: 400 });
  assert.throws(() => assertEmbeddedOrigin({ isActive: true, allowedOrigins: ['https://a.example'] }, 'https://b.example'), { status: 403 });
  assert.throws(() => assertEmbeddedOrigin({ isActive: false, allowedOrigins: ['https://a.example'] }, 'https://a.example'), { status: 403 });
  assert.doesNotThrow(() => assertEmbeddedOrigin({ isActive: true, allowedOrigins: ['https://a.example'] }, 'https://a.example'));
});

test('Embedded bearer tokens reach tenant routes only; global admin and integration keys stay forbidden', () => {
  for (const path of [
    '/api/conversations/abc', '/api/knowledge', '/api/files/extract',
    '/api/whatsapp/readiness', '/api/api-keys', '/api/notifications/ws-ticket',
    '/api/context-profile/me', '/api/tenants/my/usage', '/api/auth/me',
    '/api/embedded/123456789012345678901234/phone/request-code',
  ]) assert.doesNotThrow(() => assertEmbeddedRoute(path, 'GET'));
  for (const path of [
    '/api/admin/stats', '/api/admin/whatsapp/platform/status', '/api/tenants',
    '/api/tenants/123456789012345678901234', '/api/auth/logout',
    '/api/embedded/integrations', '/api/embedded/integrations/123456789012345678901234/rotate',
  ]) assert.throws(() => assertEmbeddedRoute(path, 'GET'), { status: 403 });
});

test('Admin account roles are tenant-scoped in an embed without changing stored roles', () => {
  assert.equal(embeddedRole(Role.ADMIN), Role.TENANT_OWNER);
  assert.equal(embeddedRole(Role.OWNER), Role.TENANT_OWNER);
  assert.equal(embeddedRole(Role.AI_ADMIN), Role.USER);
  assert.equal(embeddedRole(Role.USER), Role.USER);
});

test('Host bootstrap credentials have the expected strength and are one-purpose tokens', () => {
  for (const prefix of ['thn_embed', 'thb', 'thc', 'the', 'thr']) {
    const token = embeddedToken(prefix);
    assert.match(token, new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`));
    assert.match(embeddedHash(token), /^[a-f\d]{64}$/);
  }
});
