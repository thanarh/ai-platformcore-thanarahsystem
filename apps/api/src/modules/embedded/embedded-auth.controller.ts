import {
  Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, Req, UseFilters,
} from '@nestjs/common';
import { PhoneEnrollmentService } from '../auth/phone-enrollment.service';
import { WhatsappRateLimitFilter } from '../whatsapp/whatsapp-rate-limit.filter';
import { EmbeddedService } from './embedded.service';
import { EmbeddedSessionsService } from './embedded-sessions.service';
import { EmbeddedSessionDocument } from './schemas/embedded.schema';
import { requireEmbeddedToken } from './embedded.policy';
import { CompletePhoneRegistration } from '../auth/phone-enrollment.service';

@Controller('embedded')
@UseFilters(WhatsappRateLimitFilter)
export class EmbeddedAuthController {
  constructor(
    private readonly embedded: EmbeddedService,
    private readonly sessions: EmbeddedSessionsService,
    private readonly phones: PhoneEnrollmentService,
  ) {}

  private token(value: string) { return requireEmbeddedToken(value, 'thc'); }

  @Post(':id/phone/request-code')
  @HttpCode(HttpStatus.OK)
  async requestCode(@Param('id') id: string, @Headers('authorization') authorization: string,
    @Req() request: { ip?: string; socket?: { remoteAddress?: string } },
    @Body() body: { phone: string; country?: string; purpose: 'login' | 'register' }) {
    const token = this.token(authorization?.replace(/^Bearer /i, ''));
    await this.embedded.pending(id, token);
    return this.phones.requestCode(
      body?.phone, body?.purpose, request.ip || request.socket?.remoteAddress || 'unknown', body?.country,
    );
  }

  @Post(':id/phone/verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Param('id') id: string, @Headers('authorization') authorization: string,
    @Body() body: { phone: string; code: string; country?: string; purpose: 'login' | 'register' }) {
    const token = this.token(authorization?.replace(/^Bearer /i, ''));
    const pending = await this.embedded.pending(id, token);
    const result = await this.phones.verifyCode(body);
    if (result.next === 'authenticated') return this.embedded.bindExisting(pending, result.user);
    await this.embedded.rememberProof(pending, result.enrollmentToken);
    return {
      next: 'complete_registration' as const,
      phone: result.phone, phoneProof: result.enrollmentToken,
      expiresInSeconds: result.expiresInSeconds,
    };
  }

  @Post(':id/phone/complete-registration')
  @HttpCode(HttpStatus.OK)
  async completeRegistration(@Param('id') id: string, @Headers('authorization') authorization: string,
    @Body() body: CompletePhoneRegistration & { phoneProof: string }) {
    const token = this.token(authorization?.replace(/^Bearer /i, ''));
    const pending = await this.embedded.pending(id, token);
    this.embedded.checkProof(pending, body?.phoneProof);
    const tokens = this.sessions.tokens();
    let active: EmbeddedSessionDocument | undefined;
    const { phoneProof, ...details } = body;
    await this.phones.completeRegistration(
      { ...details, enrollmentToken: phoneProof },
      async (created, session) => {
        active = await this.embedded.bind(pending, created, session, tokens, phoneProof);
      },
    );
    if (!active) throw new Error('Embedded session transaction did not produce a session');
    return this.sessions.response(active, tokens);
  }
}
