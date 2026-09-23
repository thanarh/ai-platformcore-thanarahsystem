import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PushSubscriptionDocument = PushSubscription & Document;

@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  endpoint: string;

  @Prop({ type: Object, required: true })
  keys: { p256dh: string; auth: string };

  @Prop()
  expirationTime?: number | null;

  @Prop()
  userAgent?: string;

  @Prop()
  lastUsedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription);
PushSubscriptionSchema.index({ tenantId: 1, userId: 1 });
