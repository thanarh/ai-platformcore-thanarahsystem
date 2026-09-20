import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContextProfile, ContextProfileSchema } from './schemas/context-profile.schema';
import { ContextProfileController } from './context-profile.controller';
import { ContextProfileService } from './context-profile.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContextProfile.name, schema: ContextProfileSchema },
    ]),
  ],
  controllers: [ContextProfileController],
  providers: [ContextProfileService],
  exports: [ContextProfileService],
})
export class ContextProfileModule {}