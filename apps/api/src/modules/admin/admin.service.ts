import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { UsageService } from '../usage/usage.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AdminService {
  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private usageService: UsageService,
    private knowledgeService: KnowledgeService,
    private apiKeysService: ApiKeysService,
    private aiService: AiService,
  ) {}

  async getDashboardStats() {
    const [
      totalUsers,
      totalTenants,
      messagesToday,
      usageStats,
      totalKnowledge,
      totalApiKeys,
      aiHealth,
    ] = await Promise.all([
      this.usersService.getTotalCount(),
      this.tenantsService.getTotalCount(),
      this.messagesService.countToday(),
      this.usageService.getStats(),
      this.knowledgeService.getCount(),
      this.apiKeysService.getTotalCount(),
      this.aiService.getAiHealth(),
    ]);

    return {
      users: { total: totalUsers },
      tenants: { total: totalTenants },
      messages: { today: messagesToday },
      usage: usageStats,
      knowledge: { total: totalKnowledge },
      apiKeys: { total: totalApiKeys },
      aiHealth,
    };
  }

  async getRecentLogs() {
    return this.usageService.getRecentLogs(50);
  }
}
