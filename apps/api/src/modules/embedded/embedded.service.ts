import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus,
  Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  EmbeddedBootstrap, EmbeddedBootstrapDocument, EmbeddedIdentity, EmbeddedIdentityDocument,
  EmbeddedIntegration, EmbeddedIntegrationDocument, EmbeddedSession, EmbeddedSessionDocument,
} from './schemas/embedded.schema';
import {
  assertEmbeddedOrigin, embeddedHash, embeddedToken, normalizeEmbeddedOrigin, requireEmbeddedToken,
} from './embedded.policy';
import { EmbeddedSessionsService } from './embedded-sessions.service';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class EmbeddedService {
  constructor(
    @InjectModel(EmbeddedIntegration.name) private readonly integrations: Model<EmbeddedIntegrationDocument>,
    @InjectModel(EmbeddedIdentity.name) private readonly identities: Model<EmbeddedIdentityDocument>,
    @InjectModel(EmbeddedBootstrap.name) private readonly bootstraps: Model<EmbeddedBootstrapDocument>,
    @InjectModel(EmbeddedSession.name) private readonly sessions: Model<EmbeddedSessionDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sessionService: EmbeddedSessionsService,
  ) {}

  private id(id: string) {
    if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new BadRequestException('معرّف الربط غير صالح.');
    return new Types.ObjectId(id);
  }

  private details(data: { name: string; allowedOrigins: string[] }) {
    if (!data || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100
      || !Array.isArray(data.allowedOrigins) || data.allowedOrigins.length < 1 || data.allowedOrigins.length > 20) {
      throw new BadRequestException('أدخل اسم الربط وموقعًا مسموحًا واحدًا على الأقل، بحد أقصى 20 موقعًا.');
    }
    return { name: data.name.trim(), allowedOrigins: [...new Set(data.allowedOrigins.map(normalizeEmbeddedOrigin))] };
  }

  private publicIntegration(integration: EmbeddedIntegrationDocument) {
    const { keyHash: _hash, ...safe } = integration.toObject();
    return safe;
  }

  async create(tenantId: string, userId: string, data: { name: string; allowedOrigins: string[] }) {
    const key = embeddedToken('thn_embed');
    const integration = await this.integrations.create({
      ...this.details(data), tenantId: this.id(tenantId), createdBy: this.id(userId),
      keyHash: embeddedHash(key), keyPrefix: `${key.slice(0, 18)}…`,
    });
    return { ...this.publicIntegration(integration), key };
  }

  async list(tenantId: string) {
    return this.integrations.find({ tenantId: this.id(tenantId) }).sort({ createdAt: -1 });
  }

  async update(id: string, tenantId: string, data: { name: string; allowedOrigins: string[] }) {
    const integration = await this.integrations.findOneAndUpdate(
      { _id: this.id(id), tenantId: this.id(tenantId) },
      { $set: this.details(data), $inc: { version: 1 } }, { new: true },
    );
    if (!integration) throw new NotFoundException('الربط غير موجود.');
    return this.publicIntegration(integration);
  }

  async rotate(id: string, tenantId: string) {
    const key = embeddedToken('thn_embed');
    const integration = await this.integrations.findOneAndUpdate(
      { _id: this.id(id), tenantId: this.id(tenantId), isActive: true },
      { $set: { keyHash: embeddedHash(key), keyPrefix: `${key.slice(0, 18)}…` }, $inc: { version: 1 } },
      { new: true },
    );
    if (!integration) throw new NotFoundException('الربط غير موجود أو متوقف.');
    return { ...this.publicIntegration(integration), key };
  }

  async revoke(id: string, tenantId: string) {
    const result = await this.integrations.updateOne(
      { _id: this.id(id), tenantId: this.id(tenantId) },
      { $set: { isActive: false }, $inc: { version: 1 } },
    );
    if (!result.matchedCount) throw new NotFoundException('الربط غير موجود.');
    return { success: true };
  }

  async config(id: string, originValue: string) {
    const origin = normalizeEmbeddedOrigin(originValue);
    const integration = await this.integrations.findById(this.id(id));
    assertEmbeddedOrigin(integration, origin);
    return { id, type: 'thanarah_embed', name: integration.name, allowedOrigins: [origin] };
  }

  async bootstrap(id: string, key: string, data: { externalUserId: string; origin: string; nonce: string }) {
    requireEmbeddedToken(key, 'thn_embed');
    if (!data || typeof data.externalUserId !== 'string' || !data.externalUserId.trim()
      || data.externalUserId !== data.externalUserId.trim() || data.externalUserId.length > 200
      || typeof data.nonce !== 'string' || !/^[\w-]{32,128}$/.test(data.nonce)) {
      throw new BadRequestException('يلزم معرّف مستخدم خادمي ورمز طلب صالحان.');
    }
    const origin = normalizeEmbeddedOrigin(data.origin);
    const integration = await this.integrations.findOne({ _id: this.id(id), keyHash: embeddedHash(key), isActive: true });
    if (!integration) throw new UnauthorizedException('مفتاح الربط غير صالح أو أُبطل.');
    assertEmbeddedOrigin(integration, origin);
    const minute = Math.floor(Date.now() / 60_000);
    const limited = await this.integrations.updateOne({
      _id: integration._id, isActive: true, version: integration.version,
      $or: [{ bootstrapMinute: { $ne: minute } }, { bootstrapsInMinute: { $lt: 60 } }],
    }, [{
      $set: {
        bootstrapMinute: minute,
        bootstrapsInMinute: {
          $cond: [{ $eq: ['$bootstrapMinute', minute] }, { $add: ['$bootstrapsInMinute', 1] }, 1],
        },
      },
    }]);
    if (!limited.matchedCount) throw new HttpException('تجاوز الربط حد تهيئة الجلسات. حاول بعد دقيقة.', HttpStatus.TOO_MANY_REQUESTS);
    const subjectHash = embeddedHash(`${id.toLowerCase()}\0${data.externalUserId}`);
    const identity = await this.identities.findOne({ integrationId: integration._id, subjectHash });
    const code = embeddedToken('thb');
    await this.bootstraps.create({
      codeHash: embeddedHash(code), integrationId: integration._id,
      version: integration.version, subjectHash, origin, nonce: data.nonce,
      userId: identity?.userId, tenantId: identity?.tenantId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    return { code, expiresInSeconds: 60, framePath: `/embed/${id}?origin=${encodeURIComponent(origin)}` };
  }

  async exchange(id: string, data: { code: string; origin: string; nonce: string }) {
    requireEmbeddedToken(data?.code, 'thb');
    const origin = normalizeEmbeddedOrigin(data.origin);
    if (typeof data.nonce !== 'string') throw new BadRequestException('رمز الطلب مطلوب.');
    const integration = await this.integrations.findById(this.id(id));
    assertEmbeddedOrigin(integration, origin);
    const onboardingToken = embeddedToken('thc');
    const tokens = this.sessionService.tokens();
    const result = await this.connection.transaction(async (session) => {
      const code = await this.bootstraps.findOneAndUpdate({
        integrationId: integration._id, version: integration.version, origin, nonce: data.nonce,
        codeHash: embeddedHash(data.code), usedAt: null, expiresAt: { $gt: new Date() },
      }, { $set: { usedAt: new Date() } }, { new: true, session });
      if (!code) throw new UnauthorizedException('انتهى رمز التهيئة أو استُخدم، أو أن الموقع/الطلب لا يطابقه.');
      const identity = await this.identities.findOne({
        integrationId: integration._id, subjectHash: code.subjectHash,
      }).session(session);
      if (code.userId && (!identity || identity.userId.toString() !== code.userId.toString()
        || identity.tenantId.toString() !== code.tenantId?.toString())) {
        throw new UnauthorizedException('تغيّر ارتباط الحساب. أعد التهيئة.');
      }
      const [created] = await this.sessions.create([{
        integrationId: integration._id, version: integration.version,
        subjectHash: code.subjectHash, origin, nonce: data.nonce,
        state: identity ? 'active' : 'pending',
        ...(identity ? {
          userId: identity.userId, tenantId: identity.tenantId,
          ...this.sessionService.tokenFields(tokens),
        } : { onboardingHash: embeddedHash(onboardingToken) }),
        expiresAt: new Date(Date.now() + (identity ? 8 * 60 * 60_000 : 15 * 60_000)),
      }], { session });
      return created;
    });
    return result.state === 'active' ? this.sessionService.response(result, tokens)
      : { next: 'verify_phone' as const, onboardingToken, expiresInSeconds: 900 };
  }

  async pending(id: string, onboardingToken: string) {
    requireEmbeddedToken(onboardingToken, 'thc');
    const pending = await this.sessions.findOne({
      integrationId: this.id(id), onboardingHash: embeddedHash(onboardingToken),
      state: 'pending', expiresAt: { $gt: new Date() },
    }).select('+registrationProofHash');
    if (!pending) throw new UnauthorizedException('انتهت تهيئة الحساب. أعد الاتصال من النظام المضيف.');
    const integration = await this.integrations.findById(pending.integrationId);
    assertEmbeddedOrigin(integration, pending.origin);
    if (integration.version !== pending.version) throw new UnauthorizedException('أُبطل مفتاح الربط.');
    return pending;
  }

  async rememberProof(pending: EmbeddedSessionDocument, proof?: string) {
    await this.sessions.updateOne({ _id: pending._id, state: 'pending' },
      proof ? { $set: { registrationProofHash: embeddedHash(proof) } } : { $unset: { registrationProofHash: '' } });
  }

  checkProof(pending: EmbeddedSessionDocument, token: string) {
    if (typeof token !== 'string' || pending.registrationProofHash !== embeddedHash(token)) {
      throw new UnauthorizedException('إثبات الجوال لا يخص تهيئة هذا الحساب.');
    }
  }

  async bind(pending: EmbeddedSessionDocument, user: UserDocument, session: ClientSession,
    tokens: ReturnType<EmbeddedSessionsService['tokens']>) {
    if (!user.isActive || !user.isPhoneVerified || !user.tenantId) throw new ForbiddenException('يلزم حساب نشط متحقق الجوال.');
    const identity = await this.identities.findOneAndUpdate(
      { integrationId: pending.integrationId, subjectHash: pending.subjectHash },
      { $setOnInsert: { userId: user._id, tenantId: user.tenantId } },
      { upsert: true, new: true, session },
    );
    if (identity.userId.toString() !== user._id.toString() || identity.tenantId.toString() !== user.tenantId.toString()) {
      throw new ConflictException('هوية النظام المضيف مرتبطة بحساب آخر. لا يمكن تبديل صاحبها تلقائيًا.');
    }
    const active = await this.sessions.findOneAndUpdate({
      _id: pending._id, state: 'pending', expiresAt: { $gt: new Date() },
    }, {
      $set: {
        state: 'active', userId: user._id, tenantId: user.tenantId,
        ...this.sessionService.tokenFields(tokens), expiresAt: new Date(Date.now() + 8 * 60 * 60_000),
      },
      $unset: { onboardingHash: '', registrationProofHash: '' },
    }, { new: true, session });
    if (!active) throw new UnauthorizedException('استُخدمت تهيئة الحساب أو انتهت.');
    return active;
  }

  async bindExisting(pending: EmbeddedSessionDocument, user: UserDocument) {
    const tokens = this.sessionService.tokens();
    try {
      const active = await this.connection.transaction((session) => this.bind(pending, user, session, tokens));
      return this.sessionService.response(active, tokens);
    } catch (error: any) {
      if (error.code === 11000) throw new ConflictException('الحساب مرتبط بهوية أخرى في هذا النظام.');
      throw error;
    }
  }
}
