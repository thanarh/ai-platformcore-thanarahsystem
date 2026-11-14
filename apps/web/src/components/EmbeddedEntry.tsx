'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { AccountDetailsForm, type AccountDetails } from '@/components/auth/AccountDetailsForm';
import { canonicalPhone, PhoneNumberField, type PhoneValue } from '@/components/auth/PhoneNumberField';
import api from '@/lib/api';

type Stage = 'loading' | 'waiting' | 'phone' | 'code' | 'details' | 'error';
function message(error: any) {
  const value = error?.response?.data?.message || error?.message;
  return Array.isArray(value) ? value.join('، ') : value || 'تعذر الاتصال. حاول مجددًا.';
}
function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/\D/g, '').slice(0, 6);
}

export default function EmbeddedEntry({ integrationId, origin }: { integrationId: string; origin: string }) {
  const setAuth = useAuthStore((state) => state.setAuth);
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState('');
  const [onboardingToken, setOnboardingToken] = useState('');
  const [phoneProof, setPhoneProof] = useState('');
  const [phone, setPhone] = useState<PhoneValue>({ country: 'SA', nationalNumber: '' });
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [code, setCode] = useState('');
  const [purpose, setPurpose] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const id = integrationId.toLowerCase();

  useEffect(() => {
    let active = true;
    let exchanging = false;
    const absoluteOrigin = (() => { try { return new URL(origin).origin; } catch { return ''; } })();
    if (!absoluteOrigin || absoluteOrigin !== origin) {
      setError('رابط التضمين غير صالح. افتحه من النظام الذي أرسله لك.');
      setStage('error'); return;
    }
    void fetch(`/api/embedded/${id}/config?origin=${encodeURIComponent(origin)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('الموقع المضيف غير مصرح له.');
        const config = await response.json();
        if (config.id?.toLowerCase() !== id || !config.allowedOrigins?.includes(origin)) {
          throw new Error('الموقع المضيف غير مصرح له.');
        }
      })
      .then(() => {
        if (!active) return;
        setStage('waiting');
        window.parent.postMessage({ type: 'thanarah:ready', integrationId: id }, origin);
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause)); setStage('error');
      });
    const onMessage = async (event: MessageEvent) => {
      if (!active || exchanging || event.source !== window.parent || event.origin !== origin) return;
      const data = event.data;
      if (data?.type !== 'thanarah:bootstrap' || data.integrationId?.toLowerCase() !== id
        || typeof data.code !== 'string' || typeof data.nonce !== 'string') return;
      exchanging = true;
      setError(''); setStage('loading');
      try {
        const { data: result } = await api.post(`/embedded/${id}/exchange`, { code: data.code, nonce: data.nonce, origin });
        if (result.next === 'authenticated' && result.user?.isEmbedded
          && result.user.embeddedIntegrationId?.toLowerCase() === id) {
          window.removeEventListener('message', onMessage);
          setAuth(result.user, result.accessToken, result.refreshToken);
          return;
        }
        if (result.next !== 'verify_phone' || typeof result.onboardingToken !== 'string') {
          throw new Error('تعذر إنشاء جلسة مضمّنة آمنة.');
        }
        window.removeEventListener('message', onMessage);
        setOnboardingToken(result.onboardingToken);
        setStage('phone');
      } catch (cause) {
        exchanging = false;
        setError(message(cause)); setStage('error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => { active = false; window.removeEventListener('message', onMessage); };
  }, [id, origin, setAuth]);

  const requestCode = async () => {
    setBusy(true); setError('');
    try {
      const normalized = canonicalPhone(phone);
      const { data } = await api.post(`/embedded/${id}/phone/request-code`, {
        phone: normalized, country: phone.country, purpose,
      }, { headers: { Authorization: `Bearer ${onboardingToken}` } });
      setVerifiedPhone(normalized); setCode(''); setStage('code');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const verifyCode = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/embedded/${id}/phone/verify-code`, {
        phone: verifiedPhone, country: phone.country, purpose, code,
      }, { headers: { Authorization: `Bearer ${onboardingToken}` } });
      if (data.next === 'authenticated' && data.user?.isEmbedded
        && data.user.embeddedIntegrationId?.toLowerCase() === id) {
        setAuth(data.user, data.accessToken, data.refreshToken); return;
      }
      if (data.next !== 'complete_registration' || typeof data.phoneProof !== 'string') {
        throw new Error('استجابة التحقق غير مكتملة.');
      }
      setPhoneProof(data.phoneProof);
      setStage('details');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const completeRegistration = async (details: AccountDetails) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/embedded/${id}/phone/complete-registration`, {
        ...details, phoneProof,
      }, { headers: { Authorization: `Bearer ${onboardingToken}` } });
      if (!data.user?.isEmbedded || data.user.embeddedIntegrationId?.toLowerCase() !== id) {
        throw new Error('جلسة التضمين غير مطابقة للنظام المضيف.');
      }
      setPhoneProof('');
      setAuth(data.user, data.accessToken, data.refreshToken);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f3] p-4" dir="rtl">
      <section className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="font-arabic text-xl font-semibold text-gray-900">ثنارة AI</h1>
        {stage === 'loading' && <p className="mt-4 text-sm text-gray-600">جارٍ تجهيز جلسة آمنة…</p>}
        {stage === 'waiting' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-7 text-gray-700">بانتظار تهيئة آمنة من النظام المضيف…</p>
          </div>
        )}
        {stage === 'phone' && (
          <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void requestCode(); }}>
            <PhoneNumberField id={`embed-${id}-phone`} value={phone} onChange={setPhone} disabled={busy} />
            <label htmlFor={`embed-${id}-purpose`} className="block text-sm text-gray-700">الغرض</label>
            <select id={`embed-${id}-purpose`} value={purpose} onChange={(event) => setPurpose(event.target.value as 'login' | 'register')}
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm">
              <option value="login">الدخول إلى حسابي</option><option value="register">إنشاء حساب جديد</option>
            </select>
            <button disabled={busy} className="w-full rounded-xl bg-thanarah-700 py-3 text-sm text-white disabled:opacity-50">
              {busy ? 'جارٍ الإرسال…' : 'إرسال رمز WhatsApp'}
            </button>
          </form>
        )}
        {stage === 'code' && (
          <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
            <p className="text-sm leading-6">أدخل الرمز المرسل إلى <bdi>{verifiedPhone}</bdi></p>
            <label htmlFor={`embed-${id}-code`} className="block text-sm">رمز التحقق</label>
            <input id={`embed-${id}-code`} autoComplete="one-time-code" inputMode="numeric" required pattern="[0-9]{6}"
              maxLength={6} value={code} onChange={(event) => setCode(normalizeDigits(event.target.value))}
              className="w-full rounded-xl border border-gray-200 p-3 text-center text-lg tracking-widest" dir="ltr" />
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={() => { setStage('phone'); setCode(''); }} className="flex-1 rounded-xl border p-3 text-sm">تغيير الرقم</button>
              <button disabled={busy} className="flex-1 rounded-xl bg-thanarah-700 p-3 text-sm text-white disabled:opacity-50">{busy ? 'جارٍ التحقق…' : 'تحقق'}</button>
            </div>
          </form>
        )}
        {stage === 'details' && <div className="mt-5"><AccountDetailsForm id={`embed-${id}`} onSubmit={completeRegistration} loading={busy} /></div>}
        {stage === 'error' && (
          <div className="mt-4 space-y-3">
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p>
            <button type="button" onClick={() => {
              setStage('waiting'); setError('');
              window.parent.postMessage({ type: 'thanarah:bootstrap:refresh', integrationId: id }, origin);
            }}
              className="text-sm text-thanarah-700">حاول مجددًا</button>
          </div>
        )}
        {error && stage !== 'error' && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p>}
        {['phone', 'code', 'details'].includes(stage) && <p className="mt-4 text-xs leading-6 text-gray-500">لا يشارك هذا الربط جلسة دخولك أو بيانات مؤسسة أخرى.</p>}
      </section>
    </main>
  );
}
