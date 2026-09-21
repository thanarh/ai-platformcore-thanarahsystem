import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FileExtractionService } from './file-extraction.service';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly fileExtractionService: FileExtractionService) {}

  @Post('extract')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async extract(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم اختيار ملف');
    return this.fileExtractionService.extract(file);
  }
}