import {
  Controller,
  Get,
  Param,
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
      user.tenantId,
    );

    return this.messagesService.findByConversation(conversationId, 100);
  }
}
