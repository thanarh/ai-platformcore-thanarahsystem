import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappInboundDocument = WhatsappInbound & Document;

@Schema({ timestamps: true })
export class WhatsappInbound {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId?: Types.ObjectId;

  @Prop({ index: true })
  scopeKey?: string;

  @Prop({ required: true })
  providerMessageId: string;

  @Prop({ select: false })
  contactHash?: string;

  @Prop({ select: false })
  encryptedContent?: string;

  @Prop({ select: false })
  encryptedReply?: string;

  @Prop({ required: true, enum: ['received', 'processing', 'replied', 'ignored', 'failed'] })
  status: string;

  @Prop()
  messageKind?: string;

  @Prop()
  forwardedAt?: Date;

  @Prop()
  forwardFailureCount?: number;

  @Prop()
  leadDetected?: boolean;

  @Prop()
  failureCode?: string;

  @Prop()
  providerReplyId?: string;

  @Prop({ default: () => new Date(Date.now() + 30 * 86_400_000) })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WhatsappInboundSchema = SchemaFactory.createForClass(WhatsappInbound);
WhatsappInboundSchema.index({ tenantId: 1, providerMessageId: 1 }, { unique: true });
WhatsappInboundSchema.index(
  { scopeKey: 1, providerMessageId: 1 },
  { unique: true, partialFilterExpression: { scopeKey: { $type: 'string' } } },
);
WhatsappInboundSchema.index(
  { scopeKey: 1, contactHash: 1, createdAt: -1 },
  { partialFilterExpression: { contactHash: { $type: 'string' } } },
);
WhatsappInboundSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
