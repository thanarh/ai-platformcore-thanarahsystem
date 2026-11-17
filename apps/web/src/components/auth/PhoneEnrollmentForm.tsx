'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import { getSafePostLoginPath } from '@/lib/auth-navigation';
import { canonicalPhone, PhoneNumberField, type PhoneValue } from './PhoneNumberField';
import { AccountDetailsForm, type AccountDetails } from './AccountDetailsForm';

function errorText(error: any) {
  const message = error?.response?.data?.message || error?.message;
  return Array.isArray(message) ? message.join('، ') : message || 'تعذّر الاتصال بالخادم. حاول مجددًا.';
}

export function PhoneEnrollmentForm({ purpose }: { purpose: 'register' | 'login' }) {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const id = useId();
  const [step, setStep] = useState<'phone' | 'code' | 'details'>('phone');
  const [phone, setPhone] = useState<PhoneValue>({ country: 'SA', nationalNumber: '' });
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [code, setCode] = useState('');
  const [enrollmentToken, setEnrollmentToken] = useState('');
  const [proofExpiresAt, setProofExpiresAt] = useState(0);
  const [codeExpiresAt, setCodeExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step === 'phone') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);
  const expiredProof = step === 'details' && now >= proofExpiresAt;
  const expiredCode = step === 'code' && now >= codeExpiresAt;
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const authenticate = (data: any) => {
    if (!data.user || !data.accessToken || !data.refreshToken) throw new Error('استجابة الدخول غير مكتملة.');
    setAuth(data.user, data.accessToken, data.refreshToken);
    router.replace(getSafePostLoginPath(window.location.search));
  };
  const resetPhone = () => {
    setStep('phone'); setCode(''); setEnrollmentToken(''); setVerifiedPhone('');
    setError(''); setProofExpiresAt(0);
  };
  const requestCode = async () => {
    setBusy(true); setError('');
    try {
      const normalized = canonicalPhone(phone);
      const data = await authApi.requestPhoneCode({ phone: normalized, country: phone.country, purpose });
      const sentAt = Date.now();
      setNow(sentAt); setVerifiedPhone(normalized);
      setCodeExpiresAt(sentAt + data.expiresInSeconds * 1000);
      setResendAt(sentAt + (data.retryAfterSeconds || 60) * 1000);
      setCode(''); setStep('code');
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setBusy(false); }
  };
  const verifyCode = async () => {
    setBusy(true); setError('');
    try {
      const data = await authApi.verifyPhoneCode({
        phone: verifiedPhone, country: phone.country, code, purpose,
      });
      if (data.next === 'authenticated') {
        authenticate(data);
      } else if (data.next === 'complete_registration' && data.enrollmentToken) {
        const verifiedAt = Date.now();
        setNow(verifiedAt); setEnrollmentToken(data.enrollmentToken);
        setProofExpiresAt(verifiedAt + data.expiresInSeconds * 1000);
        setCode(''); setStep('details');
      } else throw new Error('استجابة التحقق غير مكتملة.');
    } catch (verifyError) { setError(errorText(verifyError)); }
    finally { setBusy(false); }
  };
  const completeRegistration = async (details: AccountDetails) => {
    if (expiredProof) return;
    setBusy(true); setError('');
    try {
      authenticate(await authApi.completePhoneRegistration({ enrollmentToken, ...details }));
    } catch (registrationError: any) {
      setError(errorText(registrationError));
      if (registrationError?.response?.status === 401) setProofExpiresAt(0);
    } finally { setBusy(false); }
  };
  const submitClass = 'w-full rounded-xl bg-thanarah-700 py-3 text-sm font-medium text-white transition hover:bg-thanarah-600 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-4 font-arabic" dir="rtl">
      <ol aria-label="خطوات التحقق والتسجيل" className="flex items-center gap-2 text-[11px] text-gray-500">
        {['الجوال', 'التحقق', 'بيانات الحساب'].map((label, index) => (
          <li key={label} aria-current={['phone', 'code', 'details'][index] === step ? 'step' : undefined}
            className={`flex-1 rounded-lg px-2 py-2 text-center ${['phone', 'code', 'details'][index] === step ? 'bg-thanarah-50 font-semibold text-thanarah-800' : 'bg-gray-50'}`}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {step === 'phone' && (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void requestCode(); }}>
          <PhoneNumberField id={`${id}-phone`} value={phone} onChange={setPhone} disabled={busy} />
          <p className="text-xs leading-6 text-gray-500">
            سيصلك رمز عبر WhatsApp سواء كان لديك حساب أو كنت تسجل لأول مرة. الجوال هو هويتك الأساسية.
          </p>
          <button type="submit" className={submitClass} disabled={busy} aria-busy={busy}>
            {busy ? 'جارٍ إرسال الرمز…' : 'إرسال رمز WhatsApp'}
          </button>
        </form>
      )}
      {step === 'code' && (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
          <p className="text-sm leading-6 text-gray-600">أدخل الرمز المرسل عبر WhatsApp إلى <bdi className="font-medium">{verifiedPhone}</bdi></p>
          <div>
            <label htmlFor={`${id}-code`} className="mb-2 block text-sm text-gray-700">رمز التحقق</label>
            <input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" autoFocus
              pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code}
              onChange={(event) => setCode(event.target.value
                .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
                .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
                .replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-xl tracking-[.35em] outline-none focus:ring-2 focus:ring-thanarah-500" dir="ltr" />
          </div>
          {expiredCode && <p role="status" className="text-xs text-amber-700">انتهت صلاحية الرمز. أعد إرساله للمتابعة.</p>}
          <button type="submit" disabled={busy || expiredCode} aria-busy={busy} className={submitClass}>
            {busy ? 'جارٍ التحقق…' : 'تأكيد الرمز والمتابعة'}
          </button>
          <div className="flex items-center justify-between gap-2 text-xs text-thanarah-700">
            <button type="button" disabled={busy || resendSeconds > 0} className="disabled:text-gray-400"
              onClick={() => void requestCode()}>
              {resendSeconds > 0 ? `إعادة الإرسال بعد ${resendSeconds} ث` : 'إعادة إرسال الرمز'}
            </button>
            <button type="button" disabled={busy} onClick={resetPhone}>تغيير رقم الجوال</button>
          </div>
        </form>
      )}
      {step === 'details' && (
        <>
          <p role="status" className="rounded-xl bg-thanarah-50 p-3 text-xs leading-6 text-thanarah-800">
            تم التحقق من <bdi>{verifiedPhone}</bdi>. أكمل بياناتك لإنشاء حسابك ومؤسستك.
          </p>
          {expiredProof ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-700">انتهت مهلة إنشاء الحساب. تحقق من جوالك مجددًا.</p>
              <button type="button" onClick={resetPhone} className={submitClass}>العودة للتحقق من الجوال</button>
            </div>
          ) : <AccountDetailsForm id={id} onSubmit={completeRegistration} loading={busy} />}
          {!expiredProof && <button type="button" disabled={busy} onClick={resetPhone} className="text-xs text-thanarah-700">استخدام رقم جوال آخر</button>}
        </>
      )}
      {error && <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</div>}
    </div>
  );
}
