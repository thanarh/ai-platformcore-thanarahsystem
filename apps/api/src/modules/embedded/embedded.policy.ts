import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Role } from '../../common/decorators/roles.decorator';

export const embeddedHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const embeddedToken = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;
export function requireEmbeddedToken(value: unknown, prefix: string): string {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`).test(value)) {
    throw new BadRequestException('رمز الربط غير صالح.');
  }
  return value;
}

export function normalizeEmbeddedOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.length > 300) throw new BadRequestException('أصل الموقع غير صالح.');
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || url.hostname.includes('*') || url.origin === 'null'
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production'))) {
      throw new Error('Invalid origin');
    }
    return url.origin;
  } catch { throw new BadRequestException('أدخل أصل HTTPS فقط دون مسار، مثل https://example.com.'); }
}

export function assertEmbeddedOrigin(integration: { isActive: boolean; allowedOrigins: string[] }, origin: string) {
  if (!integration?.isActive || !integration.allowedOrigins.includes(origin)) {
    throw new ForbiddenException('الربط متوقف أو الموقع غير مسموح له بالتضمين.');
  }
}

export function embeddedRole(role: Role): Role {
  return [Role.OWNER, Role.ADMIN].includes(role) ? Role.TENANT_OWNER
    : role === Role.AI_ADMIN ? Role.USER : role;
}

/** An embedded session must never call a global or normal-auth endpoint. */
export function assertEmbeddedRoute(path: string, method: string) {
  const normalized = path.replace(/^\/api(?=\/)/, '').replace(/\/+$/, '');
  if (normalized === '/auth/me' && method === 'GET') return;
  if (/^\/(?:conversations|messages|knowledge|files|context-profile|whatsapp|api-keys|notifications)(?:\/|$)/.test(normalized)) return;
  if (/^\/ai(?:\/|$)/.test(normalized)) return; // Admin AI actions also enforce their normal roles.
  if (/^\/tenants\/(?:me|usage)(?:\/|$)/.test(normalized)) return;
  if (/^\/embedded\/integrations(?:\/|$)/.test(normalized)) return;
  throw new ForbiddenException('هذه العملية غير متاحة داخل النظام المضمّن.');
}
