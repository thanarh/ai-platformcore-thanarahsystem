import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('conversation titles and pins remain tenant/user scoped', () => {
  const service = read('apps/api/src/modules/conversations/conversations.service.ts');
  const controller = read('apps/api/src/modules/conversations/conversations.controller.ts');
  const schema = read('apps/api/src/modules/conversations/schemas/conversation.schema.ts');

  assert.match(service, /tenantId: new Types\.ObjectId\(tenantId\)/);
  assert.match(service, /userId: new Types\.ObjectId\(userId\)/);
  assert.match(service, /sort\(\{ isPinned: -1, lastMessageAt: -1 \}\)/);
  assert.match(service, /createTitle/);
  assert.match(controller, /@Post\(':id\/pin'\)/);
  assert.match(controller, /user\.tenantId\.toString\(\)/);
  assert.match(schema, /isPinned: -1, lastMessageAt: -1/);
});

test('AI Context Profile has CRUD, tenant isolation, and deterministic suggestions', () => {
  const schema = read('apps/api/src/modules/context-profile/schemas/context-profile.schema.ts');
  const service = read('apps/api/src/modules/context-profile/context-profile.service.ts');
  const controller = read('apps/api/src/modules/context-profile/context-profile.controller.ts');

  assert.match(schema, /ContextProfileSchema\.index\(\{ tenantId: 1, userId: 1 \}, \{ unique: true \}\)/);
  assert.match(service, /findOne\(\{ tenantId: new Types\.ObjectId\(tenantId\), userId: new Types\.ObjectId\(userId\) \}\)/);
  assert.match(service, /deleteOne\(\{[\s\S]*tenantId: new Types\.ObjectId\(tenantId\),[\s\S]*userId: new Types\.ObjectId\(userId\)/);
  assert.match(service, /mode: 'welcome'/);
  assert.match(service, /mode: 'personalized'/);
  assert.match(controller, /@UseGuards\(JwtAuthGuard\)/);
});

test('personalization is passed into AI context and cache identity', () => {
  const aiService = read('apps/api/src/modules/ai/ai.service.ts');
  const router = read('services/ai-engine/app/router/intelligence_router.py');
  const cache = read('services/ai-engine/app/response_cache.py');
  const webHome = read('apps/web/src/app/(dashboard)/chat/page.tsx');

  assert.match(aiService, /contextProfile/);
  assert.match(router, /Thanarah Context Profile/);
  assert.match(cache, /"contextProfile": tenant_config\.get\("contextProfile", \{\}\)/);
  assert.doesNotMatch(webHome, /const SUGGESTIONS/);
  assert.match(webHome, /contextProfilesApi\.suggestions/);
});