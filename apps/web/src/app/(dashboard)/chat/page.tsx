'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, FileText, LockKeyhole, MessageSquare, Mic, Search, ShieldCheck, Sliders, Sparkles, Table2, Wand2, X, Zap } from 'lucide-react';
import { ThanarahIcon } from '@/components/ThanarahLogo';
import { useChatStore } from '@/store/chat';
import { useRouter } from 'next/navigation';
import { aiApi, contextProfilesApi, conversationsApi } from '@/lib/api';

export default function ChatHomePage() {
  const router = useRouter();
  const { setActiveConversation, addConversation } = useChatStore();
  const [personalization, setPersonalization] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [skills, setSkills] = useState<any[]>([]);

  useEffect(() => {
    contextProfilesApi.suggestions()
      .then(setPersonalization)
      .catch(() => setPersonalization({ mode: 'welcome', isNewUser: true, suggestions: [] }))
      .finally(() => setLoadingProfile(false));
  }, []);

  useEffect(() => {
    aiApi.skills()
      .then((payload) => setSkills(payload?.skills || []))
      .catch(() => setSkills([]));
  }, []);

  const startChat = async (prompt?: string) => {
    const conv = await conversationsApi.create();
    addConversation(conv);
    setActiveConversation(conv._id);
    if (prompt) {
      router.push(`/chat/${conv._id}?prompt=${encodeURIComponent(prompt)}`);
    } else {
      router.push(`/chat/${conv._id}`);
    }
  };

  const readySkills = skills.filter((skill) => skill.enabled && skill.implementationStatus !== 'contract-only');
  const plannedSkills = skills.filter((skill) => !skill.enabled || skill.implementationStatus === 'contract-only');
  const toolIcons: Record<string, any> = {
    summarize: FileText,
    write: Wand2,
    data_analysis: BarChart3,
    research: Search,
    web_search: Search,
    create_pdf: FileText,
    create_document: FileText,
    create_spreadsheet: Table2,
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f6f8f7]" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ThanarahIcon className="h-11 w-11" />
            <div>
              <p className="text-xs font-semibold tracking-wide text-thanarah-700">THANARAH INTELLIGENCE</p>
              <p className="mt-0.5 text-xs text-gray-500 font-arabic">مساحة عملك الذكية</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-xs text-emerald-700 shadow-sm sm:flex font-arabic">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            AI Core جاهز
          </div>
        </div>

        <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1f7350] via-[#2d8a5e] to-[#73b894] p-6 text-white shadow-[0_20px_50px_-28px_rgba(31,115,80,0.7)] sm:p-8">
            <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-arabic">
                <Sparkles className="h-3.5 w-3.5" />
                مساحة العمل جاهزة
              </span>
              <h1 className="mt-5 text-3xl font-semibold leading-tight font-arabic sm:text-4xl">
                {personalization?.mode === 'personalized' ? 'ماذا تريد أن ننجز اليوم؟' : 'مرحبًا بك في ذكاء Thanarah'}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-white/80 font-arabic">
                تحدث مع نفس الذكاء في الكتابة والصوت، واختر الأداة المناسبة من داخل المحادثة بدون تشتيت.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={() => startChat()}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-thanarah-800 shadow-sm transition hover:bg-emerald-50 font-arabic"
                >
                  <MessageSquare className="h-4 w-4" />
                  ابدأ محادثة
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => startChat('أريد أن أستخدم الصوت في هذه المحادثة')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm text-white transition hover:bg-white/15 font-arabic"
                >
                  <Mic className="h-4 w-4" />
                  جرّب الصوت
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-thanarah-50 p-2.5 text-thanarah-700"><ShieldCheck className="h-5 w-5" /></div>
                <span className="text-[10px] text-emerald-600 font-arabic">متصل</span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-gray-900 font-arabic">ذكاء مؤسستك</h2>
              <p className="mt-1 text-xs leading-6 text-gray-500 font-arabic">السياق والتخصيص يعملان داخل نفس مساحة المحادثة.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><Zap className="h-5 w-5" /></div>
                <span className="text-[10px] text-gray-400 font-arabic">محلي</span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-gray-900 font-arabic">استجابة محلية</h2>
              <p className="mt-1 text-xs leading-6 text-gray-500 font-arabic">يعمل الذكاء المحلي بدون تبديل نموذج أو مسار محادثة.</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 font-arabic">ابدأ من هنا</h2>
                <p className="mt-1 text-xs text-gray-500 font-arabic">أسئلة سريعة تفتح محادثة جديدة.</p>
              </div>
              <MessageSquare className="h-5 w-5 text-thanarah-600" />
            </div>
            <div className="mt-4 grid gap-2">
              {(personalization?.mode === 'personalized' && personalization?.suggestions?.length
                ? personalization.suggestions.slice(0, 4)
                : ['لخّص هذا النص لي', 'اكتب لي مسودة احترافية', 'حلّل هذه الفكرة', 'ساعدني في تنظيم يومي']
              ).map((suggestion: string) => (
                <button
                  key={suggestion}
                  onClick={() => startChat(suggestion)}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3 text-right text-xs text-gray-700 transition hover:border-thanarah-200 hover:bg-thanarah-50 font-arabic"
                >
                  <span>{suggestion}</span>
                  <ArrowLeft className="h-3.5 w-3.5 text-gray-400" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 font-arabic">الأدوات</h2>
                <p className="mt-1 text-xs text-gray-500 font-arabic">الأدوات المتاحة تظهر أولًا داخل المحادثة.</p>
              </div>
              <button
                onClick={() => startChat()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-[11px] text-white transition hover:bg-gray-700 font-arabic"
              >
                فتح المحادثة
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(readySkills.length ? readySkills : [
                { id: 'summarize', name: 'تلخيص', description: 'تلخيص النصوص والمحادثات' },
                { id: 'write', name: 'كتابة', description: 'كتابة وإعادة صياغة النصوص' },
              ]).map((skill) => {
                const Icon = toolIcons[skill.id] || Wand2;
                return (
                  <div key={skill.id} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                    <span className="rounded-lg bg-white p-2 text-thanarah-700 shadow-sm"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-gray-800 font-arabic">{skill.name}</p>
                      <p className="mt-0.5 truncate text-[10px] text-gray-500 font-arabic">{skill.description}</p>
                    </div>
                    <span className="mr-auto h-2 w-2 rounded-full bg-emerald-500" title="متاحة" />
                  </div>
                );
              })}
            </div>
            {plannedSkills.length > 0 && (
              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-400 font-arabic">
                <LockKeyhole className="h-3.5 w-3.5" />
                {plannedSkills.length} أدوات تنتظر تفعيل التنفيذ والصلاحيات
              </div>
            )}
          </div>
        </section>

        {personalization?.isNewUser && !personalization?.profile?.onboardingDismissed && (
          <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-thanarah-100 bg-thanarah-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Sliders className="mt-0.5 h-5 w-5 flex-shrink-0 text-thanarah-700" />
              <div>
                <p className="font-medium text-gray-800 font-arabic">خصّص مساحة العمل</p>
                <p className="mt-1 text-xs leading-6 text-gray-600 font-arabic">اختر المجال وأسلوب الرد والمهام التي تريدها من ثنارة.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/settings/intelligence')} className="rounded-lg bg-thanarah-700 px-3 py-2 text-xs text-white font-arabic">تخصيص الآن</button>
              <button
                onClick={() => {
                  contextProfilesApi.update({ onboardingDismissed: true }).catch(() => {});
                  setPersonalization((current: any) => ({ ...current, profile: { ...(current?.profile || {}), onboardingDismissed: true } }));
                }}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-arabic"
              >
                <X className="h-3.5 w-3.5" />
                لاحقًا
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
