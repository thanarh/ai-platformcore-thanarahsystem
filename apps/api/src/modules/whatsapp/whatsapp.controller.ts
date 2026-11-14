import {
  Controller, Get, Post, Body, Headers, UseGuards,
  BadRequestException, ForbiddenException, HttpCode, HttpStatus, Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { WhatsappMessageInput, WhatsappService } from './whatsapp.service';

@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('platform/status')
  getPlatformStatus() {
    return this.whatsappService.getSessionStatus('platform');
  }

  @Post('platform/connect')
  connectPlatform() {
    return this.whatsappService.startPlatformConnection();
  }

  @Post('platform/disconnect')
  disconnectPlatform() {
    return this.whatsappService.disconnect('platform');
  }
}

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class TenantWhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  @Get('readiness')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  getTenantReadiness(@CurrentUser() user: any) {
    return this.whatsappService.getSessionStatus(`tenant:${user.tenantId?.toString()}`);
  }

  @Post('connect')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  connectTenant(@CurrentUser() user: any) {
    return this.whatsappService.startTenantConnection(user.tenantId?.toString());
  }

  @Post('disconnect')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  disconnectTenant(@CurrentUser() user: any) {
    return this.whatsappService.disconnect(`tenant:${user.tenantId?.toString()}`);
  }

  @Post('messages')
  @HttpCode(HttpStatus.ACCEPTED)
  sendMessage(
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
    if (scopedKey) {
      return this.apiKeysService.consumeRateLimit(user.apiKeyId).then(() =>
        this.whatsappService.enqueueMessage(
          user.tenantId?.toString(),
          body,
          idempotencyKey,
          user.apiKeyId,
        ),
      );
    }
    return this.whatsappService.enqueueMessage(
      user.tenantId?.toString(),
      body,
      idempotencyKey,
    );
  }

  @Get('messages/:id')
  getDelivery(@CurrentUser() user: any, @Param('id') id: string) {
    const manager = [Role.ADMIN, Role.OWNER, Role.TENANT_OWNER].includes(user?.role);
    const scopedKey = user?.isApiKeyAuth === true && user.apiKeyScopes?.includes('whatsapp:send');
    if ((!manager && !scopedKey) || (scopedKey && user.apiKeyEnvironment !== 'live')) {
      throw new ForbiddenException('WhatsApp status permission required');
    }
    if (!user?.tenantId) throw new ForbiddenException('Tenant access required');
    return this.whatsappService.getDelivery(user.tenantId.toString(), id);
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
