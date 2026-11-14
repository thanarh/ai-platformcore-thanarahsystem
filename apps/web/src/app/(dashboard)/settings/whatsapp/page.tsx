'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

type Readiness = {
  available: boolean;
  integration: string;
  state: string;
  reason?: string;
  capabilities: {
    linkSession: boolean;
    receiveMessages: boolean;
    sendMessages: boolean;
    sendMedia: boolean;
  };
};

const managerRoles = ['OWNER', 'ADMIN', 'TENANT_OWNER'];

const capabilityLabels: Array<{ key: keyof Readiness['capabilities']; label: string }> = [
  { key: 'linkSession', label: 'ربط جلسة المؤسسة' },
  { key: 'receiveMessages', label: 'استقبال الرسائل' },
  { key: 'sendMessages', label: 'إرسال الرسائل' },
  { key: 'sendMedia', label: 'إرسال الوسائط' },
];

function readinessFrom(value: unknown): value is Readiness {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<Readiness>;
  return typeof response.available === 'boolean'
    && typeof response.integration === 'string'
    && typeof response.state === 'string'
    && Boolean(response.capabilities && typeof response.capabilities === 'object');
}

function errorMessage(error: any) {
  return error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || 'تعذّر قراءة حالة جاهزية WhatsApp. حاول مرة أخرى.';
}

