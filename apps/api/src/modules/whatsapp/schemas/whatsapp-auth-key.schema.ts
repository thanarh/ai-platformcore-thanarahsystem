import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WhatsappAuthKeyDocument = WhatsappAuthKey & Document;

@Schema({ timestamps: true })
export class WhatsappAuthKey {
  @Prop({ required: true })
  scopeKey: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  keyId: string;

  @Prop({ required: true, select: false })
  encryptedValue: string;
}

export const WhatsappAuthKeySchema = SchemaFactory.createForClass(WhatsappAuthKey);
WhatsappAuthKeySchema.index({ scopeKey: 1, type: 1, keyId: 1 }, { unique: true });
