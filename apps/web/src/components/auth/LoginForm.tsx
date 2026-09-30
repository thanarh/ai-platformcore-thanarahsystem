'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';

export function LoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authApi.login(form.email, form.password);
      setAuth(data.user, data.accessToken, data.refreshToken);
      router.push('/chat');
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
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
        {loading ? 'جارٍ الدخول...' : 'دخول'}
      </button>
    </form>
  );
}