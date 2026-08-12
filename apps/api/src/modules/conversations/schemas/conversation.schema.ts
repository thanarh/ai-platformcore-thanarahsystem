import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: 'New Conversation' })
  title: string;

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ default: 0 })
  totalTokens: number;

  @Prop()
  summary: string;

  @Prop({ type: Object, default: {} })
  metadata: {
    model?: string;
    backend?: string;
    language?: string;
    tags?: string[];
  };

  @Prop({ default: false })
  isPinned: boolean;

  @Prop()
  lastMessageAt: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
ConversationSchema.index({ tenantId: 1, lastMessageAt: -1 });
