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
const { MessagesService } = require('../../apps/api/dist/modules/messages/messages.service');
const { JwtAuthGuard } = require('../../apps/api/dist/common/guards/jwt-auth.guard');
const { AuthService } = require('../../apps/api/dist/modules/auth/auth.service');
const {
  decryptWhatsappData,
  encryptWhatsappData,
  whatsappEncryptionKey,
} = require('../../apps/api/dist/modules/whatsapp/whatsapp.crypto');
const { quickThanarahReply } = require('../../apps/api/dist/modules/whatsapp/thanarah-profile');

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

test('WhatsApp routing configuration normalizes recipients and validates the forwarding switch', async () => {
  let session;
  const sessionModel = {
    findOneAndUpdate: (_filter, update) => ({
      select: async () => {
        session ??= { ...update.$setOnInsert };
        return session;
      },
    }),
    updateOne: async (_filter, update) => { Object.assign(session, update.$set); },
    findOne: () => ({
      select: () => ({ lean: async () => session }),
    }),
  };
  const service = new WhatsappService(sessionModel, {}, {}, {}, {});
  const config = await service.updateBotSettings(`tenant:${tenantId}`, {
    forwardingPhones: ['+966501234567'],
    forwardIncomingEnabled: true,
    autoReplyEnabled: true,
  });
  assert.deepEqual(config, {
    forwardingPhones: ['+966501234567'],
    forwardIncomingEnabled: true,
    autoReplyEnabled: true,
  });
  assert.equal(session.forwardingConfigured, true);
  assert.deepEqual(await service.getBotSettings(`tenant:${tenantId}`), config);
  await assert.rejects(
    () => service.updateBotSettings(`tenant:${tenantId}`, {
      forwardingPhones: [],
      forwardIncomingEnabled: true,
      autoReplyEnabled: false,
    }),
    { status: 400 },
  );
});

test('Tenant auto-replies are enabled by default until an administrator saves a choice', async () => {
  const service = new WhatsappService({
    findOne: () => ({
      select: () => ({
        lean: async () => ({ autoReplyEnabled: false, autoReplyConfigured: false }),
      }),
    }),
  });
  const tenantSettings = await service.getBotSettings(`tenant:${tenantId}`);
  const platformSettings = await service.getBotSettings('platform');
  assert.equal(tenantSettings.autoReplyEnabled, true);
  assert.equal(platformSettings.autoReplyEnabled, false);
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

test('WhatsApp transcript messages are encrypted at rest and decrypted for authorized reads', async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'messages-encryption-test-secret-long-enough-123';
  let stored;
  class FakeMessage {
    constructor(data) {
      Object.assign(this, data);
      this._id = '444444444444444444444444';
      this.createdAt = new Date();
      this.save = async () => {
        stored = this;
        return this;
      };
    }
  }
  FakeMessage.find = () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [{
          ...stored,
          save: undefined,
        }],
      }),
    }),
  });
  const service = new MessagesService(
    FakeMessage,
    { findById: async () => ({ metadata: { channel: 'whatsapp' } }) },
  );
  try {
    await service.create({
      tenantId,
      userId: '555555555555555555555555',
      conversationId: '666666666666666666666666',
      role: 'user',
      content: 'رسالة واتساب سرية',
    });
    assert.equal(stored.contentEncrypted, true);
    assert.notEqual(stored.content, 'رسالة واتساب سرية');
    const messages = await service.findByConversation('666666666666666666666666', 10);
    assert.equal(messages[0].content, 'رسالة واتساب سرية');
    assert.equal(messages[0].contentEncrypted, false);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
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
  let dispatches = 0;
  service.requestDispatch = () => { dispatches += 1; };
  const input = { to: '+966501234567', type: 'text', text: 'private payload', consentReference: 'consent-1042' };
  const first = await service.enqueueMessage(tenantId, input, 'operation-1042');
  const second = await service.enqueueMessage(tenantId, input, 'operation-1042');
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'pending');
  assert.equal(dispatches, 1, 'new deliveries should start dispatch immediately');
  assert.doesNotMatch(row.encryptedPayload, /private payload/);
  assert.equal(JSON.parse(decryptWhatsappData(row.encryptedPayload, key)).text, 'private payload');
  await assert.rejects(
    () => service.enqueueMessage(tenantId, { ...input, text: 'different' }, 'operation-1042'),
    { status: 409 },
  );
});

