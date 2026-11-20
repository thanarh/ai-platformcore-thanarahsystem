'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, MessageSquare, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

type SimulationRole = 'user' | 'assistant';
type ReplySource = 'quick_reply' | 'ai' | 'simulated_failure' | 'fallback' | 'request_error' | 'pending';

type SimulationLine = {
  id: string;
  role: SimulationRole;
  content: string;
  source?: ReplySource;
  latencyMs?: number;
  failureCode?: string | null;
  example?: boolean;
};

type SimulationResponse = {
  status: 'replied' | 'failed';
  source: 'quick_reply' | 'ai' | 'simulated_failure' | 'fallback';
  reply: string;
  failureCode: string | null;
  latencyMs: number;
  simulated: true;
  sentToWhatsApp: false;
  savedToConversation: false;
};

const exampleLines: SimulationLine[] = [
  {
    id: 'example-customer',
    role: 'user',
    content: 'من هيا ثناره؟',
    example: true,
  },
  {
    id: 'example-assistant',
    role: 'assistant',
    content: 'تنويه: أنا مساعد آلي وقد يطلع فريق ثنارة على رسالتك للمتابعة.\nثنارة شركة تقنية تطوّر منظومة رقمية للمنشآت الصحية، تشمل حلولًا لإدارة العيادات والتواصل والذكاء الاصطناعي.',
    source: 'quick_reply',
    latencyMs: 1,
    example: true,
  },
];

const quickQuestions = ['من هيا ثناره؟', 'علومك', 'ما خدمات ثنارة؟'];

function sourceLabel(source?: ReplySource) {
  if (source === 'quick_reply') return 'رد فوري';
  if (source === 'ai') return 'رد المساعد';
  if (source === 'simulated_failure') return 'اختبار تعذّر الذكاء';
  if (source === 'fallback') return 'رد احتياطي';
  if (source === 'request_error') return 'تعذّر الاختبار';
  return 'جارٍ تجهيز رد الاختبار';
}

