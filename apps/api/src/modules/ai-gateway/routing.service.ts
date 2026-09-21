import { Injectable } from '@nestjs/common';
import { ToolId, ToolRoute } from './tool.types';

export interface CapabilityDecision {
  route: ToolRoute;
  reason: string;
  toolId?: ToolId;
}

@Injectable()
export class CapabilityRoutingService {
  decide(query: string): CapabilityDecision {
    const text = (query || '').toLocaleLowerCase();
    if (/(appointment|appointments|موعد|مواعيد|doctor|doctors|طبيب|أطباء)/i.test(text)) {
      return {
        route: 'thanarah_tool',
        toolId: /doctor|طبيب|أطباء/i.test(text) ? 'get_doctors' : 'get_appointments',
        reason: 'tenant operational data signal',
      };
    }
    if (/(latest|current|today|now|آخر|اليوم|الآن|ابحث|search|research)/i.test(text)) {
      return { route: 'web', reason: 'current or external information signal' };
    }
    return { route: 'local', reason: 'no operational or web signal' };
  }

  resolveCalendarDate(value: string, timezone: string, now = new Date()): string {
    const normalized = value.trim().toLocaleLowerCase();
    if (!['tomorrow', 'بكرة', 'غداً', 'غدا'].includes(normalized)) return value;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .reduce<Record<string, string>>((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
      }, {});
    const date = new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1),
    );
    return date.toISOString().slice(0, 10);
  }
}