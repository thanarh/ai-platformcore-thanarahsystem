import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappConsentDocument = WhatsappConsent & Document;

@Schema({ timestamps: true })
export class WhatsappConsent {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', default: null })
  tenantId?: Types.ObjectId | null;

  @Prop()
  scopeKey?: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({ required: true, enum: ['active', 'revoked'], default: 'active' })
  status: 'active' | 'revoked';

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  reference: string;

  @Prop({ required: true })
  consentedAt: Date;

  @Prop()
  revokedAt?: Date;
}

export const WhatsappConsentSchema = SchemaFactory.createForClass(WhatsappConsent);
WhatsappConsentSchema.index({ tenantId: 1, phoneNumber: 1 }, { unique: true });
WhatsappConsentSchema.index(
  { scopeKey: 1, phoneNumber: 1 },
  { unique: true, partialFilterExpression: { scopeKey: { $type: 'string' } } },
);
WhatsappConsentSchema.index({ tenantId: 1, status: 1 });
