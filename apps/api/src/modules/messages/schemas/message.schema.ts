import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId: Types.ObjectId;

  @Prop({ required: true, enum: ['user', 'assistant', 'system', 'tool'] })
  role: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: String, enum: ['text', 'voice'], default: 'text' })
  inputMode: 'text' | 'voice';

  /** Transcription and audio references only; the audio binary is not stored here. */
  @Prop({ type: Object, default: {} })
  voiceMetadata?: {
    sessionId?: string;
    language?: 'ar' | 'en';
    transcriptionStatus?: 'pending' | 'completed' | 'failed';
    audioMimeType?: string;
    durationMs?: number;
    capturedAt?: Date | string;
    audioStorageRef?: string;
  };

  @Prop({ index: false })
  contentHash?: string;

  @Prop({ type: Object, default: {} })
  aiMetadata: {
    model?: string;
    backend?: string;
    routeDecision?: string;
    inputTokens?: number;
    outputTokens?: number;
    latency?: number;
    requestId?: string;
    toolCalls?: any[];
    ragSources?: any[];
  };

  @Prop({ default: false })
  isEdited: boolean;

  @Prop({ default: false })
  isPinned: boolean;

  @Prop()
  editedAt: Date;

  @Prop({ type: Object, default: {} })
  feedback: {
    rating?: 'up' | 'down';
    correction?: string;
    createdAt?: Date;
  };

  @Prop({ type: Object, default: {} })
  attachments: {
    files?: Array<{ name: string; url: string; type: string; size: number }>;
  };

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ tenantId: 1, createdAt: -1 });
MessageSchema.index({ userId: 1 });
MessageSchema.index({ tenantId: 1, userId: 1, role: 1, contentHash: 1, createdAt: -1 });
