'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { ThanarahIcon } from '@/components/ThanarahLogo';
import { useChatStore } from '@/store/chat';
import { useRouter } from 'next/navigation';
import { conversationsApi } from '@/lib/api';

const SUGGESTIONS = [
  { ar: 'ما هي خدمات العيادة؟', en: 'What are the clinic services?' },
  { ar: 'أحتاج مساعدة في صياغة عقد عمل', en: 'Help me draft an employment contract' },
  { ar: 'اشرح لي كيف يعمل الذكاء الاصطناعي', en: 'Explain how AI works' },
  { ar: 'احسب لي ١٥٪ من ٢٥٠٠٠ ريال', en: 'Calculate 15% of 25,000 SAR' },
];

export default function ChatHomePage() {
  const router = useRouter();
  const { setActiveConversation, addConversation } = useChatStore();

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
            كيف يمكنني مساعدتك اليوم؟
          </h1>
          <p className="text-sm text-gray-500 font-arabic">
            مساعد ذكاء اصطناعي متقدم يفهم العربية والإنجليزية
          </p>
        </div>

        {/* Quick start suggestions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => startChat(s.ar)}
              className="text-right bg-white hover:bg-gray-50 border border-gray-200 hover:border-thanarah-300 rounded-xl px-4 py-3 text-sm text-gray-700 transition font-arabic leading-relaxed"
            >
              {s.ar}
            </button>
          ))}
        </div>

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
