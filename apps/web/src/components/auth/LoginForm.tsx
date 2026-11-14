'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';

export function LoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [form, setForm] = useState({ email: '', password: '' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (method === 'phone' && !codeSent) {
        await authApi.requestPhoneCode({ phone, purpose: 'login' });
        setCodeSent(true);
      } else {
        const data = method === 'phone'
          ? await authApi.verifyPhoneCode({ phone, code, purpose: 'login' })
          : await authApi.login(form.email, form.password);
        setAuth(data.user, data.accessToken, data.refreshToken);
        router.push('/chat');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || (method === 'phone' ? 'تعذر إرسال الرمز أو التحقق منه.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
      <div className="flex gap-2 rounded-xl bg-gray-100 p-1 text-xs">
        <button type="button" onClick={() => { setMethod('phone'); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 font-arabic ${method === 'phone' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>الدخول برقم الجوال</button>
        <button type="button" onClick={() => { setMethod('email'); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 font-arabic ${method === 'email' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>البريد وكلمة المرور</button>
      </div>

      {method === 'phone' ? (
        <>
          <div>
            <label htmlFor="thanarah-login-phone" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">رقم الجوال</label>
            <input
              id="thanarah-login-phone"
              type="tel"
              disabled={codeSent}
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-left transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thanarah-500"
              placeholder="+9665XXXXXXXX"
              dir="ltr"
              required
            />
          </div>
          {codeSent && (
            <div>
              <label htmlFor="thanarah-login-code" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">رمز WhatsApp</label>
              <input
                id="thanarah-login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-lg tracking-[.35em] transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thanarah-500"
                placeholder="••••••"
                required
                minLength={6}
                maxLength={6}
              />
              <button type="button" onClick={() => { setCodeSent(false); setCode(''); }} className="mt-2 text-xs font-medium text-thanarah-700 font-arabic">
                تغيير رقم الجوال
              </button>
            </div>
          )}
          <p className="text-xs leading-5 text-gray-500 font-arabic">سيصلك رمز التحقق من رقم WhatsApp الخاص بالمنصة.</p>
        </>
      ) : (
      <>
      <div>
        <label htmlFor="thanarah-login-email" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          البريد الإلكتروني
        </label>
        <input
          id="thanarah-login-email"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-left transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thanarah-500"
          placeholder="example@domain.com"
          dir="ltr"
          required
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="thanarah-login-password" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          كلمة المرور
        </label>
        <input
          id="thanarah-login-password"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thanarah-500"
          placeholder="••••••••"
          dir="ltr"
          required
          minLength={8}
          autoComplete="current-password"
        />
      </div>
      </>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600 font-arabic">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="w-full rounded-xl bg-thanarah-700 py-3 text-sm font-medium text-white transition hover:bg-thanarah-600 disabled:cursor-not-allowed disabled:opacity-60 font-arabic"
      >
        {loading ? 'جارٍ المعالجة...' : method === 'phone' ? codeSent ? 'تأكيد الرمز والدخول' : 'إرسال رمز WhatsApp' : 'دخول'}
      </button>
    </form>
  );
}