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
    phone: '',
    code: '',
    codeSent: false,
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

    if (form.email || form.password || form.confirmPassword) {
      if (!form.email || !form.password || !form.confirmPassword) {
        setError('أدخل البريد وكلمة المرور وتأكيدها معًا، أو اتركها فارغة.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError('كلمتا المرور غير متطابقتين');
        return;
      }
      if (form.password.length < 8) {
        setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
        return;
      }
    }

    setLoading(true);
    try {
      if (!form.codeSent) {
        await authApi.requestPhoneCode({ phone: form.phone, purpose: 'register' });
        setForm((current) => ({ ...current, codeSent: true }));
      } else {
        const data = await authApi.verifyPhoneCode({
          phone: form.phone,
          code: form.code,
          purpose: 'register',
          firstName: form.firstName,
          lastName: form.lastName,
          industry: form.industry,
          email: form.email || undefined,
          password: form.password || undefined,
        });
        setAuth(data.user, data.accessToken, data.refreshToken);
        router.push('/chat');
      }
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
        <label htmlFor="thanarah-register-phone" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          رقم الجوال
        </label>
        <input
          id="thanarah-register-phone"
          type="tel"
          disabled={form.codeSent}
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
          className={`${inputClass} text-left`}
          placeholder="+9665XXXXXXXX"
          dir="ltr"
          required
        />
        {form.codeSent && (
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, codeSent: false, code: '' }))}
            className="mt-2 text-xs font-medium text-thanarah-700 font-arabic"
          >
            تغيير رقم الجوال
          </button>
        )}
      </div>

      {form.codeSent && (
        <div>
          <label htmlFor="thanarah-register-code" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
            رمز التحقق من WhatsApp
          </label>
          <input
            id="thanarah-register-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '').slice(0, 6) })}
            className={`${inputClass} text-center tracking-[.35em]`}
            placeholder="••••••"
            required
            minLength={6}
            maxLength={6}
          />
        </div>
      )}

      <div>
        <label htmlFor="thanarah-register-email" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          البريد الإلكتروني <span className="text-gray-400">(اختياري)</span>
        </label>
        <input
          id="thanarah-register-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          className={`${inputClass} text-left`}
          dir="ltr"
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
          كلمة المرور <span className="text-gray-400">(اختيارية)</span>
        </label>
        <input
          id="thanarah-register-password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          className={inputClass}
          dir="ltr"
          minLength={8}
        />
      </div>

      <div>
        <label htmlFor="thanarah-register-confirm-password" className="mb-1 block text-sm font-medium text-gray-700 font-arabic">
          تأكيد كلمة المرور <span className="text-gray-400">(اختياري)</span>
        </label>
        <input
          id="thanarah-register-confirm-password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
          className={inputClass}
          dir="ltr"
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
        {loading ? 'جارٍ المعالجة...' : form.codeSent ? 'تأكيد الرمز وإنشاء الحساب' : 'إرسال رمز WhatsApp'}
      </button>
    </form>
  );
}