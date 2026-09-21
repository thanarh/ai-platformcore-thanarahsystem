'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import {
  ChevronDown,
  FileText,
  Globe2,
  Lightbulb,
  MessageSquare,
  Mic,
  Paperclip,
  Search,
  Send,
  Sparkles,
  ListTodo,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ThanarahIcon } from '@/components/ThanarahLogo';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { conversationsApi } from '@/lib/api';
import TaskAssistantPanel, { AssistantTask } from '@/components/TaskAssistantPanel';
import { cn } from '@/lib/utils';

const shortcuts = [
  {
    title: 'تحليل مستند',
    description: 'ارفع ملفًا واحصل على ملخص',
    icon: FileText,
    iconClass: 'bg-[#e9f8f0] text-[#17815b]',
  },
  {
    title: 'البحث في الإنترنت',
    description: 'معلومات محدثة من مصادر موثوقة',
    icon: Globe2,
    iconClass: 'bg-[#f1eaff] text-[#7548dc]',
  },
  {
    title: 'مساعدة في الكتابة',
    description: 'محتوى احترافي وسريع',
    icon: Sparkles,
    iconClass: 'bg-[#e7f2ff] text-[#3289dc]',
  },
  {
    title: 'أفكار ومقترحات',
    description: 'لتحسين عملك وإنتاجيتك',
    icon: Lightbulb,
    iconClass: 'bg-[#fff8e6] text-[#dca726]',
  },
];

