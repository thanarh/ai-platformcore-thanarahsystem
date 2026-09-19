import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('authentication keeps password policy and tenant identity in JWT payload', () => {
  const source = read('apps/api/src/modules/auth/auth.service.ts');
  assert.match(source, /data\.password\.length < 8/);
  assert.match(source, /tenantId: user\.tenantId\?\.toString\(\)/);
  assert.match(source, /this\.jwtService\.verify\(refreshToken/);
  assert.match(source, /storedTokenMatches/);
});

test('conversation reads and mutations enforce tenant/user ownership', () => {
  const source = read('apps/api/src/modules/conversations/conversations.service.ts');
  assert.match(source, /tenantId: new Types\.ObjectId\(tenantId\)/);
  assert.match(source, /userId: new Types\.ObjectId\(userId\)/);
  assert.match(source, /if \(tenantId && conversation\.tenantId\.toString\(\) !== tenantId\.toString\(\)\)/);
  assert.match(source, /if \(userId && conversation\.userId\.toString\(\) !== userId\.toString\(\)\)/);
  assert.match(source, /status: \{ \$ne: 'deleted' \}/);
});

test('AI stream contract carries tenant/user context and SSE response', () => {
  const source = read('apps/api/src/modules/ai/ai.service.ts');
  assert.match(source, /tenantId: data\.tenantId/);
  assert.match(source, /userId: data\.userId/);
  assert.match(source, /stream: true/);
  assert.match(source, /Content-Type', 'text\/event-stream/);
  assert.match(source, /data\.res\.write\(`data: \$\{JSON\.stringify\(\{ delta:/);
  assert.match(source, /data: \[DONE\]/);
});

test('tenant-scoped AI and message routes remain present', () => {
  const aiController = read('apps/api/src/modules/ai/ai.controller.ts');
  const messagesController = read('apps/api/src/modules/messages/messages.controller.ts');
  assert.match(aiController, /chat\/stream/);
  assert.match(messagesController, /:conversationId/);
  assert.match(messagesController, /@CurrentUser\(\) user/);
  assert.match(messagesController, /user\.tenantId/);
});

test('tenant user listing exists, is tenant-scoped, and excludes credentials', () => {
  const tenantsController = read('apps/api/src/modules/tenants/tenants.controller.ts');
  const usersService = read('apps/api/src/modules/users/users.service.ts');
  assert.match(tenantsController, /@Get\(':id\/users'\)/);
  assert.match(tenantsController, /user\.tenantId\.toString\(\) !== id/);
  assert.match(tenantsController, /findPublicByTenant\(id\)/);
  assert.match(usersService, /-passwordHash/);
  assert.match(usersService, /-refreshToken/);
  assert.match(usersService, /tenantId: new Types\.ObjectId\(tenantId\)/);
});

test('global owner user listing is role-protected and credential-safe', () => {
  const adminController = read('apps/api/src/modules/admin/admin.controller.ts');
  const usersService = read('apps/api/src/modules/users/users.service.ts');
  assert.match(adminController, /@Get\('users'\)/);
  assert.match(adminController, /@Roles\(Role\.ADMIN, Role\.OWNER\)/);
  assert.match(adminController, /getAllUsers\(\)/);
  assert.match(usersService, /findAllPublic\(\)/);
  assert.match(usersService, /-passwordHash/);
  assert.match(usersService, /-refreshToken/);
});

test('customer administration is role-protected and uses allowlisted updates', () => {
  const adminController = read('apps/api/src/modules/admin/admin.controller.ts');
  const adminService = read('apps/api/src/modules/admin/admin.service.ts');
  assert.match(adminController, /@Get\('users\/:id\/customer'\)/);
  assert.match(adminController, /@Patch\('users\/:id\/customer'\)/);
  assert.match(adminController, /@Roles\(Role\.ADMIN, Role\.OWNER\)/);
  assert.match(adminService, /You cannot deactivate your own account/);
  assert.match(adminService, /organization\.usagePolicy =/);
  assert.doesNotMatch(adminService, /updateCustomer[\s\S]*this\.tenantsService\.update\([^,]+,\s*data\)/);
});
