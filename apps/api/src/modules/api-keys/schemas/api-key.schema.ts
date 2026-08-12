import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  keyHash: string; // SHA-256 hash of the actual key

  @Prop({ required: true })
  keyPrefix: string; // First 12 chars shown to user (e.g., thn_live_xxxx)

  @Prop({ default: 'live', enum: ['live', 'test'] })
  environment: string;

  @Prop({ type: [String], default: ['chat'] })
  scopes: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastUsedAt: Date;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ default: 1000 })
  rateLimit: number; // requests per hour

  @Prop()
  expiresAt: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

ApiKeySchema.index({ tenantId: 1 });
ApiKeySchema.index({ keyHash: 1 });
