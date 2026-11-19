'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, MessageSquare, RefreshCw, Send } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

type InboxSummary = {
  conversationId: string;
  phoneNumber: string | null;
  lastMessageAt?: string | null;
  messageCount: number;
  preview: string;
};

type ThreadMessage = {
  id: string;
  role: string;
  content: string;
  createdAt?: string;
  contentDecodeError?: boolean;
};

type Thread = {
  conversationId: string;
  phoneNumber: string | null;
  messages: ThreadMessage[];
  latestInbound?: {
    status: string;
    failureCode: string | null;
    createdAt?: string;
  } | null;
};

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ar-SA', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function failureMessage(code?: string | null) {
  switch (code) {
    case 'AI_RESPONSE_FAILED':
      return 'تعذّر على المساعد إعداد إجابة؛ أرسل النظام إشعار استلام للعميل.';
    case 'WHATSAPP_AUTO_REPLY_FAILED':
      return 'تعذّر تأكيد إرسال الرد عبر WhatsApp. تحقق من اتصال الرقم.';
    case 'WHATSAPP_INBOUND_PROCESSING_FAILED':
      return 'تعذّرت معالجة الرسالة الواردة؛ سجّل النظام سببًا آمنًا في قاعدة البيانات.';
    case 'WHATSAPP_INBOX_SAVE_FAILED':
      return 'تعذّر حفظ المحادثة. تحقق من اتصال قاعدة البيانات.';
    default:
      return 'تعذّر الرد على آخر رسالة. راجع اتصال WhatsApp وإعداد الرد الآلي.';
  }
}

