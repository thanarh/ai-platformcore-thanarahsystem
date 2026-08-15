import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { EmailService } from '../email/email.service';
import { Role } from '../../common/decorators/roles.decorator';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantSlug?: string;
  }) {
    if (data.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Resolve or create tenant
    let tenantId: string;
    if (data.tenantSlug) {
      const tenant = await this.tenantsService.findBySlug(data.tenantSlug);
      if (!tenant) throw new BadRequestException('Organization not found');
      tenantId = tenant._id.toString();
    } else {
      const slug = `tenant-${Date.now()}`;
      const tenant = await this.tenantsService.create({
        slug,
        name: `${data.firstName}'s Workspace`,
        type: 'organization',
        status: 'active',
      });
      tenantId = tenant._id.toString();
    }

    // First user globally becomes OWNER
    const totalUsers = await this.usersService.getTotalCount();
    const role = totalUsers === 0 ? Role.OWNER : Role.USER;

    const user = await this.usersService.create({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      role,
      tenantId,
    });

    // Generate email verification token and send it (non-blocking)
    const verificationToken = await this.usersService.generateVerificationToken(
      user._id.toString(),
    );
    this.emailService
      .sendVerificationEmail(user.email, user.firstName, verificationToken)
      .catch(() => {}); // fire-and-forget

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.toPublic(user),
      ...tokens,
      emailVerificationSent: true,
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await this.usersService.validatePassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.updateLastLogin(user._id.toString());

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.toPublic(user),
      ...tokens,
    };
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return this.usersService.toPublic(user);
  }

  /** Verify email using the token from the link */
  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Token is required');

    const user = await this.usersService.findByVerificationToken(token);
    if (!user) {
      throw new BadRequestException('رابط التحقق غير صالح أو منتهي الصلاحية');
    }

    await this.usersService.markEmailVerified(user._id.toString());
    return { success: true, message: 'تم تأكيد بريدك الإلكتروني بنجاح ✅' };
  }

  /** Resend verification email */
  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) {
      throw new BadRequestException('البريد الإلكتروني محقق بالفعل');
    }

    const token = await this.usersService.generateVerificationToken(user._id.toString());
    await this.emailService.sendVerificationEmail(user.email, user.firstName, token);

    return { success: true, message: 'تم إرسال رابط التحقق مجدداً' };
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tenantId: user.tenantId?.toString(),
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
