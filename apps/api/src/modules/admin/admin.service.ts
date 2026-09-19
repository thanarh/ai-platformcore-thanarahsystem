import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    const logs = await this.usageService.getRecentLogs(100);
    return logs.map((record: any) => {
      const item = record.toObject ? record.toObject() : { ...record };
      item.backend = 'ذكاء ثنارة';
      item.model = 'thanarah-intelligence';
      item.routeDecision = item.status === 'success' ? 'Thanarah intelligent routing' : undefined;
      return item;
    });
  }

  async getAllTenants() {
    return this.tenantsService.findAll();
  }

  async getAllUsers() {
    return this.usersService.findAllPublic();
  }

  async getCustomer(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const tenantId = user.tenantId?.toString();
    if (!tenantId) {
      return {
        user: this.usersService.toPublic(user),
        organization: null,
        usage: null,
      };
    }

    const [organization, usage] = await Promise.all([
      this.tenantsService.findById(tenantId),
      this.tenantsService.getUsageStatus(tenantId),
    ]);

    return {
      user: this.usersService.toPublic(user),
      organization,
      usage,
    };
  }

  async updateCustomer(userId: string, data: any, actorUserId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.tenantId) throw new BadRequestException('User has no organization');

    if (data.userActive !== undefined) {
      if (userId === actorUserId && data.userActive === false) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      if (typeof data.userActive !== 'boolean') {
        throw new BadRequestException('Invalid user status');
      }
      await this.usersService.setActive(userId, data.userActive);
    }

    const organization: any = {};
    if (data.organizationActive !== undefined) {
      if (typeof data.organizationActive !== 'boolean') {
        throw new BadRequestException('Invalid organization status');
      }
      organization.isActive = data.organizationActive;
    }
    if (data.status !== undefined) {
      if (!['active', 'suspended', 'trial'].includes(data.status)) {
        throw new BadRequestException('Invalid organization status');
      }
      organization.status = data.status;
    }
    if (data.industry !== undefined) {
      if (typeof data.industry !== 'string' || data.industry.length > 80) {
        throw new BadRequestException('Invalid industry');
      }
      organization.industry = data.industry;
      organization.type = data.industry === 'healthcare' ? 'clinic' : 'organization';
    }

    if (data.subscription !== undefined) {
      const plan = data.subscription?.plan;
      const status = data.subscription?.status;
      const dailyPriceSar = Number(data.subscription?.dailyPriceSar);
      if (!['free', 'pro_daily'].includes(plan)) {
        throw new BadRequestException('Invalid subscription plan');
      }
      if (!['free', 'active', 'paused', 'expired'].includes(status)) {
        throw new BadRequestException('Invalid subscription status');
      }
      if (!Number.isFinite(dailyPriceSar) || dailyPriceSar < 0 || dailyPriceSar > 100000) {
        throw new BadRequestException('Invalid daily price');
      }
      const endsAt = data.subscription?.endsAt
        ? new Date(data.subscription.endsAt)
        : undefined;
      if (endsAt && Number.isNaN(endsAt.getTime())) {
        throw new BadRequestException('Invalid subscription end date');
      }
      organization.subscription = {
        plan,
        status,
        dailyPriceSar,
        activatedByAdmin: true,
        startedAt: data.subscription?.startedAt || new Date(),
        endsAt,
      };
    }

    if (data.usagePolicy !== undefined) {
      const appDailyCoins = Number(data.usagePolicy?.appDailyCoins);
      const appMessageCost = Number(data.usagePolicy?.appMessageCost);
      const apiDailyRequests = Number(data.usagePolicy?.apiDailyRequests);
      const values = [appDailyCoins, appMessageCost, apiDailyRequests];
      if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 10000000)) {
        throw new BadRequestException('Invalid usage limits');
      }
      if (appMessageCost < 1) {
        throw new BadRequestException('Message cost must be at least 1');
      }
      organization.usagePolicy = { appDailyCoins, appMessageCost, apiDailyRequests };
    }

    if (data.medicalEnabled !== undefined) {
      if (typeof data.medicalEnabled !== 'boolean') {
        throw new BadRequestException('Invalid medical mode');
      }
      const currentTenant: any = await this.tenantsService.findById(user.tenantId.toString());
      organization.medicalMode = {
        ...(currentTenant.medicalMode || {}),
        enabled: data.medicalEnabled,
        configuredByAdmin: true,
      };
    }

    if (Object.keys(organization).length > 0) {
      await this.tenantsService.update(user.tenantId.toString(), organization);
    }

    return this.getCustomer(userId);
  }

  async getAllApiKeys() {
    return this.apiKeysService.findAll();
  }
}
