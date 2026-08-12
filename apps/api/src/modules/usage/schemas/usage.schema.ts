import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UsageRecordDocument = UsageRecord & Document;

@Schema({ timestamps: true })
export class UsageRecord {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId: Types.ObjectId;

  @Prop({ required: true })
  requestId: string;

  @Prop()
  backend: string;

  @Prop()
  model: string;

  @Prop()
  routeDecision: string;

  @Prop({ default: 0 })
  inputTokens: number;

  @Prop({ default: 0 })
  outputTokens: number;

  @Prop({ default: 0 })
  latencyMs: number;

  @Prop({ default: 'success' })
  status: string;

  @Prop()
  error: string;

  @Prop({ type: [String], default: [] })
  toolCalls: string[];

  @Prop({ default: false })
  ragUsed: boolean;

  @Prop()
  createdAt: Date;
}

export const UsageRecordSchema = SchemaFactory.createForClass(UsageRecord);

UsageRecordSchema.index({ tenantId: 1, createdAt: -1 });
UsageRecordSchema.index({ createdAt: -1 });
UsageRecordSchema.index({ requestId: 1 });
