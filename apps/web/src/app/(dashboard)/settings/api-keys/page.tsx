'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEmbeddedRouter } from '@/lib/embedded-navigation';
import { AlertCircle, AlertTriangle, Check, Clipboard, KeyRound, Plus, Shield, Trash2 } from 'lucide-react';
import { apiKeysApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type ApiKeyRecord = {
  _id: string;
  name: string;
  environment?: string;
  keyPrefix?: string;
  scopes?: string[];
  usageCount?: number;
  lastUsedAt?: string;
  expiresAt?: string;
  rateLimit?: number;
};

const managerRoles = ['OWNER', 'ADMIN', 'TENANT_OWNER'];
const availableScopes = [
  { value: 'chat', label: 'محادثة AI', detail: 'الوصول إلى واجهة المحادثة' },
  { value: 'whatsapp:send', label: 'إرسال WhatsApp', detail: 'إرسال نصوص ووسائط ومتابعة حالة التسليم' },
  { value: 'whatsapp:consent', label: 'موافقات WhatsApp', detail: 'تسجيل الموافقات وإلغاء الإذن قبل الإرسال' },
];

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
}

export default function ApiKeysPage() {
  const router = useEmbeddedRouter();
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state._hasHydrated);
  const isManager = Boolean(user && managerRoles.includes(user.role));
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    environment: 'live',
    scopes: ['chat'] as string[],
    hourlyRateLimit: '120',
    expiresAt: '',
  });

  useEffect(() => {
    if (hydrated && !isManager) router.replace('/chat');
  }, [hydrated, isManager, router]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const result = await apiKeysApi.list();
      setKeys(Array.isArray(result) ? result : result?.keys || []);
    } catch (error) {
      setListError(errorMessage(error, 'تعذّر تحميل مفاتيح API. تحقق من صلاحيتك ثم أعد المحاولة.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isManager) void loadKeys();
  }, [isManager, loadKeys]);

  const toggleScope = (value: string) => {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(value)
        ? current.scopes.filter((scope) => scope !== value)
        : [...current.scopes, value],
    }));
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    const hourlyRateLimit = Number(form.hourlyRateLimit);
    if (!Number.isInteger(hourlyRateLimit) || hourlyRateLimit < 1 || hourlyRateLimit > 1000) {
      setActionError('حد الطلبات في الساعة يجب أن يكون عددًا صحيحًا من 1 إلى 1000.');
      return;
    }
    if (!form.scopes.length) {
      setActionError('اختر نطاقًا واحدًا على الأقل للمفتاح.');
      return;
    }
    const expiresAt = form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      setActionError('تاريخ انتهاء الصلاحية يجب أن يكون في المستقبل.');
      return;
    }
    setCreating(true);
    try {
      const result = await apiKeysApi.create({
        name: form.name.trim(),
        environment: form.environment,
        scopes: form.scopes,
        rateLimit: hourlyRateLimit,
        ...(expiresAt ? { expiresAt } : {}),
      });
      if (!result?.key) throw new Error('تم إنشاء المفتاح لكن لم يصل المفتاح السري من الخادم. تواصل مع المسؤول قبل المتابعة.');
      setNewKey(result.key);
      setCopied(false);
      setForm({ name: '', environment: 'live', scopes: ['chat'], hourlyRateLimit: '120', expiresAt: '' });
      setShowCreate(false);
      await loadKeys();
    } catch (error) {
      setActionError(errorMessage(error, 'تعذّر إنشاء المفتاح. لم تُحفظ البيانات؛ راجع الصلاحيات وحاول مجددًا.'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: ApiKeyRecord) => {
    if (!window.confirm(`إلغاء مفتاح «${key.name}»؟ ستتوقف الطلبات التي تستخدمه فورًا.`)) return;
    setActionError('');
    setRevoking(key._id);
    try {
      await apiKeysApi.revoke(key._id);
      await loadKeys();
    } catch (error) {
      setActionError(errorMessage(error, 'تعذّر إلغاء المفتاح. لم تتغير حالته.'));
    } finally {
      setRevoking(null);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
    } catch (error) {
      setActionError(errorMessage(error, 'تعذّر النسخ. انسخ المفتاح يدويًا قبل إغلاق هذه الرسالة.'));
    }
  };

  if (!hydrated || (hydrated && !isManager)) {
    return <div className="flex min-h-[50vh] items-center justify-center" dir="rtl"><div className="h-5 w-5 animate-pulse rounded-full bg-[#6e987b]" /></div>;
  }

  return (
    <main className="min-h-[100dvh] flex-1 overflow-auto bg-[#f3f6f3] px-4 py-7 text-[#24332f] sm:px-7 lg:px-10" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-[24px] bg-[#173d35] p-6 text-[#f7f4e9] sm:flex-row sm:items-end sm:p-8">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#b5d6b8]"><KeyRound className="h-4 w-4" /> إدارة وصول المؤسسة</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">مفاتيح API</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-[#d5e3d9]">أنشئ مفاتيح محدودة الصلاحية للتكاملات. يظهر السر مرة واحدة فقط؛ خزّنه في خادمك وليس في المتصفح.</p>
          </div>
          <button onClick={() => { setActionError(''); setShowCreate((visible) => !visible); }} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#d1e1c5] px-4 text-sm font-bold text-[#204936] transition hover:bg-[#e1ebd9]">
            <Plus className="h-4 w-4" /> إنشاء مفتاح
          </button>
        </header>

        {actionError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#e5c7bd] bg-[#fff7f3] p-3 text-sm text-[#8b3f2e]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{actionError}</span><button onClick={() => setActionError('')} className="mr-auto text-xs underline">إغلاق</button></div>}

        {newKey && (
          <section className="rounded-2xl border border-[#dfca8a] bg-[#fff8df] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#98772a]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-[#69521d]">انسخ المفتاح الآن — لن يظهر مرة أخرى</h2>
                <p className="mt-1 text-xs leading-5 text-[#83703e]">لا ترسله في البريد أو واجهة العميل. خزّنه كسر في بيئة خادمك.</p>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#eadcae] bg-[#fffdf4] p-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-[#42391f]" dir="ltr">{newKey}</code>
                  <button onClick={() => void copyKey()} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#eee4bf] px-2.5 py-2 text-xs font-semibold text-[#63501e]"><Clipboard className="h-3.5 w-3.5" />{copied ? 'تم النسخ' : 'نسخ'}</button>
                </div>
                <button onClick={() => setNewKey(null)} className="mt-3 text-xs font-semibold text-[#806421] underline">تم حفظ المفتاح بأمان</button>
              </div>
            </div>
          </section>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="rounded-[22px] border border-[#dce5de] bg-[#fbfcf8] p-5 shadow-[0_10px_30px_rgba(29,66,51,.04)] sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e5efe3] text-[#39775b]"><Shield className="h-4 w-4" /></div>
              <div><h2 className="text-base font-bold">مفتاح بتفويض محدد</h2><p className="mt-1 text-xs text-[#78867d]">اختر أقل الصلاحيات اللازمة ومدة وصول مناسبة.</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[#53675d]">اسم المفتاح
                <input required maxLength={80} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="مثال: نظام المواعيد" className="mt-1.5 h-11 w-full rounded-xl border border-[#dce5de] bg-white px-3 text-sm outline-none focus:border-[#6f9b7f]" />
              </label>
              <label className="text-xs font-semibold text-[#53675d]">البيئة
                <select value={form.environment} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-[#dce5de] bg-white px-3 text-sm outline-none focus:border-[#6f9b7f]">
                  <option value="live">إنتاج (live)</option><option value="test">اختبار (test)</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-[#53675d]">الحد الأقصى للطلبات في الساعة
                <input type="number" required min={1} max={1000} step={1} value={form.hourlyRateLimit} onChange={(event) => setForm((current) => ({ ...current, hourlyRateLimit: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-[#dce5de] bg-white px-3 font-mono text-sm outline-none focus:border-[#6f9b7f]" dir="ltr" />
              </label>
              <label className="text-xs font-semibold text-[#53675d]">تاريخ الانتهاء <span className="font-normal text-[#89958d]">(اختياري)</span>
                <input type="date" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-[#dce5de] bg-white px-3 text-sm outline-none focus:border-[#6f9b7f]" />
              </label>
            </div>
            <fieldset className="mt-5">
              <legend className="mb-2 text-xs font-bold text-[#53675d]">النطاقات المسموحة</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {availableScopes.map((scope) => (
                  <label key={scope.value} className={cn('flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition', form.scopes.includes(scope.value) ? 'border-[#aac7ae] bg-[#edf5eb]' : 'border-[#e1e8e0] bg-white hover:bg-[#f7f9f5]')}>
                    <input type="checkbox" checked={form.scopes.includes(scope.value)} onChange={() => toggleScope(scope.value)} className="mt-0.5 accent-[#39775b]" />
                    <span><span className="block text-xs font-bold">{scope.label}</span><span className="mt-1 block font-mono text-[10px] text-[#718176]" dir="ltr">{scope.value}</span><span className="mt-1 block text-[10px] text-[#87938a]">{scope.detail}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button disabled={creating} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#246c50] text-sm font-bold text-white transition hover:bg-[#195d43] disabled:opacity-60">{creating ? 'جارٍ الإنشاء…' : <><Check className="h-4 w-4" />إنشاء المفتاح</>}</button>
              <button type="button" disabled={creating} onClick={() => setShowCreate(false)} className="h-11 rounded-xl border border-[#dce5de] px-5 text-sm font-semibold text-[#617268] hover:bg-[#f0f4ed]">إلغاء</button>
            </div>
          </form>
        )}

        <section className="overflow-hidden rounded-[22px] border border-[#dce5de] bg-[#fbfcf8]">
          <div className="flex items-center justify-between border-b border-[#e6ece5] px-5 py-4">
            <div><h2 className="text-sm font-bold">المفاتيح النشطة</h2><p className="mt-1 text-[10px] text-[#839087]">تُعرض بيانات الاستخدام فقط؛ لا يمكن استرجاع الأسرار السابقة.</p></div>
            <span className="rounded-full bg-[#edf3e9] px-2.5 py-1 text-[10px] font-bold text-[#54705d]">{keys.length} مفتاح</span>
          </div>
          {loading ? (
            <div className="space-y-3 p-5" aria-label="جارٍ تحميل المفاتيح">{[1, 2, 3].map((row) => <div key={row} className="h-16 animate-pulse rounded-xl bg-[#edf1eb]" />)}</div>
          ) : listError ? (
            <div className="p-6 text-sm text-[#8b3f2e]"><p>{listError}</p><button onClick={() => void loadKeys()} className="mt-3 text-xs font-bold underline">إعادة المحاولة</button></div>
          ) : keys.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#edf3e9]"><KeyRound className="h-5 w-5 text-[#65816b]" /></div>
              <p className="mt-3 text-sm font-bold">لا توجد مفاتيح بعد</p>
              <p className="mt-1 text-xs text-[#849087]">أنشئ مفتاحًا مخصصًا للتكامل الأول.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#edf1eb]">
              {keys.map((key) => (
                <article key={key._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf3e9] text-[#64816b]"><KeyRound className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold">{key.name}</h3>
                      <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold', key.environment === 'live' ? 'bg-[#e6f2e5] text-[#36704c]' : 'bg-[#edf0ec] text-[#67766c]')}>{key.environment || 'live'}</span>
                      {key.expiresAt && <span className="text-[10px] text-[#78867d]">ينتهي {formatDate(key.expiresAt)}</span>}
                    </div>
                    <code className="mt-1 block font-mono text-[11px] text-[#718176]" dir="ltr">{key.keyPrefix || 'prefix غير متاح'}••••••••</code>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#87938a]">
                      <span>حد {key.rateLimit ?? '—'} طلب/ساعة</span>
                      <span>استخدام {key.usageCount ?? 0} مرة</span>
                      {key.lastUsedAt && <span>آخر استخدام {formatDate(key.lastUsedAt)}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{(key.scopes || []).map((scope) => <span key={scope} className="rounded-md bg-[#f0f4ed] px-1.5 py-1 font-mono text-[9px] text-[#62776a]" dir="ltr">{scope}</span>)}</div>
                  </div>
                  <button disabled={revoking === key._id} onClick={() => void handleRevoke(key)} aria-label={`إلغاء ${key.name}`} className="inline-flex h-9 items-center justify-center gap-2 self-end rounded-lg border border-[#ead3cc] px-3 text-xs font-semibold text-[#9a4e3c] transition hover:bg-[#fff3ef] disabled:opacity-50 sm:self-center">
                    <Trash2 className="h-3.5 w-3.5" />{revoking === key._id ? 'جارٍ الإلغاء…' : 'إلغاء المفتاح'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[22px] border border-[#d9e2dc] bg-[#eef3ed] p-5 sm:p-6">
          <h2 className="text-sm font-bold">نطاق WhatsApp قيد التجهيز</h2>
          <p className="mt-1 text-xs leading-6 text-[#68786d]">النطاق محفوظ للعقد المستقبلي فقط؛ الإرسال غير متاح ويرجع HTTP 503 حتى اعتماد موصل Baileys. لا ترسل طلبات حقيقية الآن.</p>
          <pre dir="ltr" className="mt-3 overflow-x-auto rounded-xl bg-[#203b32] p-4 text-[11px] leading-6 text-[#e5eee4]"><code>{`POST /api/whatsapp/messages
x-api-key: $THANARAH_API_KEY
Idempotency-Key: appointment-8421-reminder
Content-Type: application/json

{"to":"+9665XXXXXXXX","type":"text","text":"موعدكم غدًا الساعة 10:00"}

Current response: HTTP 503 WHATSAPP_TRANSPORT_BLOCKED`}</code></pre>
        </section>
        <p className="flex items-start gap-2 px-1 text-[10px] leading-5 text-[#87938a]"><Shield className="mt-0.5 h-3 w-3 shrink-0" />واجهة الإدارة لا تغني عن صلاحيات الخادم؛ يجب أن يفرض الخادم دور المدير على إنشاء المفاتيح وإلغائها.</p>
      </div>
    </main>
  );
}
