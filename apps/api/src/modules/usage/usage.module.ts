import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsageService } from './usage.service';
import { UsageRecord, UsageRecordSchema } from './schemas/usage.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UsageRecord.name, schema: UsageRecordSchema }]),
  ],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
