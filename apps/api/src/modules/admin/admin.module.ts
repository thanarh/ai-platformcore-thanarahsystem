import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { UsageModule } from '../usage/usage.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    UsersModule,
    TenantsModule,
    ConversationsModule,
    MessagesModule,
    UsageModule,
    KnowledgeModule,
    ApiKeysModule,
    AiModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