export default function WhatsappInboxPanel({ connected }: { connected: boolean }) {
  const [threads, setThreads] = useState<InboxSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef({ conversationId: '', lastMessageId: '' });
  const stickToBottomRef = useRef(true);

  const loadInbox = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data } = await api.get<InboxSummary[]>('/whatsapp/inbox');
      const rows = Array.isArray(data) ? data : [];
      setThreads(rows);
      setSelectedId((current) => rows.some((row) => row.conversationId === current)
        ? current
        : rows[0]?.conversationId || '');
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'تعذّر تحميل محادثات WhatsApp.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId: string, quiet = false) => {
    if (!conversationId) {
      setThread(null);
      return;
    }
    try {
      const { data } = await api.get<Thread>(`/whatsapp/inbox/${conversationId}`);
      setThread(data);
    } catch (requestError: any) {
      if (!quiet) setError(requestError?.response?.data?.message || 'تعذّر فتح المحادثة.');
    }
  }, []);

  useEffect(() => {
    void loadInbox();
    const timer = window.setInterval(() => void loadInbox(true), 7000);
    return () => window.clearInterval(timer);
  }, [loadInbox]);

  useEffect(() => {
    void loadThread(selectedId);
    const timer = selectedId
      ? window.setInterval(() => void loadThread(selectedId, true), 5000)
      : undefined;
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [loadThread, selectedId]);

  useEffect(() => {
    if (!selectedId || thread?.conversationId !== selectedId) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const lastMessageId = thread.messages[thread.messages.length - 1]?.id || '';
    const conversationChanged = scrollAnchorRef.current.conversationId !== selectedId;
    const newMessage = Boolean(lastMessageId && lastMessageId !== scrollAnchorRef.current.lastMessageId);

    if (conversationChanged) {
      container.scrollTop = container.scrollHeight;
      stickToBottomRef.current = true;
    } else if (newMessage && stickToBottomRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }

    scrollAnchorRef.current = { conversationId: selectedId, lastMessageId };
  }, [selectedId, thread?.conversationId, thread?.messages]);

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/whatsapp/inbox/${selectedId}/reply`, { text });
      setDraft('');
      await Promise.all([loadThread(selectedId, true), loadInbox(true)]);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'تعذّر إرسال الرد. تحقق من اتصال WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  const statusText = thread?.latestInbound?.status === 'failed'
    ? 'آخر رد آلي تعذّر'
    : thread?.latestInbound?.status === 'processing'
      ? 'الذكاء الاصطناعي يجهّز الرد'
      : thread?.latestInbound?.status === 'replied'
        ? 'تم إرسال آخر رد آلي'
        : '';

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dce5de] bg-[#fbfcf8] shadow-[0_10px_30px_rgba(29,66,51,.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebe4] px-5 py-4 sm:px-6">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[.14em] text-[#6d8b79]">
            <MessageSquare className="h-4 w-4" /> صندوق وارد WhatsApp
          </p>
          <h2 className="mt-1 text-lg font-bold text-[#24332f]">محادثات الرقم المرتبط</h2>
          <p className="mt-1 text-xs text-[#65756b]">تتحدث المحادثات تلقائيًا كل بضع ثوانٍ.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold',
            connected ? 'bg-[#e6f3e8] text-[#327047]' : 'bg-[#fff3df] text-[#856632]',
          )}>
            {connected ? 'الرقم متصل' : 'يلزم ربط الرقم'}
          </span>
          <button
            type="button"
            onClick={() => void loadInbox()}
            className="rounded-lg border border-[#dce5de] bg-white p-2 text-[#52665a] hover:bg-[#f1f5ef]"
            aria-label="تحديث المحادثات"
            title="تحديث المحادثات"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-[#e5c7bd] bg-[#fff7f3] px-3 py-2 text-sm text-[#8b3f2e] sm:mx-5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid min-h-[520px] md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-[#e5ebe4] md:border-b-0 md:border-l">
          <div className="border-b border-[#e5ebe4] px-4 py-3 text-xs font-semibold text-[#65756b]">
            {threads.length} محادثة
          </div>
          <div className="max-h-[250px] overflow-y-auto md:max-h-[520px]">
            {loading && threads.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-[#65756b]" role="status">
                <LoaderCircle className="h-4 w-4 animate-spin" /> جارٍ تحميل المحادثات…
              </div>
            ) : threads.length === 0 ? (
              <p className="p-4 text-sm leading-6 text-[#718078]">
                لا توجد محادثات بعد. بعد ربط QR، أرسل رسالة إلى رقم المؤسسة لتظهر هنا.
              </p>
            ) : threads.map((item) => (
              <button
                key={item.conversationId}
                type="button"
                onClick={() => setSelectedId(item.conversationId)}
                className={cn(
                  'block w-full border-b border-[#eef1ec] px-4 py-3 text-right transition hover:bg-[#f3f6f1]',
                  selectedId === item.conversationId && 'bg-[#eaf2eb]',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[#2f4639]" dir="ltr">
                    {item.phoneNumber || 'رقم قديم غير محفوظ'}
                  </span>
                  <span className="shrink-0 text-[10px] text-[#7c8980]">{formatTime(item.lastMessageAt)}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-[#718078]">
                  {item.preview || 'رسالة WhatsApp'}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[520px] min-w-0 flex-col">
          {thread ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ebe4] px-4 py-3 sm:px-5">
                <div>
                  <p className="text-sm font-bold text-[#2f4639]" dir="ltr">
                    {thread.phoneNumber || 'رقم جهة الاتصال غير محفوظ'}
                  </p>
                  {statusText && <p className="mt-1 text-xs text-[#7a6b3a]">{statusText}</p>}
                </div>
                {!connected && <p className="text-xs text-[#8a6835]">أعد ربط QR لإرسال رد يدوي.</p>}
              </header>
              <div
                ref={messagesContainerRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  stickToBottomRef.current =
                    element.scrollHeight - element.scrollTop - element.clientHeight < 80;
                }}
                className="min-h-0 max-h-[520px] flex-1 space-y-3 overflow-y-auto bg-[#f4f7f2] p-4"
                aria-live="polite"
              >
                {thread.messages.map((message) => {
                  const outgoing = message.role === 'assistant';
                  const unreadable = message.contentDecodeError === true;
                  return (
                    <div
                      key={message.id}
                      className={cn('flex', unreadable ? 'justify-center' : outgoing ? 'justify-start' : 'justify-end')}
                    >
                      <div className={cn(
                        'max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm',
                        unreadable
                          ? 'max-w-full border border-dashed border-[#e8d9aa] bg-[#fff8df] text-[#806b31]'
                          : outgoing
                            ? 'rounded-tr-sm border border-[#d9e8dc] bg-white text-[#34483a]'
                            : 'rounded-tl-sm bg-[#d9efdd] text-[#283e31]',
                      )}>
                        <p className={cn('mb-1 text-[10px] font-semibold', unreadable ? 'text-[#806b31]' : 'text-[#67806e]')}>
                          {unreadable ? 'رسالة قديمة غير مقروءة' : outgoing ? 'ثنارة / فريق المؤسسة' : 'العميل'}
                        </p>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                        <p className="mt-1 text-left text-[10px] text-[#839087]" dir="ltr">
                          {formatTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {thread.messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-[#718078]">لا توجد رسائل محفوظة في هذه المحادثة.</p>
                )}
              </div>
              {thread.latestInbound?.status === 'failed' && thread.latestInbound.failureCode && (
                <p className="border-t border-[#f0dfca] bg-[#fff9ef] px-4 py-2 text-xs text-[#795f37]" role="status">
                  {failureMessage(thread.latestInbound.failureCode)} يمكنك إرسال رد يدوي أو مراجعة إعداد الرد الآلي.
                </p>
              )}
              <form onSubmit={(event) => void sendReply(event)} className="flex gap-2 border-t border-[#e5ebe4] bg-white p-3 sm:p-4">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={4096}
                  disabled={!connected || !thread.phoneNumber || sending}
                  placeholder={connected ? 'اكتب ردًا يدويًا…' : 'اربط رقم WhatsApp لإرسال الرد'}
                  className="min-w-0 flex-1 rounded-xl border border-[#dce5de] px-3 py-2.5 text-sm outline-none focus:border-[#39785a] disabled:bg-[#f2f4f1]"
                  aria-label="نص الرد اليدوي"
                />
                <button
                  type="submit"
                  disabled={!connected || !thread.phoneNumber || !draft.trim() || sending}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#1c5944] px-3.5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="hidden sm:inline">{sending ? 'جارٍ الإرسال…' : 'إرسال'}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div className="max-w-sm">
                <MessageSquare className="mx-auto h-8 w-8 text-[#9bb3a0]" />
                <p className="mt-3 text-sm font-semibold text-[#4b6153]">
                  {threads.length ? 'اختر محادثة لعرض الرسائل والرد' : 'ستظهر رسائل العملاء هنا'}
                </p>
                <p className="mt-2 text-xs leading-6 text-[#7b8980]">
                  الرد الآلي يجيب على الرسائل النصية الجديدة عند تفعيله من إعدادات التوجيه أدناه.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
