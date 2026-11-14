import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { EmailService } from '../email/email.service';
import { createHash } from 'crypto';
import { CompletePhoneRegistration, PhoneEnrollmentService } from './phone-enrollment.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private phoneEnrollment: PhoneEnrollmentService,
  ) {}

  // The legacy route now requires the same verified enrollment proof.
  // Email-only registration cannot bypass the mandatory mobile identity.
  async register(data: CompletePhoneRegistration) {
    return this.completePhoneRegistration(data);
  }

  async login(email: string, password: string) {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new UnauthorizedException('Invalid email or password');
    }
    const foundUser = await this.usersService.findByEmail(email);
    if (!foundUser?.passwordHash) throw new UnauthorizedException('Invalid email or password');
    const isValid = await this.usersService.validatePassword(password, foundUser.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid email or password');
    const user = await this.usersService.ensureTenantOwnerRole(foundUser);
    return this.issueSession(user);
  }

  requestPhoneCode(phone: string, purpose: 'login' | 'register', clientIp: string, country?: string) {
    return this.phoneEnrollment.requestCode(phone, purpose, clientIp, country);
  }

  async verifyPhoneCode(data: {
    phone: string; code: string; purpose: 'login' | 'register'; country?: string;
  }) {
    const verified = await this.phoneEnrollment.verifyCode(data);
    if (verified.next === 'complete_registration') return verified;
    return { next: 'authenticated' as const, ...await this.issueSession(verified.user) };
  }

  async completePhoneRegistration(data: CompletePhoneRegistration) {
    const user = await this.phoneEnrollment.completeRegistration(data);
    let emailVerificationSent = false;
    if (user.email) {
      // Account and phone proof have already committed; email is supplementary.
      try {
        const token = await this.usersService.generateVerificationToken(user._id.toString());
        await this.emailService.sendVerificationEmail(user.email, user.firstName, token);
        emailVerificationSent = true;
      } catch {
        // Optional email delivery must not undo a verified phone account.
      }
    }
    return {
      next: 'authenticated' as const,
      ...await this.issueSession(user),
      phoneVerified: true, emailVerificationSent,
    };
  }

  private async issueSession(user: any) {
    await this.usersService.updateLastLogin(user._id.toString());
    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);
    return { user: this.usersService.toPublic(user), ...tokens };
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { success: true };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token is required');
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });
      const user = await this.usersService.findById(payload.sub);
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const storedTokenMatches = user?.refreshToken === tokenHash || user?.refreshToken === refreshToken;
      if (!user || !user.isActive || !user.refreshToken || !storedTokenMatches) {
        throw new UnauthorizedException('Session is no longer valid');
      }
      const effectiveUser = await this.usersService.ensureTenantOwnerRole(user);
      const tokens = await this.generateTokens(effectiveUser);
      await this.usersService.updateRefreshToken(effectiveUser._id.toString(), tokens.refreshToken);
      return { user: this.usersService.toPublic(effectiveUser), ...tokens };
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again');
    }
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return this.usersService.toPublic(user);
  }

  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Token is required');
    const user = await this.usersService.findByVerificationToken(token);
    if (!user) throw new BadRequestException('رابط التحقق غير صالح أو منتهي الصلاحية');
    await this.usersService.markEmailVerified(user._id.toString());
    return { success: true, message: 'تم تأكيد بريدك الإلكتروني بنجاح ✅' };
  }

  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('البريد الإلكتروني محقق بالفعل');
    const token = await this.usersService.generateVerificationToken(user._id.toString());
    await this.emailService.sendVerificationEmail(user.email, user.firstName, token);
    return { success: true, message: 'تم إرسال رابط التحقق مجدداً' };
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user._id.toString(), email: user.email, phoneNumber: user.phoneNumber,
      role: user.role, tenantId: user.tenantId?.toString(),
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.secret'),
      expiresIn: this.configService.get('jwt.expiresIn'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
    });
    return { accessToken, refreshToken };
  }
}
