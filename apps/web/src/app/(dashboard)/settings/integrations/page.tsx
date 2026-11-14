'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { embeddedIntegrationsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type Integration = {
  _id: string; name: string; type: 'thanarah_embed'; allowedOrigins: string[];
  keyPrefix: string; isActive: boolean; version: number; createdAt: string;
};
function origins(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
}
const input = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-thanarah-500 focus:ring-2 focus:ring-thanarah-100';

export default function EmbeddedIntegrationsPage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<Integration[]>([]);
  const [name, setName] = useState('');
  const [allowedOrigins, setAllowedOrigins] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [iframeSnippet, setIframeSnippet] = useState('');
  const canManage = ['OWNER', 'ADMIN', 'TENANT_OWNER'].includes(user?.role || '') && !user?.isEmbedded;

  const load = useCallback(async () => {
    try { setItems(await embeddedIntegrationsApi.list()); }
    catch { setMessage('تعذّر تحميل عمليات الربط. تأكد أن لديك صلاحية إدارة المؤسسة.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canManage) void load(); else setLoading(false); }, [canManage, load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(''); setRawKey('');
    try {
      const created = await embeddedIntegrationsApi.create({ name, allowedOrigins: origins(allowedOrigins) });
      setItems((current) => [created, ...current]); setRawKey(created.key);
      setIframeSnippet(`<iframe title="Thanarah AI" src="${window.location.origin}/embed/${created._id}?origin=${encodeURIComponent(origins(allowedOrigins)[0] || '')}" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups" referrerpolicy="strict-origin" style="width:100%;height:800px;border:0"></iframe>`);
      setName(''); setAllowedOrigins('');
    } catch (error: any) { setMessage(error.response?.data?.message || 'تعذر إنشاء الربط.'); }
    finally { setBusy(false); }
  };
  const rotate = async (item: Integration) => {
    if (!window.confirm('سيُلغى المفتاح الحالي وتُنهى جلسات هذا الربط. هل تريد المتابعة؟')) return;
    setBusy(true); setMessage('');
    try {
      const updated = await embeddedIntegrationsApi.rotate(item._id);
      setItems((current) => current.map((entry) => entry._id === item._id ? updated : entry));
      setRawKey(updated.key);
    } catch (error: any) { setMessage(error.response?.data?.message || 'تعذر تجديد المفتاح.'); }
    finally { setBusy(false); }
  };
  const revoke = async (item: Integration) => {
    if (!window.confirm('سيُوقف الربط فورًا ويُنهي جلسات المستخدمين داخله. هل تريد الإيقاف؟')) return;
    setBusy(true); setMessage('');
    try {
      await embeddedIntegrationsApi.revoke(item._id);
      setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, isActive: false, version: entry.version + 1 } : entry));
      setMessage('تم إيقاف الربط وإنهاء جلساته.');
    } catch (error: any) { setMessage(error.response?.data?.message || 'تعذر إيقاف الربط.'); }
    finally { setBusy(false); }
  };
  const updateOrigins = async (item: Integration) => {
    const value = window.prompt('أصول المواقع المسموحة، افصل بينها بفاصلة أو سطر جديد:', item.allowedOrigins.join('\n'));
    if (value === null) return;
    setBusy(true); setMessage('');
    try {
      const updated = await embeddedIntegrationsApi.update(item._id, {
        name: item.name, allowedOrigins: origins(value),
      });
      setItems((current) => current.map((entry) => entry._id === item._id ? updated : entry));
      setMessage('تم تعديل المواقع المسموحة وإنهاء الجلسات القديمة.');
    } catch (error: any) { setMessage(error.response?.data?.message || 'تعذر تحديث المواقع.'); }
    finally { setBusy(false); }
  };

  if (!canManage) return <div className="p-6 font-arabic" dir="rtl">لا تملك صلاحية إدارة هذا النوع من الربط.</div>;
  return (
    <div className="app-viewport overflow-y-auto bg-[#f5f5f3] p-4 sm:p-8" dir="rtl">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-xs font-medium text-thanarah-700">تكامل المنتج</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">ربط نظام ثنارة AI</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-600">
            تضمين كامل لصفحات وميزات المؤسسة داخل نظام شريك. صلاحيات إرسال WhatsApp وAPI keys المعتادة منفصلة عن مفتاح تكامل التضمين.
            لكل مستخدم هوية متحقق منها ومؤسسة مستقلة؛ لا يصلح المفتاح الخادمي لتسجيل الدخول.
          </p>
        </header>
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-medium">إنشاء ربط جديد</h2>
          <div>
            <label htmlFor="embedded-integration-name" className="mb-1 block text-sm text-gray-700">اسم الربط</label>
            <input id="embedded-integration-name" className={input} required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="نظام بوابة العملاء" />
          </div>
          <div>
            <label htmlFor="embedded-integration-origins" className="mb-1 block text-sm text-gray-700">أصول المواقع المسموحة (HTTPS)</label>
            <textarea id="embedded-integration-origins" className={`${input} min-h-24`} required value={allowedOrigins}
              onChange={(event) => setAllowedOrigins(event.target.value)} placeholder={'https://portal.example.com\nhttps://app.example.com'} />
            <p className="mt-1 text-xs text-gray-500">اكتب الأصل فقط، دون مسار أو *، بحد 20 نطاقًا.</p>
          </div>
          {message && <p role="status" className="rounded-lg bg-thanarah-50 p-3 text-sm text-thanarah-800">{message}</p>}
          <button disabled={busy} className="rounded-xl bg-thanarah-700 px-5 py-3 text-sm text-white disabled:opacity-50">{busy ? 'جارٍ الحفظ…' : 'إنشاء الربط'}</button>
        </form>

        {rawKey && (
          <section className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-5" aria-label="بيانات المفتاح التي تعرض مرة واحدة">
            <h2 className="font-semibold text-amber-900">احفظ المفتاح الخادمي الآن — لن يظهر مجددًا</h2>
            <p className="text-sm leading-6 text-amber-900">ضعه في مخزن الأسرار الخاص بخادم النظام الشريك فقط، ولا تضعه في المتصفح أو إطار التضمين. يظهر هنا مرة واحدة بعد الإنشاء أو التجديد.</p>
            <code className="block overflow-x-auto rounded-lg border border-amber-200 bg-white p-3 text-xs" dir="ltr">{rawKey}</code>
            <h3 className="text-sm font-medium">مكوّن الإطار — لا يحتوي المفتاح</h3>
            <pre className="overflow-x-auto rounded-lg bg-white p-3 text-[11px]" dir="ltr">{iframeSnippet}</pre>
            <p className="text-xs text-gray-700">يلزم أن يطلب خادم الشريك رمز تهيئة أحادي الاستخدام لكل مستخدم، ثم يرسله إلى الإطار برسالة آمنة إلى أصل ثنارة المحدد في المثال أدناه.</p>
            <button type="button" onClick={() => setRawKey('')} className="text-sm text-amber-900 underline">أخفيته بعد حفظه</button>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-medium">الروابط الحالية</h2>
          {loading && <p className="text-sm text-gray-500">جارٍ التحميل…</p>}
          {!loading && !items.length && <p className="rounded-xl border border-dashed p-5 text-sm text-gray-500">لم تُنشأ روابط بعد.</p>}
          {items.map((item) => (
            <article key={item._id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="font-medium">{item.name}</h3><p className="mt-1 font-mono text-xs text-gray-500">{item.keyPrefix} · {item.type}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-xs ${item.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{item.isActive ? 'نشط' : 'متوقف'}</span>
              </div>
              <ul className="flex flex-wrap gap-2">{item.allowedOrigins.map((origin) => <li key={origin} className="rounded-lg bg-gray-50 px-2 py-1 font-mono text-xs" dir="ltr">{origin}</li>)}</ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !item.isActive} onClick={() => void updateOrigins(item)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">تعديل المواقع</button>
                <button type="button" disabled={busy || !item.isActive} onClick={() => void rotate(item)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">تجديد المفتاح</button>
                <button type="button" disabled={busy || !item.isActive} onClick={() => void revoke(item)} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700 disabled:opacity-50">إيقاف الربط</button>
              </div>
            </article>
          ))}
        </section>

        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-medium">تسليم آمن من خادم إلى خادم</h2>
          <p className="text-sm leading-6 text-gray-600">تحقق من جلسة المستخدم في نظامك الشريك على الخادم. لا تقبل المعرّف من المتصفح، ولا ترسل الهاتف أو البريد بوصفهما إثباتًا.</p>
          <pre className="overflow-x-auto rounded-xl bg-[#17272c] p-4 text-xs leading-6 text-emerald-100" dir="ltr">{`// Server-side only; use your secret store.
const result = await fetch(THANARAH_URL + "/api/embedded/" + INTEGRATION_ID + "/bootstrap", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-thanarah-integration-key": process.env.THANARAH_EMBED_KEY
  },
  body: JSON.stringify({
    externalUserId: verifiedPartnerSession.subject,
    origin: "https://portal.example.com"
  })
}).then(r => { if (!r.ok) throw new Error("Thanarah bootstrap failed"); return r.json(); });

// Return result to the authenticated page as JSON; create the iframe with result.framePath.
// Once it loads, transfer only the one-use code to the exact Thanarah origin:
iframe.contentWindow.postMessage({
  type: "thanarah:bootstrap", integrationId: INTEGRATION_ID,
  code: result.code, nonce: result.nonce
}, new URL(iframe.src).origin);
// Never put result.code, the server key or access tokens in the iframe URL,
// logs, browser storage, or messages to any other origin.`}</pre>
          <p className="text-xs leading-6 text-gray-500">The iframe opens the phone-first verification flow only when this external identity has no prior Thanarah link. Phone codes come from the platform Baileys sender; each user’s WhatsApp connection and API keys stay with their verified tenant.</p>
        </section>
      </div>
    </div>
  );
}
