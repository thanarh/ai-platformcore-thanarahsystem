import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  nameAr: string;

  @Prop({ default: 'clinic' })
  type: string; // clinic | company | organization

  @Prop({ default: 'active' })
  status: string; // active | suspended | trial

  @Prop({ type: Object, default: {} })
  branding: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    companyName?: string;
  };

  @Prop({ type: Object, default: {} })
  settings: {
    defaultLanguage?: 'ar' | 'en';
    timezone?: string;
    allowedDomains?: string[];
    maxUsers?: number;
    maxStorageMb?: number;
  };

  @Prop({ type: Object, default: {} })
  aiConfig: {
    systemPrompt?: string;
    communicationStyle?: string;
    preferredBackend?: string;
    byokEnabled?: boolean;
    localAiEnabled?: boolean;
    ragEnabled?: boolean;
  };

  @Prop({ type: Object, default: {} })
  clinicBrain: {
    description?: string;
    descriptionAr?: string;
    doctors?: Array<{ name: string; specialty: string; nameAr?: string }>;
    services?: Array<{ name: string; nameAr?: string; price?: number }>;
    workingHours?: string;
    policies?: string;
    faqs?: Array<{ q: string; a: string }>;
    contactInfo?: object;
  };

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);

TenantSchema.index({ slug: 1 });
TenantSchema.index({ status: 1 });
