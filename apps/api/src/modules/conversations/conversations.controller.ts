import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.conversationsService.findByUser(
      user.tenantId?.toString(),
      user._id.toString(),
    );
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: { title?: string }) {
    return this.conversationsService.create({
      tenantId: user.tenantId?.toString(),
      userId: user._id.toString(),
      title: body.title,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.conversationsService.findById(id, user._id.toString());
  }

  @Put(':id/title')
  updateTitle(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { title: string },
  ) {
    return this.conversationsService.updateTitle(id, user._id.toString(), body.title);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.conversationsService.softDelete(id, user._id.toString());
  }
}
