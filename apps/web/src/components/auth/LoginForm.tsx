'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import { getSafePostLoginPath } from '@/lib/auth-navigation';
import { PhoneEnrollmentForm } from './PhoneEnrollmentForm';

export function LoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputClass = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-thanarah-500 sm:text-sm';

  return (
    <div className="space-y-4 font-arabic" dir="rtl">
      <div className="flex gap-2 rounded-xl bg-gray-100 p-1 text-xs">
        <button type="button" onClick={() => { setMethod('phone'); setError(''); }}
          aria-pressed={method === 'phone'}
          className={`flex-1 rounded-lg px-3 py-2 ${method === 'phone' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          الدخول برقم الجوال
        </button>
        <button type="button" onClick={() => { setMethod('email'); setError(''); }}
          aria-pressed={method === 'email'}
          className={`flex-1 rounded-lg px-3 py-2 ${method === 'email' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          البريد وكلمة المرور
        </button>
      </div>
      {/* Keep the verified onboarding state when switching to the email fallback. */}
      <div hidden={method !== 'phone'}><PhoneEnrollmentForm purpose="login" /></div>
      {method === 'email' && (
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault(); setLoading(true); setError('');
          try {
            const data = await authApi.login(form.email, form.password);
            setAuth(data.user, data.accessToken, data.refreshToken);
            router.replace(getSafePostLoginPath(window.location.search));
          } catch {
            setError('البريد الإلكتروني أو كلمة المرور غير صحيحة، أو تعذّر الاتصال بالخادم.');
          } finally { setLoading(false); }
        }}>
          <div>
            <label htmlFor="thanarah-login-email" className="mb-1 block text-sm text-gray-700">البريد الإلكتروني</label>
            <input id="thanarah-login-email" type="email" autoComplete="email" dir="ltr" required
              className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div>
            <label htmlFor="thanarah-login-password" className="mb-1 block text-sm text-gray-700">كلمة المرور</label>
            <input id="thanarah-login-password" type="password" autoComplete="current-password" dir="ltr" required minLength={8}
              className={inputClass} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={loading} aria-busy={loading}
            className="w-full rounded-xl bg-thanarah-700 py-3 text-sm font-medium text-white hover:bg-thanarah-600 disabled:opacity-50">
            {loading ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
          </button>
        </form>
      )}
    </div>
  );
}
