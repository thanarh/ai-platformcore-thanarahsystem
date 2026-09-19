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
