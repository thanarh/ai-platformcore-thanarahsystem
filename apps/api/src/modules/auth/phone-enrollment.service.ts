import {
  BadRequestException, ConflictException, ForbiddenException, HttpException,
  HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { Role } from '../../common/decorators/roles.decorator';
import { WhatsappOtpChallenge, WhatsappOtpChallengeDocument } from './schemas/whatsapp-otp-challenge.schema';
import { PhoneEnrollment, PhoneEnrollmentDocument } from './schemas/phone-enrollment.schema';
import { normalizeAuthPhone } from './phone-number';
import { roleAfterPhoneVerification } from './phone-admin-policy';

type Purpose = 'login' | 'register';
export type CompletePhoneRegistration = {
  enrollmentToken: string;
  firstName: string;
  lastName: string;
  industry?: string;
  email?: string;
  password?: string;
};

@Injectable()
export class PhoneEnrollmentService {
  constructor(
    private readonly users: UsersService,
    private readonly tenants: TenantsService,
    private readonly whatsapp: WhatsappService,
    @InjectModel(WhatsappOtpChallenge.name)
    private readonly challenges: Model<WhatsappOtpChallengeDocument>,
    @InjectModel(PhoneEnrollment.name)
    private readonly enrollments: Model<PhoneEnrollmentDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private secret() {
    const secret = process.env.SESSION_SECRET || '';
    if (secret.length < 32) {
      throw new ServiceUnavailableException('التحقق بالجوال غير مهيأ حاليًا. تواصل مع مدير المنصة.');
    }
    return secret;
  }

  private hash(value: string) {
    return createHmac('sha256', this.secret()).update(value).digest('hex');
  }

  private checkPurpose(purpose: Purpose) {
    if (!['login', 'register'].includes(purpose)) {
      throw new BadRequestException('حدد طلب الدخول أو التسجيل.');
    }
  }

  async requestCode(phoneValue: string, purpose: Purpose, clientIp: string, country?: string) {
    const phone = normalizeAuthPhone(phoneValue, country);
    this.checkPurpose(purpose);
    const phoneHash = this.hash(`phone:${phone}`);
    const ipHash = this.hash(`phone:ip:${clientIp || 'unknown'}`);
    await this.whatsapp.consumeBudget(`otp-ip:${ipHash}`, 10, 3600);
    await this.whatsapp.consumeBudget(`otp-phone:${phoneHash}`, 5, 3600);
    await this.whatsapp.consumeBudget('otp-platform', 500, 86_400);
    const now = new Date();
    const latest = await this.challenges.findOne({ phoneHash }).sort({ lastSentAt: -1 });
    if (latest && now.getTime() - latest.lastSentAt.getTime() < 60_000) {
      throw new HttpException('انتظر دقيقة قبل طلب رمز جديد.', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.whatsapp.consumeBudget(`otp-cooldown:${phoneHash}`, 1, 60);
    // No account lookup here: both known and new numbers receive a real code.
    await this.challenges.updateMany(
      { phoneHash, usedAt: null }, { $set: { usedAt: now } },
    );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challenge = await this.challenges.create({
      phoneHash, purpose,
      codeHash: this.hash(`${phoneHash}:${code}`),
      attempts: 0, lastSentAt: now,
      expiresAt: new Date(now.getTime() + 300_000),
      cleanupAt: new Date(now.getTime() + 3_600_000),
    });
    try {
      await this.whatsapp.sendPlatformOtp(phone, code);
    } catch {
      await this.challenges.deleteOne({ _id: challenge._id });
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_OTP_SEND_UNAVAILABLE',
        message: 'تعذّر إرسال رمز WhatsApp. تأكد من اتصال رقم المنصة وأن رقمك يستخدم WhatsApp، ثم حاول لاحقًا.',
      });
    }
    return {
      success: true, expiresInSeconds: 300, retryAfterSeconds: 60,
      message: 'أُرسل رمز التحقق عبر WhatsApp. أدخله للمتابعة.',
    };
  }

  async verifyCode(data: { phone: string; code: string; purpose: Purpose; country?: string }) {
    const phone = normalizeAuthPhone(data?.phone, data?.country);
    this.checkPurpose(data?.purpose);
    if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) {
      throw new BadRequestException('أدخل رمز التحقق المكوّن من ستة أرقام.');
    }
    const phoneHash = this.hash(`phone:${phone}`);
    const challenge = await this.challenges.findOneAndUpdate({
      phoneHash, purpose: data.purpose, usedAt: null,
      expiresAt: { $gt: new Date() }, attempts: { $lt: 5 },
    }, { $inc: { attempts: 1 } }, { new: true, sort: { lastSentAt: -1 } });
    if (!challenge) {
      throw new UnauthorizedException('الرمز منتهي أو مستخدم أو تجاوز حد المحاولات. اطلب رمزًا جديدًا.');
    }
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hash(`${phoneHash}:${data.code}`), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('رمز التحقق غير صحيح.');
    }
    const consumed = await this.challenges.updateOne(
      { _id: challenge._id, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    );
    if (!consumed.modifiedCount) throw new UnauthorizedException('الرمز مستخدم أو منتهي. اطلب رمزًا جديدًا.');

    const existing = await this.users.findAnyByPhone(phone);
    if (existing) {
      if (!existing.isActive) throw new ForbiddenException('هذا الحساب غير نشط. تواصل مع الإدارة.');
      let user = await this.users.confirmPhoneOwnership(
        existing, roleAfterPhoneVerification(phone, existing.role),
      );
      user = await this.users.ensureTenantOwnerRole(user);
      return { next: 'authenticated' as const, user };
    }
    const enrollmentToken = randomBytes(32).toString('base64url');
    await this.enrollments.create({
      tokenHash: this.tokenHash(enrollmentToken),
      phoneNumber: phone,
      expiresAt: new Date(Date.now() + 600_000),
    });
    return {
      next: 'complete_registration' as const,
      enrollmentToken, phone, expiresInSeconds: 600,
    };
  }

  async completeRegistration(data: CompletePhoneRegistration) {
    const details = this.validateDetails(data);
    const tokenHash = this.tokenHash(data.enrollmentToken);
    try {
      // Proof consumption, account and institution commit together, or all roll back.
      // Never fall back to non-transactional writes if the database is unavailable.
      return await this.connection.transaction(async (session) => {
        const proof = await this.enrollments.findOneAndUpdate({
          tokenHash, consumedAt: null, expiresAt: { $gt: new Date() },
        }, { $set: { consumedAt: new Date() } }, { new: true, session });
        if (!proof) {
          throw new UnauthorizedException('انتهى إثبات الجوال أو استُخدم. تحقق من رقمك مجددًا.');
        }
        const tenant = await this.tenants.create({
          slug: `tenant-${randomBytes(16).toString('hex')}`,
          name: `${details.firstName}'s Workspace`,
          type: details.industry === 'healthcare' ? 'clinic' : 'organization',
          industry: details.industry, status: 'active',
          subscription: { plan: 'free', status: 'free', dailyPriceSar: 0, activatedByAdmin: false },
          usagePolicy: { appDailyCoins: 500, appMessageCost: 50, apiDailyRequests: 50 },
          usageBalance: { day: new Date().toISOString().slice(0, 10), appCoinsUsed: 0, apiRequestsUsed: 0 },
          medicalMode: { enabled: false, configuredByAdmin: false },
        }, session);
        const user = await this.users.createPhoneUser({
          ...details, phoneNumber: proof.phoneNumber,
          role: roleAfterPhoneVerification(proof.phoneNumber, Role.TENANT_OWNER),
          tenantId: tenant._id.toString(),
        }, session);
        return user;
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('الحساب مسجّل بالفعل. سجّل الدخول بالجوال دون إنشاء حساب جديد.');
      }
      throw error;
    }
  }

  private tokenHash(token: string) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException('يلزم التحقق من الجوال أولًا.');
    }
    return createHash('sha256').update(token).digest('hex');
  }

  private validateDetails(data: CompletePhoneRegistration) {
    if (!data || Object.keys(data).some((key) => ![
      'enrollmentToken', 'firstName', 'lastName', 'industry', 'email', 'password',
    ].includes(key))) throw new BadRequestException('بيانات التسجيل غير صالحة.');
    if (typeof data.firstName !== 'string' || typeof data.lastName !== 'string'
      || !data.firstName.trim() || !data.lastName.trim()
      || data.firstName.length > 80 || data.lastName.length > 80
      || (data.email !== undefined && typeof data.email !== 'string')
      || (data.password !== undefined && typeof data.password !== 'string')
      || (data.industry !== undefined && (typeof data.industry !== 'string' || data.industry.length > 80))) {
      throw new BadRequestException('أدخل الاسم الأول واسم العائلة وبيانات صالحة.');
    }
    const email = data.email?.trim().toLowerCase() || undefined;
    const password = data.password || undefined;
    if ((email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      || (password && (password.length < 8 || password.length > 128))
      || Boolean(email) !== Boolean(password)) {
      throw new BadRequestException('البريد وكلمة المرور اختياريان معًا. استخدم بريدًا صالحًا وكلمة مرور من 8 إلى 128 حرفًا.');
    }
    return {
      firstName: data.firstName.trim(), lastName: data.lastName.trim(),
      email, password, industry: data.industry?.trim() || 'general',
    };
  }
}
