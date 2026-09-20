import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { TenantsService } from '../tenants/tenants.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post('chat')
  async chat(
    @CurrentUser() user: any,
    @Body()
    body: {
      conversationId: string;
      content: string;
      inputMode?: 'text' | 'voice';
      voiceMetadata?: Record<string, unknown>;
    },
  ) {
    const tenantId = user.tenantId?.toString();
    const apiRequest = user.isApiKeyAuth === true;
    const platformAdmin = !apiRequest && ['OWNER', 'ADMIN', 'AI_ADMIN'].includes(user.role);
    if (!platformAdmin) await this.tenantsService.consumeChatUsage(tenantId, apiRequest);
    try {
      return await this.aiService.chat({
        conversationId: body.conversationId,
        content: body.content,
        userId: user._id.toString(),
        tenantId,
        inputMode: body.inputMode,
        voiceMetadata: body.voiceMetadata,
      });
    } catch (error) {
      if (!platformAdmin) {
        await this.tenantsService.refundChatUsage(tenantId, apiRequest).catch(() => {});
      }
      throw error;
    }
  }

  @Post('chat/stream')
  async chatStream(
    @CurrentUser() user: any,
    @Body() body: {
      conversationId: string;
      content: string;
      inputMode?: 'text' | 'voice';
      voiceMetadata?: Record<string, unknown>;
    },
    @Res() res: Response,
  ) {
    const tenantId = user.tenantId?.toString();
    const apiRequest = user.isApiKeyAuth === true;
    const platformAdmin = !apiRequest && ['OWNER', 'ADMIN', 'AI_ADMIN'].includes(user.role);
    if (!platformAdmin) await this.tenantsService.consumeChatUsage(tenantId, apiRequest);
    return this.aiService.streamChat({
      conversationId: body.conversationId,
      content: body.content,
      userId: user._id.toString(),
      tenantId,
      inputMode: body.inputMode,
      voiceMetadata: body.voiceMetadata,
      res,
    });
  }

  @Get('health')
  getAiHealth() {
    return this.aiService.getAiHealth();
  }

  @Get('capabilities')
  getCapabilities() {
    return this.aiService.getCapabilities();
  }

  @Get('skills')
  getSkills() {
    return this.aiService.getSkills();
  }

  @Get('voice/capabilities')
  getVoiceCapabilities() {
    return this.aiService.getVoiceCapabilities();
  }

  @Get('backends')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
  getBackends() {
    return this.aiService.getBackends();
  }

  @Put('backends/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
  updateBackend(@Param('id') id: string, @Body() body: any) {
    return this.aiService.updateBackend(id, body);
  }

  @Post('backends/:id/test')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
  testBackend(@Param('id') id: string) {
    return this.aiService.testBackend(id);
  }
}
