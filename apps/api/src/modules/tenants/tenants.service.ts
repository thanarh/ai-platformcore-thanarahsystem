import { Injectable, NotFoundException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from './schemas/tenant.schema';

@Injectable()
export class TenantsService {
  constructor(@InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>) {}

  async create(data: Partial<Tenant>): Promise<TenantDocument> {
    const existing = await this.tenantModel.findOne({ slug: data.slug });
    if (existing) throw new ConflictException('Tenant slug already exists');
    const tenant = new this.tenantModel(data);
    return tenant.save();
  }

  async findById(id: string): Promise<TenantDocument> {
    const tenant = await this.tenantModel.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findBySlug(slug: string): Promise<TenantDocument | null> {
    return this.tenantModel.findOne({ slug, isActive: true });
  }

  async findAll(): Promise<TenantDocument[]> {
    return this.tenantModel.find({ isActive: true }).sort({ createdAt: -1 });
  }

  async update(id: string, data: Partial<Tenant>): Promise<TenantDocument> {
    const tenant = await this.tenantModel.findByIdAndUpdate(id, data, { new: true });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateAiConfig(id: string, aiConfig: object): Promise<TenantDocument> {
    return this.update(id, { aiConfig } as any);
  }

  async updateClinicBrain(id: string, brain: object): Promise<TenantDocument> {
    return this.update(id, { clinicBrain: brain } as any);
  }

  private usageRules(tenant: TenantDocument) {
    const subscription: any = tenant.subscription || {};
    const policy: any = tenant.usagePolicy || {};
    const subscribed = subscription.plan === 'pro_daily'
      && subscription.status === 'active'
      && (!subscription.endsAt || new Date(subscription.endsAt) > new Date());
    return {
      plan: subscribed ? 'pro_daily' : 'free',
      appDailyCoins: Number(policy.appDailyCoins ?? (subscribed ? 5000 : 500)),
      appMessageCost: Number(policy.appMessageCost ?? 50),
      apiDailyRequests: Number(policy.apiDailyRequests ?? (subscribed ? 1000 : 50)),
    };
  }

  async getUsageStatus(id: string) {
    let tenant = await this.findById(id);
    const today = new Date().toISOString().slice(0, 10);
    if (tenant.usageBalance?.day !== today) {
      tenant = await this.tenantModel.findByIdAndUpdate(
        id,
        { usageBalance: { day: today, appCoinsUsed: 0, apiRequestsUsed: 0 } },
        { new: true },
      ) as TenantDocument;
    }
    const rules = this.usageRules(tenant);
    const usedCoins = Number(tenant.usageBalance?.appCoinsUsed || 0);
    const usedApi = Number(tenant.usageBalance?.apiRequestsUsed || 0);
    return {
      ...rules,
      day: today,
      appCoinsUsed: usedCoins,
      appCoinsRemaining: Math.max(0, rules.appDailyCoins - usedCoins),
      apiRequestsUsed: usedApi,
      apiRequestsRemaining: Math.max(0, rules.apiDailyRequests - usedApi),
    };
  }

  async consumeChatUsage(id: string, apiRequest: boolean) {
    const status = await this.getUsageStatus(id);
    const field = apiRequest ? 'usageBalance.apiRequestsUsed' : 'usageBalance.appCoinsUsed';
    const amount = apiRequest ? 1 : status.appMessageCost;
    const limit = apiRequest ? status.apiDailyRequests : status.appDailyCoins;
    const tenant = await this.tenantModel.findOneAndUpdate(
      {
        _id: id,
        $expr: {
          $lte: [
            { $add: [{ $ifNull: [`$${field}`, 0] }, amount] },
            limit,
          ],
        },
      },
      { $inc: { [field]: amount } },
      { new: true },
    );
    if (!tenant) {
      throw new HttpException(
        apiRequest
          ? `تم استهلاك حد API اليومي (${limit} طلب). اطلب زيادة الحد من الإدارة.`
          : `تم استهلاك رصيد اليوم (${limit} كوين). يتجدد الرصيد تلقائياً غداً.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.getUsageStatus(id);
  }

  async refundChatUsage(id: string, apiRequest: boolean) {
    const status = await this.getUsageStatus(id);
    const field = apiRequest ? 'usageBalance.apiRequestsUsed' : 'usageBalance.appCoinsUsed';
    const amount = apiRequest ? 1 : status.appMessageCost;
    await this.tenantModel.findOneAndUpdate(
      { _id: id, [field]: { $gte: amount } },
      { $inc: { [field]: -amount } },
    );
  }

  async getTotalCount(): Promise<number> {
    return this.tenantModel.countDocuments({ isActive: true });
  }

  async createDefaultTenant(): Promise<TenantDocument> {
    const existing = await this.findBySlug('default');
    if (existing) return existing;

    return this.create({
      slug: 'default',
      name: 'Thanarah Default',
      nameAr: 'ثنارة الافتراضي',
      type: 'organization',
      status: 'active',
    });
  }
}
