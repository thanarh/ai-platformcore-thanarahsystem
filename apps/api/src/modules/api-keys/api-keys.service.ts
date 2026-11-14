import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { ApiKey, ApiKeyDocument } from './schemas/api-key.schema';

@Injectable()
export class ApiKeysService {
  constructor(@InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>) {}

  async create(data: {
    tenantId: string;
    userId: string;
    name: string;
    environment?: 'live' | 'test';
    scopes?: string[];
    rateLimit?: number;
    expiresAt?: string;
  }): Promise<{ key: ApiKeyDocument; rawKey: string }> {
    if (!data.tenantId || !Types.ObjectId.isValid(data.tenantId) || !Types.ObjectId.isValid(data.userId) ||
      typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100 ||
      (data.environment !== undefined && !['live', 'test'].includes(data.environment)) ||
      (data.scopes !== undefined && (!Array.isArray(data.scopes) || !data.scopes.length ||
        data.scopes.some(s => !['chat', 'whatsapp:send'].includes(s)))) ||
      (data.rateLimit !== undefined && (!Number.isInteger(data.rateLimit) || data.rateLimit < 1 || data.rateLimit > 1000)) ||
      (data.expiresAt !== undefined && (!Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()))) {
      throw new BadRequestException('Invalid key name, tenant, scopes, rate limit or expiry');
    }
    const env = data.environment || 'live';

    // Generate raw key — only shown once
    const random = randomBytes(32).toString('hex');
    const rawKey = `thn_${env}_${random}`;

    // Store only the hash
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 16) + '...';

    const key = new this.apiKeyModel({
      tenantId: new Types.ObjectId(data.tenantId),
      createdBy: new Types.ObjectId(data.userId),
      name: data.name,
      keyHash,
      keyPrefix,
      environment: env,
      scopes: data.scopes || ['chat'],
      rateLimit: data.rateLimit || 1000,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    return { key: await key.save(), rawKey };
  }

  async findByTenant(tenantId: string): Promise<ApiKeyDocument[]> {
    if (!tenantId || !Types.ObjectId.isValid(tenantId)) throw new BadRequestException('Tenant required');
    return this.apiKeyModel.find({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    }).sort({ createdAt: -1 });
  }

  async validateKey(rawKey: string): Promise<ApiKeyDocument | null> {
    if (typeof rawKey !== 'string' || rawKey.length > 256) return null;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.apiKeyModel.findOne({ keyHash, isActive: true });

    if (!apiKey) return null;

    // Check expiry
    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return null;
    }

    // Update usage
    await this.apiKeyModel.findByIdAndUpdate(apiKey._id, {
      lastUsedAt: new Date(),
      $inc: { usageCount: 1 },
    });

    return apiKey;
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    if (!tenantId || !Types.ObjectId.isValid(tenantId) || !Types.ObjectId.isValid(id)) throw new BadRequestException('Valid tenant and key required');
    const key = await this.apiKeyModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!key) throw new NotFoundException('API key not found');
    key.isActive = false;
    await key.save();
  }

  async findAll(): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .populate('tenantId', 'name nameAr')
      .populate('createdBy', 'firstName lastName email');
  }

  async getTotalCount(tenantId?: string): Promise<number> {
    const filter: any = { isActive: true };
    if (tenantId) filter.tenantId = new Types.ObjectId(tenantId);
    return this.apiKeyModel.countDocuments(filter);
  }
}
