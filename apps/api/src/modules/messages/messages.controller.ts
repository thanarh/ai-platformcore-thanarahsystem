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

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
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
    return { ok: true, messageId: updated?._id, feedback: updated?.feedback };
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
