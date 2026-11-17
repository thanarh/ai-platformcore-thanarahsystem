import {
  Controller, Get, Post, Body, Headers, UseGuards,
  BadRequestException, ForbiddenException, HttpCode, HttpStatus, Param, UseFilters, Header, Put,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { WhatsappBotSettings, WhatsappMessageInput, WhatsappService } from './whatsapp.service';
import { WhatsappRateLimitFilter } from './whatsapp-rate-limit.filter';

@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('platform/status')
  @Header('Cache-Control', 'no-store')
  getPlatformStatus() {
    return this.whatsappService.getSessionStatus('platform');
  }

  @Get('readiness')
  @Header('Cache-Control', 'no-store')
  getReadiness() {
    return this.whatsappService.getSessionStatus('platform');
  }

  @Get('platform/settings')
  @Header('Cache-Control', 'no-store')
  getPlatformSettings() {
    return this.whatsappService.getBotSettings('platform');
  }

  @Put('platform/settings')
  updatePlatformSettings(@Body() body: WhatsappBotSettings) {
    return this.whatsappService.updateBotSettings('platform', body);
  }

  @Post('platform/connect')
  connectPlatform() {
    return this.whatsappService.startPlatformConnection();
  }

  @Post('platform/relink')
  relinkPlatform() {
    return this.whatsappService.relinkPlatformWithQr();
  }

  @Post('platform/disconnect')
  disconnectPlatform() {
    return this.whatsappService.disconnect('platform');
  }
}

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
@UseFilters(WhatsappRateLimitFilter)
export class TenantWhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  @Get('readiness')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  getTenantReadiness(@CurrentUser() user: any) {
    return this.whatsappService.getSessionStatus(`tenant:${user.tenantId?.toString()}`);
  }

  @Get('settings')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  @Header('Cache-Control', 'no-store')
  getTenantSettings(@CurrentUser() user: any) {
    return this.whatsappService.getBotSettings(`tenant:${user.tenantId?.toString()}`);
  }

  @Put('settings')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  updateTenantSettings(@CurrentUser() user: any, @Body() body: WhatsappBotSettings) {
    return this.whatsappService.updateBotSettings(`tenant:${user.tenantId?.toString()}`, body);
  }

  @Post('connect')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  connectTenant(@CurrentUser() user: any) {
    return this.whatsappService.startTenantConnection(user.tenantId?.toString());
  }

  @Post('relink')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  relinkTenant(@CurrentUser() user: any) {
    return this.whatsappService.relinkTenantWithQr(user.tenantId?.toString());
  }

  @Post('disconnect')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  disconnectTenant(@CurrentUser() user: any) {
    return this.whatsappService.disconnect(`tenant:${user.tenantId?.toString()}`);
  }

  @Get('inbox')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  getInbox(@CurrentUser() user: any) {
    return this.whatsappService.getTenantInbox(user.tenantId?.toString());
  }

  @Get('inbox/:conversationId')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  getInboxThread(@CurrentUser() user: any, @Param('conversationId') conversationId: string) {
    return this.whatsappService.getTenantInboxThread(user.tenantId?.toString(), conversationId);
  }

  @Post('inbox/:conversationId/reply')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  replyToInbox(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Body() body: { text?: string },
  ) {
    return this.whatsappService.replyToTenantInbox(
      user.tenantId?.toString(),
      conversationId,
      body?.text || '',
    );
  }

  @Post('messages')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendMessage(
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: WhatsappMessageInput,
  ) {
    const manager = [Role.ADMIN, Role.OWNER, Role.TENANT_OWNER].includes(user?.role);
    const scopedKey = user?.isApiKeyAuth === true && user.apiKeyScopes?.includes('whatsapp:send');
    if ((!manager && !scopedKey) || (scopedKey && user.apiKeyEnvironment !== 'live')) {
      throw new ForbiddenException('WhatsApp send permission required');
    }
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException('A unique Idempotency-Key is required');
    }
    if (scopedKey) await this.apiKeysService.consumeRateLimit(user.apiKeyId);
    const delivery = await this.whatsappService.enqueueMessage(
      user.tenantId?.toString(),
      body,
      idempotencyKey,
      scopedKey ? user.apiKeyId : undefined,
    );
    return { ok: true, delivery };
  }

  @Get('messages/:id')
  async getDelivery(@CurrentUser() user: any, @Param('id') id: string) {
    const manager = [Role.ADMIN, Role.OWNER, Role.TENANT_OWNER].includes(user?.role);
    const scopedKey = user?.isApiKeyAuth === true && user.apiKeyScopes?.includes('whatsapp:send');
    if ((!manager && !scopedKey) || (scopedKey && user.apiKeyEnvironment !== 'live')) {
      throw new ForbiddenException('WhatsApp status permission required');
    }
    if (!user?.tenantId) throw new ForbiddenException('Tenant access required');
    return { ok: true, delivery: await this.whatsappService.getDelivery(user.tenantId.toString(), id) };
  }

  @Post('consents')
  recordConsent(
    @CurrentUser() user: any,
    @Body() body: { phone: string; source: string; reference: string },
  ) {
    const manager = [Role.ADMIN, Role.OWNER, Role.TENANT_OWNER].includes(user?.role);
    const scopedKey = user?.isApiKeyAuth === true && user.apiKeyScopes?.includes('whatsapp:consent');
    if ((!manager && !scopedKey) || (scopedKey && user.apiKeyEnvironment !== 'live')) {
      throw new ForbiddenException('WhatsApp consent permission required');
    }
    return this.whatsappService.recordConsent(user.tenantId?.toString(), body);
  }

  @Post('consents/revoke')
  revokeConsent(@CurrentUser() user: any, @Body() body: { phone: string }) {
    const manager = [Role.ADMIN, Role.OWNER, Role.TENANT_OWNER].includes(user?.role);
    const scopedKey = user?.isApiKeyAuth === true && user.apiKeyScopes?.includes('whatsapp:consent');
    if ((!manager && !scopedKey) || (scopedKey && user.apiKeyEnvironment !== 'live')) {
      throw new ForbiddenException('WhatsApp consent permission required');
    }
    return this.whatsappService.revokeConsent(user.tenantId?.toString(), body?.phone);
  }
}
