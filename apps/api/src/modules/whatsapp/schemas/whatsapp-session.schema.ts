import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappSessionDocument = WhatsappSession & Document;

@Schema({ timestamps: true })
export class WhatsappSession {
  @Prop({ required: true })
  scopeKey: string;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', default: null })
  tenantId?: Types.ObjectId;

  @Prop({ required: true, enum: ['platform', 'tenant'] })
  scope: 'platform' | 'tenant';

  @Prop({ default: false })
  enabled: boolean;

  @Prop({ default: 'disconnected' })
  connectionState: string;

  @Prop()
  phoneNumber?: string;

  @Prop({ select: false })
  encryptedCreds?: string;

  @Prop()
  lastConnectedAt?: Date;

  @Prop({ type: [String], default: [] })
  forwardingPhones?: string[];

  @Prop({ default: false })
  forwardingConfigured?: boolean;

  @Prop({ default: false })
  forwardIncomingEnabled?: boolean;

  @Prop({ default: false })
  autoReplyEnabled?: boolean;

  @Prop({ default: false })
  autoReplyConfigured?: boolean;
}

export const WhatsappSessionSchema = SchemaFactory.createForClass(WhatsappSession);
WhatsappSessionSchema.index({ scopeKey: 1 }, { unique: true });
WhatsappSessionSchema.index({ tenantId: 1, scope: 1 });
