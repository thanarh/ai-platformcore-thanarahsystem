'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThanarahLogoFull, ThanarahIcon } from '@/components/ThanarahLogo';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <ThanarahLogoFull size="lg" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1 font-arabic" dir="rtl">
              تسجيل الدخول
            </h1>
            <p className="text-sm text-gray-500" dir="rtl">
              مرحباً بك في ثنارة AI
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-500 focus:border-transparent transition text-left"
                placeholder="example@domain.com"
                dir="ltr"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">
                كلمة المرور
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-500 focus:border-transparent transition"
                placeholder="••••••••"
                dir="ltr"
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 text-center font-arabic">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-thanarah-700 hover:bg-thanarah-600 text-white font-medium py-3 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed font-arabic text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  جارٍ الدخول...
                </span>
              ) : (
                'دخول'
              )}
            </button>
          </form>

          <div className="mt-6 text-center" dir="rtl">
            <p className="text-sm text-gray-500 font-arabic">
              ليس لديك حساب؟{' '}
              <Link href="/register" className="text-thanarah-600 hover:underline font-medium">
                إنشاء حساب
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 font-arabic" dir="rtl">
          © {new Date().getFullYear()} ثنارة AI — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
