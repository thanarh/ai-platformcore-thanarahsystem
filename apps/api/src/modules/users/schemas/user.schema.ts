import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../../common/decorators/roles.decorator';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  /** Random token sent in the verification email (hashed with SHA-256) */
  @Prop()
  emailVerificationToken: string;

  /** Token expiry — 24 hours from registration */
  @Prop()
  emailVerificationExpires: Date;

  @Prop()
  lastLoginAt: Date;

  @Prop({ type: Object, default: {} })
  preferences: {
    language?: 'ar' | 'en';
    theme?: 'light' | 'dark';
    notifications?: boolean;
  };

  @Prop()
  refreshToken: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ tenantId: 1 });
UserSchema.index({ emailVerificationToken: 1 });
