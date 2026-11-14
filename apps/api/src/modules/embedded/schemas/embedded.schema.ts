import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class EmbeddedIntegration {
  @Prop({ type: Types.ObjectId, required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) createdBy: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ default: 'thanarah_embed', enum: ['thanarah_embed'] }) type: string;
  @Prop({ type: [String], required: true }) allowedOrigins: string[];
  @Prop({ required: true, select: false }) keyHash: string;
  @Prop({ required: true }) keyPrefix: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 1 }) version: number;
  @Prop() bootstrapMinute: number;
  @Prop({ default: 0 }) bootstrapsInMinute: number;
}
export type EmbeddedIntegrationDocument = EmbeddedIntegration & Document;
export const EmbeddedIntegrationSchema = SchemaFactory.createForClass(EmbeddedIntegration);
EmbeddedIntegrationSchema.index({ keyHash: 1 }, { unique: true });

@Schema({ timestamps: true })
export class EmbeddedIdentity {
  @Prop({ type: Types.ObjectId, required: true }) integrationId: Types.ObjectId;
  @Prop({ required: true }) subjectHash: string;
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
}
export type EmbeddedIdentityDocument = EmbeddedIdentity & Document;
export const EmbeddedIdentitySchema = SchemaFactory.createForClass(EmbeddedIdentity);
EmbeddedIdentitySchema.index({ integrationId: 1, subjectHash: 1 }, { unique: true });
EmbeddedIdentitySchema.index({ integrationId: 1, userId: 1 }, { unique: true });

@Schema({ timestamps: true })
export class EmbeddedBootstrap {
  @Prop({ required: true, select: false }) codeHash: string;
  @Prop({ type: Types.ObjectId, required: true }) integrationId: Types.ObjectId;
  @Prop({ required: true }) version: number;
  @Prop({ required: true }) subjectHash: string;
  @Prop({ type: Types.ObjectId }) userId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) origin: string;
  @Prop({ required: true }) nonce: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop() usedAt?: Date;
}
export type EmbeddedBootstrapDocument = EmbeddedBootstrap & Document;
export const EmbeddedBootstrapSchema = SchemaFactory.createForClass(EmbeddedBootstrap);
EmbeddedBootstrapSchema.index({ codeHash: 1 }, { unique: true });
EmbeddedBootstrapSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ timestamps: true })
export class EmbeddedSession {
  @Prop({ type: Types.ObjectId, required: true }) integrationId: Types.ObjectId;
  @Prop({ required: true }) version: number;
  @Prop({ required: true }) subjectHash: string;
  @Prop({ required: true }) origin: string;
  @Prop({ required: true }) nonce: string;
  @Prop({ required: true, enum: ['pending', 'active', 'revoked'] }) state: string;
  @Prop({ select: false }) onboardingHash?: string;
  @Prop({ select: false }) registrationProofHash?: string;
  @Prop({ type: Types.ObjectId }) userId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) tenantId?: Types.ObjectId;
  @Prop({ select: false }) accessHash?: string;
  @Prop({ select: false }) refreshHash?: string;
  @Prop() accessExpiresAt?: Date;
  @Prop() refreshExpiresAt?: Date;
  @Prop({ required: true }) expiresAt: Date;
}
export type EmbeddedSessionDocument = EmbeddedSession & Document;
export const EmbeddedSessionSchema = SchemaFactory.createForClass(EmbeddedSession);
EmbeddedSessionSchema.index({ onboardingHash: 1 }, { sparse: true, unique: true });
EmbeddedSessionSchema.index({ accessHash: 1 }, { sparse: true, unique: true });
EmbeddedSessionSchema.index({ refreshHash: 1 }, { sparse: true, unique: true });
EmbeddedSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EmbeddedSessionSchema.index({ integrationId: 1, state: 1 });
