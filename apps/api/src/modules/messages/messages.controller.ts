import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    private readonly configService: ConfigService,
  ) {}

  @Post(':messageId/feedback')
  async addFeedback(
    @Param('messageId') messageId: string,
    @Body() body: { rating: 'up' | 'down'; correction?: string },
    @CurrentUser() user: any,
  ) {
    const message = await this.messagesService.findById(messageId);
    if (!message || message.role !== 'assistant') throw new NotFoundException('Message not found');
    await this.conversationsService.findById(
      message.conversationId.toString(),
      user._id?.toString() ?? user.id,
      user.tenantId?.toString(),
    );
    if (!['up', 'down'].includes(body.rating)) throw new ForbiddenException('Invalid rating');
    const updated = await this.messagesService.addFeedback(messageId, body.rating, body.correction);
    if (body.rating === 'down' && body.correction?.trim()) {
      const previousUserMessage = await this.messagesService.findPreviousUserMessage(message);
      if (previousUserMessage) {
        axios.post(`${this.configService.get<string>('aiEngine.url')}/chat/learn`, {
          tenantId: user.tenantId?.toString(),
          userId: user._id?.toString() ?? user.id,
          query: previousUserMessage.content,
          correctedAnswer: body.correction.trim(),
        }, {
          timeout: 5000,
          headers: {
            'X-Thanarah-Internal': this.configService.get<string>('jwt.secret') || '',
          },
        }).catch(() => {});
      }
    }
    return { ok: true, messageId: updated?._id, feedback: updated?.feedback };
  }

  @Post(':messageId/pin')
  async setPinned(
    @Param('messageId') messageId: string,
    @Body() body: { pinned: boolean },
    @CurrentUser() user: any,
  ) {
    const message = await this.messagesService.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');
    await this.conversationsService.findById(
      message.conversationId.toString(),
      user._id?.toString() ?? user.id,
      user.tenantId?.toString(),
    );
    const updated = await this.messagesService.setPinned(messageId, body.pinned === true);
    return { ok: true, messageId: updated?._id, isPinned: updated?.isPinned };
  }

  @Get(':conversationId')
  async findByConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: any,
  ) {
    // Verify the conversation exists AND belongs to this user in their tenant.
    // ConversationsService.findById throws ForbiddenException on mismatch.
    await this.conversationsService.findById(
      conversationId,
      user._id?.toString() ?? user.id,
      user.tenantId?.toString(),
    );

    return this.messagesService.findByConversation(conversationId, 100);
  }
}
