import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  SetMetadata,
  Req,
  UseFilters,
} from '@nestjs/common';
import { JwtAuthGuard, IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { WhatsappRateLimitFilter } from '../whatsapp/whatsapp-rate-limit.filter';
import { CompletePhoneRegistration } from './phone-enrollment.service';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('auth')
@UseFilters(WhatsappRateLimitFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  register(
    @Body()
    body: CompletePhoneRegistration,
  ) {
    return this.authService.register(body);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('phone/request-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  requestPhoneCode(
    @Body() body: { phone: string; purpose: 'login' | 'register'; country?: string },
    @Req() request: { ip?: string; socket?: { remoteAddress?: string } },
  ) {
    return this.authService.requestPhoneCode(
      body?.phone, body?.purpose, request.ip || request.socket?.remoteAddress || 'unknown', body?.country,
    );
  }

  @Post('phone/verify-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  verifyPhoneCode(@Body() body: {
    phone: string;
    code: string;
    purpose: 'login' | 'register';
    country?: string;
  }) {
    return this.authService.verifyPhoneCode(body);
  }

  @Post('phone/complete-registration')
  @Public()
  @HttpCode(HttpStatus.OK)
  completePhoneRegistration(@Body() body: CompletePhoneRegistration) {
    return this.authService.completePhoneRegistration(body);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser('_id') userId: string) {
    return this.authService.logout(userId.toString());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() principal: any) {
    const user = await this.authService.getMe(principal._id.toString());
    return principal.isEmbedded ? {
      ...user, role: principal.role, tenantId: principal.tenantId,
      isEmbedded: true, embeddedIntegrationId: principal.embeddedIntegrationId,
    } : user;
  }

  /**
   * GET /auth/verify-email?token=xxx
   * Called when the user clicks the link in the verification email.
   */
  @Get('verify-email')
  @Public()
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  /**
   * POST /auth/resend-verification
   * Body: { email }
   * Allows a user to request a new verification email.
   */
  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerification(body.email);
  }
}
