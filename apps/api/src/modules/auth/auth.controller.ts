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
} from '@nestjs/common';
import { JwtAuthGuard, IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  register(
    @Body()
    body: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      tenantSlug?: string;
    },
  ) {
    return this.authService.register(body);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser('_id') userId: string) {
    return this.authService.logout(userId.toString());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser('_id') userId: string) {
    return this.authService.getMe(userId.toString());
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
