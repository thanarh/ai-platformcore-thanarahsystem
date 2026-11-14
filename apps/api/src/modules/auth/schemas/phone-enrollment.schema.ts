import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PhoneEnrollmentDocument = PhoneEnrollment & Document;

@Schema({ timestamps: true })
export class PhoneEnrollment {
  @Prop({ required: true, select: false })
  tokenHash: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  consumedAt?: Date;
}

export const PhoneEnrollmentSchema = SchemaFactory.createForClass(PhoneEnrollment);
PhoneEnrollmentSchema.index({ tokenHash: 1 }, { unique: true });
PhoneEnrollmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
