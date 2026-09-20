import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, lang: 'ar' | 'en' = 'ar') {
  const d = new Date(date);
  return formatDistanceToNow(d, {
    addSuffix: true,
    locale: lang === 'ar' ? ar : undefined,
  });
}

export function detectLanguage(text: string): 'ar' | 'en' {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'ar';
  return arabicChars / totalChars > 0.2 ? 'ar' : 'en';
}

export function isRTL(text: string): boolean {
  return detectLanguage(text) === 'ar';
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function sanitizeStreamText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export interface StreamChatOptions {
  inputMode?: 'text' | 'voice';
  voiceMetadata?: Record<string, unknown>;
}

export async function streamChat(
  conversationId: string,
  content: string,
  token: string,
  onDelta: (delta: string) => void,
  onDone: (meta?: any) => void,
  onError: (err: string) => void,
  onEvent: (event: any) => void = () => {},
  signal?: AbortSignal,
  options?: StreamChatOptions,
) {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(`${baseUrl}/api/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversationId, content, ...options }),
      signal,
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      let message = detail;
      try {
        const parsed = JSON.parse(detail);
        message = Array.isArray(parsed.message) ? parsed.message.join('، ') : (parsed.message || parsed.detail || detail);
      } catch {}
      onError(message || 'تعذر الاتصال بخدمة ثنارة الذكية.');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let meta: any = null;
    let completed = false;

    const processEvent = (event: string) => {
      const raw = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();
      if (!raw) return;
      if (raw === '[DONE]') {
        completed = true;
        onDone(meta);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          completed = true;
          onError(sanitizeStreamText(parsed.content) || 'تعذر إكمال الطلب حالياً.');
          return;
        }
        if (parsed.event) onEvent(parsed);
        const delta = sanitizeStreamText(parsed.delta);
        if (delta) onDelta(delta);
        if (parsed.meta) meta = { ...(meta || {}), ...parsed.meta };
      } catch {
        // Ignore malformed frames without exposing transport bytes to the user.
      }
    };

    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        processEvent(event);
        if (completed) break;
      }
    }

    buffer += decoder.decode();
    if (!completed && buffer.trim()) processEvent(buffer);
    if (!completed) onDone(meta);
    await reader.cancel().catch(() => {});
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      onDone({ stopped: true });
      return;
    }
    const message = error instanceof Error ? error.message : 'تعذر الاتصال بخدمة ثنارة الذكية.';
    onError(message);
  }
}
