import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  makeWASocket,
  proto,
  WAMessageStatus,
  type SignalDataSet,
  type SignalDataTypeMap,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import { createHash, createHmac, randomUUID } from 'crypto';
import { WhatsappAuthKey, WhatsappAuthKeyDocument } from './schemas/whatsapp-auth-key.schema';
import { WhatsappDelivery, WhatsappDeliveryDocument } from './schemas/whatsapp-delivery.schema';
import { WhatsappSession, WhatsappSessionDocument } from './schemas/whatsapp-session.schema';
import { WhatsappConsent, WhatsappConsentDocument } from './schemas/whatsapp-consent.schema';
import { WhatsappBudget, WhatsappBudgetDocument } from './schemas/whatsapp-budget.schema';
import { decryptWhatsappData, encryptWhatsappData, whatsappEncryptionKey } from './whatsapp.crypto';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AiService } from '../ai/ai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { TenantsService } from '../tenants/tenants.service';
import { MessagesService } from '../messages/messages.service';
import { WhatsappInbound, WhatsappInboundDocument } from './schemas/whatsapp-inbound.schema';
import { PLATFORM_ADMIN_PHONES } from '../auth/phone-admin-policy';
import {
  isThanarahLead,
  quickThanarahReply,
  THANARAH_WHATSAPP_SYSTEM_PROMPT,
} from './thanarah-profile';

export type WhatsappMessageInput = {
  to: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  text?: string;
  caption?: string;
  media?: {
    mimeType: string;
    fileName?: string;
    base64: string;
  };
  consentReference: string;
};

