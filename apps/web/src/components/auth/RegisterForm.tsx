'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';

const INDUSTRIES = [
  ['general', 'عام'],
  ['healthcare', 'الطب والرعاية الصحية'],
  ['legal', 'القانون والاستشارات'],
  ['education', 'التعليم والتدريب'],
  ['retail', 'التجارة والمبيعات'],
  ['real_estate', 'العقارات'],
  ['hospitality', 'الضيافة والخدمات'],
  ['technology', 'التقنية والبرمجيات'],
] as const;

export function RegisterForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    industry: 'general',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (form.password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    setLoading(true);
    try {
      const data = await authApi.register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        industry: form.industry,
      });
      setAuth(data.user, data.accessToken, data.refreshToken);
      router.push('/chat');
    } catch (err: any) {
      const serverMessage = err.response?.data?.message;
      const message = Array.isArray(serverMessage) ? serverMessage.join('، ') : serverMessage;
      if (typeof message === 'string' && /email already in use/i.test(message)) {
        setError('هذا البريد الإلكتروني مسجل بالفعل. جرّب تسجيل الدخول.');
      } else if (typeof message === 'string' && /password must be at least/i.test(message)) {
        setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      } else if (typeof message === 'string' && message.trim()) {
        setError(message);
      } else {
        setError('تعذر الاتصال بالخادم. تحقق من اتصالك ثم حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 px-4 py-3 text-base transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thanarah-500 sm:text-sm';

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="thanarah-register-first-name" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
            الاسم الأول
          </label>
          <input
            id="thanarah-register-first-name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="thanarah-register-last-name" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
            اسم العائلة
          </label>
          <input
            id="thanarah-register-last-name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            className={inputClass}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="thanarah-register-email" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          البريد الإلكتروني
        </label>
        <input
          id="thanarah-register-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          className={`${inputClass} text-left`}
          dir="ltr"
          required
        />
      </div>

      <div>
        <label htmlFor="thanarah-register-industry" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          قطاع العمل
        </label>
        <select
          id="thanarah-register-industry"
          value={form.industry}
          onChange={(event) => setForm({ ...form, industry: event.target.value })}
          className={`${inputClass} bg-white font-arabic`}
        >
          {INDUSTRIES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="thanarah-register-password" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          كلمة المرور
        </label>
        <input
          id="thanarah-register-password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          className={inputClass}
          dir="ltr"
          required
          minLength={8}
        />
      </div>

      <div>
        <label htmlFor="thanarah-register-confirm-password" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          تأكيد كلمة المرور
        </label>
        <input
          id="thanarah-register-confirm-password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
          className={inputClass}
          dir="ltr"
          required
        />
      </div>

      <div className="rounded-xl border border-thanarah-100 bg-thanarah-50 px-4 py-3 text-xs leading-6 text-thanarah-800 font-arabic">
        الخطة المجانية تشمل 500 كوين يومياً، تكلفة الرسالة 50 كوين، و50 طلب API يومياً.
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
        className="w-full rounded-xl bg-thanarah-700 py-3 text-sm font-medium text-white transition hover:bg-thanarah-600 disabled:cursor-not-allowed disabled:opacity-60 font-arabic active:scale-[0.98]"
      >
        {loading ? 'جارٍ التسجيل...' : 'إنشاء الحساب'}
      </button>
    </form>
  );
}