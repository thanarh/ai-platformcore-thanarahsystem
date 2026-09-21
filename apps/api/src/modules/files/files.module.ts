import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FileExtractionService } from './file-extraction.service';

@Module({
  controllers: [FilesController],
  providers: [FileExtractionService],
})
export class FilesModule {}