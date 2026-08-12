import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsageRecord, UsageRecordDocument } from './schemas/usage.schema';

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(UsageRecord.name)
    private usageModel: Model<UsageRecordDocument>,
  ) {}

  async record(data: {
    tenantId: string;
    userId?: string;
    conversationId?: string;
    requestId: string;
    backend?: string;
    model?: string;
    routeDecision?: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
    status?: string;
    error?: string;
    toolCalls?: string[];
    ragUsed?: boolean;
  }): Promise<UsageRecordDocument> {
    const record = new this.usageModel({
      tenantId: new Types.ObjectId(data.tenantId),
      userId: data.userId ? new Types.ObjectId(data.userId) : undefined,
      conversationId: data.conversationId ? new Types.ObjectId(data.conversationId) : undefined,
      requestId: data.requestId,
      backend: data.backend,
      model: data.model,
      routeDecision: data.routeDecision,
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
      latencyMs: data.latencyMs || 0,
      status: data.status || 'success',
      error: data.error,
      toolCalls: data.toolCalls || [],
      ragUsed: data.ragUsed || false,
    });
    return record.save();
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayStats, totalStats, latencyStats] = await Promise.all([
      this.usageModel.aggregate([
        { $match: { createdAt: { $gte: today } } },
        {
          $group: {
            _id: null,
            requestsToday: { $sum: 1 },
            inputTokensToday: { $sum: '$inputTokens' },
            outputTokensToday: { $sum: '$outputTokens' },
            failedToday: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
          },
        },
      ]),
      this.usageModel.aggregate([
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            totalInputTokens: { $sum: '$inputTokens' },
            totalOutputTokens: { $sum: '$outputTokens' },
            totalFailed: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
          },
        },
      ]),
      this.usageModel.aggregate([
        { $match: { status: 'success', latencyMs: { $gt: 0 } } },
        { $group: { _id: null, avgLatency: { $avg: '$latencyMs' } } },
      ]),
    ]);

    return {
      today: todayStats[0] || { requestsToday: 0, inputTokensToday: 0, outputTokensToday: 0, failedToday: 0 },
      total: totalStats[0] || { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalFailed: 0 },
      avgLatencyMs: latencyStats[0]?.avgLatency || 0,
    };
  }

  async getByTenant(tenantId: string, limit = 100): Promise<UsageRecordDocument[]> {
    return this.usageModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getRecentLogs(limit = 50): Promise<UsageRecordDocument[]> {
    return this.usageModel.find().sort({ createdAt: -1 }).limit(limit).populate('tenantId', 'name');
  }
}
