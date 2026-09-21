import { BadRequestException, Injectable } from '@nestjs/common';
import { spawn } from 'child_process';

const MAX_RETURNED_CHARS = 40000;
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'log']);

@Injectable()
export class FileExtractionService {
  async extract(file: Express.Multer.File) {
    const extension = file.originalname.split('.').pop()?.toLowerCase() || '';
    const isPdf = file.mimetype === 'application/pdf' || extension === 'pdf';
    const isText = file.mimetype.startsWith('text/') || TEXT_EXTENSIONS.has(extension) || file.mimetype === 'application/json';

    if (!isPdf && !isText) {
      throw new BadRequestException(
        'يمكن قراءة ملفات PDF والملفات النصية حاليًا. حوّل ملف Word أو Excel إلى PDF أو CSV ثم أرفقه مرة أخرى.',
      );
    }

    const content = isPdf
      ? await this.extractPdf(file.buffer)
      : file.buffer.toString('utf8');
    const normalized = content.replace(/\u0000/g, '').trim();

    if (!normalized) {
      throw new BadRequestException('لم أتمكن من استخراج نص قابل للقراءة من هذا الملف.');
    }

    return {
      name: file.originalname,
      type: file.mimetype || 'application/octet-stream',
      size: file.size,
      content: normalized.slice(0, MAX_RETURNED_CHARS),
      truncated: normalized.length > MAX_RETURNED_CHARS,
    };
  }

  private extractPdf(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('pdftotext', ['-layout', '-', '-']);
      const chunks: Buffer[] = [];
      let error = '';

      process.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      process.stderr.on('data', (chunk: Buffer) => { error += chunk.toString(); });
      process.on('error', () => reject(new BadRequestException('تعذر تشغيل قارئ ملفات PDF على الخادم.')));
      process.on('close', (code) => {
        if (code !== 0) {
          reject(new BadRequestException(error.trim() || 'تعذر قراءة ملف PDF.'));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      process.stdin.end(buffer);
    });
  }
}