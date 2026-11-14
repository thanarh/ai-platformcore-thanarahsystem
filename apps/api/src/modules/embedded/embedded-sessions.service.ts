import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  EmbeddedIntegration, EmbeddedIntegrationDocument, EmbeddedSession, EmbeddedSessionDocument,
} from './schemas/embedded.schema';
import { assertEmbeddedOrigin, embeddedHash, embeddedRole, embeddedToken, requireEmbeddedToken } from './embedded.policy';

@Injectable()
export class EmbeddedSessionsService {
  constructor(
    @InjectModel(EmbeddedIntegration.name) private readonly integrations: Model<EmbeddedIntegrationDocument>,
    @InjectModel(EmbeddedSession.name) private readonly sessions: Model<EmbeddedSessionDocument>,
    private readonly users: UsersService,
    private readonly tenants: TenantsService,
  ) {}

  tokens() {
    return { accessToken: embeddedToken('the'), refreshToken: embeddedToken('thr') };
  }

  tokenFields(tokens: ReturnType<EmbeddedSessionsService['tokens']>) {
    return {
      accessHash: embeddedHash(tokens.accessToken), refreshHash: embeddedHash(tokens.refreshToken),
      accessExpiresAt: new Date(Date.now() + 5 * 60_000),
      refreshExpiresAt: new Date(Date.now() + 15 * 60_000),
    };
  }

  private async principal(session: EmbeddedSessionDocument) {
    const integration = await this.integrations.findById(session.integrationId);
    assertEmbeddedOrigin(integration, session.origin);
    if (integration.version !== session.version) throw new UnauthorizedException('تغيّر مفتاح الربط. أعد الاتصال.');
    const user = await this.users.findById(session.userId?.toString());
    if (!user?.isActive || !user.isPhoneVerified || !user.tenantId
      || user.tenantId.toString() !== session.tenantId?.toString()) {
      throw new UnauthorizedException('تغيّر الحساب أو مؤسسته. تحقق من الهوية مجددًا.');
    }
    const tenant = await this.tenants.findById(session.tenantId.toString());
    if (!tenant.isActive || tenant.status === 'suspended') throw new UnauthorizedException('المؤسسة غير نشطة.');
    return {
      _id: user._id.toString(), tenantId: session.tenantId.toString(),
      firstName: user.firstName, lastName: user.lastName, email: user.email,
      phoneNumber: user.phoneNumber, isPhoneVerified: true,
      role: embeddedRole(user.role), isEmbedded: true,
      embeddedIntegrationId: session.integrationId.toString(),
    };
  }

  async authenticate(token: string) {
    requireEmbeddedToken(token, 'the');
    const session = await this.sessions.findOne({
      accessHash: embeddedHash(token), state: 'active',
      accessExpiresAt: { $gt: new Date() }, expiresAt: { $gt: new Date() },
    });
    if (!session) throw new UnauthorizedException('انتهت جلسة التضمين أو أُبطلت.');
    try { return await this.principal(session); }
    catch { throw new UnauthorizedException('جلسة الربط غير متاحة. أعد الاتصال بالنظام.'); }
  }

  async response(session: EmbeddedSessionDocument, tokens: ReturnType<EmbeddedSessionsService['tokens']>) {
    return {
      next: 'authenticated' as const, user: await this.principal(session),
      ...tokens, expiresInSeconds: 300, embedded: true,
    };
  }

  async refresh(refreshToken: string) {
    requireEmbeddedToken(refreshToken, 'thr');
    const filter = {
      refreshHash: embeddedHash(refreshToken), state: 'active',
      refreshExpiresAt: { $gt: new Date() }, expiresAt: { $gt: new Date() },
    };
    const found = await this.sessions.findOne(filter);
    if (!found) throw new UnauthorizedException('انتهت جلسة الربط. أعد الاتصال.');
    try { await this.principal(found); }
    catch { throw new UnauthorizedException('أُبطل الربط أو تغيّرت الهوية.'); }
    const tokens = this.tokens();
    const updated = await this.sessions.findOneAndUpdate(filter, { $set: this.tokenFields(tokens) }, { new: true });
    if (!updated) throw new UnauthorizedException('استُخدم رمز التحديث. أعد الاتصال.');
    return this.response(updated, tokens);
  }

  async logout(token: string) {
    requireEmbeddedToken(token, 'the');
    await this.sessions.updateOne(
      { accessHash: embeddedHash(token), state: 'active' }, { $set: { state: 'revoked' } },
    );
    return { success: true };
  }
}
