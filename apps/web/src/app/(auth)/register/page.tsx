'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThanarahLogoFull } from '@/components/ThanarahLogo';
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

export default function RegisterPage() {
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
      setError(err.response?.data?.message || 'حدث خطأ أثناء التسجيل');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-500 focus:border-transparent transition';

  return (
    <div className="app-viewport min-h-[100dvh] bg-[#f5f5f3] flex items-start sm:items-center justify-center px-4 py-6 safe-area-y overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6 sm:mb-8">
          <ThanarahLogoFull size="lg" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-8 animate-message-in">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1 font-arabic" dir="rtl">
              إنشاء حساب جديد
            </h1>
            <p className="text-sm text-gray-500" dir="rtl">ابدأ تجربتك مع ثنارة AI</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">الاسم الأول</label>
                <input autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">اسم العائلة</label>
                <input autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">البريد الإلكتروني</label>
              <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputClass} text-left`} dir="ltr" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">قطاع العمل</label>
              <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={`${inputClass} bg-white font-arabic`}>
                {INDUSTRIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">كلمة المرور</label>
              <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} dir="ltr" required minLength={8} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-arabic">تأكيد كلمة المرور</label>
              <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className={inputClass} dir="ltr" required />
            </div>

            <div className="rounded-xl bg-thanarah-50 border border-thanarah-100 px-4 py-3 text-xs text-thanarah-800 font-arabic leading-6">
              الخطة المجانية تشمل 500 كوين يومياً، تكلفة الرسالة 50 كوين، و50 طلب API يومياً.
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 text-center font-arabic">{error}</div>}

            <button type="submit" disabled={loading} className="w-full bg-thanarah-700 hover:bg-thanarah-600 text-white font-medium py-3 rounded-xl transition disabled:opacity-60 font-arabic text-sm active:scale-[0.98]">
              {loading ? 'جارٍ التسجيل...' : 'إنشاء الحساب'}
            </button>
          </form>

          <div className="mt-6 text-center" dir="rtl">
            <p className="text-sm text-gray-500 font-arabic">
              لديك حساب بالفعل؟{' '}
              <Link href="/login" className="text-thanarah-600 hover:underline font-medium">تسجيل الدخول</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
