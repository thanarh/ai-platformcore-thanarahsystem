import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, createHmac } from 'crypto';
import { Message, MessageDocument } from './schemas/message.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { decryptWhatsappData, encryptWhatsappData, whatsappEncryptionKey } from '../whatsapp/whatsapp.crypto';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private readonly conversationsService: ConversationsService,
  ) {}

  private decodeContent<T extends Record<string, any>>(message: T): T {
    if (message?.contentEncrypted !== true) return message;
    return {
      ...message,
      content: decryptWhatsappData(
        message.content,
        whatsappEncryptionKey(process.env.SESSION_SECRET || ''),
      ),
      contentEncrypted: false,
    };
  }

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
    const conversation = await this.conversationsService.findById(
      data.conversationId,
      data.userId,
      data.tenantId,
    );
    const contentEncrypted = conversation.metadata?.channel === 'whatsapp';
    const encryptionKey = contentEncrypted
      ? whatsappEncryptionKey(process.env.SESSION_SECRET || '')
      : null;
    const normalizedContent = data.content.trim().replace(/\s+/g, ' ').toLowerCase();
    const message = new this.messageModel({
      tenantId: new Types.ObjectId(data.tenantId),
      userId: new Types.ObjectId(data.userId),
      conversationId: new Types.ObjectId(data.conversationId),
      role: data.role,
      content: encryptionKey
        ? encryptWhatsappData(data.content, encryptionKey)
        : data.content,
      contentEncrypted,
      inputMode: data.inputMode || 'text',
      voiceMetadata: data.voiceMetadata || {},
      contentHash: encryptionKey
        ? createHmac('sha256', encryptionKey).update(normalizedContent).digest('hex')
        : createHash('sha256').update(normalizedContent).digest('hex'),
      aiMetadata: data.aiMetadata || {},
    });
    return message.save();
  }

  async findById(messageId: string): Promise<MessageDocument | null> {
    const message = await this.messageModel.findById(new Types.ObjectId(messageId)).lean();
    return message ? this.decodeContent(message) as unknown as MessageDocument : null;
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
    const previous = await this.messageModel.findOne({
      conversationId: message.conversationId,
      role: 'user',
      createdAt: { $lt: message.createdAt },
    }).sort({ createdAt: -1 }).lean();
    return previous ? this.decodeContent(previous) as unknown as MessageDocument : null;
  }

  async findByConversation(conversationId: string, limit = 50): Promise<MessageDocument[]> {
    const messages = await this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
    return messages.map((message) => this.decodeContent(message) as unknown as MessageDocument);
  }

  async findLatestByConversation(conversationId: string): Promise<MessageDocument | null> {
    const message = await this.messageModel
      .findOne({ conversationId: new Types.ObjectId(conversationId) })
      .sort({ createdAt: -1 })
      .lean();
    return message ? this.decodeContent(message) as unknown as MessageDocument : null;
  }

  async getRecentMessages(conversationId: string, count = 20): Promise<MessageDocument[]> {
    const messages = await this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .sort({ createdAt: -1 })
      .limit(count)
      .lean();
    return messages.reverse().map((message) => this.decodeContent(message) as unknown as MessageDocument);
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
