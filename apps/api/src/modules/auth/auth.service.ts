import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  WhatsappOtpChallenge,
  WhatsappOtpChallengeDocument,
} from './schemas/whatsapp-otp-challenge.schema';
import { Role } from '../../common/decorators/roles.decorator';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private whatsappService: WhatsappService,
    @InjectModel(WhatsappOtpChallenge.name)
    private readonly otpChallengeModel: Model<WhatsappOtpChallengeDocument>,
  ) {}

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    industry?: string;
    tenantSlug?: string;
  }) {
    if (
      !data
      || typeof data.email !== 'string'
      || typeof data.password !== 'string'
      || typeof data.firstName !== 'string'
      || typeof data.lastName !== 'string'
    ) {
      throw new BadRequestException('Registration details are incomplete');
    }

    const email = data.email.trim().toLowerCase();
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    if (!email || !firstName || !lastName) {
      throw new BadRequestException('Registration details are incomplete');
    }
    if (data.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    if (await this.usersService.emailExists(email)) {
      throw new ConflictException('Email already in use');
    }

    // Resolve or create tenant. The first global user remains the system
    // owner; later self-signups own only their own tenant.
    let tenantId: string;
    const tenantSlug = data.tenantSlug?.trim();
    let role = tenantSlug ? Role.USER : Role.TENANT_OWNER;
    if (tenantSlug) {
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) throw new BadRequestException('Organization not found');
      tenantId = tenant._id.toString();
    } else {
      const slug = `tenant-${Date.now()}`;
      const tenant = await this.tenantsService.create({
        slug,
        name: `${firstName}'s Workspace`,
        type: data.industry === 'healthcare' ? 'clinic' : 'organization',
        industry: data.industry || 'general',
        status: 'active',
        subscription: {
          plan: 'free',
          status: 'free',
          dailyPriceSar: 0,
          activatedByAdmin: false,
        },
        usagePolicy: {
          appDailyCoins: 500,
          appMessageCost: 50,
          apiDailyRequests: 50,
        },
        usageBalance: {
          day: new Date().toISOString().slice(0, 10),
          appCoinsUsed: 0,
          apiRequestsUsed: 0,
        },
        medicalMode: {
          enabled: false,
          configuredByAdmin: false,
        },
      });
      tenantId = tenant._id.toString();
    }

    // Preserve the existing first-user system-owner setup.
    const totalUsers = await this.usersService.getTotalCount();
    if (totalUsers === 0) role = Role.OWNER;

    let user = await this.usersService.create({
      email,
      password: data.password,
      firstName,
      lastName,
      role,
      tenantId,
    });
    user = await this.usersService.ensureTenantOwnerRole(user);

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
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new UnauthorizedException('Invalid email or password');
    }
    const foundUser = await this.usersService.findByEmail(email);
    if (!foundUser?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await this.usersService.validatePassword(password, foundUser.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.usersService.ensureTenantOwnerRole(foundUser);
    await this.usersService.updateLastLogin(user._id.toString());

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.toPublic(user),
      ...tokens,
    };
  }

  async requestPhoneCode(phoneValue: string, purpose: 'login' | 'register', clientIp: string) {
    const phone = this.normalizePhone(phoneValue);
    if (!['login', 'register'].includes(purpose)) {
      throw new BadRequestException('Purpose must be login or register');
    }
    const phoneHash = this.hashPhone(phone);
    const ipHash = this.hashPhone(`ip:${clientIp || 'unknown'}`);
    await this.whatsappService.consumeBudget(`otp-ip:${ipHash}`, 10, 3600);
    await this.whatsappService.consumeBudget(`otp-phone:${phoneHash}`, 5, 3600);
    await this.whatsappService.consumeBudget('otp-platform', 500, 86_400);
    const existingUser = await this.usersService.findByPhone(phone);
    const genericResponse = {
      success: true,
      message: 'إذا كان الرقم مؤهلًا، فسيصلك رمز التحقق عبر WhatsApp.',
      expiresInSeconds: 300,
    };
    if ((purpose === 'login' && !existingUser) || (purpose === 'register' && existingUser)) {
      return genericResponse;
    }

    const now = new Date();
    const latest = await this.otpChallengeModel
      .findOne({ phoneHash, purpose })
      .sort({ lastSentAt: -1 });
    if (latest && now.getTime() - latest.lastSentAt.getTime() < 60_000) {
      throw new HttpException('انتظر دقيقة قبل طلب رمز جديد.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const recentCount = await this.otpChallengeModel.countDocuments({
      phoneHash,
      purpose,
      lastSentAt: { $gt: new Date(now.getTime() - 60 * 60 * 1000) },
    });
    if (recentCount >= 5) {
      throw new HttpException('تم تجاوز حد طلب الرموز لهذا الرقم.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const secret = process.env.SESSION_SECRET || '';
    if (secret.length < 32) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_OTP_SECRET_NOT_CONFIGURED',
        message: 'Phone verification is not configured.',
      });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = this.hashOtp(phoneHash, code, secret);
    await this.whatsappService.consumeBudget(`otp-cooldown:${phoneHash}`, 1, 60);
    await this.otpChallengeModel.updateMany(
      { phoneHash, purpose, usedAt: null },
      { $set: { usedAt: now } },
    );
    const challenge = await this.otpChallengeModel.create({
      phoneHash,
      purpose,
      codeHash,
      attempts: 0,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      cleanupAt: new Date(now.getTime() + 60 * 60 * 1000),
    });
    try {
      await this.whatsappService.sendPlatformOtp(phone, code);
    } catch (error) {
      await this.otpChallengeModel.deleteOne({ _id: challenge._id });
      throw error;
    }
    return genericResponse;
  }

  async verifyPhoneCode(data: {
    phone: string;
    code: string;
    purpose: 'login' | 'register';
    firstName?: string;
    lastName?: string;
    industry?: string;
    email?: string;
    password?: string;
  }) {
    const phone = this.normalizePhone(data?.phone);
    if (!/^\d{6}$/.test(data?.code || '') || !['login', 'register'].includes(data?.purpose)) {
      throw new BadRequestException('رقم الهاتف أو رمز التحقق غير صالح.');
    }
    const phoneHash = this.hashPhone(phone);
    const challenge = await this.otpChallengeModel.findOneAndUpdate({
      phoneHash,
      purpose: data.purpose,
      usedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    }, { $inc: { attempts: 1 } }, { new: true, sort: { lastSentAt: -1 } });
    if (!challenge) throw new UnauthorizedException('رمز التحقق غير صالح أو منتهي الصلاحية.');

    const secret = process.env.SESSION_SECRET || '';
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hashOtp(phoneHash, data.code, secret), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('رمز التحقق غير صحيح.');
    }

    if (data.purpose === 'register') {
      if (
        (data.email !== undefined && typeof data.email !== 'string')
        || (data.password !== undefined && typeof data.password !== 'string')
        || (data.industry !== undefined && (typeof data.industry !== 'string' || data.industry.length > 80))
      ) {
        throw new BadRequestException('بيانات التسجيل غير صالحة.');
      }
      const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : '';
      const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : '';
      const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      const password = typeof data.password === 'string' ? data.password : '';
      if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) {
        throw new BadRequestException('الاسم الأول واسم العائلة مطلوبان.');
      }
      if ((email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (password && password.length < 8)) {
        throw new BadRequestException('البريد غير صالح أو كلمة المرور أقصر من 8 أحرف.');
      }
      if (Boolean(email) !== Boolean(password)) {
        throw new BadRequestException('أدخل البريد وكلمة المرور معًا، أو اتركهما فارغين.');
      }
      if (email && await this.usersService.emailExists(email)) {
        throw new ConflictException('Email already in use');
      }
    }

    const consumed = await this.otpChallengeModel.updateOne(
      { _id: challenge._id, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    );
    if (!consumed.modifiedCount) throw new UnauthorizedException('رمز التحقق مستخدم أو منتهي الصلاحية.');

    if (data.purpose === 'login') {
      const foundUser = await this.usersService.findByPhone(phone);
      if (!foundUser?.isPhoneVerified) throw new UnauthorizedException('رقم الهاتف غير مرتبط بحساب نشط.');
      const user = await this.usersService.ensureTenantOwnerRole(foundUser);
      await this.usersService.updateLastLogin(user._id.toString());
      const tokens = await this.generateTokens(user);
      await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);
      return { user: this.usersService.toPublic(user), ...tokens };
    }

    const firstName = data.firstName!.trim();
    const lastName = data.lastName!.trim();
    const email = data.email?.trim().toLowerCase() || undefined;
    const password = data.password || undefined;
    const slug = `tenant-${Date.now()}-${randomInt(1000, 9999)}`;
    const tenant = await this.tenantsService.create({
      slug,
      name: `${firstName}'s Workspace`,
      type: data.industry === 'healthcare' ? 'clinic' : 'organization',
      industry: data.industry || 'general',
      status: 'active',
      subscription: {
        plan: 'free',
        status: 'free',
        dailyPriceSar: 0,
        activatedByAdmin: false,
      },
      usagePolicy: { appDailyCoins: 500, appMessageCost: 50, apiDailyRequests: 50 },
      usageBalance: {
        day: new Date().toISOString().slice(0, 10),
        appCoinsUsed: 0,
        apiRequestsUsed: 0,
      },
      medicalMode: { enabled: false, configuredByAdmin: false },
    });
    const role = (await this.usersService.getTotalCount()) === 0 ? Role.OWNER : Role.TENANT_OWNER;
    let user = await this.usersService.createPhoneUser({
      phoneNumber: phone,
      email,
      password,
      firstName,
      lastName,
      role,
      tenantId: tenant._id.toString(),
    });
    user = await this.usersService.ensureTenantOwnerRole(user);
    if (email) {
      const verificationToken = await this.usersService.generateVerificationToken(user._id.toString());
      void this.emailService.sendVerificationEmail(email, firstName, verificationToken).catch(() => undefined);
    }
    await this.usersService.updateLastLogin(user._id.toString());
    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);
    return {
      user: this.usersService.toPublic(user),
      ...tokens,
      phoneVerified: true,
      emailVerificationSent: Boolean(email),
    };
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
      return {
        user: this.usersService.toPublic(effectiveUser),
        ...tokens,
      };
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again');
    }
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

  private normalizePhone(value: string): string {
    if (typeof value !== 'string' || !/^\+[0-9\s().-]+$/.test(value.trim())) {
      throw new BadRequestException('رقم هاتف دولي مطلوب.');
    }
    const digits = value.trim().slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
      throw new BadRequestException('أدخل رقم الهاتف بالصيغة الدولية، مثل +9665XXXXXXXX.');
    }
    return `+${digits}`;
  }

  private hashPhone(phone: string) {
    const secret = process.env.SESSION_SECRET || '';
    if (secret.length < 32) {
      throw new ServiceUnavailableException('Phone verification is not configured.');
    }
    return createHmac('sha256', secret).update(`phone:${phone}`).digest('hex');
  }

  private hashOtp(phoneHash: string, code: string, secret: string) {
    return createHmac('sha256', secret).update(`${phoneHash}:${code}`).digest('hex');
  }
}
