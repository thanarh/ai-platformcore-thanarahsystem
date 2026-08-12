import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { KnowledgeSource, KnowledgeSourceDocument } from './schemas/knowledge.schema';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private readonly aiEngineUrl: string;

  constructor(
    @InjectModel(KnowledgeSource.name)
    private knowledgeModel: Model<KnowledgeSourceDocument>,
    private configService: ConfigService,
  ) {
    this.aiEngineUrl = this.configService.get<string>('aiEngine.url');
  }

  async createSource(data: {
    tenantId: string;
    name: string;
    type?: string;
    fileName?: string;
    fileUrl?: string;
    fileMimeType?: string;
    fileSizeBytes?: number;
    metadata?: object;
  }): Promise<KnowledgeSourceDocument> {
    const source = new this.knowledgeModel({
      tenantId: new Types.ObjectId(data.tenantId),
      name: data.name,
      type: data.type || 'document',
      status: 'processing',
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileMimeType: data.fileMimeType,
      fileSizeBytes: data.fileSizeBytes || 0,
      metadata: data.metadata || {},
    });

    await source.save();

    // Trigger async processing in Python AI engine
    this.processSource(source._id.toString(), data.tenantId, data.fileUrl, data.fileMimeType).catch(
      (err) => this.logger.warn(`Source processing failed: ${err.message}`),
    );

    return source;
  }

  private async processSource(sourceId: string, tenantId: string, fileUrl: string, mimeType: string) {
    try {
      await axios.post(`${this.aiEngineUrl}/knowledge/ingest`, {
        sourceId,
        tenantId,
        fileUrl,
        mimeType,
      }, { timeout: 300000 });

      await this.knowledgeModel.findByIdAndUpdate(sourceId, {
        status: 'ready',
        processedAt: new Date(),
      });
    } catch (err) {
      await this.knowledgeModel.findByIdAndUpdate(sourceId, {
        status: 'error',
        errorMessage: err.message,
      });
    }
  }

  async findByTenant(tenantId: string): Promise<KnowledgeSourceDocument[]> {
    return this.knowledgeModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 });
  }

  async search(tenantId: string, query: string, limit = 5) {
    try {
      const response = await axios.post(`${this.aiEngineUrl}/knowledge/search`, {
        tenantId,
        query,
        limit,
      }, { timeout: 15000 });
      return response.data;
    } catch {
      return { results: [] };
    }
  }

  async deleteSource(id: string, tenantId: string) {
    await this.knowledgeModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    // Notify AI engine to clean up vectors
    axios.delete(`${this.aiEngineUrl}/knowledge/${id}`, { timeout: 10000 }).catch(() => {});
  }

  async getCount(tenantId?: string): Promise<number> {
    const filter: any = {};
    if (tenantId) filter.tenantId = new Types.ObjectId(tenantId);
    return this.knowledgeModel.countDocuments(filter);
  }
}
