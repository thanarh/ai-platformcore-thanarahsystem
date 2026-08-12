import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KnowledgeSourceDocument = KnowledgeSource & Document;

@Schema({ timestamps: true })
export class KnowledgeSource {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: 'document' })
  type: string; // document | faq | policy | clinic_info | url

  @Prop({ default: 'pending' })
  status: string; // pending | processing | ready | error

  @Prop()
  fileName: string;

  @Prop()
  fileUrl: string;

  @Prop()
  fileMimeType: string;

  @Prop({ default: 0 })
  fileSizeBytes: number;

  @Prop({ default: 0 })
  chunkCount: number;

  @Prop({ type: Object, default: {} })
  metadata: object;

  @Prop()
  errorMessage: string;

  @Prop()
  processedAt: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const KnowledgeSourceSchema = SchemaFactory.createForClass(KnowledgeSource);

KnowledgeSourceSchema.index({ tenantId: 1, status: 1 });
