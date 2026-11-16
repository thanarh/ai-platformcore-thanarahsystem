'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEmbeddedRouter } from '@/lib/embedded-navigation';
import { AlertCircle, CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import WhatsappAutomationSettings from '@/components/whatsapp/WhatsappAutomationSettings';

type Readiness = {
  available: boolean;
  integration: string;
  state: string;
  reason?: string;
  phoneNumber?: string | null;
  qrDataUrl?: string | null;
  qrExpiresAt?: string | null;
  lastConnectedAt?: string | null;
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
  const router = useEmbeddedRouter();
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state._hasHydrated);
  const allowed = Boolean(user && managerRoles.includes(user.role));
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [platformReadiness, setPlatformReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (hydrated && !allowed) router.replace('/chat');
  }, [allowed, hydrated, router]);

  const loadReadiness = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await api.get<Readiness>('/whatsapp/readiness');
      if (!readinessFrom(response.data)) {
        throw new Error('استجابة الجاهزية من الخادم غير مكتملة.');
      }
      setReadiness(response.data);
      if (user?.role === 'OWNER' || user?.role === 'ADMIN') {
        const platformResponse = await api.get<Readiness>('/admin/whatsapp/platform/status');
        if (readinessFrom(platformResponse.data)) setPlatformReadiness(platformResponse.data);
      }
    } catch (requestError: any) {
      const responseBody = requestError?.response?.data;
      if (readinessFrom(responseBody)) {
        setReadiness(responseBody);
      } else {
        setError(errorMessage(requestError));
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (allowed) void loadReadiness(true);
  }, [allowed, loadReadiness]);

  useEffect(() => {
    if (!allowed) return;
    const shouldPoll = [readiness?.state, platformReadiness?.state]
      .some((state) => ['connecting', 'qr_pending', 'reconnecting'].includes(state || ''));
    if (!shouldPoll) return;
    const timer = window.setInterval(() => void loadReadiness(false), 2500);
    return () => window.clearInterval(timer);
  }, [allowed, loadReadiness, platformReadiness?.state, readiness?.state]);

  const runConnectionAction = async (kind: 'tenant' | 'platform', action: 'connect' | 'disconnect') => {
    if (action === 'disconnect' && !window.confirm(
      kind === 'platform'
        ? 'سيُفصل رقم المنصة وتتوقف رموز WhatsApp حتى ربطه مجددًا. هل تريد المتابعة؟'
        : 'سيُحذف ربط الرقم وتُلغى الرسائل المنتظرة. هل تريد المتابعة؟',
    )) return;
    const key = `${kind}:${action}`;
    setBusy(key);
    setError('');
    try {
      const path = kind === 'platform'
        ? `/admin/whatsapp/platform/${action}`
        : `/whatsapp/${action}`;
      await api.post(path);
      await loadReadiness(false);
    } catch (requestError: any) {
      setError(errorMessage(requestError));
    } finally {
      setBusy('');
    }
  };

  if (!hydrated || !allowed) {
    return <div className="flex min-h-[50vh] items-center justify-center" dir="rtl"><div className="h-5 w-5 animate-pulse rounded-full bg-[#6e987b]" /></div>;
  }

  const blocked = readiness?.available === false || readiness?.state === 'blocked';
  const hasReadiness = Boolean(readiness);
  const statusLabel = (value?: Readiness | null) => {
    if (value?.available) return 'متصل';
    if (value?.state === 'qr_pending') return 'امسح رمز QR';
    if (value?.state === 'qr_expired') return 'انتهت صلاحية QR';
    if (value?.state === 'connecting') return 'جارٍ الاتصال';
    if (value?.state === 'reconnecting') return 'جارٍ إعادة الاتصال';
    if (value?.state === 'reconnect_failed') return 'تعذر الاتصال؛ أعد المحاولة';
    if (value?.state === 'needs_qr') return 'يلزم ربط QR مجددًا';
    if (value?.state === 'qr_error' || value?.state === 'storage_error') return 'تعذر إكمال الربط';
    return 'غير متصل';
  };

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
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ربط WhatsApp عبر QR</h1>
              <p className="mt-2 max-w-xl text-sm leading-7 text-[#d5e3d9]">
                اربط رقم المؤسسة بجلسة Baileys محفوظة ومشفّرة، وأرسل الرسائل عبر API. يمكن الرد على الرسائل النصية الواردة عند وجود موافقة نشطة.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs">
              <span className={cn('h-2 w-2 rounded-full', blocked ? 'bg-[#d6b779]' : 'bg-[#a8d6a3]')} />
              {loading ? 'جارٍ قراءة الحالة' : statusLabel(readiness)}
            </div>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#e5c7bd] bg-[#fff7f3] px-4 py-3 text-sm text-[#8b3f2e]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
                <button onClick={() => void loadReadiness(true)} className="mt-2 inline-flex items-center gap-2 font-semibold">
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
                <h2 className="mt-2 text-lg font-bold">رقم المؤسسة</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[#65756b]">
                  هذا الرقم هو المرسل لرسائل API التابعة لمؤسستك. بيانات الجلسة محفوظة مشفّرة على الخادم.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e8d9aa] bg-[#fff8df] px-3 py-1.5 text-xs font-semibold text-[#806b31]">
                <LockKeyhole className="h-3.5 w-3.5" /> {statusLabel(readiness)}
              </span>
            </div>

            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_.9fr]">
              <div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void runConnectionAction('tenant', 'connect')}
                    className="rounded-xl bg-[#1c5944] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {busy === 'tenant:connect' ? 'جارٍ بدء الربط…' : readiness.available ? 'تحديث الاتصال' : 'ربط رقم المؤسسة'}
                  </button>
                  {readiness.state !== 'disconnected' && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void runConnectionAction('tenant', 'disconnect')}
                      className="rounded-xl border border-[#d8dfd8] px-4 py-2.5 text-xs font-bold text-[#65756b] disabled:opacity-50"
                    >
                      {busy === 'tenant:disconnect' ? 'جارٍ الفصل…' : 'فصل الرقم'}
                    </button>
                  )}
                </div>
                {readiness.qrDataUrl && (
                  <div className="mt-4 inline-flex flex-col items-center gap-2 rounded-2xl border border-[#dce5de] bg-white p-4">
                    <img src={readiness.qrDataUrl} alt="رمز QR لربط WhatsApp" className="h-56 w-56" />
                    <span className="text-xs text-[#65756b]">WhatsApp ← الأجهزة المرتبطة ← ربط جهاز</span>
                  </div>
                )}
                {readiness.phoneNumber && (
                  <p className="mt-4 text-xs text-[#65756b]" dir="ltr">
                    {readiness.phoneNumber} · آخر اتصال {readiness.lastConnectedAt ? new Date(readiness.lastConnectedAt).toLocaleString('ar') : '—'}
                  </p>
                )}
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
                  <li>كل مؤسسة تربط رقمها الخاص؛ لا تُشارك الجلسات أو سياقات المحادثات بينها.</li>
                  <li>تُشفّر بيانات الجلسة والرسائل المخزنة قبل حفظها.</li>
                  <li>يرد الذكاء الاصطناعي على النصوص فقط، وبعد تسجيل موافقة المستلم؛ «إلغاء» يوقف الردود.</li>
                  <li>لا تشارك رمز QR أو بيانات الجلسة؛ افصل الرقم فورًا إذا لم تعد تملكه.</li>
                </ul>
              </aside>
            </div>
          </section>
        ) : null}

        <WhatsappAutomationSettings scope="tenant" title="رقم المؤسسة" />

        {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
          <>
          <section className="rounded-[22px] border border-[#dce5de] bg-[#fbfcf8] p-5 shadow-[0_10px_30px_rgba(29,66,51,.04)] sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-[11px] font-bold tracking-[.16em] text-[#6d8b79]">إعداد المنصة</p>
                <h2 className="mt-2 text-lg font-bold">رقم Baileys المركزي لرموز التسجيل</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65756b]">
                  هذا الرقم منفصل عن أرقام المؤسسات، ويُستخدم لإرسال رمز تحقق الهاتف عند التسجيل أو الدخول.
                </p>
                {platformReadiness?.phoneNumber && <p className="mt-2 text-xs" dir="ltr">{platformReadiness.phoneNumber}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void runConnectionAction('platform', 'connect')}
                  className="rounded-xl bg-[#1c5944] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy === 'platform:connect' ? 'جارٍ بدء الربط…' : platformReadiness?.available ? 'تحديث الاتصال' : 'ربط رقم المنصة'}
                </button>
                {platformReadiness && platformReadiness.state !== 'disconnected' && (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void runConnectionAction('platform', 'disconnect')}
                    className="rounded-xl border border-[#d8dfd8] px-4 py-2.5 text-xs font-bold text-[#65756b] disabled:opacity-50"
                  >
                    {busy === 'platform:disconnect' ? 'جارٍ الفصل…' : 'فصل رقم المنصة'}
                  </button>
                )}
              </div>
            </div>
            {platformReadiness?.qrDataUrl && (
              <div className="mt-4 inline-flex flex-col items-center gap-2 rounded-2xl border border-[#dce5de] bg-white p-4">
                <img src={platformReadiness.qrDataUrl} alt="رمز QR لرقم المنصة" className="h-56 w-56" />
                <span className="text-xs text-[#65756b]">امسح الرمز من الهاتف المخصص لإرسال OTP</span>
              </div>
            )}
            <p className="mt-3 text-xs text-[#65756b]">الحالة: {statusLabel(platformReadiness)}</p>
          </section>
          <WhatsappAutomationSettings scope="platform" title="رقم ثنارة المركزي" />
          </>
        )}

        <section className="rounded-[22px] border border-[#d9e2dc] bg-[#eef3ed] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-[11px] font-bold tracking-[.16em] text-[#6d8b79]">عقد التكامل المستقبلي</p>
              <h2 className="mt-2 text-lg font-bold">واجهة إرسال المؤسسة</h2>
              <p className="mt-1 max-w-3xl text-xs leading-6 text-[#68786d]">
                الطلب يُقبل في قائمة الإرسال ويعيد معرّفًا لمتابعة حالة التسليم. استخدم مفتاح API بنطاق whatsapp:send.
              </p>
            </div>
          </div>
          <pre dir="ltr" className="mt-4 overflow-x-auto rounded-xl bg-[#203b32] p-4 text-[11px] leading-6 text-[#e5eee4]"><code>{`POST /api/whatsapp/messages
x-api-key: $THANARAH_API_KEY
Idempotency-Key: unique-request-key
Content-Type: application/json

{"to":"+9665XXXXXXXX","type":"text","text":"نص الرسالة","consentReference":"consent-record-184"}`}</code></pre>
          <p className="mt-3 text-xs leading-6 text-[#68786d]">
            سجّل موافقة المستلم أولًا عبر POST /api/whatsapp/consents بمفتاح نطاقه whatsapp:consent؛ بعدها أرسل النص أو الوسائط مع المرجع المطابق.
          </p>
        </section>
      </div>
    </main>
  );
}
