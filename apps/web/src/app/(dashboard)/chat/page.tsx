'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  MessageSquare,
  Mic,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
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
    router.push(prompt ? `/chat/${conv._id}?prompt=${encodeURIComponent(prompt)}` : `/chat/${conv._id}`);
  };

  const readySkills = skills.filter(
    (skill) => skill.enabled && skill.implementationStatus !== 'contract-only',
  );
  const toolIcons: Record<string, any> = {
    summarize: FileText,
    write: Wand2,
  };
  const visibleSkills = (readySkills.length
    ? readySkills
    : [
        { id: 'summarize', name: 'تلخيص', description: 'تلخيص النصوص والمحادثات' },
        { id: 'write', name: 'كتابة', description: 'كتابة وإعادة صياغة النصوص' },
      ]
  ).slice(0, 2);
  const prompts = personalization?.mode === 'personalized' && personalization?.suggestions?.length
    ? personalization.suggestions.slice(0, 4)
    : ['لخّص هذا النص لي', 'اكتب لي مسودة احترافية', 'حلّل هذه الفكرة', 'ساعدني في تنظيم يومي'];

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7faf8] px-3 py-3.5" dir="rtl">
      <div className="mx-auto max-w-[780px]">
        <header className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <ThanarahIcon className="h-7 w-7" size={28} />
            <p className="font-arabic text-[10px] font-bold tracking-[0.12em] text-[#397862]">
              THANARAH INTELLIGENCE
            </p>
          </div>
          <p className="font-arabic -mt-1 text-[10px] text-[#9aaaa2]">مساحة عملك الذكية</p>
        </header>

        <section className="mt-4 rounded-[22px] bg-gradient-to-br from-[#16885d] via-[#309e6d] to-[#79c99c] px-5 py-4 text-white shadow-[0_14px_28px_-18px_rgba(22,136,93,0.65)] sm:px-7 sm:py-6">
          <div className="font-arabic flex items-center justify-start gap-1.5 text-[9px] text-white/90">
            <span>مساحة العمل جاهزة</span>
            <Sparkles className="h-3 w-3" />
          </div>
          <div className="mt-5 text-center">
            <h1 className="font-arabic text-[21px] font-bold leading-8 sm:text-3xl">
              {personalization?.mode === 'personalized'
                ? 'ماذا تريد أن ننجز اليوم؟'
                : 'مرحبًا بك في ذكاء Thanarah'}
            </h1>
            <p className="font-arabic mx-auto mt-1 max-w-[620px] text-[10px] leading-6 text-white/85 sm:text-sm">
              تحدث مع نفس الذكاء في الكتابة والصوت، واختر الأداة المناسبة من داخل المحادثة بدون تشتيت.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => startChat()}
              className="font-arabic inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[10px] font-semibold text-[#1a6e4b] shadow-sm transition hover:bg-[#f1fff6]"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              ابدأ محادثة
              <ArrowLeft className="h-3 w-3" />
            </button>
            <button
              onClick={() => startChat('أريد أن أستخدم الصوت في هذه المحادثة')}
              className="font-arabic inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3.5 text-[10px] text-white transition hover:bg-white/15"
            >
              <Mic className="h-3.5 w-3.5" />
              جرّب الصوت
            </button>
          </div>
        </section>

        <section className="mt-3 grid gap-3">
          <div className="relative rounded-[15px] border border-[#e1e9e4] bg-white px-4 py-3.5 shadow-[0_3px_12px_rgba(31,72,50,0.04)]">
            <span className="font-arabic absolute left-4 top-3.5 text-[9px] text-[#3a9a70]">متصل</span>
            <div className="rounded-lg bg-[#eff9f2] p-2 text-[#388c68]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="mt-2 text-right">
              <h2 className="font-arabic text-[12px] font-bold text-[#26342d]">ذكاء مؤسستك</h2>
              <p className="font-arabic mt-1 text-[9px] leading-5 text-[#87948e]">
                السياق والتخصيص يعملان داخل نفس مساحة المحادثة.
              </p>
            </div>
          </div>
          <div className="relative rounded-[15px] border border-[#e1e9e4] bg-white px-4 py-3.5 shadow-[0_3px_12px_rgba(31,72,50,0.04)]">
            <span className="font-arabic absolute left-4 top-3.5 text-[9px] text-[#a9b2ad]">محلي</span>
            <div className="rounded-lg bg-[#fff9eb] p-2 text-[#dfa93e]">
              <Zap className="h-4 w-4" />
            </div>
            <div className="mt-2 text-right">
              <h2 className="font-arabic text-[12px] font-bold text-[#26342d]">استجابة محلية</h2>
              <p className="font-arabic mt-1 text-[9px] leading-5 text-[#87948e]">
                يعمل الذكاء المحلي بدون تبديل نموذج أو مسار محادثة.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-[15px] border border-[#e1e9e4] bg-white p-3.5 shadow-[0_3px_12px_rgba(31,72,50,0.04)]">
          <div className="flex items-start justify-between">
            <div className="text-right">
              <h2 className="font-arabic text-[12px] font-bold text-[#26342d]">ابدأ من هنا</h2>
              <p className="font-arabic mt-0.5 text-[9px] text-[#96a19c]">أسئلة سريعة تفتح محادثة جديدة.</p>
            </div>
            <MessageSquare className="mt-0.5 h-4 w-4 text-[#4a9f7a]" />
          </div>
          <div className="mt-3 grid gap-1.5">
            {prompts.map((prompt: string) => (
              <button
                key={prompt}
                onClick={() => startChat(prompt)}
                className="font-arabic flex h-8 items-center justify-between rounded-lg bg-[#f7f9fa] px-2.5 text-[9px] text-[#65716c] transition hover:bg-[#f0f8f3]"
              >
                <span>{prompt}</span>
                <ArrowLeft className="h-3 w-3 text-[#b0b9b5]" />
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[15px] border border-[#e1e9e4] bg-white p-3.5 shadow-[0_3px_12px_rgba(31,72,50,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={() => startChat()}
              className="font-arabic inline-flex h-7 items-center gap-1 rounded-lg bg-[#172532] px-2.5 text-[9px] text-white transition hover:bg-[#253744]"
            >
              فتح المحادثة
              <ArrowLeft className="h-3 w-3" />
            </button>
            <div className="text-right">
              <h2 className="font-arabic text-[12px] font-bold text-[#26342d]">الأدوات</h2>
              <p className="font-arabic mt-0.5 text-[9px] text-[#96a19c]">الأدوات المتاحة تظهر أولًا داخل المحادثة.</p>
            </div>
          </div>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {visibleSkills.map((skill) => {
              const Icon = toolIcons[skill.id] || Wand2;
              return (
                <div key={skill.id} className="flex items-center gap-2 rounded-lg border border-[#d8f1e2] bg-[#f0fbf5] px-2 py-2">
                  <span className="rounded-md bg-white p-1.5 text-[#509578]">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="font-arabic text-[10px] font-bold text-[#40554b]">{skill.name}</p>
                    <p className="font-arabic mt-0.5 truncate text-[8px] text-[#8b9b93]">{skill.description}</p>
                  </div>
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#25b77b]" />
                </div>
              );
            })}
          </div>
        </section>

        {!loadingProfile && personalization?.isNewUser && !personalization?.profile?.onboardingDismissed && (
          <section className="font-arabic mt-3 flex items-center justify-between gap-3 rounded-[15px] border border-[#d8eee1] bg-[#eef9f2] px-3.5 py-3.5">
            <div className="min-w-0 text-right">
              <h2 className="text-[11px] font-bold text-[#3e5b4d]">خصّص مساحة العمل</h2>
              <p className="mt-1 text-[8px] leading-5 text-[#779084]">
                اختر المجال وأسلوب الرد والمهام التي تريدها من ثنارة.
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => router.push('/settings/intelligence')}
                className="rounded-lg bg-[#20794f] px-2.5 py-2 text-[9px] font-semibold text-white transition hover:bg-[#176d46]"
              >
                تخصيص الآن
              </button>
              <button
                onClick={() => {
                  contextProfilesApi.update({ onboardingDismissed: true }).catch(() => {});
                  setPersonalization((current: any) => ({
                    ...current,
                    profile: { ...(current?.profile || {}), onboardingDismissed: true },
                  }));
                }}
                className="flex items-center gap-0.5 text-[9px] text-[#8b9891]"
              >
                <X className="h-3 w-3" />
                لاحقًا
              </button>
            </div>
            <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-[#4c9d78]" />
          </section>
        )}
      </div>
    </div>
  );
}