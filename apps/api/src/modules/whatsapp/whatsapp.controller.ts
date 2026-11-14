import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role, Roles } from '../../common/decorators/roles.decorator';

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
