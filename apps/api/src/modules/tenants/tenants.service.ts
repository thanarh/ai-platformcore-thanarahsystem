import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
