'use client';

import { useState } from 'react';

export type AccountDetails = {
  firstName: string; lastName: string; industry: string; email?: string; password?: string;
};
const industries = [
  ['general', 'عام'], ['healthcare', 'الطب والرعاية الصحية'], ['legal', 'القانون والاستشارات'],
  ['education', 'التعليم والتدريب'], ['retail', 'التجارة والمبيعات'], ['real_estate', 'العقارات'],
  ['hospitality', 'الضيافة والخدمات'], ['technology', 'التقنية والبرمجيات'],
];

export function AccountDetailsForm({ onSubmit, loading, id }: {
  onSubmit: (details: AccountDetails) => Promise<void>; loading: boolean; id: string;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', industry: 'general', email: '', password: '', confirmation: '',
  });
  const [error, setError] = useState('');
  const inputClass = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-thanarah-500 sm:text-sm';
  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      setError('');
      if (form.email || form.password || form.confirmation) {
        if (!form.email || !form.password || form.password !== form.confirmation) {
          setError('أدخل البريد وكلمة المرور وتأكيدها معًا، وتأكد من تطابق كلمتي المرور.');
          return;
        }
      }
      await onSubmit({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), industry: form.industry,
        ...(form.email.trim() ? { email: form.email.trim(), password: form.password } : {}),
      });
    }} dir="rtl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-first-name`} className="mb-1 block text-sm text-gray-700">الاسم الأول</label>
          <input id={`${id}-first-name`} autoComplete="given-name" className={inputClass} required maxLength={80}
            value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-last-name`} className="mb-1 block text-sm text-gray-700">اسم العائلة</label>
          <input id={`${id}-last-name`} autoComplete="family-name" className={inputClass} required maxLength={80}
            value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-industry`} className="mb-1 block text-sm text-gray-700">قطاع العمل</label>
        <select id={`${id}-industry`} value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} className={`${inputClass} bg-white`}>
          {industries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <details className="rounded-xl border border-gray-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-600">إضافة بريد وكلمة مرور كبديل دخول (اختياري)</summary>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={`${id}-email`} className="mb-1 block text-sm text-gray-700">البريد الإلكتروني</label>
            <input id={`${id}-email`} type="email" autoComplete="email" dir="ltr" className={inputClass}
              value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div>
            <label htmlFor={`${id}-password`} className="mb-1 block text-sm text-gray-700">كلمة المرور</label>
            <input id={`${id}-password`} type="password" autoComplete="new-password" dir="ltr" minLength={8} maxLength={128} className={inputClass}
              value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </div>
          <div>
            <label htmlFor={`${id}-confirmation`} className="mb-1 block text-sm text-gray-700">تأكيد كلمة المرور</label>
            <input id={`${id}-confirmation`} type="password" autoComplete="new-password" dir="ltr" className={inputClass}
              value={form.confirmation} onChange={(event) => setForm({ ...form, confirmation: event.target.value })} />
          </div>
        </div>
      </details>
      <p className="rounded-xl bg-thanarah-50 p-3 text-xs leading-6 text-thanarah-800">الجوال هو هويتك الأساسية. ستُنشأ لك مؤسسة مستقلة بعد إكمال الحساب.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} aria-busy={loading}
        className="w-full rounded-xl bg-thanarah-700 py-3 text-sm font-medium text-white hover:bg-thanarah-600 disabled:opacity-50">
        {loading ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'}
      </button>
    </form>
  );
}
