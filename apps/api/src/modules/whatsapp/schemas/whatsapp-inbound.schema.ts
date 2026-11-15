import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappInboundDocument = WhatsappInbound & Document;

@Schema({ timestamps: true })
export class WhatsappInbound {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  providerMessageId: string;

  @Prop({ required: true, enum: ['processing', 'replied', 'ignored', 'failed'] })
  status: string;

  @Prop()
  failureCode?: string;

  @Prop()
  providerReplyId?: string;

  @Prop({ default: () => new Date(Date.now() + 30 * 86_400_000) })
  expiresAt: Date;
}

export const WhatsappInboundSchema = SchemaFactory.createForClass(WhatsappInbound);
WhatsappInboundSchema.index({ tenantId: 1, providerMessageId: 1 }, { unique: true });
WhatsappInboundSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