export default function WhatsappReplySimulator() {
  const [lines, setLines] = useState<SimulationLine[]>(exampleLines);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lines]);

  const simulate = async (rawMessage: string, simulateFailure = false) => {
    const message = rawMessage.trim();
    if (!message || busy) return;

    const history = lines
      .filter((line) => !line.example && ['quick_reply', 'ai'].includes(line.source || ''))
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    const userLine: SimulationLine = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    const pendingId = `pending-${Date.now()}`;
    setLines((current) => [
      ...current.filter((line) => !line.example),
      userLine,
      { id: pendingId, role: 'assistant', content: '', source: 'pending' },
    ]);
    setDraft('');
    setBusy(true);
    setError('');

    try {
      const { data } = await api.post<SimulationResponse>('/admin/whatsapp/platform/simulate', {
        message,
        history,
        simulateFailure,
      });
      setLines((current) => current.map((line) => line.id === pendingId
        ? {
          id: `reply-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          source: data.source,
          latencyMs: data.latencyMs,
          failureCode: data.failureCode,
        }
        : line));
    } catch (requestError: any) {
      const messageText = requestError?.response?.data?.message
        || 'تعذّر تشغيل المحاكاة. تحقق من اتصال الخادم ثم أعد الاختبار.';
      setError(messageText);
      setLines((current) => current.map((line) => line.id === pendingId
        ? { ...line, content: messageText, source: 'request_error' }
        : line));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void simulate(draft);
  };

  const reset = () => {
    if (busy) return;
    setLines(exampleLines);
    setDraft('');
    setError('');
  };

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dce5de] bg-[#fbfcf8] shadow-[0_10px_30px_rgba(29,66,51,.04)]" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5ebe4] px-5 py-4 sm:px-6">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[.14em] text-[#6d8b79]">
            <MessageSquare className="h-4 w-4" /> اختبار آمن
          </p>
          <h2 className="mt-1 text-lg font-bold text-[#24332f]">محاكي ردود WhatsApp</h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-[#65756b]">
            اختبر صياغة الرد قبل استقبال العملاء. هذه محاكاة فقط؛ لا ترسل WhatsApp ولا تحفظ المحادثة.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe4d2] bg-[#edf7ee] px-3 py-1.5 text-xs font-semibold text-[#327047]">
          <ShieldCheck className="h-3.5 w-3.5" /> لا اتصال بالرقم
        </span>
      </header>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e4eae2] bg-[#f4f7f2]">
          <div className="flex items-center justify-between border-b border-[#e5ebe4] bg-white px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[#2f4639]">جلسة اختبار محلية</p>
              <p className="text-[11px] text-[#77847b]">المحادثة تُحفظ في هذه الصفحة فقط</p>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce5de] px-2.5 py-1.5 text-xs font-semibold text-[#53675d] disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> مسح الاختبار
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {lines.map((line) => {
              const isAssistant = line.role === 'assistant';
              return (
                <div key={line.id} className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
                  <div className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm',
                    isAssistant
                      ? 'rounded-tr-sm border border-[#d9e8dc] bg-white text-[#34483a]'
                      : 'rounded-tl-sm bg-[#d9efdd] text-[#283e31]',
                    line.source === 'simulated_failure' && 'border-[#e8d9aa] bg-[#fff8df] text-[#806b31]',
                    line.source === 'request_error' && 'border-[#e5c7bd] bg-[#fff7f3] text-[#8b3f2e]',
                  )}>
                    {line.example && (
                      <p className="mb-1 text-[10px] font-bold text-[#7b887e]">مثال للشكل فقط</p>
                    )}
                    {line.source === 'pending' ? (
                      <span className="inline-flex items-center gap-2 text-xs text-[#65756b]">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        جارٍ تجهيز رد الاختبار فقط…
                      </span>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{line.content}</p>
                    )}
                    {isAssistant && line.source !== 'pending' && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[#819087]">
                        <span>{sourceLabel(line.source)}</span>
                        {typeof line.latencyMs === 'number' && <span>{line.latencyMs} ms</span>}
                        {line.failureCode && <span dir="ltr">{line.failureCode}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {error && (
            <p role="alert" className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-[#fff1ec] px-3 py-2 text-xs text-[#8b3f2e]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <form onSubmit={submit} className="flex gap-2 border-t border-[#e5ebe4] bg-white p-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={1200}
              placeholder="اكتب رسالة اختبار…"
              aria-label="رسالة اختبار"
              className="min-w-0 flex-1 rounded-xl border border-[#dce5de] bg-[#fbfcf8] px-3 py-2 text-sm outline-none focus:border-[#8bb49a]"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1c5944] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              اختبر
            </button>
          </form>
        </div>

        <aside className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-[#34483a]">جرّب أمثلة سريعة</h3>
            <div className="mt-2 flex flex-wrap gap-2 lg:flex-col">
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void simulate(question)}
                  disabled={busy}
                  className="rounded-xl border border-[#dce5de] bg-white px-3 py-2 text-right text-xs text-[#53675d] hover:bg-[#f5f8f3] disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#e8d9aa] bg-[#fff8df] p-3 text-xs leading-6 text-[#806b31]">
            <p className="font-bold">اختبار مسار التعذّر</p>
            <p className="mt-1">يعرض الرد الاحتياطي دون إيقاف الجلسة أو استدعاء الذكاء الاصطناعي.</p>
            <button
              type="button"
              onClick={() => void simulate('سؤال عام لاختبار تعذّر الرد', true)}
              disabled={busy}
              className="mt-2 rounded-lg border border-[#dfce96] bg-white px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              محاكاة فشل الذكاء
            </button>
          </div>

          <p className="text-[11px] leading-5 text-[#7b887e]">
            الأسئلة التي تحتاج إجابة مولّدة قد تستخدم رصيد الذكاء المفعّل. الردود السريعة واختبار الفشل لا يستهلكان رصيد النموذج.
          </p>
        </aside>
      </div>
    </section>
  );
}
