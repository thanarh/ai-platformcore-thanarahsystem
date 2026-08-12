import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeSource, KnowledgeSourceSchema } from './schemas/knowledge.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeSource.name, schema: KnowledgeSourceSchema },
    ]),
  ],
  providers: [KnowledgeService],
  controllers: [KnowledgeController],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
