import { Module } from '@nestjs/common';
import { TenantWhatsappController, WhatsappController } from './whatsapp.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAuthKey, WhatsappAuthKeySchema } from './schemas/whatsapp-auth-key.schema';
import { WhatsappDelivery, WhatsappDeliverySchema } from './schemas/whatsapp-delivery.schema';
import { WhatsappSession, WhatsappSessionSchema } from './schemas/whatsapp-session.schema';
import { WhatsappConsent, WhatsappConsentSchema } from './schemas/whatsapp-consent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsappSession.name, schema: WhatsappSessionSchema },
      { name: WhatsappAuthKey.name, schema: WhatsappAuthKeySchema },
      { name: WhatsappDelivery.name, schema: WhatsappDeliverySchema },
      { name: WhatsappConsent.name, schema: WhatsappConsentSchema },
    ]),
  ],
  controllers: [WhatsappController, TenantWhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