test('Incoming WhatsApp text uses a tenant-scoped conversation and replies once', async () => {
  const rows = [];
  const sent = [];
  const consent = { status: 'active', reference: 'consent-2048' };
  const socket = {
    sendMessage: async (...args) => {
      sent.push(args);
      return { key: { id: args[2].messageId } };
    },
  };
  const inboundModel = {
    create: async row => {
      if (rows.some(item => item.providerMessageId === row.providerMessageId)) {
        const error = new Error('duplicate inbound');
        error.code = 11000;
        throw error;
      }
      rows.push({ ...row });
    },
    updateOne: async (filter, update) => {
      Object.assign(rows.find(item => item.providerMessageId === filter.providerMessageId), update.$set);
    },
  };
  const consentModel = {
    findOne: () => ({ lean: async () => consent }),
    exists: async () => true,
    updateOne: async () => undefined,
  };
  const conversations = {
    findOrCreateWhatsAppConversation: async (...args) => {
      assert.equal(args[0], tenantId);
      return { _id: '555555555555555555555555' };
    },
  };
  const ai = {
    chat: async data => {
      assert.equal(data.tenantId, tenantId);
      assert.equal(data.content, 'ما أوقات العمل؟');
      return { content: 'نعمل من التاسعة صباحًا.' };
    },
  };
  const service = new WhatsappService(
    {
      findOne: () => ({
        select: () => ({
          lean: async () => ({
            forwardingPhones: [],
            forwardIncomingEnabled: false,
            autoReplyEnabled: true,
          }),
        }),
      }),
    }, {}, {}, consentModel, {}, {}, inboundModel, ai, conversations,
    { consumeChatUsage: async () => undefined },
  );
  service.encryptionKey = () => Buffer.alloc(32, 3);
  service.sockets.set(`tenant:${tenantId}`, socket);
  const message = {
    key: { id: 'incoming-001', remoteJid: '966501234567@s.whatsapp.net' },
    message: { extendedTextMessage: { text: 'ما أوقات العمل؟' } },
  };

  await service.handleInboundMessage(`tenant:${tenantId}`, socket, message);
  await service.handleInboundMessage(`tenant:${tenantId}`, socket, message);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], '966501234567@s.whatsapp.net');
  assert.ok(sent[0][1].text.endsWith('نعمل من التاسعة صباحًا.'));
  assert.match(sent[0][1].text, /مساعد آلي/);
  assert.equal(rows[0].status, 'replied');
});

test('Tenant inbound messages are saved to the WhatsApp inbox when AI replies are off', async () => {
  const rows = [];
  const messages = [];
  let encryptedPhone;
  const key = whatsappEncryptionKey('tenant-inbox-test-secret-long-enough-123');
  const service = new WhatsappService(
    {
      findOne: () => ({
        select: () => ({
          lean: async () => ({
            forwardingPhones: [],
            forwardIncomingEnabled: false,
            autoReplyEnabled: false,
            autoReplyConfigured: true,
          }),
        }),
      }),
    },
    {},
    {},
    { findOne: () => ({ lean: async () => null }) },
    {},
    {},
    {
      create: async row => { rows.push({ ...row }); },
      updateOne: async (_filter, update) => Object.assign(rows[0], update.$set),
    },
    {},
    {
      findOrCreateWhatsAppConversation: async (...args) => {
        encryptedPhone = args[3];
        return { _id: '555555555555555555555555', messageCount: 0 };
      },
      incrementMessageCount: async () => undefined,
    },
    {},
    {
      create: async message => { messages.push(message); },
    },
  );
  service.encryptionKey = () => key;
  const socket = { sendMessage: async () => assert.fail('AI is disabled; do not send a reply') };
  service.sockets.set(`tenant:${tenantId}`, socket);
  await service.handleInboundMessage(`tenant:${tenantId}`, socket, {
    key: { id: 'inbox-only-01', remoteJid: '966501234567@s.whatsapp.net' },
    message: { conversation: 'أريد معرفة الأسعار' },
  });

  assert.equal(rows[0].status, 'received');
  assert.ok(rows[0].contactHash);
  assert.equal(decryptWhatsappData(rows[0].encryptedContent, key), 'أريد معرفة الأسعار');
  assert.equal(decryptWhatsappData(encryptedPhone, key), '+966501234567');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, 'أريد معرفة الأسعار');
});

