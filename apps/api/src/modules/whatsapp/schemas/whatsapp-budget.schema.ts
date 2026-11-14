import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WhatsappBudgetDocument = WhatsappBudget & Document;

@Schema()
export class WhatsappBudget {
  @Prop({ required: true })
  bucket: string;

  @Prop({ required: true, default: 0 })
  count: number;

  @Prop({ required: true })
  expiresAt: Date;
}

export const WhatsappBudgetSchema = SchemaFactory.createForClass(WhatsappBudget);
WhatsappBudgetSchema.index({ bucket: 1 }, { unique: true });
WhatsappBudgetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
