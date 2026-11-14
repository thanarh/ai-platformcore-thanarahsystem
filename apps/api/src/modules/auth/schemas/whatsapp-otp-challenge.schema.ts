import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WhatsappOtpChallengeDocument = WhatsappOtpChallenge & Document;

@Schema({ timestamps: true })
export class WhatsappOtpChallenge {
  @Prop({ required: true, index: true })
  phoneHash: string;

  @Prop({ required: true, enum: ['login', 'register'] })
  purpose: 'login' | 'register';

  @Prop({ required: true })
  codeHash: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ required: true })
  lastSentAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true })
  cleanupAt: Date;

  @Prop()
  usedAt?: Date;
}

export const WhatsappOtpChallengeSchema = SchemaFactory.createForClass(WhatsappOtpChallenge);
WhatsappOtpChallengeSchema.index({ phoneHash: 1, purpose: 1, lastSentAt: -1 });
WhatsappOtpChallengeSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });
