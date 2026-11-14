import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappDeliveryDocument = WhatsappDelivery & Document;

@Schema({ timestamps: true })
export class WhatsappDelivery {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ApiKey', default: null })
  apiKeyId?: Types.ObjectId;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ required: true, select: false })
  encryptedPayload: string;

  @Prop({ required: true, enum: ['pending', 'sending', 'sent', 'delivered', 'read', 'failed'], default: 'pending' })
  status: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: Date.now })
  nextAttemptAt: Date;

  @Prop()
  lockedAt?: Date;

  @Prop()
  providerMessageId?: string;

  @Prop()
  failureCode?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;

  @Prop({ default: () => new Date(Date.now() + 30 * 86_400_000) })
  expiresAt: Date;
}

export const WhatsappDeliverySchema = SchemaFactory.createForClass(WhatsappDelivery);
WhatsappDeliverySchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
WhatsappDeliverySchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
WhatsappDeliverySchema.index({ tenantId: 1, providerMessageId: 1 });
WhatsappDeliverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
