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
  const arabicPattern = /[\u0600-\u06FF]/;
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

export async function streamChat(
  conversationId: string,
  content: string,
  token: string,
  onDelta: (delta: string) => void,
  onDone: (meta?: any) => void,
  onError: (err: string) => void
) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${baseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, content }),
  });

  if (!res.ok || !res.body) {
    onError('Failed to connect to AI engine');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let meta: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') {
        onDone(meta);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          onError(parsed.content || 'AI error');
          return;
        }
        if (parsed.delta) onDelta(parsed.delta);
        if (parsed.meta) meta = parsed.meta;
      } catch {}
    }
  }

  onDone(meta);
}
