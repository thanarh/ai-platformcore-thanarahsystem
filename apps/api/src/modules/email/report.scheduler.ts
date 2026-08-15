import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EmailService } from './email.service';
import { UsageService } from '../usage/usage.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UsageRecord, UsageRecordDocument } from '../usage/schemas/usage.schema';

@Injectable()
export class ReportScheduler {
  private readonly logger = new Logger(ReportScheduler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly usageService: UsageService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(UsageRecord.name) private usageModel: Model<UsageRecordDocument>,
  ) {}

  /** Runs every day at 07:00 AM Riyadh time (UTC+3 → 04:00 UTC) */
  @Cron('0 4 * * *', { timeZone: 'Asia/Riyadh' })
  async sendDailyReport() {
    this.logger.log('📧 Generating daily report...');

    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const dateStr = now.toLocaleDateString('ar-SA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Riyadh',
      });

      // 1. Usage stats
      const usageStats = await this.usageService.getStats();
      const stats = {
        requestsToday: usageStats.today.requestsToday,
        inputTokensToday: usageStats.today.inputTokensToday,
        outputTokensToday: usageStats.today.outputTokensToday,
        failedToday: usageStats.today.failedToday,
      };

      // 2. New users today
      const newUserDocs = await this.userModel
        .find({ createdAt: { $gte: todayStart } })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const newUsers = newUserDocs.map((u) => ({
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        createdAt: u.createdAt,
      }));

      // 3. Suspicious users: registered > 48h ago but email not verified
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const unverifiedDocs = await this.userModel
        .find({
          isEmailVerified: false,
          isActive: true,
          createdAt: { $lt: fortyEightHoursAgo },
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const suspiciousUsers = unverifiedDocs.map((u) => ({
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        reason: 'بريد غير موثق منذ أكثر من 48 ساعة',
      }));

      // 4. Heavy consumption users today (top 5 by total tokens)
      const heavyUsageAgg = await this.usageModel.aggregate([
        { $match: { createdAt: { $gte: todayStart }, userId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$userId',
            totalTokens: { $sum: { $add: ['$inputTokens', '$outputTokens'] } },
            requests: { $sum: 1 },
          },
        },
        { $sort: { totalTokens: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
        {
          $project: {
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            email: '$user.email',
            totalTokens: 1,
            requests: 1,
          },
        },
      ]);

      const heavyUsers = heavyUsageAgg.map((r) => ({
        name: `${r.firstName} ${r.lastName}`,
        email: r.email,
        tokens: r.totalTokens,
        requests: r.requests,
      }));

      await this.emailService.sendDailyReport({
        date: dateStr,
        stats,
        newUsers,
        suspiciousUsers,
        heavyUsers,
      });

      this.logger.log('✅ Daily report sent successfully');
    } catch (err) {
      this.logger.error(`❌ Daily report failed: ${err.message}`, err.stack);
    }
  }
}
