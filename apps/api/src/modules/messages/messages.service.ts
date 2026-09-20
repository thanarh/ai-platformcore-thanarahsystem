import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class MessagesService {
  constructor(@InjectModel(Message.name) private messageModel: Model<MessageDocument>) {}

  async create(data: {
    tenantId: string;
    userId: string;
    conversationId: string;
    role: string;
    content: string;
    inputMode?: 'text' | 'voice';
    voiceMetadata?: object;
    aiMetadata?: object;
  }): Promise<MessageDocument> {
    const normalizedContent = data.content.trim().replace(/\s+/g, ' ').toLowerCase();
    const message = new this.messageModel({
      tenantId: new Types.ObjectId(data.tenantId),
      userId: new Types.ObjectId(data.userId),
      conversationId: new Types.ObjectId(data.conversationId),
      role: data.role,
      content: data.content,
      inputMode: data.inputMode || 'text',
      voiceMetadata: data.voiceMetadata || {},
      contentHash: createHash('sha256').update(normalizedContent).digest('hex'),
      aiMetadata: data.aiMetadata || {},
    });
    return message.save();
  }

  async findById(messageId: string): Promise<MessageDocument | null> {
    return this.messageModel.findById(new Types.ObjectId(messageId));
  }

  async addFeedback(
    messageId: string,
    rating: 'up' | 'down',
    correction?: string,
  ): Promise<MessageDocument | null> {
    return this.messageModel.findOneAndUpdate(
      { _id: new Types.ObjectId(messageId), role: 'assistant' },
      {
        $set: {
          feedback: {
            rating,
            correction: correction?.trim().slice(0, 2000),
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    );
  }

  async setPinned(messageId: string, pinned: boolean): Promise<MessageDocument | null> {
    return this.messageModel.findByIdAndUpdate(
      new Types.ObjectId(messageId),
      { $set: { isPinned: pinned } },
      { new: true },
    );
  }

  async findPreviousUserMessage(message: MessageDocument): Promise<MessageDocument | null> {
    return this.messageModel.findOne({
      conversationId: message.conversationId,
      role: 'user',
      createdAt: { $lt: message.createdAt },
    }).sort({ createdAt: -1 });
  }

  async findByConversation(conversationId: string, limit = 50): Promise<MessageDocument[]> {
    return this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .sort({ createdAt: 1 })
      .limit(limit);
  }

  async getRecentMessages(conversationId: string, count = 20): Promise<MessageDocument[]> {
    return this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .sort({ createdAt: -1 })
      .limit(count)
      .then((msgs) => msgs.reverse());
  }

  async countToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.messageModel.countDocuments({ createdAt: { $gte: today }, role: 'user' });
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.messageModel.countDocuments({ tenantId: new Types.ObjectId(tenantId) });
  }

  async getUsageStats(): Promise<{ totalMessages: number; totalInputTokens: number; totalOutputTokens: number }> {
    const result = await this.messageModel.aggregate([
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          totalInputTokens: { $sum: '$aiMetadata.inputTokens' },
          totalOutputTokens: { $sum: '$aiMetadata.outputTokens' },
        },
      },
    ]);
    return result[0] || { totalMessages: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  }
}
