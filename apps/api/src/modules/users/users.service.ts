import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument } from './schemas/user.schema';
import { Role } from '../../common/decorators/roles.decorator';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: Role;
    tenantId?: string;
  }): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ email: data.email.toLowerCase() });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = new this.userModel({
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role || Role.USER,
      tenantId: data.tenantId ? new Types.ObjectId(data.tenantId) : undefined,
    });

    return user.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase(), isActive: true });
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id);
  }

  async findByTenant(tenantId: string): Promise<UserDocument[]> {
    return this.userModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { lastLoginAt: new Date() });
  }

  async updateRefreshToken(userId: string, token: string | null): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: token });
  }

  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async update(userId: string, data: Partial<User>): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(userId, data, { new: true });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.userModel.countDocuments({ tenantId: new Types.ObjectId(tenantId) });
  }

  async getTotalCount(): Promise<number> {
    return this.userModel.countDocuments({ isActive: true });
  }

  // ─── Email Verification ───────────────────────────────────────────────────

  /**
   * Generate a secure random token, store its SHA-256 hash on the user,
   * and return the raw token to be sent in the email link.
   */
  async generateVerificationToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.userModel.findByIdAndUpdate(userId, {
      emailVerificationToken: tokenHash,
      emailVerificationExpires: expires,
    });

    return rawToken; // send this in the email
  }

  /**
   * Find a user by the raw token from the email link.
   * Returns null if token is invalid or expired.
   */
  async findByVerificationToken(rawToken: string): Promise<UserDocument | null> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return this.userModel.findOne({
      emailVerificationToken: tokenHash,
      emailVerificationExpires: { $gt: new Date() },
      isEmailVerified: false,
    });
  }

  /** Mark user's email as verified and clear the token */
  async markEmailVerified(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });
  }

  toPublic(user: UserDocument) {
    const obj = user.toObject();
    delete obj.passwordHash;
    delete obj.refreshToken;
    delete obj.emailVerificationToken;
    delete obj.emailVerificationExpires;
    return obj;
  }
}
