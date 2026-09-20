'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Check, RotateCcw, Save, Sparkles } from 'lucide-react';
import { contextProfilesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const FOCUS_AREAS = [
  { value: 'appointments', label: 'المواعيد' },
  { value: 'patients', label: 'العملاء والمرضى' },
  { value: 'insurance', label: 'التأمين' },
  { value: 'billing', label: 'الفواتير' },
  { value: 'operations', label: 'العمليات' },
  { value: 'marketing', label: 'التسويق' },
];

const EMPTY_FORM = {
  industry: '',
  specialization: '',
  responseStyle: 'concise',
  language: 'ar',
  focusAreas: [] as string[],
  additionalInstructions: '',
};

export default function IntelligenceSettingsPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    contextProfilesApi.get()
      .then((profile) => {
        setForm({
          industry: profile?.organizationContext?.industry || '',
          specialization: profile?.organizationContext?.specialization || '',
          responseStyle: profile?.userContext?.preferredResponseStyle || 'concise',
          language: profile?.userContext?.preferredLanguage || 'ar',
          focusAreas: profile?.frequentTasks || [],
          additionalInstructions: profile?.organizationContext?.additionalInstructions || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleFocus = (value: string) => {
    setForm((current) => ({
      ...current,
      focusAreas: current.focusAreas.includes(value)
        ? current.focusAreas.filter((item) => item !== value)
        : [...current.focusAreas, value],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await contextProfilesApi.update({
        organizationContext: {
          industry: form.industry,
          specialization: form.specialization,
          additionalInstructions: form.additionalInstructions,
        },
        userContext: {
          preferredLanguage: form.language,
          preferredResponseStyle: form.responseStyle,
        },
        frequentTasks: form.focusAreas,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    setSaving(false);
  };

  const reset = async () => {
    if (!window.confirm('سيتم حذف سياق التخصيص والاقتراحات المحفوظة. هل تريد المتابعة؟')) return;
    await contextProfilesApi.remove().catch(() => {});
    setForm(EMPTY_FORM);
  };

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-thanarah-400 focus:ring-2 focus:ring-thanarah-100 font-arabic';

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex-1 overflow-auto p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-thanarah-600" />
              <h1 className="text-2xl font-semibold text-gray-900 font-arabic">تخصيص ذكاء Thanarah</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1 font-arabic">أخبر المساعد بالمجال وطريقة الرد والمهام التي تريد المساعدة فيها.</p>
          </div>
          <button onClick={save} disabled={saving} className={cn('inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white font-arabic', saved ? 'bg-green-600' : 'bg-thanarah-700 hover:bg-thanarah-600')}>
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'تم الحفظ' : saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </div>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-medium text-gray-900 font-arabic">سياق المؤسسة</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm text-gray-600 font-arabic">المجال
              <input className={cn(inputClass, 'mt-1.5')} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="مثال: Healthcare" />
            </label>
            <label className="text-sm text-gray-600 font-arabic">التخصص
              <input className={cn(inputClass, 'mt-1.5')} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} placeholder="مثال: عيادة أسنان" />
            </label>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-medium text-gray-900 font-arabic">طريقة الرد</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['professional', 'رسمي ومهني'],
              ['friendly', 'ودي وطبيعي'],
              ['concise', 'مختصر ومباشر'],
              ['detailed', 'مفصل وشامل'],
            ].map(([value, label]) => (
              <button key={value} onClick={() => setForm({ ...form, responseStyle: value })} className={cn('rounded-xl border-2 px-3 py-2.5 text-sm font-arabic transition', form.responseStyle === value ? 'border-thanarah-500 bg-thanarah-50 text-thanarah-800' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[
              ['ar', 'العربية'],
              ['en', 'English'],
            ].map(([value, label]) => (
              <button key={value} onClick={() => setForm({ ...form, language: value })} className={cn('rounded-lg border px-3 py-2 text-sm font-arabic', form.language === value ? 'border-thanarah-500 bg-thanarah-50' : 'border-gray-200')}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-medium text-gray-900 font-arabic">مجالات التركيز</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FOCUS_AREAS.map((area) => (
              <button key={area.value} onClick={() => toggleFocus(area.value)} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-right font-arabic', form.focusAreas.includes(area.value) ? 'border-thanarah-500 bg-thanarah-50 text-thanarah-800' : 'border-gray-200 text-gray-600')}>
                <span className={cn('w-4 h-4 rounded border flex items-center justify-center', form.focusAreas.includes(area.value) ? 'bg-thanarah-600 border-thanarah-600' : 'border-gray-300')}>
                  {form.focusAreas.includes(area.value) && <Check className="w-3 h-3 text-white" />}
                </span>
                {area.label}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <h2 className="font-medium text-gray-900 font-arabic">تعليمات إضافية</h2>
          <textarea className={cn(inputClass, 'resize-none leading-relaxed')} rows={5} value={form.additionalInstructions} onChange={(e) => setForm({ ...form, additionalInstructions: e.target.value })} placeholder="اكتب تعليمات مفيدة ومستقرة للمساعد. لا تضف معلومات حساسة لا تحتاجها المحادثة." />
          <p className="text-xs text-gray-400 font-arabic">يستخدم هذا السياق للتخصيص فقط، ولا يحل محل قاعدة بيانات المؤسسة أو مصدر الحقيقة فيها.</p>
        </section>

        <button onClick={reset} className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-arabic">
          <RotateCcw className="w-4 h-4" />
          حذف سياق التخصيص والبدء من جديد
        </button>
      </div>
    </div>
  );
}