test('STOP persists an opt-out before AI processing or administrator forwarding', async () => {
  let aiCalls = 0;
  let savedConsent;
  const service = new WhatsappService(
    {}, {}, {},
    {
      findOne: () => ({ lean: async () => null }),
      findOneAndUpdate: async (_filter, update) => { savedConsent = update.$set; },
    },
    {}, {},
    { create: async () => assert.fail('opt-out must not be forwarded') },
    { chat: async () => { aiCalls += 1; return { content: 'unexpected' }; } },
    {},
    {},
  );
  service.sockets.set(`tenant:${tenantId}`, { sendMessage: async () => assert.fail('must not send') });
  await service.handleInboundMessage(`tenant:${tenantId}`, service.sockets.get(`tenant:${tenantId}`), {
    key: { id: 'incoming-no-consent', remoteJid: '966501234567@s.whatsapp.net' },
    message: { conversation: 'إلغاء' },
  });
  assert.equal(savedConsent.status, 'revoked');
  assert.equal(savedConsent.source, 'inbound-stop');
  assert.equal(aiCalls, 0);
});

test('Platform WhatsApp answers company questions and flags interested contacts for admins', async () => {
  const sent = [];
  const rows = [];
  let fallbackAiCalls = 0;
  const sessionModel = {
    findOne: () => ({
      select: () => ({
        lean: async () => ({
          forwardingPhones: ['+966501111111'],
          forwardIncomingEnabled: true,
          autoReplyEnabled: true,
          autoReplyConfigured: true,
        }),
      }),
    }),
  };
  const inboundModel = {
    create: async row => { rows.push({ ...row }); },
    find: () => ({
      select: () => ({
        sort: () => ({
          limit: () => ({ lean: async () => [] }),
        }),
      }),
    }),
    updateOne: async (_filter, update) => {
      const row = rows[0];
      Object.assign(row, update.$set || {});
    },
  };
  const socket = {
    user: { id: '966500000000:2@s.whatsapp.net' },
    sendMessage: async (...args) => {
      sent.push(args);
      return { key: { id: `sent-${sent.length}` } };
    },
  };
  const service = new WhatsappService(
    sessionModel, {}, {}, { findOne: () => ({ lean: async () => null }) }, {}, {},
    inboundModel,
    { chatStateless: async () => { fallbackAiCalls += 1; return { content: 'unexpected' }; } },
    {}, {},
  );
  service.encryptionKey = () => whatsappEncryptionKey('platform-whatsapp-test-key-that-is-long-enough');
  service.sockets.set('platform', socket);

  await service.handleInboundMessage('platform', socket, {
    key: { id: 'platform-inbound-01', remoteJid: '966501234567@s.whatsapp.net' },
    message: { conversation: 'أنا مهتم بخدمات ثنارة' },
  });

  assert.equal(sent.length, 3, 'send an admin notice, forward the original and reply to the contact');
  assert.match(sent[0][1].text, /عميل مهتم بخدمات ثنارة/);
  assert.match(sent[0][1].text, /\+966501234567/);
  assert.deepEqual(sent[1][1], {
    forward: {
      key: { id: 'platform-inbound-01', remoteJid: '966501234567@s.whatsapp.net' },
      message: { conversation: 'أنا مهتم بخدمات ثنارة' },
    },
    force: true,
  });
  assert.match(sent[2][1].text, /يسعدنا اهتمامك بثنارة/);
  assert.equal(fallbackAiCalls, 0, 'common Thanarah questions use the immediate verified answer');
  assert.match(quickThanarahReply('مين انتم؟'), /ثنارة شركة تقنية/);
  assert.equal(rows[0].status, 'replied');
  assert.equal(rows[0].forwardFailureCount, 0);
  assert.ok(rows[0].forwardedAt);
  assert.ok(rows[0].encryptedContent);
  assert.ok(rows[0].encryptedReply);
});

