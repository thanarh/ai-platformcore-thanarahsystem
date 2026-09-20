import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { UsageModule } from '../usage/usage.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ContextProfileModule } from '../context-profile/context-profile.module';

@Module({
  imports: [
    HttpModule,
    ConversationsModule,
    MessagesModule,
    UsageModule,
    TenantsModule,
    ContextProfileModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