export default function ChatHomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setActiveConversation, addConversation } = useChatStore();
  const [input, setInput] = useState('');
  const [showTaskAssistant, setShowTaskAssistant] = useState(false);

  const startChat = async (prompt?: string) => {
    const conv = await conversationsApi.create();
    addConversation(conv);
    setActiveConversation(conv._id);
    router.push(prompt?.trim()
      ? `/chat/${conv._id}?prompt=${encodeURIComponent(prompt.trim())}`
      : `/chat/${conv._id}`);
  };

  const handleSubmit = () => {
    if (input.trim()) void startChat(input);
  };

  const initials = `${user?.firstName?.[0] || 'T'}${user?.lastName?.[0] || 'A'}`;
  const displayName = `${user?.firstName || 'Thanarah'} ${user?.lastName || 'Admin'}`;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f8fbfc]" dir="rtl">
      <header className="relative z-20 flex h-[76px] flex-shrink-0 items-center justify-between px-6 sm:px-8" dir="ltr">
        <div className="flex items-center gap-3" dir="ltr">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f7659] text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="leading-tight">
            <p className="text-[12px] font-semibold text-[#17232c]">{displayName}</p>
            <p className="mt-1 text-[10px] text-[#6f7c84]">{user?.email || 'admin@ai.thanarah.com'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" dir="ltr">
          <button
            type="button"
            onClick={() => setShowTaskAssistant((visible) => !visible)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-arabic shadow-[0_3px_12px_rgba(38,71,87,0.05)] transition',
              showTaskAssistant
                ? 'border-[#b8ddc7] bg-[#eef8f2] text-[#187b57]'
                : 'border-[#e5ebee] bg-white/80 text-[#46535d] hover:bg-white',
            )}
            aria-expanded={showTaskAssistant}
            aria-controls="thanarah-home-task-assistant"
          >
            <ListTodo className="h-3.5 w-3.5" />
            مساعد المهام
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e5ebee] bg-white/80 text-[#46535d] shadow-[0_3px_12px_rgba(38,71,87,0.05)] transition hover:bg-white"
            aria-label="بحث"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 pb-28 sm:px-8">
        <div className="w-full max-w-[660px] pt-3 sm:pt-5">
          <section className="flex flex-col items-center text-center">
            <div className="flex h-[66px] w-[66px] items-center justify-center rounded-[19px] bg-white shadow-[0_10px_26px_rgba(57,112,95,0.12)]">
              <ThanarahIcon size={40} className="h-10 w-10" />
            </div>
            <h1 className="font-arabic mt-5 text-[30px] font-bold leading-[1.45] tracking-[-0.04em] text-[#17232c] sm:text-[37px]">
              مرحبًا بك في <span className="text-[#157855]">ثنارة AI</span>
            </h1>
            <p className="font-arabic mt-1.5 text-[14px] text-[#69767e] sm:text-[16px]">
              مساعدك الذكي للعمل، المعرفة، والتحليل.
            </p>
          </section>

          <section className="mt-7">
            <div className="flex min-h-[62px] items-center gap-2 rounded-[17px] border border-[#edf1f2] bg-white px-3 py-2 shadow-[0_8px_26px_rgba(40,75,91,0.08)]" dir="rtl">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#16815b] text-white transition hover:bg-[#116e4d] disabled:cursor-not-allowed disabled:bg-[#dce9e4]"
                aria-label="إرسال الرسالة"
              >
                <Send className="h-[18px] w-[18px]" />
              </button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="اكتب رسالتك هنا..."
                rows={1}
                className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2.5 text-right text-[13px] text-[#2b3940] outline-none placeholder:text-[#8e989e] font-arabic"
                aria-label="رسالتك"
              />
              <div className="flex flex-shrink-0 items-center gap-1" dir="ltr">
                <button
                  type="button"
                  onClick={() => void startChat()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8fafb] text-[#69767e] transition hover:bg-[#eef5f2] hover:text-[#16815b]"
                  aria-label="إرفاق ملف"
                  title="إرفاق ملف من داخل المحادثة"
                >
                  <Paperclip className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={() => void startChat()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8fafb] text-[#69767e] transition hover:bg-[#eef5f2] hover:text-[#16815b]"
                  aria-label="استخدام الصوت"
                  title="استخدام الصوت من داخل المحادثة"
                >
                  <Mic className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </section>

          <section className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-2.5" dir="ltr">
            {shortcuts.map(({ title, description, icon: Icon, iconClass }) => (
              <button
                key={title}
                type="button"
                onClick={() => void startChat(title)}
                className="flex min-h-[121px] flex-col items-center rounded-[15px] border border-[#edf1f2] bg-white px-2.5 py-4 text-center shadow-[0_4px_15px_rgba(40,75,91,0.035)] transition hover:-translate-y-0.5 hover:border-[#cde8dc] hover:shadow-[0_8px_22px_rgba(40,110,82,0.1)]"
                dir="rtl"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
                  <Icon className="h-[21px] w-[21px]" strokeWidth={1.8} />
                </span>
                <span className="font-arabic mt-3 text-[12px] font-bold text-[#202d35]">{title}</span>
                <span className="font-arabic mt-1 text-[9px] leading-4 text-[#7f8b91]">{description}</span>
              </button>
            ))}
          </section>

          <button
            type="button"
            className="font-arabic mx-auto mt-8 flex items-center gap-1 text-[11px] text-[#74828a] transition hover:text-[#16815b]"
            onClick={() => void startChat()}
          >
            مزيد من القدرات
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </main>

      <div className="pointer-events-none absolute bottom-[-90px] left-[-110px] z-0 h-[255px] w-[72%] rotate-[-7deg] rounded-[50%] border-t border-[#dceced] bg-[#edf5f6]/90 sm:h-[300px]" />
      <div className="pointer-events-none absolute bottom-[-125px] left-[-55px] z-0 h-[230px] w-[68%] rotate-[8deg] rounded-[50%] border-t border-[#d5e8ea] bg-[#e5f0f1]/80" />
      <div className="pointer-events-none absolute bottom-[-170px] left-[17%] z-0 h-[225px] w-[58%] rotate-[-5deg] rounded-[50%] border-t border-[#d7e8e9] bg-[#f0f6f7]/90" />
      <div className="pointer-events-none absolute bottom-6 left-8 z-10 hidden text-left sm:block" dir="ltr">
        <p className="text-[13px] font-medium leading-4 text-[#26353d]">Think Smarter</p>
        <p className="text-[13px] font-medium leading-4 text-[#26353d]">Work Better</p>
        <span className="mt-2 block h-0.5 w-5 bg-[#20775a]" />
      </div>
      {showTaskAssistant && (
        <div id="thanarah-home-task-assistant" className="absolute inset-y-0 left-0 z-30">
          <TaskAssistantPanel
            storageKey={`thanarah-assistant-tasks:${(user as any)?._id || (user as any)?.id || 'current'}`}
            onClose={() => setShowTaskAssistant(false)}
            onAskAboutTask={(task: AssistantTask) => {
              void startChat(`ساعدني في تنظيم وتنفيذ هذه المهمة: ${task.title}`);
            }}
          />
        </div>
      )}
    </div>
  );
}