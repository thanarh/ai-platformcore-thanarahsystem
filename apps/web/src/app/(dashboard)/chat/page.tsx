'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { MessageSquare, Sparkles, Sliders, X } from 'lucide-react';
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

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto" dir="rtl">
      <div className="max-w-xl w-full text-center space-y-8">
        {/* Logo mark */}
        <div className="flex justify-center">
          <ThanarahIcon className="w-16 h-16 opacity-90" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2 font-arabic">
            {personalization?.mode === 'personalized'
              ? 'ماذا تريد أن ننجز اليوم؟'
              : 'مرحبًا بك في ذكاء Thanarah'}
          </h1>
          <p className="text-sm text-gray-500 font-arabic leading-relaxed">
            {personalization?.mode === 'personalized'
              ? 'اقتراحات مبنية على سياق الاستخدام المحفوظ، ويمكنك تعديلها من التخصيص.'
              : 'أنا هنا لمساعدتك في العمل، المعلومات، والتحليل داخل مؤسستك.'}
          </p>
        </div>

        {personalization?.isNewUser && !personalization?.profile?.onboardingDismissed && (
          <div className="text-right bg-thanarah-50 border border-thanarah-100 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-thanarah-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-gray-800 font-arabic">خصّص ذكاء Thanarah لمؤسستك</p>
                <p className="text-xs text-gray-600 mt-1 font-arabic leading-relaxed">
                  اختر المجال، أسلوب الرد، والمهام التي تريد المساعدة فيها. يمكنك استخدام المحادثة الآن دون إكمال التخصيص.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => router.push('/settings/intelligence')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-thanarah-700 px-3 py-1.5 text-xs text-white font-arabic"
                  >
                    <Sliders className="w-3.5 h-3.5" />
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
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-arabic"
                  >
                    <X className="w-3.5 h-3.5" />
                    لاحقًا
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loadingProfile && personalization?.mode === 'personalized' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(personalization.suggestions || []).map((suggestion: string) => (
              <button
                key={suggestion}
                onClick={() => startChat(suggestion)}
                className="text-right bg-white hover:bg-gray-50 border border-gray-200 hover:border-thanarah-300 rounded-xl px-4 py-3 text-sm text-gray-700 transition font-arabic leading-relaxed"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {!loadingProfile && personalization?.mode !== 'personalized' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 text-right space-y-3">
            <p className="text-sm text-gray-700 font-arabic">يمكنك أن تسألني عن:</p>
            <div className="flex flex-wrap gap-2">
              {['المواعيد', 'العملاء', 'الخدمات', 'التقارير', 'إجراءات العمل', 'معلومات مؤسستك'].map((item) => (
                <span key={item} className="rounded-full bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs text-gray-600 font-arabic">
                  {item}
                </span>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-1.5">
              <p className="text-xs text-gray-500 font-arabic">Tip: يمكنك سؤالي بطريقة طبيعية، بدون أوامر محددة.</p>
              <p className="text-xs text-gray-500 font-arabic">Tip: كلما استخدمتني أكثر، أصبحت اقتراحاتي أكثر ارتباطًا بسياق عملك.</p>
              <p className="text-xs text-gray-500 font-arabic">Tip: يمكنك تخصيص طريقة تعاملي معك من الإعدادات.</p>
            </div>
          </div>
        )}

        {skills.length > 0 && (
          <div className="text-right space-y-2">
            <p className="text-xs font-medium text-gray-500 font-arabic">جرّب Skill</p>
            <div className="flex flex-wrap gap-2">
              {skills.slice(0, 6).map((skill) => (
                <span
                  key={skill.id}
                  title={skill.implementationStatus === 'contract-only' ? 'Contract فقط — غير مفعّلة في هذه المرحلة' : skill.description}
                  className={`rounded-full border px-3 py-1.5 text-xs font-arabic ${
                    skill.enabled
                      ? 'border-thanarah-200 bg-thanarah-50 text-thanarah-800'
                      : 'border-gray-200 bg-gray-50 text-gray-400'
                  }`}
                >
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => startChat()}
          className="inline-flex items-center gap-2 bg-thanarah-700 hover:bg-thanarah-600 text-white rounded-xl px-6 py-3 text-sm font-medium transition font-arabic"
        >
          <MessageSquare className="w-4 h-4" />
          ابدأ محادثة جديدة
        </button>
      </div>
    </div>
  );
}
