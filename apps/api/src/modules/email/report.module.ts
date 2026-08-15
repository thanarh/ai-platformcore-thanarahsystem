import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailModule } from './email.module';
import { UsageModule } from '../usage/usage.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsageRecord, UsageRecordSchema } from '../usage/schemas/usage.schema';
import { ReportScheduler } from './report.scheduler';

@Module({
  imports: [
    EmailModule,
    UsageModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UsageRecord.name, schema: UsageRecordSchema },
    ]),
  ],
  providers: [ReportScheduler],
})
export class ReportModule {}
