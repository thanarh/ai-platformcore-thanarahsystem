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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
      skillId?: string;
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
        skillId: body.skillId,
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
      skillId?: string;
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
      skillId: body.skillId,
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

  @Post('voice/transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 10_000_000 },
    }),
  )
  async transcribeVoice(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { conversationId: string; language?: string },
  ) {
    if (!file?.buffer || !body.conversationId) {
      throw new BadRequestException('Audio and conversationId are required');
    }
    return this.aiService.transcribeVoice({
      conversationId: body.conversationId,
      userId: user._id.toString(),
      tenantId: user.tenantId.toString(),
      audio: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname || 'voice-input',
      language: body.language || 'ar',
    });
  }

  @Post('voice/synthesize')
  async synthesizeVoice(
    @CurrentUser() user: any,
    @Body() body: { conversationId: string; text: string; language?: string },
    @Res() res: Response,
  ) {
    if (!body.conversationId || !body.text?.trim()) {
      throw new BadRequestException('Text and conversationId are required');
    }
    const audio = await this.aiService.synthesizeVoice({
      conversationId: body.conversationId,
      userId: user._id.toString(),
      tenantId: user.tenantId.toString(),
      text: body.text,
      language: body.language || 'ar',
    });
    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Thanarah-Voice-Provider', audio.provider);
    res.setHeader('X-Thanarah-Voice-Latency-Ms', audio.latencyMs);
    res.send(audio.content);
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
