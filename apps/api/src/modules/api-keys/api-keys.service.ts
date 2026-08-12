import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
  }): Promise<{ key: ApiKeyDocument; rawKey: string }> {
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
    });

    return { key: await key.save(), rawKey };
  }

  async findByTenant(tenantId: string): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel.find({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    }).sort({ createdAt: -1 });
  }

  async validateKey(rawKey: string): Promise<ApiKeyDocument | null> {
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
    const key = await this.apiKeyModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!key) throw new NotFoundException('API key not found');
    key.isActive = false;
    await key.save();
  }

  async getTotalCount(tenantId?: string): Promise<number> {
    const filter: any = { isActive: true };
    if (tenantId) filter.tenantId = new Types.ObjectId(tenantId);
    return this.apiKeyModel.countDocuments(filter);
  }
}
