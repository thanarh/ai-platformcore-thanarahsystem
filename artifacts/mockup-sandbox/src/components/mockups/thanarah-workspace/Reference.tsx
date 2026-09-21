import './_group.css';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  FileText,
  Globe2,
  Grid2X2,
  HelpCircle,
  KeyRound,
  Lightbulb,
  LogOut,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
} from 'lucide-react';

const shortcuts = [
  { title: 'تحليل مستند', description: 'ارفع ملفًا واحصل على ملخص', icon: FileText, color: 'bg-[#e9f8f0] text-[#17815b]' },
  { title: 'البحث في الإنترنت', description: 'معلومات محدثة من مصادر موثوقة', icon: Globe2, color: 'bg-[#f1eaff] text-[#7548dc]' },
  { title: 'مساعدة في الكتابة', description: 'محتوى احترافي وسريع', icon: Sparkles, color: 'bg-[#e7f2ff] text-[#3289dc]' },
  { title: 'أفكار ومقترحات', description: 'لتحسين عملك وإنتاجيتك', icon: Lightbulb, color: 'bg-[#fff8e6] text-[#dca726]' },
];

function Sidebar() {
  const items = [
    { label: 'المحادثات', icon: MessageSquare, active: true },
    { label: 'البحث في الإنترنت', icon: Globe2 },
    { label: 'أدوات AI', icon: Grid2X2 },
    { label: 'مفاتيح API', icon: KeyRound },
    { label: 'قاعدة المعرفة', icon: BookOpen },
    { label: 'الإعدادات', icon: Settings },
  ];

  return (
    <aside className="flex h-full w-[204px] flex-shrink-0 flex-col border-l border-[#edf0f1] bg-[#fbfcfc] p-2.5" dir="rtl">
      <div className="flex h-[58px] items-center justify-between border-b border-[#eff2f2] px-1">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8">
            <span className="absolute left-[34%] top-0 h-[45%] w-[36%] rounded-full bg-[#16845b]" />
            <span className="absolute left-0 top-[32%] h-[42%] w-[42%] rounded-full bg-[#2aa36f]" />
            <span className="absolute right-0 top-[36%] h-[42%] w-[42%] rounded-full bg-[#7bcba0]" />
            <span className="absolute left-[35%] top-[45%] h-[25%] w-[25%] rounded-full bg-[#dbf3e5]" />
          </div>
          <div className="font-arabic text-right leading-none">
            <p className="text-[15px] font-bold text-[#1d7658]">ثنارة</p>
            <p className="mt-1 text-[6px] tracking-[0.22em] text-[#64726e]">THANARAH AI</p>
          </div>
        </div>
        <ChevronLeft className="h-4 w-4 text-[#26363e]" />
      </div>
      <button className="font-arabic mt-3 flex h-11 items-center justify-between rounded-xl bg-[#187b57] px-3 text-[12px] text-white">
        <Plus className="h-5 w-5" />
        <span>محادثة جديدة</span>
        <MessageSquare className="h-[18px] w-[18px]" />
      </button>
      <nav className="mt-3 space-y-0.5">
        {items.map(({ label, icon: Icon, active }) => (
          <div key={label} className={`font-arabic flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[11px] ${active ? 'bg-[#eef7f2] text-[#167854]' : 'text-[#53616a]'}`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
            {label}
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-[#e8eded] pt-2">
        <div className="font-arabic flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[11px] text-[#59656c]"><HelpCircle className="h-[18px] w-[18px]" />المساعدة</div>
        <div className="font-arabic flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[11px] text-[#59656c]"><LogOut className="h-[18px] w-[18px]" />تسجيل الخروج</div>
        <div className="font-arabic mt-2 rounded-xl bg-[#f3f8f7] px-2 py-3 text-center">
          <p className="text-[12px] font-bold text-[#1e2b32]">Thanarah AI</p>
          <p className="mt-1 text-[8px] text-[#78868b]">ذكاء عملي لنتائج حقيقية</p>
        </div>
      </div>
    </aside>
  );
}

export function Reference() {
  return (
    <main className="flex min-h-screen overflow-hidden bg-[#f8fbfc]" dir="rtl">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-10 flex h-[68px] flex-shrink-0 items-center justify-between px-7" dir="ltr">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1f7659] text-[10px] text-white">TA</div>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-[#17232c]">Thanarah Admin</p>
              <p className="mt-1 text-[8px] text-[#6f7c84]">admin@ai.thanarah.com</p>
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#e5ebee] bg-white text-[#46535d]"><Search className="h-3.5 w-3.5" /></div>
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center overflow-hidden px-5">
          <div className="w-full max-w-[660px] pt-4">
            <section className="flex flex-col items-center text-center">
              <div className="flex h-[62px] w-[62px] items-center justify-center rounded-[18px] bg-white shadow-[0_10px_26px_rgba(57,112,95,0.12)]">
                <div className="relative h-9 w-9">
                  <span className="absolute left-[34%] top-0 h-[45%] w-[36%] rounded-full bg-[#16845b]" />
                  <span className="absolute left-0 top-[32%] h-[42%] w-[42%] rounded-full bg-[#2aa36f]" />
                  <span className="absolute right-0 top-[36%] h-[42%] w-[42%] rounded-full bg-[#7bcba0]" />
                  <span className="absolute left-[35%] top-[45%] h-[25%] w-[25%] rounded-full bg-[#dbf3e5]" />
                </div>
              </div>
              <h1 className="font-arabic mt-4 text-[29px] font-bold tracking-[-0.04em] text-[#17232c]">مرحبًا بك في <span className="text-[#157855]">ثنارة AI</span></h1>
              <p className="font-arabic mt-1 text-[12px] text-[#69767e]">مساعدك الذكي للعمل، المعرفة، والتحليل.</p>
            </section>

            <div className="mt-6 flex h-[58px] items-center gap-2 rounded-[16px] border border-[#edf1f2] bg-white px-3 shadow-[0_8px_26px_rgba(40,75,91,0.08)]" dir="rtl">
              <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16815b] text-white"><Send className="h-4 w-4" /></button>
              <span className="font-arabic flex-1 text-right text-[11px] text-[#8e989e]">اكتب رسالتك هنا...</span>
              <div className="flex gap-1" dir="ltr">
                <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f8fafb] text-[#69767e]"><Paperclip className="h-4 w-4" /></button>
                <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f8fafb] text-[#69767e]"><Mic className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-2.5" dir="ltr">
              {shortcuts.map(({ title, description, icon: Icon, color }) => (
                <div key={title} className="flex min-h-[112px] flex-col items-center rounded-[14px] border border-[#edf1f2] bg-white px-2 py-3.5 text-center" dir="rtl">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
                  <span className="font-arabic mt-2.5 text-[10px] font-bold text-[#202d35]">{title}</span>
                  <span className="font-arabic mt-1 text-[8px] leading-3.5 text-[#7f8b91]">{description}</span>
                </div>
              ))}
            </div>
            <div className="font-arabic mx-auto mt-6 flex w-fit items-center gap-1 text-[9px] text-[#74828a]">مزيد من القدرات <ChevronDown className="h-3 w-3" /></div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-[-80px] left-[-70px] h-[190px] w-[75%] rotate-[-7deg] rounded-[50%] border-t border-[#dceced] bg-[#edf5f6]/90" />
        <div className="pointer-events-none absolute bottom-[-110px] left-[-35px] h-[170px] w-[70%] rotate-[8deg] rounded-[50%] border-t border-[#d5e8ea] bg-[#e5f0f1]/80" />
        <div className="font-arabic absolute bottom-5 left-7 text-left text-[10px] leading-3.5 text-[#26353d]" dir="ltr">
          Think Smarter<br />Work Better
          <span className="mt-1.5 block h-0.5 w-4 bg-[#20775a]" />
        </div>
      </div>
    </main>
  );
}