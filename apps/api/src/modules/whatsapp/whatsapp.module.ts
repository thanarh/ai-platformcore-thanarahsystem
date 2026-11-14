import { Module } from '@nestjs/common';
import { TenantWhatsappController, WhatsappController } from './whatsapp.controller';

@Module({
  controllers: [WhatsappController, TenantWhatsappController],
})
export class WhatsappModule {}
