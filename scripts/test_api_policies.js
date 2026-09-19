#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { TenantsService } = require('../apps/api/dist/modules/tenants/tenants.service');
const { AuthService } = require('../apps/api/dist/modules/auth/auth.service');

function fakeTenantModel() {
  const tenant = {
    _id: 'tenant-a',
    industry: 'general',
    subscription: { plan: 'free', status: 'free' },
    usagePolicy: { appDailyCoins: 500, appMessageCost: 50, apiDailyRequests: 50 },
    usageBalance: { day: new Date().toISOString().slice(0, 10), appCoinsUsed: 0, apiRequestsUsed: 0 },
  };
  return {
    tenant,
    async findById() { return tenant; },
    async findByIdAndUpdate(_id, update) {
      if (update.usageBalance) tenant.usageBalance = update.usageBalance;
      return tenant;
    },
    async findOneAndUpdate(_query, update) {
      const [field, amount] = Object.entries(update.$inc)[0];
      const key = field.split('.').pop();
      const limit = key === 'apiRequestsUsed'
        ? tenant.usagePolicy.apiDailyRequests
        : tenant.usagePolicy.appDailyCoins;
      if ((tenant.usageBalance[key] || 0) + amount > limit) return null;
      tenant.usageBalance[key] = (tenant.usageBalance[key] || 0) + amount;
      return tenant;
    },
  };
}

async function testUsage() {
  const model = fakeTenantModel();
  const service = new TenantsService(model);
  for (let i = 0; i < 10; i += 1) await service.consumeChatUsage('tenant-a', false);
  const status = await service.getUsageStatus('tenant-a');
  assert.equal(status.appCoinsRemaining, 0);
  await assert.rejects(() => service.consumeChatUsage('tenant-a', false), (error) => error.getStatus() === 429);

  model.tenant.usageBalance.apiRequestsUsed = 49;
  await service.consumeChatUsage('tenant-a', true);
  await assert.rejects(() => service.consumeChatUsage('tenant-a', true), (error) => error.getStatus() === 429);

  await service.refundChatUsage('tenant-a', true);
  assert.equal((await service.getUsageStatus('tenant-a')).apiRequestsRemaining, 1);
}

async function testRefresh() {
  const raw = 'valid-refresh-token';
  const storedHash = crypto.createHash('sha256').update(raw).digest('hex');
  let rotated = null;
  const user = {
    _id: { toString: () => 'user-a' },
    email: 'user@example.com',
    role: 'USER',
    tenantId: { toString: () => 'tenant-a' },
    isActive: true,
    refreshToken: storedHash,
  };
  const users = {
    async findById() { return user; },
    async updateRefreshToken(_id, token) { rotated = token; },
    toPublic(value) { return { email: value.email, role: value.role }; },
  };
  const jwt = {
    verify(token) { if (token !== raw) throw new Error('bad token'); return { sub: 'user-a' }; },
    sign(_payload, options) { return options.secret === 'refresh-secret' ? 'rotated-refresh' : 'new-access'; },
  };
  const config = {
    get(key) {
      return {
        'jwt.secret': 'access-secret',
        'jwt.refreshSecret': 'refresh-secret',
        'jwt.expiresIn': '15m',
        'jwt.refreshExpiresIn': '7d',
      }[key];
    },
  };
  const service = new AuthService(users, {}, jwt, config, {});
  const result = await service.refresh(raw);
  assert.equal(result.accessToken, 'new-access');
  assert.equal(result.refreshToken, 'rotated-refresh');
  assert.equal(rotated, 'rotated-refresh');
  await assert.rejects(() => service.refresh('invalid'), (error) => error.getStatus() === 401);
}

(async () => {
  await testUsage();
  await testRefresh();
  console.log('API_POLICY_TEST_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
