import { Injectable } from '@nestjs/common';
import { ToolAuditRecord } from './tool.types';

@Injectable()
export class ToolAuditService {
  private readonly records: ToolAuditRecord[] = [];
  private readonly maxRecords = 1000;

  record(record: ToolAuditRecord): void {
    this.records.push({ ...record });
    if (this.records.length > this.maxRecords) this.records.shift();
  }

  recent(limit = 50): ToolAuditRecord[] {
    return this.records.slice(-Math.max(1, Math.min(limit, 100))).reverse();
  }
}