test('Platform forwards non-text media without sending it to the AI engine', async () => {
  const sent = [];
  const inboundRows = [];
  let aiCalls = 0;
  const socket = {
    sendMessage: async (...args) => {
      sent.push(args);
      return { key: { id: `forward-${sent.length}` } };
    },
  };
  const service = new WhatsappService(
    {
      findOne: () => ({
        select: () => ({
          lean: async () => ({
            forwardingPhones: ['+966501111111'],
            forwardIncomingEnabled: true,
            autoReplyEnabled: true,
            autoReplyConfigured: true,
          }),
        }),
      }),
    }, {}, {}, { findOne: () => ({ lean: async () => null }) }, {}, {},
    {
      create: async row => { inboundRows.push(row); },
      updateOne: async (_filter, update) => Object.assign(inboundRows[0], update.$set),
    },
    { chatStateless: async () => { aiCalls += 1; return { content: 'unexpected' }; } },
    {}, {},
  );
  service.sockets.set('platform', socket);
  const mediaMessage = {
    key: { id: 'platform-media-01', remoteJid: '966501234567@s.whatsapp.net' },
    message: { imageMessage: { mimetype: 'image/jpeg', caption: 'صورة' } },
  };

  await service.handleInboundMessage('platform', socket, mediaMessage);

  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1][1], { forward: mediaMessage, force: true });
  assert.equal(aiCalls, 0, 'non-text messages are forwarded but do not enter text generation');
  assert.equal(inboundRows[0].status, 'ignored');
});

test('Expired QR status is explicit and does not claim the session is connected', async () => {
  const service = new WhatsappService({
    findOne: () => ({ lean: async () => ({ connectionState: 'qr_pending', scope: 'tenant' }) }),
  });
  const result = await service.getSessionStatus(`tenant:${tenantId}`);
  assert.equal(result.state, 'qr_expired');
  assert.equal(result.available, false);
  assert.equal(result.qrDataUrl, null);
});

test('Automatic WhatsApp reconnect stops after its bounded attempts', async () => {
  let stateUpdate;
  const service = new WhatsappService({
    updateOne: async (_filter, update) => { stateUpdate = update.$set.connectionState; },
  });
  const scopeKey = `tenant:${tenantId}`;
  service.reconnectAttempts.set(scopeKey, 6);
  service.scheduleReconnect(scopeKey, 'tenant', tenantId);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.reconnectExhausted.has(scopeKey), true);
  assert.equal(stateUpdate, 'reconnect_failed');
  assert.equal(service.reconnectTimers.has(scopeKey), false);
});

