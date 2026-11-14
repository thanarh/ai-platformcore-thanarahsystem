import {
  Controller, Get, Post, Body, Headers, UseGuards,
  BadRequestException, ForbiddenException, ServiceUnavailableException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class WhatsappController {
  @Get('readiness')
  getReadiness() {
    return {
      available: false,
      integration: 'baileys',
      state: 'blocked',
      reason: 'package_security_policy',
      capabilities: {
        linkSession: false,
        receiveMessages: false,
        sendMessages: false,
        sendMedia: false,
      },
    };
  }
}

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class TenantWhatsappController {
  @Get('readiness')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER, Role.TENANT_OWNER)
  getTenantReadiness() {
    return {
      available: false,
      integration: 'baileys',
      state: 'blocked',
      reason: 'package_security_policy',
      configured: false,
      capabilities: {
        linkSession: false,
        receiveMessages: false,
        sendMessages: false,
        sendMedia: false,
        deliverVerificationCodes: false,
      },
      message: 'Baileys transport is not installed or connected in this deployment.',
    };
  }

  @Post('messages')
  sendMessage(
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() _body: any,
  ) {
    const manager = [Role.ADMIN, Role.OWNER, Role.TENANT_OWNER].includes(user?.role);
    const scopedKey = user?.isApiKeyAuth === true && user.apiKeyScopes?.includes('whatsapp:send');
    if ((!manager && !scopedKey) || (scopedKey && user.apiKeyEnvironment !== 'live')) {
      throw new ForbiddenException('WhatsApp send permission required');
    }
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException('A unique Idempotency-Key is required');
    }
    // This endpoint is deliberately fail-closed until Baileys is approved and connected.
    // It must not fall back to Meta Cloud or a shared WhatsApp number.
    throw new ServiceUnavailableException({
      code: 'WHATSAPP_TRANSPORT_BLOCKED',
      integration: 'baileys',
      message: 'WhatsApp sending is unavailable until the Baileys transport is approved.',
    });
  }
}