export type WhatsappBotSettings = {
  forwardingPhones: string[];
  forwardIncomingEnabled: boolean;
  autoReplyEnabled: boolean;
};

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly sockets = new Map<string, WASocket>();
  private readonly starting = new Set<string>();
  private readonly qrCodes = new Map<string, { dataUrl: string; expiresAt: Date }>();
  private readonly connectedAt = new Map<string, Date>();
  private dispatching = false;
  private dispatchRequested = false;
  private shuttingDown = false;
  private readonly reconnectAttempts = new Map<string, number>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reconnectExhausted = new Set<string>();
  private readonly credentialWrites = new Map<string, Promise<void>>();
  private readonly inboundQueues = new Map<string, Promise<void>>();
  private readonly socketFactory = makeWASocket;
  private readonly instanceId = randomUUID();
  private readonly connectionLeaseMs = 60_000;

  constructor(
    @InjectModel(WhatsappSession.name) private readonly sessionModel: Model<WhatsappSessionDocument>,
    @InjectModel(WhatsappAuthKey.name) private readonly authKeyModel: Model<WhatsappAuthKeyDocument>,
    @InjectModel(WhatsappDelivery.name) private readonly deliveryModel: Model<WhatsappDeliveryDocument>,
    @InjectModel(WhatsappConsent.name) private readonly consentModel: Model<WhatsappConsentDocument>,
    @InjectModel(WhatsappBudget.name) private readonly budgetModel: Model<WhatsappBudgetDocument>,
    private readonly apiKeysService: ApiKeysService,
    @InjectModel(WhatsappInbound.name) private readonly inboundModel: Model<WhatsappInboundDocument>,
    private readonly aiService: AiService,
    private readonly conversationsService: ConversationsService,
    private readonly tenantsService: TenantsService,
    private readonly messagesService: MessagesService,
  ) {}

  onModuleInit() {
    void this.restoreEnabledSessions();
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    await Promise.allSettled([...this.credentialWrites.values()]);
    const sockets = [...this.sockets.entries()];
    this.sockets.clear();
    await Promise.all(sockets.map(async ([scopeKey, socket]) => {
      socket.end(new Error('Application shutting down'));
      await this.sessionModel.updateOne(
        { scopeKey, connectionOwner: this.instanceId },
        { $unset: { connectionOwner: 1, connectionLeaseUntil: 1 } },
      ).catch(() => undefined);
    }));
  }

  private encryptionKey() {
    try {
      return whatsappEncryptionKey(process.env.SESSION_SECRET || '');
    } catch {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_ENCRYPTION_NOT_CONFIGURED',
        message: 'WhatsApp session encryption is not configured.',
      });
    }
  }

  async getBotSettings(scopeKey: string): Promise<WhatsappBotSettings> {
    const session = await this.sessionModel.findOne({ scopeKey })
      .select('forwardingPhones forwardIncomingEnabled autoReplyEnabled autoReplyConfigured')
      .lean();
    return {
      forwardingPhones: session?.forwardingConfigured === true
        ? session.forwardingPhones || []
        : scopeKey === 'platform'
          ? session?.forwardingPhones?.length ? session.forwardingPhones : [...PLATFORM_ADMIN_PHONES]
          : session?.forwardingPhones || [],
      forwardIncomingEnabled: session?.forwardIncomingEnabled === true,
      autoReplyEnabled: session?.autoReplyConfigured === true
        ? session.autoReplyEnabled === true
        : true,
    };
  }

  async updateBotSettings(scopeKey: string, input: WhatsappBotSettings): Promise<WhatsappBotSettings> {
    if (scopeKey !== 'platform'
      && !/^tenant:[a-f\d]{24}$/i.test(scopeKey)) {
      throw new BadRequestException('A valid WhatsApp scope is required');
    }
    if (!input || !Array.isArray(input.forwardingPhones)
      || typeof input.forwardIncomingEnabled !== 'boolean'
      || typeof input.autoReplyEnabled !== 'boolean') {
      throw new BadRequestException('Forwarding numbers and automation switches are required');
    }
    if (input.forwardingPhones.length > 10) {
      throw new BadRequestException('No more than 10 forwarding numbers can be configured');
    }
    const forwardingPhones = [...new Set(input.forwardingPhones.map((phone) => `+${this.normalizePhone(phone)}`))];
    if (input.forwardIncomingEnabled && forwardingPhones.length === 0) {
      throw new BadRequestException('Add at least one administrator number before enabling forwarding');
    }
    const scope = scopeKey === 'platform' ? 'platform' : 'tenant';
    const tenantId = scope === 'tenant' ? scopeKey.slice('tenant:'.length) : undefined;
    await this.ensureSession(scopeKey, scope, tenantId);
    await this.sessionModel.updateOne(
      { scopeKey },
      {
        $set: {
          forwardingPhones,
          forwardingConfigured: true,
          forwardIncomingEnabled: input.forwardIncomingEnabled,
          autoReplyEnabled: input.autoReplyEnabled,
          autoReplyConfigured: true,
        },
      },
    );
    return { forwardingPhones, forwardIncomingEnabled: input.forwardIncomingEnabled, autoReplyEnabled: input.autoReplyEnabled };
  }

  private async ensureSession(scopeKey: string, scope: 'platform' | 'tenant', tenantId?: string) {
    const filter = { scopeKey };
    const update = {
      $setOnInsert: {
        scopeKey,
        scope,
        tenantId: tenantId ? new Types.ObjectId(tenantId) : null,
        enabled: false,
        connectionState: 'disconnected',
      },
    };
    return this.sessionModel
      .findOneAndUpdate(filter, update, { upsert: true, new: true })
      .select('+encryptedCreds');
  }

  private async claimConnectionLease(scopeKey: string) {
    const now = new Date();
    return this.sessionModel.findOneAndUpdate(
      {
        scopeKey,
        $or: [
          { connectionOwner: this.instanceId },
          { connectionOwner: null },
          { connectionOwner: { $exists: false } },
          { connectionLeaseUntil: { $lte: now } },
          { connectionLeaseUntil: null },
          { connectionLeaseUntil: { $exists: false } },
        ],
      },
      {
        $set: {
          connectionOwner: this.instanceId,
          connectionLeaseUntil: new Date(now.getTime() + this.connectionLeaseMs),
        },
      },
      { new: true },
    ).select('+encryptedCreds');
  }

  private persistCredentials(scopeKey: string, socket: WASocket, credentials: unknown): Promise<void> {
    const snapshot = JSON.stringify(credentials, BufferJSON.replacer);
    const previous = this.credentialWrites.get(scopeKey) || Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
      if (this.sockets.get(scopeKey) !== socket) return;
      const saved = await this.sessionModel.updateOne(
        { scopeKey, connectionOwner: this.instanceId },
        { $set: { encryptedCreds: encryptWhatsappData(snapshot, this.encryptionKey()) } },
      );
      if (saved?.matchedCount === 0) throw new Error('WhatsApp session lease was lost');
    });
    this.credentialWrites.set(scopeKey, write);
    return write.finally(() => {
      if (this.credentialWrites.get(scopeKey) === write) this.credentialWrites.delete(scopeKey);
    });
  }

  async startPlatformConnection() {
    this.reconnectAttempts.delete('platform');
    this.reconnectExhausted.delete('platform');
    return this.startConnection('platform', 'platform');
  }

  async startTenantConnection(tenantId: string) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    this.reconnectAttempts.delete(`tenant:${tenantId}`);
    this.reconnectExhausted.delete(`tenant:${tenantId}`);
    return this.startConnection(`tenant:${tenantId}`, 'tenant', tenantId);
  }

  private async startConnection(scopeKey: string, scope: 'platform' | 'tenant', tenantId?: string) {
    const existing = this.sockets.get(scopeKey);
    if (existing) return this.getSessionStatus(scopeKey);
    if (this.starting.has(scopeKey)) return { state: 'connecting', scopeKey };
    this.starting.add(scopeKey);
    try {
    this.encryptionKey();

    await this.ensureSession(scopeKey, scope, tenantId);
    const session = await this.claimConnectionLease(scopeKey);
    if (!session) return { state: 'connected_elsewhere', scopeKey };
    let creds;
    try {
      creds = session?.encryptedCreds
        ? JSON.parse(decryptWhatsappData(session.encryptedCreds, this.encryptionKey()), BufferJSON.reviver)
        : initAuthCreds();
    } catch {
      await this.sessionModel.updateOne(
        { scopeKey, connectionOwner: this.instanceId },
        {
          $set: { enabled: false, connectionState: 'session_key_mismatch' },
          $unset: { connectionOwner: 1, connectionLeaseUntil: 1 },
        },
      );
      return {
        state: 'session_key_mismatch',
        reason: 'WHATSAPP_SESSION_KEY_MISMATCH',
      };
    }
    await this.sessionModel.updateOne(
      { scopeKey, connectionOwner: this.instanceId },
      { $set: { enabled: true, connectionState: 'connecting' } },
    );
    this.qrCodes.delete(scopeKey);

    const auth = {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          if (!ids.length) return {} as { [id: string]: SignalDataTypeMap[T] };
          const documents = await this.authKeyModel
            .find({ scopeKey, type: String(type), keyId: { $in: ids } })
            .select('+encryptedValue')
            .lean();
          const values: Record<string, SignalDataTypeMap[T]> = {};
          for (const document of documents) {
            let value = JSON.parse(
              decryptWhatsappData(document.encryptedValue, this.encryptionKey()),
              BufferJSON.reviver,
            );
            if (type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            values[document.keyId] = value;
          }
          return values;
        },
        set: async (data: SignalDataSet) => {
          const writes: Promise<unknown>[] = [];
          for (const [type, entries] of Object.entries(data)) {
            if (!entries) continue;
            for (const [keyId, value] of Object.entries(entries)) {
              if (value === null) {
                writes.push(this.authKeyModel.deleteOne({ scopeKey, type, keyId }).exec());
              } else {
                writes.push(this.authKeyModel.updateOne(
                  { scopeKey, type, keyId },
                  {
                    $set: {
                      encryptedValue: encryptWhatsappData(
                        JSON.stringify(value, BufferJSON.replacer),
                        this.encryptionKey(),
                      ),
                    },
                  },
                  { upsert: true },
                ).exec());
              }
            }
          }
          await Promise.all(writes);
        },
        clear: async () => {
          await this.authKeyModel.deleteMany({ scopeKey });
        },
      },
    };

    const socket = this.socketFactory({
      auth,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      emitOwnEvents: false,
      // Never log QR values, message bodies, Signal material or phone numbers.
      logger: {
        level: 'silent',
        trace() {}, debug() {}, info() {}, warn() {}, error() {},
        child() { return this; },
      },
    });
    this.sockets.set(scopeKey, socket);

    socket.ev.on('creds.update', () => {
      if (this.sockets.get(scopeKey) !== socket || this.shuttingDown) return;
      return this.persistCredentials(scopeKey, socket, auth.creds).catch(async () => {
        socket.end(new Error('Session persistence unavailable'));
        await this.sessionModel
          .updateOne(
            { scopeKey, connectionOwner: this.instanceId },
            { $set: { connectionState: 'storage_error' } },
          )
          .catch(() => undefined);
      });
    });

    socket.ev.on('connection.update', async (update) => {
      if (this.sockets.get(scopeKey) !== socket || this.shuttingDown) return;
      try {
      if (update.qr) {
        try {
          const dataUrl = await QRCode.toDataURL(update.qr, {
            width: 288,
            margin: 2,
            errorCorrectionLevel: 'M',
          });
          this.qrCodes.set(scopeKey, {
            dataUrl,
            expiresAt: new Date(Date.now() + 45_000),
          });
          await this.sessionModel.updateOne(
            { scopeKey, connectionOwner: this.instanceId },
            { $set: { connectionState: 'qr_pending' } },
          );
        } catch {
          await this.sessionModel.updateOne(
            { scopeKey, connectionOwner: this.instanceId },
            { $set: { connectionState: 'qr_error' } },
          );
        }
      }

      if (update.connection === 'open') {
        await this.persistCredentials(scopeKey, socket, auth.creds);
        this.reconnectAttempts.delete(scopeKey);
        this.reconnectExhausted.delete(scopeKey);
        const reconnectTimer = this.reconnectTimers.get(scopeKey);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        this.reconnectTimers.delete(scopeKey);
        this.qrCodes.delete(scopeKey);
        const phoneNumber = socket.user?.id?.split(':')[0]?.split('@')[0] || undefined;
        const now = new Date();
        this.connectedAt.set(scopeKey, now);
        await this.sessionModel.updateOne(
          { scopeKey, connectionOwner: this.instanceId },
          {
            $set: {
              connectionState: 'connected',
              phoneNumber,
              lastConnectedAt: now,
              enabled: true,
              connectionLeaseUntil: new Date(now.getTime() + this.connectionLeaseMs),
            },
            $unset: { lastDisconnectCode: 1 },
          },
        );
      }

      if (update.connection === 'close') {
        await this.credentialWrites.get(scopeKey)?.catch(() => undefined);
        this.sockets.delete(scopeKey);
        this.qrCodes.delete(scopeKey);
        const statusCode = (update.lastDisconnect?.error as any)?.output?.statusCode;
        const requiresQr = [
          DisconnectReason.loggedOut,
          DisconnectReason.badSession,
          DisconnectReason.forbidden,
        ].includes(statusCode);
        const connectionReplaced = statusCode === DisconnectReason.connectionReplaced;
        const sessionWrite = await this.sessionModel.updateOne(
          { scopeKey, connectionOwner: this.instanceId },
          {
            $set: {
              enabled: !requiresQr && !connectionReplaced,
              connectionState: requiresQr
                ? 'needs_qr'
                : connectionReplaced
                  ? 'connection_replaced'
                  : 'reconnecting',
              ...(Number.isInteger(statusCode) ? { lastDisconnectCode: statusCode } : {}),
              ...(requiresQr ? { encryptedCreds: null, phoneNumber: null } : {}),
            },
            ...(requiresQr || connectionReplaced
              ? { $unset: { connectionOwner: 1, connectionLeaseUntil: 1 } }
              : {}),
          },
        );
        if (sessionWrite?.matchedCount === 0) return;
        if (requiresQr) await this.authKeyModel.deleteMany({ scopeKey });
        if (requiresQr || connectionReplaced) {
          this.reconnectAttempts.delete(scopeKey);
          this.reconnectExhausted.delete(scopeKey);
        }
        else this.scheduleReconnect(scopeKey, scope, tenantId);
      }
      } catch {
        await this.sessionModel
          .updateOne(
            { scopeKey, connectionOwner: this.instanceId },
            { $set: { connectionState: 'storage_error' } },
          )
          .catch(() => undefined);
      }
    });

    socket.ev.on('messages.update', async (updates) => {
      try {
      for (const item of updates) {
        const id = item.key?.id;
        const status = Number(item.update?.status);
        if (!id) continue;
        const nextStatus = status === WAMessageStatus.READ || status === WAMessageStatus.PLAYED
          ? 'read'
          : status === WAMessageStatus.DELIVERY_ACK
            ? 'delivered'
            : undefined;
        if (nextStatus) {
          const tenantId = scopeKey.startsWith('tenant:') ? scopeKey.slice('tenant:'.length) : null;
          if (!tenantId || !Types.ObjectId.isValid(tenantId)) continue;
          await this.deliveryModel.updateMany(
            {
              tenantId: new Types.ObjectId(tenantId),
              providerMessageId: id,
              ...(nextStatus === 'delivered' ? { status: { $ne: 'read' } } : {}),
            },
            { $set: { status: nextStatus } },
          );
        }
      }
      } catch {
        // Delivery status updates are retried on the next WhatsApp receipt event.
      }
    });

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) {
        void this.enqueueInboundMessage(scopeKey, socket, message);
      }
    });

    return {
      state: 'connecting',
      message: 'WhatsApp connection started. Scan the QR code when it appears.',
    };
    } finally {
      this.starting.delete(scopeKey);
    }
  }

  async getSessionStatus(scopeKey: string) {
    const session = await this.sessionModel.findOne({ scopeKey }).lean();
    const qr = this.qrCodes.get(scopeKey);
    const qrDataUrl = qr && qr.expiresAt.getTime() > Date.now() ? qr.dataUrl : undefined;
    if (qr && !qrDataUrl) this.qrCodes.delete(scopeKey);
    const connectionLeaseUntil = session?.connectionLeaseUntil
      ? new Date(session.connectionLeaseUntil).getTime()
      : 0;
    const connectedElsewhere = Boolean(
      session?.connectionOwner
      && session.connectionOwner !== this.instanceId
      && connectionLeaseUntil > Date.now(),
    );
    const state = connectedElsewhere
      ? 'connected_elsewhere'
      : session?.connectionState === 'qr_pending' && !qrDataUrl
      ? 'qr_expired'
      : session?.connectionState || 'disconnected';
    return {
      available: state === 'connected' && this.sockets.has(scopeKey),
      state,
      integration: 'baileys',
      phoneNumber: session?.phoneNumber || null,
      lastConnectedAt: session?.lastConnectedAt || null,
      reason: state === 'session_key_mismatch'
        ? 'The saved WhatsApp session cannot be decrypted with the current SESSION_SECRET.'
        : state === 'connected_elsewhere'
          ? 'This WhatsApp session is active in another application runtime.'
          : state === 'connection_replaced'
            ? 'WhatsApp replaced this runtime connection; saved session data was preserved.'
            : state === 'reconnect_failed'
              ? Number.isInteger(session?.lastDisconnectCode)
                ? `انتهت محاولات الاتصال؛ رمز إغلاق WhatsApp الأخير: ${session.lastDisconnectCode}.`
                : 'انتهت محاولات الاتصال التلقائية. أعد المحاولة أو أعد الربط عبر QR.'
            : undefined,
      qrDataUrl: qrDataUrl || null,
      qrExpiresAt: qrDataUrl ? qr?.expiresAt : null,
      capabilities: {
        linkSession: true,
        sendMessages: state === 'connected' && this.sockets.has(scopeKey),
        sendMedia: state === 'connected' && this.sockets.has(scopeKey),
        receiveMessages: state === 'connected' && this.sockets.has(scopeKey),
      },
    };
  }

  async relinkTenantWithQr(tenantId: string) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    return this.relinkWithQr(`tenant:${tenantId}`, 'tenant', tenantId);
  }

  async relinkPlatformWithQr() {
    return this.relinkWithQr('platform', 'platform');
  }

  private async relinkWithQr(scopeKey: string, scope: 'platform' | 'tenant', tenantId?: string) {
    if (this.starting.has(scopeKey)) throw new ConflictException('Connection is starting. Try again shortly.');
    await this.ensureSession(scopeKey, scope, tenantId);
    const lease = await this.claimConnectionLease(scopeKey);
    if (!lease) {
      throw new ConflictException('جلسة WhatsApp تعمل في نسخة أخرى؛ أوقفها هناك قبل إعادة الربط.');
    }
    const reconnectTimer = this.reconnectTimers.get(scopeKey);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    this.reconnectTimers.delete(scopeKey);
    this.reconnectAttempts.delete(scopeKey);
    this.reconnectExhausted.delete(scopeKey);
    const socket = this.sockets.get(scopeKey);
    this.sockets.delete(scopeKey);
    this.qrCodes.delete(scopeKey);
    this.connectedAt.delete(scopeKey);
    if (socket) socket.end(new Error('Replacing unreadable WhatsApp session'));
    await this.ensureSession(scopeKey, scope, tenantId);
    await Promise.all([
      this.authKeyModel.deleteMany({ scopeKey }),
      this.sessionModel.updateOne(
        { scopeKey, connectionOwner: this.instanceId },
        {
          $set: {
            enabled: false,
            connectionState: 'disconnected',
            encryptedCreds: null,
            phoneNumber: null,
            lastConnectedAt: null,
          },
        },
      ),
    ]);
    return this.startConnection(scopeKey, scope, tenantId);
  }

  async getTenantInbox(tenantId: string) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    const conversations = await this.conversationsService.findWhatsAppByTenant(tenantId);
    return Promise.all(conversations.map(async (conversation) => {
      const conversationId = conversation._id.toString();
      const latest = await this.messagesService?.findLatestByConversation(conversationId);
      let phoneNumber: string | null = null;
      try {
        const encryptedPhone = conversation.metadata?.whatsappContactPhoneEncrypted;
        if (encryptedPhone) phoneNumber = decryptWhatsappData(encryptedPhone, this.encryptionKey());
      } catch {
        phoneNumber = null;
      }
      return {
        conversationId,
        phoneNumber,
        lastMessageAt: conversation.lastMessageAt || latest?.createdAt || conversation.updatedAt,
        messageCount: conversation.messageCount || 0,
        preview: latest?.contentDecodeError
          ? 'رسالة قديمة غير قابلة للقراءة'
          : latest?.content || '',
      };
    }));
  }

  async getTenantInboxThread(tenantId: string, conversationId: string) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    const conversation = await this.conversationsService.findWhatsAppConversationByTenant(tenantId, conversationId);
    let phoneNumber: string | null = null;
    try {
      const encryptedPhone = conversation.metadata?.whatsappContactPhoneEncrypted;
      if (encryptedPhone) phoneNumber = decryptWhatsappData(encryptedPhone, this.encryptionKey());
    } catch {
      phoneNumber = null;
    }
    const messages = await this.messagesService.findByConversation(conversationId, 100);
    const latestInbound = await this.inboundModel.findOne({
      scopeKey: `tenant:${tenantId}`,
      contactHash: conversation.metadata?.whatsappContactKey,
    }).sort({ createdAt: -1 }).lean();
    return {
      conversationId,
      phoneNumber,
      messages: messages.map((message) => ({
        id: message._id.toString(),
        role: message.role,
        content: message.content,
        contentDecodeError: message.contentDecodeError === true,
        createdAt: message.createdAt,
      })),
      latestInbound: latestInbound ? {
        status: latestInbound.status,
        failureCode: latestInbound.failureCode || null,
        createdAt: latestInbound.createdAt,
      } : null,
    };
  }

  async replyToTenantInbox(tenantId: string, conversationId: string, text: string) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    const content = typeof text === 'string' ? text.trim() : '';
    if (!content || content.length > 4096) {
      throw new BadRequestException('Reply must contain 1–4096 characters');
    }
    const conversation = await this.conversationsService.findWhatsAppConversationByTenant(tenantId, conversationId);
    const scopeKey = `tenant:${tenantId}`;
    const socket = this.sockets.get(scopeKey);
    if (!socket || !(await this.getSessionStatus(scopeKey)).available) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_SESSION_DISCONNECTED',
        message: 'اربط رقم المؤسسة عبر QR قبل إرسال الردود.',
      });
    }
    let phoneNumber: string;
    try {
      const encryptedPhone = conversation.metadata?.whatsappContactPhoneEncrypted;
      if (!encryptedPhone) throw new Error('Contact number is missing');
      phoneNumber = decryptWhatsappData(encryptedPhone, this.encryptionKey()).replace(/\D/g, '');
    } catch {
      throw new ConflictException('رقم جهة الاتصال غير متوفر لهذه المحادثة القديمة.');
    }
    const sent = await socket.sendMessage(`${phoneNumber}@s.whatsapp.net`, { text: content });
    if (!sent?.key?.id) throw new ServiceUnavailableException('تعذر تأكيد إرسال الرسالة عبر WhatsApp.');
    if (!this.messagesService) throw new ServiceUnavailableException('Chat history is unavailable.');
    const saved = await this.messagesService.create({
      tenantId,
      userId: conversation.userId.toString(),
      conversationId,
      role: 'assistant',
      content,
      aiMetadata: { backend: 'whatsapp-admin-reply', providerMessageId: sent.key.id },
    });
    await this.conversationsService.incrementMessageCount(conversationId);
    return {
      id: saved._id.toString(),
      role: saved.role,
      content: saved.content,
      createdAt: saved.createdAt,
    };
  }

  async disconnect(scopeKey: string) {
    if (this.starting.has(scopeKey)) throw new ConflictException('Connection is starting. Try again shortly.');
    await this.claimIfSessionExists(scopeKey);
    const reconnectTimer = this.reconnectTimers.get(scopeKey);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    this.reconnectTimers.delete(scopeKey);
    this.reconnectAttempts.delete(scopeKey);
    this.reconnectExhausted.delete(scopeKey);
    const socket = this.sockets.get(scopeKey);
    this.sockets.delete(scopeKey);
    this.qrCodes.delete(scopeKey);
    this.connectedAt.delete(scopeKey);
    if (socket) {
      try {
        await socket.logout();
      } catch {
        socket.end(new Error('Session disconnected by administrator'));
      }
    }
    await Promise.all([
      this.sessionModel.updateOne(
        { scopeKey, connectionOwner: this.instanceId },
        {
          $set: {
            enabled: false,
            connectionState: 'disconnected',
            encryptedCreds: null,
            phoneNumber: null,
            lastConnectedAt: null,
          },
          $unset: { connectionOwner: 1, connectionLeaseUntil: 1 },
        },
      ),
      this.authKeyModel.deleteMany({ scopeKey }),
      ...(scopeKey.startsWith('tenant:')
        ? [this.deliveryModel.updateMany(
          {
            tenantId: new Types.ObjectId(scopeKey.slice('tenant:'.length)),
            status: { $in: ['pending', 'sending'] },
          },
          { $set: { status: 'failed', failureCode: 'WHATSAPP_SESSION_DISCONNECTED', lockedAt: null } },
        )]
        : []),
    ]);
    return { success: true, state: 'disconnected' };
  }

  async sendPlatformOtp(phone: string, code: string) {
    const socket = this.sockets.get('platform');
    if (!socket || (await this.getSessionStatus('platform')).available !== true) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_PLATFORM_SENDER_UNAVAILABLE',
        message: 'The platform WhatsApp sender is not connected.',
      });
    }
    const jid = `${this.normalizePhone(phone)}@s.whatsapp.net`;
    const registrations = await socket.onWhatsApp(jid);
    if (!registrations?.some((registration) => registration.exists)) {
      throw new BadRequestException('الرقم غير متاح على WhatsApp.');
    }
    const sent = await socket.sendMessage(jid, {
      text: `رمز التحقق الخاص بك هو: ${code}\nينتهي خلال 5 دقائق. لا تشاركه مع أحد.`,
    });
    if (!sent?.key?.id) {
      throw new ServiceUnavailableException('تعذر تأكيد إرسال رمز WhatsApp.');
    }
  }

  private scheduleReconnect(scopeKey: string, scope: 'platform' | 'tenant', tenantId?: string) {
    if (
      this.shuttingDown
      || this.reconnectExhausted.has(scopeKey)
      || this.reconnectTimers.has(scopeKey)
      || this.sockets.has(scopeKey)
    ) return;
    const attempt = (this.reconnectAttempts.get(scopeKey) || 0) + 1;
    if (attempt > 6) {
      this.reconnectExhausted.add(scopeKey);
      void this.sessionModel.updateOne(
        { scopeKey, connectionOwner: this.instanceId },
        {
          $set: { connectionState: 'reconnect_failed' },
          $unset: { connectionOwner: 1, connectionLeaseUntil: 1 },
        },
      ).catch(() => undefined);
      return;
    }
    this.reconnectAttempts.set(scopeKey, attempt);
    const delayMs = Math.min(30_000, 1_000 * (2 ** (attempt - 1)));
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(scopeKey);
      if (this.shuttingDown || this.sockets.has(scopeKey)) return;
      void this.startConnection(scopeKey, scope, tenantId).catch(() => {
        this.scheduleReconnect(scopeKey, scope, tenantId);
      });
    }, delayMs);
    timer.unref?.();
    this.reconnectTimers.set(scopeKey, timer);
  }

  @Interval(15_000)
  private async renewConnectionLeases() {
    if (this.shuttingDown || !this.sockets.size) return;
    const leaseUntil = new Date(Date.now() + this.connectionLeaseMs);
    await Promise.all([...this.sockets.entries()].map(async ([scopeKey, socket]) => {
      try {
        const result = await this.sessionModel.updateOne(
          { scopeKey, connectionOwner: this.instanceId },
          { $set: { connectionLeaseUntil: leaseUntil } },
        );
        if (result?.matchedCount === 0 && this.sockets.get(scopeKey) === socket) {
          this.sockets.delete(scopeKey);
          this.qrCodes.delete(scopeKey);
          socket.end(new Error('WhatsApp session ownership lost'));
        }
      } catch {
        this.logger.warn('WhatsApp session lease renewal failed');
      }
    }));
  }

  private async claimIfSessionExists(scopeKey: string) {
    if (typeof this.sessionModel.findOne !== 'function') return false;
    const session = await this.sessionModel.findOne({ scopeKey }).lean();
    if (!session) return false;
    const lease = await this.claimConnectionLease(scopeKey);
    if (!lease) {
      throw new ConflictException('جلسة WhatsApp تعمل في نسخة أخرى من التطبيق؛ لم نحذف بياناتها.');
    }
    return true;
  }

  private enqueueInboundMessage(scopeKey: string, socket: WASocket, message: any): Promise<void> {
    const remoteJid = [message?.key?.remoteJid, message?.key?.remoteJidAlt]
      .find((jid) => typeof jid === 'string' && jid.includes('@'));
    const identity = remoteJid || message?.key?.id || 'unknown';
    const queueKey = `${scopeKey}:${identity}`;
    const previous = this.inboundQueues.get(queueKey) || Promise.resolve();
    const queued = previous.catch(() => undefined).then(async () => {
      try {
        await this.handleInboundMessage(scopeKey, socket, message);
      } catch (error) {
        await this.recordUnexpectedInboundFailure(scopeKey, message, error);
      }
    });
    this.inboundQueues.set(queueKey, queued);
    void queued.then(
      () => {
        if (this.inboundQueues.get(queueKey) === queued) this.inboundQueues.delete(queueKey);
      },
      () => {
        if (this.inboundQueues.get(queueKey) === queued) this.inboundQueues.delete(queueKey);
      },
    );
    return queued;
  }

  private async recordUnexpectedInboundFailure(scopeKey: string, message: any, error: any) {
    const providerMessageId = message?.key?.id;
    if (typeof providerMessageId !== 'string' || !providerMessageId) return;

    const tenantId = scopeKey.startsWith('tenant:') ? scopeKey.slice('tenant:'.length) : null;
    const tenantObjectId = tenantId && Types.ObjectId.isValid(tenantId)
      ? new Types.ObjectId(tenantId)
      : null;
    const remoteJid = [message?.key?.remoteJid, message?.key?.remoteJidAlt]
      .find((jid) => typeof jid === 'string' && jid.endsWith('@s.whatsapp.net'));
    const phone = typeof remoteJid === 'string'
      ? remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '')
      : '';
    const contactHash = phone
      ? createHash('sha256').update(`${scopeKey}:${phone}`).digest('hex')
      : undefined;
    let hasText = false;
    try {
      hasText = Boolean(this.extractInboundText(message));
    } catch {
      // Store the error category without logging or copying the message body.
    }
    const failureCode = 'WHATSAPP_INBOUND_PROCESSING_FAILED';
    const rawCode = error?.code;
    const safeCode = typeof rawCode === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(rawCode)
      ? rawCode
      : error?.name === 'Error' ? 'UNEXPECTED_ERROR' : 'PROCESSING_ERROR';
    const scopeLabel = tenantObjectId ? 'tenant' : 'platform';

    try {
      await this.inboundModel.updateOne(
        { scopeKey, providerMessageId, status: { $in: ['received', 'processing'] } },
        { $set: { status: 'failed', failureCode } },
      );
      await this.inboundModel.updateOne(
        { scopeKey, providerMessageId },
        {
          $setOnInsert: {
            ...(tenantObjectId ? { tenantId: tenantObjectId } : {}),
            scopeKey,
            providerMessageId,
            ...(contactHash ? { contactHash } : {}),
            messageKind: hasText ? 'text' : 'media',
            status: 'failed',
            failureCode,
          },
        },
        { upsert: true },
      );
      this.logger.warn(`WhatsApp inbound processing failed (${scopeLabel}; ${safeCode})`);
    } catch {
      this.logger.warn(`WhatsApp inbound failure could not be saved (${scopeLabel})`);
    }
  }

  private async handleInboundMessage(scopeKey: string, socket: WASocket, message: any) {
    const isPlatform = scopeKey === 'platform';
    const tenantId = scopeKey.startsWith('tenant:') ? scopeKey.slice('tenant:'.length) : null;
    if ((!isPlatform && (!tenantId || !Types.ObjectId.isValid(tenantId))) || message?.key?.fromMe) return;
    const remoteJid = message?.key?.remoteJid;
    if (typeof remoteJid !== 'string' || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return;

    const phoneJid = [remoteJid, message?.key?.remoteJidAlt]
      .find((jid) => typeof jid === 'string' && jid.endsWith('@s.whatsapp.net'));
    if (!phoneJid) return;
    const phone = phoneJid.split('@')[0].split(':')[0].replace(/\D/g, '');
    const providerMessageId = message?.key?.id;
    if (!phone || phone.length < 8 || phone.length > 15 || typeof providerMessageId !== 'string') return;

    const text = this.extractInboundText(message);
    if (!message?.message || (text && text.length > 4096)) return;
    const tenantObjectId = tenantId ? new Types.ObjectId(tenantId) : null;
    const phoneNumber = `+${phone}`;
    const consentFilter = isPlatform
      ? { scopeKey, phoneNumber }
      : { tenantId: tenantObjectId, phoneNumber };

    if (text && /^\s*(stop|unsubscribe|إلغاء|الغاء|توقف)\s*$/i.test(text)) {
      await this.consentModel.findOneAndUpdate(
        consentFilter,
        {
          $set: {
            ...(isPlatform ? { scopeKey } : {}),
            ...(tenantObjectId ? { tenantId: tenantObjectId } : {}),
            phoneNumber,
            status: 'revoked',
            source: 'inbound-stop',
            reference: providerMessageId,
            consentedAt: new Date(),
            revokedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );
      return;
    }

    const existingConsent = await this.consentModel.findOne(consentFilter).lean();
    if (existingConsent?.status === 'revoked') return;
    const settings = await this.getBotSettings(scopeKey);
    if (isPlatform && !settings.forwardIncomingEnabled && !settings.autoReplyEnabled) return;

    const contactHash = createHash('sha256').update(`${scopeKey}:${phone}`).digest('hex');
    const directLead = Boolean(isPlatform && text && isThanarahLead(text));
    let recentLead = false;
    if (isPlatform && text && !directLead) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const previousLead = await this.inboundModel.findOne({
        scopeKey,
        contactHash,
        providerMessageId: { $ne: providerMessageId },
        leadDetected: true,
        status: { $in: ['processing', 'replied'] },
        createdAt: { $gte: cutoff },
      }).sort({ createdAt: -1 }).lean();
      recentLead = Boolean(previousLead);
    }
    const leadDetected = directLead || recentLead;
    const canReply = settings.autoReplyEnabled && Boolean(text);

    try {
      await this.inboundModel.create({
        ...(tenantObjectId ? { tenantId: tenantObjectId } : {}),
        scopeKey,
        providerMessageId,
        contactHash,
        ...(text ? { encryptedContent: encryptWhatsappData(text, this.encryptionKey()) } : {}),
        leadDetected,
        messageKind: text ? 'text' : 'media',
        status: canReply ? 'processing' : isPlatform ? 'ignored' : 'received',
      });
    } catch (error: any) {
      if (error?.code === 11000) return;
      throw error;
    }

    const inboundFilter = { scopeKey, providerMessageId };
    const shouldForward = settings.forwardIncomingEnabled || leadDetected;
    const forwardPromise = shouldForward && settings.forwardingPhones.length
      ? this.forwardInboundToAdmins(socket, settings.forwardingPhones, phone, message, leadDetected)
        .then(async (forwardFailureCount) => {
          await this.inboundModel.updateOne(inboundFilter, {
            $set: {
              ...(forwardFailureCount === 0 ? { forwardedAt: new Date() } : {}),
              forwardFailureCount,
            },
          });
        })
        .catch(async () => {
          await this.inboundModel.updateOne(inboundFilter, { $set: { forwardFailureCount: settings.forwardingPhones.length } })
            .catch(() => undefined);
        })
      : Promise.resolve();

    let conversation: any = null;
    let userId: string | null = null;
    if (!isPlatform) {
      userId = contactHash.slice(0, 24);
      try {
        conversation = await this.conversationsService.findOrCreateWhatsAppConversation(
          tenantId!,
          userId,
          contactHash,
          encryptWhatsappData(phoneNumber, this.encryptionKey()),
        );
        if (!canReply) {
          if (!this.messagesService) throw new Error('WhatsApp message storage is unavailable');
          await this.messagesService.create({
            tenantId: tenantId!,
            userId,
            conversationId: conversation._id.toString(),
            role: 'user',
            content: text || 'وصلت رسالة وسائط عبر WhatsApp.',
          });
          await this.conversationsService.incrementMessageCount(conversation._id.toString());
        }
      } catch {
        await this.inboundModel.updateOne(
          inboundFilter,
          { $set: { status: 'failed', failureCode: 'WHATSAPP_INBOX_SAVE_FAILED' } },
        ).catch(() => undefined);
        await forwardPromise;
        return;
      }
    }

    if (!canReply) {
      await forwardPromise;
      return;
    }

    try {
      let answerText: string;
      let firstContact = false;
      let aiFailed = false;
      if (isPlatform) {
        const previousHistory = await this.getPlatformHistory(scopeKey, contactHash, providerMessageId);
        firstContact = !previousHistory.hasPrevious;
        answerText = quickThanarahReply(text) || '';
        if (!answerText) {
          try {
            const answer = await this.aiService.chatStateless({
              conversationId: `whatsapp:${contactHash}`,
              userId: contactHash,
              tenantId: 'thanarah-platform-whatsapp',
              messages: [...previousHistory.messages, { role: 'user', content: text }],
              systemPrompt: THANARAH_WHATSAPP_SYSTEM_PROMPT,
            });
            answerText = answer.content.trim();
            if (!answerText) {
              aiFailed = true;
              this.logger.warn('WhatsApp AI returned an empty answer (platform; EMPTY_AI_RESPONSE)');
            }
          } catch (error) {
            answerText = '';
            aiFailed = true;
            this.logger.warn(
              `WhatsApp AI generation failed (platform; ${this.safeErrorLabel(error)})`,
            );
          }
        }
      } else {
        // External contacts have isolated, non-authenticating identities. A
        // user-initiated inbound message can receive one direct reply; STOP
        // is persisted and prevents any further processing.
        firstContact = Number(conversation.messageCount || 0) === 0;
        await this.tenantsService.consumeChatUsage(tenantId!, false);
        try {
          const answer = await this.aiService.chat({
            conversationId: conversation._id.toString(),
            content: text,
            userId,
            tenantId: tenantId!,
            stream: false,
            inputMode: 'text',
            fastMode: true,
          });
          aiFailed = answer?.error === true;
          answerText = aiFailed ? '' : (answer?.content || '').trim();
          if (aiFailed || !answerText) {
            this.logger.warn('WhatsApp AI generation failed (tenant; AI_RESPONSE_FAILED)');
          }
        } catch (error) {
          answerText = '';
          aiFailed = true;
          this.logger.warn(
            `WhatsApp AI generation failed (tenant; ${this.safeErrorLabel(error)})`,
          );
        }
      }

      if (!answerText) {
        answerText = isPlatform
          ? 'ما قدرت أجهز إجابة دقيقة الآن. جرّب صياغة سؤالك بطريقة أخرى، أو اكتب «أريد تواصل» لطلب متابعة من فريق ثنارة.'
          : 'وصلت رسالتك، لكن تعذّر إنشاء رد آلي الآن. جرّب مرة أخرى بعد قليل.';
        aiFailed = true;
      }
      if (firstContact) {
        const disclosure = isPlatform
          ? 'تنويه: أنا مساعد آلي وقد يطلع فريق ثنارة على رسالتك للمتابعة.\n'
          : 'تنويه: أنا مساعد آلي وقد يطلع فريق المؤسسة على رسالتك للمتابعة.\n';
        answerText = `${disclosure}${answerText}`;
      }
      const stillConsented = await this.consentModel.findOne(consentFilter).lean();
      if (stillConsented?.status === 'revoked' || this.sockets.get(scopeKey) !== socket) {
        await this.inboundModel.updateOne(
          inboundFilter,
          { $set: { status: 'ignored', failureCode: 'WHATSAPP_CONSENT_REVOKED' } },
        );
        await forwardPromise;
        return;
      }

      const replyId = `3EB0${createHash('sha256')
        .update(`${scopeKey}:${providerMessageId}`)
        .digest('hex')
        .slice(0, 24)
        .toUpperCase()}`;
      const sent = await socket.sendMessage(
        `${phone}@s.whatsapp.net`,
        { text: answerText.slice(0, 4096) },
        { messageId: replyId },
      );
      if (!sent?.key?.id) throw new Error('WhatsApp did not confirm the reply');
      if (!isPlatform && aiFailed && this.messagesService) {
        await this.messagesService.create({
          tenantId: tenantId!,
          userId: userId!,
          conversationId: conversation._id.toString(),
          role: 'assistant',
          content: answerText,
          aiMetadata: { backend: 'whatsapp-fallback', failureCode: 'AI_RESPONSE_FAILED' },
        });
        await this.conversationsService.incrementMessageCount(conversation._id.toString());
      }
      await this.inboundModel.updateOne(
        inboundFilter,
        {
          $set: {
            status: aiFailed ? 'failed' : 'replied',
            providerReplyId: sent.key.id,
            encryptedReply: encryptWhatsappData(answerText, this.encryptionKey()),
            ...(aiFailed ? { failureCode: 'AI_RESPONSE_FAILED' } : {}),
          },
          ...(aiFailed ? {} : { $unset: { failureCode: 1 } }),
        },
      );
    } catch {
      this.logger.warn(`WhatsApp auto-reply failed (${scopeKey.startsWith('tenant:') ? 'tenant' : 'platform'})`);
      await this.inboundModel.updateOne(
        inboundFilter,
        { $set: { status: 'failed', failureCode: 'WHATSAPP_AUTO_REPLY_FAILED' } },
      ).catch(() => undefined);
    }
    await forwardPromise;
  }

  private async getPlatformHistory(scopeKey: string, contactHash: string, currentMessageId: string) {
    const rows = await this.inboundModel.find({
      scopeKey,
      contactHash,
      providerMessageId: { $ne: currentMessageId },
      status: 'replied',
    })
      .select('+encryptedContent +encryptedReply')
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const row of [...rows].reverse()) {
      try {
        if (row.encryptedContent) {
          history.push({
            role: 'user',
            content: decryptWhatsappData(row.encryptedContent, this.encryptionKey()),
          });
        }
        if (row.encryptedReply) {
          history.push({
            role: 'assistant',
            content: decryptWhatsappData(row.encryptedReply, this.encryptionKey()),
          });
        }
      } catch {
        // Ignore one corrupted/old conversation item; never expose stored ciphertext.
      }
    }
    return { messages: history, hasPrevious: rows.length > 0 };
  }

  private safeErrorLabel(error: unknown): string {
    const candidate = error as {
      code?: unknown;
      name?: unknown;
      response?: { status?: unknown };
    } | null;
    if (typeof candidate?.code === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(candidate.code)) {
      return candidate.code;
    }
    if (Number.isInteger(candidate?.response?.status)) {
      return `HTTP_${candidate?.response?.status}`;
    }
    if (typeof candidate?.name === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(candidate.name)) {
      return candidate.name;
    }
    return 'AI_REQUEST_FAILED';
  }

  private async forwardInboundToAdmins(
    socket: WASocket,
    forwardingPhones: string[],
    senderPhone: string,
    message: any,
    leadDetected: boolean,
  ): Promise<number> {
    const selfPhone = socket.user?.id?.split(':')[0]?.split('@')[0]?.replace(/\D/g, '');
    const recipients = [...new Set(forwardingPhones)]
      .filter((phone) => phone.replace(/\D/g, '') !== selfPhone);
    const results = await Promise.allSettled(recipients.map(async (phone) => {
      const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
      const header = leadDetected ? 'عميل مهتم بخدمات ثنارة' : 'رسالة WhatsApp واردة';
      const notice = await socket.sendMessage(jid, {
        text: `${header}\nمن الرقم: +${senderPhone}`,
      });
      if (!notice?.key?.id) throw new Error('Forward notice was not confirmed');
      const forwarded = await socket.sendMessage(jid, { forward: message, force: true });
      if (!forwarded?.key?.id) throw new Error('Forwarded message was not confirmed');
    }));
    return results.filter((result) => result.status === 'rejected').length;
  }

  private extractInboundText(message: any): string | null {
    let content = message?.message;
    for (let depth = 0; depth < 4; depth += 1) {
      const wrapped = content?.ephemeralMessage?.message
        || content?.viewOnceMessage?.message
        || content?.viewOnceMessageV2?.message
        || content?.documentWithCaptionMessage?.message;
      if (!wrapped) break;
      content = wrapped;
    }
    const text = content?.conversation || content?.extendedTextMessage?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  }

  async enqueueMessage(tenantId: string, input: WhatsappMessageInput, idempotencyKey: string, apiKeyId?: string) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    const normalized = this.validateMessage(input);
    const payloadText = JSON.stringify(normalized);
    const payloadHash = createHmac('sha256', this.encryptionKey()).update(payloadText).digest('hex');
    const prior = await this.deliveryModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      idempotencyKey,
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This Idempotency-Key was already used for a different message.' });
      }
      return this.publicDelivery(prior);
    }

    const consent = await this.consentModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      phoneNumber: `+${normalized.to}`,
      status: 'active',
    });
    if (!consent || consent.reference !== normalized.consentReference) {
      throw new ForbiddenException({
        code: 'WHATSAPP_RECIPIENT_CONSENT_REQUIRED',
        message: 'An active recipient consent record matching consentReference is required.',
      });
    }

    const session = await this.sessionModel.findOne({ scopeKey: `tenant:${tenantId}` }).lean();
    if (!session?.enabled || !session.lastConnectedAt) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_TENANT_NOT_CONNECTED',
        message: 'This institution has not linked its WhatsApp account.',
      });
    }

    await this.consumeBudget(`tenant-minute:${tenantId}`, 30, 60);
    await this.consumeBudget(`tenant-day:${tenantId}`, 1000, 86_400);
    let delivery: WhatsappDeliveryDocument;
    try {
      delivery = await this.deliveryModel.create({
        tenantId: new Types.ObjectId(tenantId),
        apiKeyId: apiKeyId && Types.ObjectId.isValid(apiKeyId) ? new Types.ObjectId(apiKeyId) : null,
        idempotencyKey,
        payloadHash,
        encryptedPayload: encryptWhatsappData(payloadText, this.encryptionKey()),
        status: 'pending',
        nextAttemptAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const duplicate = await this.deliveryModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        idempotencyKey,
      });
      if (!duplicate || duplicate.payloadHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This Idempotency-Key was already used for a different message.' });
      }
      if (duplicate.status === 'pending') this.requestDispatch();
      return this.publicDelivery(duplicate);
    }
    this.requestDispatch();
    return this.publicDelivery(delivery);
  }

  private requestDispatch() {
    this.dispatchRequested = true;
    void this.dispatchPendingMessages();
  }

  async consumeBudget(scope: string, limit: number, windowSeconds: number): Promise<void> {
    const windowMs = windowSeconds * 1000;
    const window = Math.floor(Date.now() / windowMs);
    const bucket = `${scope}:${window}`;
    try {
      await this.budgetModel.findOneAndUpdate(
        { bucket, count: { $lt: limit } },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) },
        },
        { upsert: true, new: true },
      );
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      throw new HttpException(
        { code: 'WHATSAPP_RATE_LIMIT', message: 'تم تجاوز حد الاستخدام. حاول لاحقًا.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordConsent(tenantId: string, input: { phone: string; source: string; reference: string }) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    const phoneNumber = `+${this.normalizePhone(input?.phone)}`;
    const source = typeof input?.source === 'string' ? input.source.trim() : '';
    const reference = typeof input?.reference === 'string' ? input.reference.trim() : '';
    if (!source || source.length > 80 || !reference || reference.length < 4 || reference.length > 160) {
      throw new BadRequestException('Consent source and reference are required');
    }
    const consent = await this.consentModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), phoneNumber },
      {
        $set: {
          status: 'active',
          source,
          reference,
          consentedAt: new Date(),
          revokedAt: null,
        },
      },
      { upsert: true, new: true },
    );
    return { phoneNumber: consent.phoneNumber, status: consent.status, reference: consent.reference };
  }

  async revokeConsent(tenantId: string, phoneValue: string) {
    if (!Types.ObjectId.isValid(tenantId)) throw new BadRequestException('A valid tenant is required');
    const phoneNumber = `+${this.normalizePhone(phoneValue)}`;
    const result = await this.consentModel.updateOne(
      { tenantId: new Types.ObjectId(tenantId), phoneNumber, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date() } },
    );
    return { success: true, revoked: result.modifiedCount > 0 };
  }

  async getDelivery(tenantId: string, deliveryId: string) {
    if (!Types.ObjectId.isValid(deliveryId) || !Types.ObjectId.isValid(tenantId)) {
      throw new BadRequestException('A valid delivery and tenant are required');
    }
    const delivery = await this.deliveryModel.findOne({
      _id: deliveryId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return this.publicDelivery(delivery);
  }

  private publicDelivery(delivery: WhatsappDeliveryDocument) {
    return {
      id: delivery._id.toString(),
      status: delivery.status,
      attempts: delivery.attempts,
      providerMessageId: delivery.providerMessageId || null,
      failureCode: delivery.failureCode || null,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    };
  }

  private validateMessage(raw: WhatsappMessageInput): WhatsappMessageInput {
    const input: WhatsappMessageInput = raw && {
      ...raw,
      to: raw.to || (raw as any).recipient?.phone,
      type: raw.type || 'text',
      text: raw.text ?? (raw as any).message,
    };
    const to = this.normalizePhone(input?.to);
    if (!['text', 'image', 'video', 'audio', 'document'].includes(input?.type)) {
      throw new BadRequestException('Message type must be text, image, video, audio or document');
    }
    if (typeof input?.consentReference !== 'string' || input.consentReference.trim().length < 4 || input.consentReference.length > 160) {
      throw new BadRequestException('A documented recipient consentReference is required');
    }
    if (input.type === 'text') {
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4096) {
        throw new BadRequestException('Text messages must contain 1–4096 characters');
      }
      return { to, type: 'text', text: input.text, consentReference: input.consentReference.trim() };
    }
    if (!input.media || typeof input.media.base64 !== 'string' || input.media.base64.length > 14_000_000) {
      throw new BadRequestException('Media is required and must be no larger than 10 MB');
    }
    const base64 = input.media.base64.replace(/\s/g, '');
    const bytes = Buffer.from(base64, 'base64');
    if (
      bytes.length === 0
      || bytes.length > 10 * 1024 * 1024
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
      || bytes.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')
    ) {
      throw new BadRequestException('Media must be valid base64 and no larger than 10 MB');
    }
    const allowed: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/webp'],
      video: ['video/mp4'],
      audio: ['audio/mpeg', 'audio/ogg', 'audio/mp4'],
      document: ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    };
    const mimeType = input.media.mimeType;
    if (!allowed[input.type].includes(mimeType)) {
      throw new BadRequestException(`Unsupported ${input.type} MIME type`);
    }
    if (!this.mediaMatchesMime(bytes, mimeType)) {
      throw new BadRequestException('Media bytes do not match the declared MIME type');
    }
    const fileName = input.media.fileName?.trim() || `${input.type}.${mimeType.split('/')[1]}`;
    if (fileName.length > 128 || /[\\/\r\n]/.test(fileName)) {
      throw new BadRequestException('Invalid media file name');
    }
    return {
      to,
      type: input.type,
      caption: typeof input.caption === 'string' ? input.caption.slice(0, 1024) : undefined,
      media: { mimeType, fileName, base64: bytes.toString('base64') },
      consentReference: input.consentReference.trim(),
    };
  }

  private normalizePhone(value: string): string {
    if (
      typeof value !== 'string'
      || !/^\+[0-9\s().-]+$/.test(value.trim())
    ) {
      throw new BadRequestException('Phone must be an international number in E.164 format');
    }
    const digits = value.trim().slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
      throw new BadRequestException('Phone must be an international number in E.164 format');
    }
    return digits;
  }

  private mediaMatchesMime(bytes: Buffer, mimeType: string) {
    if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mimeType === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (mimeType === 'video/mp4' || mimeType === 'audio/mp4') return bytes.toString('ascii', 4, 8) === 'ftyp';
    if (mimeType === 'audio/ogg') return bytes.toString('ascii', 0, 4) === 'OggS';
    if (mimeType === 'audio/mpeg') return bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    if (mimeType === 'application/pdf') return bytes.toString('ascii', 0, 5) === '%PDF-';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    }
    if (mimeType === 'text/plain') return !bytes.includes(0);
    return false;
  }

  private messageContent(input: WhatsappMessageInput) {
    if (input.type === 'text') return { text: input.text! };
    const buffer = Buffer.from(input.media!.base64, 'base64');
    if (input.type === 'image') return { image: buffer, mimetype: input.media!.mimeType, caption: input.caption };
    if (input.type === 'video') return { video: buffer, mimetype: input.media!.mimeType, caption: input.caption };
    if (input.type === 'audio') return { audio: buffer, mimetype: input.media!.mimeType, ptt: false };
    return {
      document: buffer,
      mimetype: input.media!.mimeType,
      fileName: input.media!.fileName,
      caption: input.caption,
    };
  }

  @Interval(30_000)
  private async restoreEnabledSessions() {
    if (this.shuttingDown) return;
    try {
      const enabled = await this.sessionModel.find({ enabled: true }).select('scopeKey scope tenantId').lean();
      for (const session of enabled) {
        if (this.reconnectExhausted.has(session.scopeKey)) continue;
        if (!this.sockets.has(session.scopeKey)) {
          try {
            await this.startConnection(session.scopeKey, session.scope, session.tenantId?.toString());
          } catch {
            await this.sessionModel.updateOne(
              { scopeKey: session.scopeKey },
              { $set: { connectionState: 'reconnecting' } },
            );
          }
        }
      }
    } catch {
      // The database can be unavailable during lazy startup; the interval retries.
    }
  }

  @Interval(5_000)
  private async dispatchPendingMessages() {
    if (this.shuttingDown) return;
    if (this.dispatching) {
      this.dispatchRequested = true;
      return;
    }
    this.dispatching = true;
    this.dispatchRequested = false;
    let processed = 0;
    try {
      for (let count = 0; count < 10; count += 1) {
        const now = new Date();
        const delivery = await this.deliveryModel.findOneAndUpdate(
          {
            $or: [
              { status: 'pending', nextAttemptAt: { $lte: now } },
              { status: 'sending', lockedAt: { $lt: new Date(now.getTime() - 120_000) } },
            ],
          },
          { $set: { status: 'sending', lockedAt: now }, $inc: { attempts: 1 } },
          { new: true, sort: { createdAt: 1 } },
        ).select('+encryptedPayload');
        if (!delivery) break;
        processed += 1;

        const tenantId = delivery.tenantId.toString();
        const socket = this.sockets.get(`tenant:${tenantId}`);
        if (!socket || !(await this.getSessionStatus(`tenant:${tenantId}`)).available) {
          await this.deliveryModel.updateOne(
            { _id: delivery._id },
            {
              $set: {
                status: delivery.attempts >= 5 ? 'failed' : 'pending',
                failureCode: 'WHATSAPP_SESSION_DISCONNECTED',
                nextAttemptAt: new Date(Date.now() + Math.min(300_000, 15_000 * delivery.attempts)),
                lockedAt: null,
              },
            },
          );
          continue;
        }

        try {
          const payload = JSON.parse(
            decryptWhatsappData(delivery.encryptedPayload, this.encryptionKey()),
          ) as WhatsappMessageInput;
          if (delivery.apiKeyId && !await this.apiKeysService.canSendQueuedWhatsappMessage(
            delivery.apiKeyId.toString(), tenantId,
          )) {
            await this.deliveryModel.updateOne(
              { _id: delivery._id },
              { $set: { status: 'failed', failureCode: 'WHATSAPP_KEY_REVOKED', lockedAt: null } },
            );
            continue;
          }
          const consent = await this.consentModel.findOne({
            tenantId: delivery.tenantId,
            phoneNumber: `+${payload.to}`,
            status: 'active',
            reference: payload.consentReference,
          }).lean();
          if (!consent) {
            await this.deliveryModel.updateOne(
              { _id: delivery._id },
              { $set: { status: 'failed', failureCode: 'WHATSAPP_CONSENT_REVOKED', lockedAt: null } },
            );
            continue;
          }
          const jid = `${payload.to}@s.whatsapp.net`;
          const messageId = `3EB0${delivery._id.toString().toUpperCase()}`;
          await this.deliveryModel.updateOne(
            { _id: delivery._id },
            { $set: { providerMessageId: messageId } },
          );
          const result = await socket.sendMessage(jid, this.messageContent(payload), { messageId });
          if (!result?.key?.id) throw new Error('Provider did not confirm a message identifier');
          await this.deliveryModel.updateOne(
            { _id: delivery._id, status: 'sending' },
            {
              $set: { status: 'sent', providerMessageId: result?.key?.id, lockedAt: null },
              $unset: { failureCode: 1 },
            },
          );
        } catch {
          await this.deliveryModel.updateOne(
            { _id: delivery._id },
            {
              $set: {
                status: delivery.attempts >= 5 ? 'failed' : 'pending',
                failureCode: 'WHATSAPP_SEND_FAILED',
                nextAttemptAt: new Date(Date.now() + Math.min(300_000, 15_000 * delivery.attempts)),
                lockedAt: null,
              },
            },
          );
        }
      }
    } catch {
      // Leave claimed deliveries recoverable by the lease timeout.
    } finally {
      this.dispatching = false;
      if (this.dispatchRequested || processed === 10) {
        this.dispatchRequested = false;
        setImmediate(() => void this.dispatchPendingMessages());
      }
    }
  }
}