test('Manual disconnect cancels a pending reconnect', async () => {
  let savedSessionFields;
  const service = new WhatsappService(
    { updateOne: async (_filter, update) => { savedSessionFields = update.$set; } },
    { deleteMany: async () => undefined },
  );
  const timer = setTimeout(() => assert.fail('reconnect must be cancelled'), 60_000);
  service.reconnectTimers.set('platform', timer);
  await service.disconnect('platform');
  assert.equal(service.reconnectTimers.has('platform'), false);
  assert.equal(timer._destroyed, true);
  assert.equal(savedSessionFields.connectionState, 'disconnected');
  assert.equal(savedSessionFields.encryptedCreds, null);
  assert.equal(savedSessionFields.forwardingPhones, undefined, 'disconnecting retains administrator routing settings');
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

test('Unreadable WhatsApp credentials require explicit QR relinking without deleting them automatically', async () => {
  const oldKey = whatsappEncryptionKey('previous-session-secret-is-not-current-123');
  const currentKey = whatsappEncryptionKey('current-session-secret-is-different-1234');
  const encryptedCreds = encryptWhatsappData(JSON.stringify({ registered: true }), oldKey);
  const row = {
    scopeKey: `tenant:${tenantId}`,
    scope: 'tenant',
    enabled: true,
    encryptedCreds,
  };
  let deletedAuthKeys = 0;
  let relinkStarted = false;
  const sessionModel = {
    findOneAndUpdate: () => ({ select: async () => row }),
    updateOne: async (_filter, update) => Object.assign(row, update.$set),
  };
  const service = new WhatsappService(
    sessionModel,
    { deleteMany: async () => { deletedAuthKeys += 1; } },
    {},
    {},
    {},
  );
  service.encryptionKey = () => currentKey;

  const failed = await service.startTenantConnection(tenantId);
  assert.equal(failed.state, 'session_key_mismatch');
  assert.equal(row.enabled, false);
  assert.equal(row.encryptedCreds, encryptedCreds, 'do not delete the saved session before user approval');
  assert.equal(deletedAuthKeys, 0);

  service.startConnection = async () => {
    relinkStarted = true;
    return { state: 'connecting' };
  };
  const relinked = await service.relinkTenantWithQr(tenantId);
  assert.deepEqual(relinked, { state: 'connecting' });
  assert.equal(relinkStarted, true);
  assert.equal(row.encryptedCreds, null);
  assert.equal(deletedAuthKeys, 1);
});

test('QR connect, open, and transient close expose the expected session states', async () => {
  let row = null;
  let callbacks = {};
  let config;
  const sessionModel = {
    findOneAndUpdate: (_filter, update) => ({
      select: async () => {
        row ??= { ...update.$setOnInsert };
        return { ...row };
      },
    }),
    updateOne: async (_filter, update) => { Object.assign(row, update.$set || {}); },
    findOne: () => ({ lean: async () => row }),
    deleteOne: async () => undefined,
  };
  const socket = {
    user: { id: '966501234567:44@s.whatsapp.net' },
    ev: {
      on: (name, callback) => { callbacks[name] = callback; },
    },
    end: () => undefined,
  };
  const service = new WhatsappService(
    sessionModel,
    { deleteMany: async () => undefined },
    { updateMany: async () => undefined },
  );
  service.encryptionKey = () => Buffer.alloc(32, 1);
  service.socketFactory = value => {
    config = value;
    return socket;
  };

  await service.startTenantConnection(tenantId);
  await callbacks['connection.update']({ qr: 'test-qr-payload' });
  let status = await service.getSessionStatus(`tenant:${tenantId}`);
  assert.equal(status.state, 'qr_pending');
  assert.match(status.qrDataUrl, /^data:image\/png;base64,/);
  assert.equal(config.printQRInTerminal, false);

  await callbacks['connection.update']({ connection: 'open' });
  status = await service.getSessionStatus(`tenant:${tenantId}`);
  assert.equal(status.state, 'connected');
  assert.equal(status.available, true);
  assert.equal(status.capabilities.receiveMessages, true);

  await callbacks['connection.update']({
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 503 } } },
  });
  status = await service.getSessionStatus(`tenant:${tenantId}`);
  assert.equal(status.state, 'reconnecting');
  assert.equal(status.available, false);
  await service.disconnect(`tenant:${tenantId}`);
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