export default function WhatsAppSettingsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state._hasHydrated);
  const allowed = Boolean(user && managerRoles.includes(user.role));
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (hydrated && !allowed) router.replace('/chat');
  }, [allowed, hydrated, router]);

  const loadReadiness = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<Readiness>('/whatsapp/readiness');
      if (!readinessFrom(response.data)) {
        throw new Error('استجابة الجاهزية من الخادم غير مكتملة.');
      }
      setReadiness(response.data);
    } catch (requestError: any) {
      const responseBody = requestError?.response?.data;
      if (readinessFrom(responseBody)) {
        setReadiness(responseBody);
      } else {
        setReadiness(null);
        setError(errorMessage(requestError));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void loadReadiness();
  }, [allowed, loadReadiness]);

  if (!hydrated || !allowed) {
    return <div className="flex min-h-[50vh] items-center justify-center" dir="rtl"><div className="h-5 w-5 animate-pulse rounded-full bg-[#6e987b]" /></div>;
  }

  const blocked = readiness?.available === false || readiness?.state === 'blocked';
  const hasReadiness = Boolean(readiness);

  return (
    <main className="min-h-[100dvh] flex-1 overflow-auto bg-[#f3f6f3] px-4 py-7 text-[#24332f] sm:px-7 lg:px-10" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="relative overflow-hidden rounded-[26px] bg-[#173d35] p-6 text-[#f7f4e9] sm:p-8">
          <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full border border-[#a8c8ae]/20" />
          <div className="pointer-events-none absolute -left-2 -top-12 h-44 w-44 rounded-full border border-[#a8c8ae]/20" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-[#b5d6b8]">
                <ShieldCheck className="h-4 w-4" /> إعدادات المؤسسة
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">WhatsApp Web</h1>
              <p className="mt-2 max-w-xl text-sm leading-7 text-[#d5e3d9]">
                حالة الجاهزية الفعلية لتكامل WhatsApp Web الخاص بمؤسستك، دون بدء جلسة أو طلب رمز تحقق.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs">
              <span className={cn('h-2 w-2 rounded-full', blocked ? 'bg-[#d6b779]' : 'bg-[#a8d6a3]')} />
              {loading ? 'جارٍ قراءة الجاهزية' : blocked ? 'غير متاح' : readiness?.available ? 'متاح' : 'غير متاح'}
            </div>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#e5c7bd] bg-[#fff7f3] px-4 py-3 text-sm text-[#8b3f2e]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
              <button onClick={() => void loadReadiness()} className="mt-2 inline-flex items-center gap-2 font-semibold">
                <RefreshCw className="h-3.5 w-3.5" /> إعادة قراءة الحالة
              </button>
            </div>
          </div>
        )}

        {loading && !hasReadiness ? (
          <section className="rounded-[22px] border border-[#dce5de] bg-[#fbfcf8] p-6" aria-label="جارٍ تحميل حالة WhatsApp">
            <div className="h-6 w-48 animate-pulse rounded-lg bg-[#e5ece4]" />
            <div className="mt-4 h-16 animate-pulse rounded-xl bg-[#edf1eb]" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-[#edf1eb]" />)}</div>
          </section>
        ) : readiness ? (
          <section className="overflow-hidden rounded-[22px] border border-[#dce5de] bg-[#fbfcf8] shadow-[0_10px_30px_rgba(29,66,51,.04)]">
            <div className="flex flex-col gap-4 border-b border-[#e5ebe4] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
              <div>
                <p className="text-[11px] font-bold tracking-[.16em] text-[#6d8b79]">الاستجابة الحقيقية من الخادم</p>
                <h2 className="mt-2 text-lg font-bold">تكامل WhatsApp غير مفعّل</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[#65756b]">
                  لا توجد جلسة مؤسسة مسجلة. لا يمكن حاليًا الربط أو استقبال الرسائل أو إرسالها أو إرسال الوسائط.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e8d9aa] bg-[#fff8df] px-3 py-1.5 text-xs font-semibold text-[#806b31]">
                <LockKeyhole className="h-3.5 w-3.5" /> {readiness.state}
              </span>
            </div>

            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_.9fr]">
              <div>
                <h3 className="text-sm font-bold">الإمكانات الحالية</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {capabilityLabels.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-[#e7ece5] bg-[#f6f8f3] px-3 py-3">
                      <span className="text-xs font-medium text-[#53675d]">{label}</span>
                      <span className={cn('rounded-full px-2 py-1 text-[10px] font-bold', readiness.capabilities[key] ? 'bg-[#e5f2e5] text-[#38704c]' : 'bg-[#f1e9e3] text-[#915e49]')}>
                        {readiness.capabilities[key] ? 'متاح' : 'غير متاح'}
                      </span>
                    </div>
                  ))}
                </div>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-[#f1f4ee] p-3 text-xs">
                  <dt className="text-[#79867d]">الموصل</dt><dd className="font-mono text-[#44584b]" dir="ltr">{readiness.integration}</dd>
                  <dt className="text-[#79867d]">السبب</dt><dd className="font-mono text-[#44584b]" dir="ltr">{readiness.reason || 'غير محدد من الخادم'}</dd>
                  <dt className="text-[#79867d]">الحالة</dt><dd className="font-mono text-[#44584b]" dir="ltr">{readiness.state}</dd>
                </dl>
              </div>

              <aside className="rounded-2xl border border-[#dce5de] bg-[#f4f6f0] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-[#315c43]">
                  <CheckCircle2 className="h-4 w-4" /> ما يعنيه هذا لمؤسستك
                </div>
                <ul className="mt-3 space-y-2 text-xs leading-6 text-[#596d5f]">
                  <li>حزمة Baileys محجوبة وفق سياسة أمان الحزم في المشروع.</li>
                  <li>لا يوجد الآن ربط حقيقي، أو إرسال لرموز التحقق، أو نقل رسائل، أو مصادقة جلسة.</li>
                  <li>لن نعرض QR أو زر اتصال وهميًا؛ لا توجد جلسة أو سجلات أو بيانات اعتماد محفوظة.</li>
                </ul>
              </aside>
            </div>
          </section>
        ) : null}

        <section className="rounded-[22px] border border-[#d9e2dc] bg-[#eef3ed] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-[11px] font-bold tracking-[.16em] text-[#6d8b79]">عقد التكامل المستقبلي</p>
              <h2 className="mt-2 text-lg font-bold">إرسال HTTP غير متاح حاليًا</h2>
              <p className="mt-1 max-w-3xl text-xs leading-6 text-[#68786d]">
                هذا وصف للعقد المخطط فقط، وليس زر إرسال أو طلبًا حيًا. سيبقى غير متاح حتى تسمح استجابة الجاهزية بذلك.
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#f4e7df] px-3 py-1.5 text-[10px] font-bold text-[#915b46]">HTTP 503 · الخدمة غير متاحة</span>
          </div>
          <pre dir="ltr" className="mt-4 overflow-x-auto rounded-xl bg-[#203b32] p-4 text-[11px] leading-6 text-[#e5eee4]"><code>{`POST /api/whatsapp/messages
x-api-key: $THANARAH_API_KEY  (scope: whatsapp:send)
Idempotency-Key: <unique-request-key>
Content-Type: application/json

{"to":"+9665XXXXXXXX","text":"Message content"}`}</code></pre>
          <p className="mt-3 text-xs leading-6 text-[#68786d]">
            عند توفر الخدمة، يلزم وجود موافقة مسبقة من المستلم واحترام حدود الإرسال. الطلبات الآن غير متاحة وتُرجع HTTP 503؛ لا يُنفذ هذا المثال من الصفحة.
          </p>
        </section>
      </div>
    </main>
  );
}
