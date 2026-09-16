'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { aiApi, tenantsApi } from '@/lib/api';
import { Bot, Save, RefreshCw, Sparkles, MessageSquare, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';

const STYLE_OPTIONS = [
  { value: 'professional', label: 'رسمي ومهني', desc: 'مناسب للعيادات والشركات' },
  { value: 'friendly',     label: 'ودي وغير رسمي', desc: 'أسلوب محادثة طبيعي' },
  { value: 'concise',      label: 'مختصر ومباشر', desc: 'ردود قصيرة وواضحة' },
  { value: 'detailed',     label: 'مفصّل وشامل', desc: 'ردود معمّقة مع شرح' },
];

const PROMPT_TEMPLATES = [
  {
    label: 'مساعد عيادة طبية',
    prompt: `أنت مساعد ذكاء اصطناعي لعيادتنا الطبية.
مهمتك: مساعدة المرضى في حجز المواعيد، الإجابة على الأسئلة العامة عن الخدمات والأطباء، وتقديم معلومات صحية عامة.
لا تقدم تشخيصات طبية. للحالات الطارئة، وجّه المريض للاتصال بالإسعاف.
تحدث دائماً بأسلوب مريح ومطمئن.`,
  },
  {
    label: 'مساعد خدمة عملاء',
    prompt: `أنت مساعد خدمة العملاء لشركتنا.
ساعد العملاء في استفساراتهم بسرعة ولطف.
إذا لم تجد الإجابة، أخبر العميل بأنك ستحوّله لموظف بشري.
ردّ دائماً بالعربية ما لم يبدأ العميل بالإنجليزية.`,
  },
  {
    label: 'مساعد شخصي',
    prompt: `أنت مساعد شخصي ذكي.
ساعد المستخدم في مهامه اليومية، الكتابة، البحث، والتحليل.
كن مرناً وودياً، وتكيّف مع أسلوب المستخدم.`,
  },
];

export default function AiSettingsPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [form, setForm] = useState({
    systemPrompt: '',
    communicationStyle: 'professional',
    responseProfile: 'fast',
    memoryEnabled: true,
  });

  useEffect(() => {
    load();
    aiApi.capabilities().then(setCapabilities).catch(() => setCapabilities(null));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const t = await tenantsApi.myTenant();
      setTenant(t);
      setForm({
        systemPrompt: t?.aiConfig?.systemPrompt || '',
        communicationStyle: t?.aiConfig?.communicationStyle || 'professional',
        responseProfile: t?.aiConfig?.responseProfile || 'fast',
        memoryEnabled: t?.aiConfig?.memoryEnabled !== false,
      });
    } catch {}
    setLoading(false);
  };

  const handleSave = async () => {
    if (!tenant?._id) return;
    setSaving(true);
    try {
      await tenantsApi.updateAiConfig(tenant._id, {
        systemPrompt: form.systemPrompt || null,
        communicationStyle: form.communicationStyle,
        responseProfile: form.responseProfile,
        memoryEnabled: form.memoryEnabled,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const applyTemplate = (prompt: string) => {
    setForm(f => ({ ...f, systemPrompt: prompt }));
  };

  const resetToDefault = () => {
    setForm(f => ({ ...f, systemPrompt: '' }));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 font-arabic">إعدادات الذكاء الاصطناعي</h1>
            <p className="text-sm text-gray-500 mt-0.5 font-arabic">
              خصّص شخصية المساعد وأسلوب ردوده
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-arabic transition',
              saved
                ? 'bg-green-600 text-white'
                : 'bg-thanarah-700 text-white hover:bg-thanarah-600'
            )}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'تم الحفظ ✓' : 'حفظ الإعدادات'}
          </button>
        </div>

        {/* Communication style */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-4 h-4 text-thanarah-600" />
            <h2 className="font-medium text-gray-900 font-arabic">أسلوب التواصل</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, communicationStyle: opt.value }))}
                className={cn(
                  'text-right p-3 rounded-xl border-2 transition',
                  form.communicationStyle === opt.value
                    ? 'border-thanarah-500 bg-thanarah-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <p className="text-sm font-medium text-gray-800 font-arabic">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 font-arabic">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Performance profile */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-thanarah-600" />
            <div>
              <h2 className="font-medium text-gray-900 font-arabic">سرعة الرد واستهلاك الموارد</h2>
              <p className="text-xs text-gray-500 font-arabic mt-0.5">لا يتم تدريب النموذج مع كل رسالة؛ يتم استخدام ذاكرة خفيفة واسترجاع ذكي</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'fast', label: 'سريع', desc: 'ردود قصيرة واستهلاك منخفض' },
              { value: 'balanced', label: 'متوازن', desc: 'جودة وسرعة متوازنة' },
              { value: 'deep', label: 'تحليل عميق', desc: 'مهام طويلة واستهلاك أعلى' },
            ].map((profile) => (
              <button key={profile.value} onClick={() => setForm(f => ({ ...f, responseProfile: profile.value }))}
                className={cn('p-3 rounded-xl border-2 text-right transition', form.responseProfile === profile.value ? 'border-thanarah-500 bg-thanarah-50' : 'border-gray-200 hover:border-gray-300')}>
                <p className="text-sm font-medium text-gray-800 font-arabic">{profile.label}</p>
                <p className="text-[11px] text-gray-500 mt-1 font-arabic">{profile.desc}</p>
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer">
            <span className="text-sm text-gray-700 font-arabic">تعلّم من المحادثات عبر الذاكرة والاسترجاع</span>
            <input type="checkbox" checked={form.memoryEnabled} onChange={(e) => setForm(f => ({ ...f, memoryEnabled: e.target.checked }))} className="w-4 h-4 accent-thanarah-600" />
          </label>
        </div>

        {/* System prompt */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-thanarah-600" />
              <h2 className="font-medium text-gray-900 font-arabic">شخصية المساعد (System Prompt)</h2>
            </div>
            <button
              onClick={resetToDefault}
              className="text-xs text-gray-400 hover:text-gray-600 font-arabic transition"
            >
              إعادة للافتراضي
            </button>
          </div>

          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
            placeholder="اترك الحقل فارغاً لاستخدام شخصية ثنارة AI الافتراضية...&#10;&#10;أو اكتب تعليمات مخصصة للمساعد:&#10;مثال: أنت مساعد لعيادة دكتور أحمد للأسنان، ساعد المرضى في..."
            rows={10}
            className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm font-arabic leading-relaxed focus:outline-none focus:ring-2 focus:ring-thanarah-400 resize-none text-gray-800"
          />

          <p className="text-xs text-gray-400 font-arabic">
            {form.systemPrompt.length > 0
              ? `${form.systemPrompt.length} حرف`
              : 'سيُستخدم System Prompt الافتراضي لثنارة AI'}
          </p>
        </div>

        {/* Templates */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-thanarah-600" />
            <h2 className="font-medium text-gray-900 font-arabic">قوالب جاهزة</h2>
          </div>
          <div className="space-y-2">
            {PROMPT_TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => applyTemplate(t.prompt)}
                className="w-full text-right px-4 py-3 border border-gray-200 rounded-xl hover:border-thanarah-300 hover:bg-thanarah-50 transition"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-thanarah-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800 font-arabic">{t.label}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 font-arabic line-clamp-1 mr-5">
                  {t.prompt.split('\n')[0]}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Thanarah intelligence services */}
        <div className="bg-thanarah-50 border border-thanarah-100 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-thanarah-600" />
            <div>
              <h2 className="font-medium text-gray-900 font-arabic">خدمات ثنارة الذكية</h2>
              <p className="text-xs text-gray-500 font-arabic mt-0.5">حالة مكونات الذكاء والمعرفة في المنصة</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-thanarah-100 p-3">
              <p className="text-xs text-gray-500 font-arabic">محرك المحادثة</p>
              <p className="text-sm font-semibold text-thanarah-700 mt-1 font-arabic">
                {capabilities?.generation?.enabled ? 'جاهز' : 'جاري الاتصال'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-thanarah-100 p-3">
              <p className="text-xs text-gray-500 font-arabic">البحث الدلالي</p>
              <p className="text-sm font-semibold text-thanarah-700 mt-1 font-arabic">
                {capabilities?.embeddings?.ready ? 'جاهز' : 'جاري التهيئة'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-thanarah-100 p-3">
              <p className="text-xs text-gray-500 font-arabic">قاعدة معرفة ثنارة</p>
              <p className="text-sm font-semibold text-thanarah-700 mt-1 font-arabic">
                {capabilities?.rag?.enabled ? 'جاهزة' : 'جاري الاتصال'}
              </p>
            </div>
          </div>
          <p className="text-xs text-thanarah-700 font-arabic leading-relaxed">
            تعمل خدمات ثنارة كوحدة موحدة للمحادثة، استرجاع المعرفة، والذاكرة الذكية مع مسارات استمرارية تمنع توقف تجربة المستخدم.
          </p>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm text-blue-700 font-arabic leading-relaxed">
            <span className="font-medium">ملاحظة:</span> التغييرات تسري على المحادثات الجديدة فوراً بعد الحفظ.
            المحادثات الجارية تستمر بالإعداد القديم حتى يُحدَّث السياق.
          </p>
        </div>

      </div>
    </div>
  );
}
