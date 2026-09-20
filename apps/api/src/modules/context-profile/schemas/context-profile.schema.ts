import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContextProfileDocument = ContextProfile & Document;

@Schema({ timestamps: true })
export class ContextProfile {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  organizationContext: {
    industry?: string;
    specialization?: string;
    additionalInstructions?: string;
  };

  @Prop({ type: Object, default: {} })
  userContext: {
    preferredLanguage?: 'ar' | 'en';
    preferredResponseStyle?: string;
  };

  @Prop({ type: [String], default: [] })
  frequentTopics: string[];

  @Prop({ type: [String], default: [] })
  recentTopics: string[];

  @Prop({ type: [String], default: [] })
  frequentTasks: string[];

  @Prop({ type: [String], default: [] })
  knownPreferences: string[];

  @Prop({ type: [String], default: [] })
  importantEntities: string[];

  @Prop({ type: Object, default: {} })
  topicEvidence: Record<string, number>;

  @Prop({ type: [Object], default: [] })
  recentActivity: Array<{ type: string; at: Date; topics: string[] }>;

  @Prop({ default: false })
  onboardingDismissed: boolean;

  @Prop()
  onboardingDismissedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ContextProfileSchema = SchemaFactory.createForClass(ContextProfile);
ContextProfileSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
ContextProfileSchema.index({ organizationId: 1, userId: 1 });