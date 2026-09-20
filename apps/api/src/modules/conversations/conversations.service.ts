import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
  ) {}

  async create(data: {
    tenantId: string;
    userId: string;
    title?: string;
  }): Promise<ConversationDocument> {
    const conversation = new this.conversationModel({
      tenantId: new Types.ObjectId(data.tenantId),
      userId: new Types.ObjectId(data.userId),
      title: data.title ? this.createTitle(data.title) : 'محادثة جديدة',
      lastMessageAt: new Date(),
    });
    return conversation.save();
  }

  async findByUser(tenantId: string, userId: string): Promise<ConversationDocument[]> {
    return this.conversationModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        userId: new Types.ObjectId(userId),
        status: { $ne: 'deleted' },
      })
      .sort({ isPinned: -1, lastMessageAt: -1 })
      .limit(100);
  }

  async findById(id: string, userId: string, tenantId: string): Promise<ConversationDocument> {
    if (!userId || !tenantId) throw new ForbiddenException('Tenant and user context required');
    const conversation = await this.conversationModel.findById(id);
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.status === 'deleted') throw new NotFoundException('Conversation not found');

    if (conversation.tenantId.toString() !== tenantId.toString()) {
      throw new ForbiddenException('Access denied');
    }
    if (conversation.userId.toString() !== userId.toString()) {
      throw new ForbiddenException('Access denied');
    }

    return conversation;
  }

  async updateTitle(
    id: string,
    userId: string,
    tenantId: string,
    title: string,
  ): Promise<ConversationDocument> {
    const conv = await this.findById(id, userId, tenantId);
    conv.title = this.createTitle(title);
    return conv.save();
  }

  async setPinned(
    id: string,
    userId: string,
    tenantId: string,
    pinned: boolean,
  ): Promise<ConversationDocument> {
    const conv = await this.findById(id, userId, tenantId);
    conv.isPinned = pinned;
    return conv.save();
  }

  async softDelete(id: string, userId: string, tenantId: string): Promise<void> {
    const conv = await this.findById(id, userId, tenantId);
    conv.status = 'deleted';
    await conv.save();
  }

  async incrementMessageCount(id: string, tokens: number = 0): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(id, {
      $inc: { messageCount: 1, totalTokens: tokens },
      lastMessageAt: new Date(),
    });
  }

  async updateSummary(id: string, summary: string): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(id, { summary });
  }

  async autoTitle(id: string, firstMessage: string): Promise<void> {
    const title = this.createTitle(firstMessage);
    await this.conversationModel.findByIdAndUpdate(id, { title });
  }

  createTitle(input: string): string {
    let title = String(input || '')
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]/g, ' ')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[بريد]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[رقم]')
      .trim();

    title = title.replace(
      /^(كيف أقدر|كيف يمكنني|كيف يمكن|اشرح لي|أحتاج مساعدة في|ساعدني في|ما هي|ما هو|هل يمكنك|please|help me|explain)\s+/i,
      '',
    );
    title = title.replace(/[؟?!.,:؛،]+$/g, '').trim();
    return title.length > 56 ? `${title.substring(0, 53).trim()}...` : title || 'محادثة جديدة';
  }

  async getByTenant(tenantId: string): Promise<ConversationDocument[]> {
    return this.conversationModel
      .find({ tenantId: new Types.ObjectId(tenantId), status: { $ne: 'deleted' } })
      .sort({ lastMessageAt: -1 })
      .limit(500);
  }

  async countToday(tenantId?: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filter: any = { createdAt: { $gte: today } };
    if (tenantId) filter.tenantId = new Types.ObjectId(tenantId);
    return this.conversationModel.countDocuments(filter);
  }
}
