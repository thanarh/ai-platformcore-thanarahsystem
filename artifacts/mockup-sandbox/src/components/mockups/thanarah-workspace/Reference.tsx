import './_group.css';
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

function Mark() {
  return (
    <div className="relative h-7 w-7">
      <div className="absolute left-[34%] top-0 h-[44%] w-[36%] rounded-full bg-[#17855b]" />
      <div className="absolute left-0 top-[32%] h-[42%] w-[42%] rounded-full bg-[#2aa36f]" />
      <div className="absolute right-0 top-[36%] h-[42%] w-[42%] rounded-full bg-[#7bcba0]" />
      <div className="absolute left-[35%] top-[45%] h-[25%] w-[25%] rounded-full bg-[#dbf3e5]" />
    </div>
  );
}

export function Reference() {
  const prompts = ['لخّص هذا النص لي', 'اكتب لي مسودة احترافية', 'حلّل هذه الفكرة', 'ساعدني في تنظيم يومي'];
  const tools = [
    { icon: FileText, title: 'تلخيص', description: 'تلخيص النصوص والمحادثات' },
    { icon: Wand2, title: 'كتابة', description: 'كتابة وإعادة صياغة النصوص' },
  ];

  return (
    <main className="min-h-screen bg-[#f7faf8] px-3 py-3.5" dir="rtl">
      <div className="mx-auto max-w-[780px]">
        <header className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <Mark />
            <p className="font-arabic text-[10px] font-bold tracking-[0.12em] text-[#397862]">THANARAH INTELLIGENCE</p>
          </div>
          <p className="font-arabic -mt-1 text-[10px] text-[#9aaaa2]">مساحة عملك الذكية</p>
        </header>

        <section className="mt-4 rounded-[22px] bg-gradient-to-br from-[#16885d] via-[#309e6d] to-[#79c99c] px-5 py-4 text-white shadow-[0_14px_28px_-18px_rgba(22,136,93,0.65)] sm:px-7 sm:py-6">
          <div className="font-arabic flex items-center justify-start gap-1.5 text-[9px] text-white/90">
            <span>مساحة العمل جاهزة</span>
            <Sparkles className="h-3 w-3" />
          </div>
          <div className="mt-5 text-center">
            <h1 className="font-arabic text-[21px] font-bold leading-8 sm:text-3xl">مرحبًا بك في ذكاء Thanarah</h1>
            <p className="font-arabic mx-auto mt-1 max-w-[620px] text-[10px] leading-6 text-white/85 sm:text-sm">
              تحدث مع نفس الذكاء في الكتابة والصوت، واختر الأداة المناسبة من داخل المحادثة بدون تشتيت.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button className="font-arabic inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[10px] font-semibold text-[#1a6e4b] shadow-sm transition hover:bg-[#f1fff6]">
              <MessageSquare className="h-3.5 w-3.5" />
              ابدأ محادثة
              <ArrowLeft className="h-3 w-3" />
            </button>
            <button className="font-arabic inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3.5 text-[10px] text-white transition hover:bg-white/15">
              <Mic className="h-3.5 w-3.5" />
              جرّب الصوت
            </button>
          </div>
        </section>

        <section className="mt-3 grid gap-3">
          <div className="relative rounded-[15px] border border-[#e1e9e4] bg-white px-4 py-3.5 shadow-[0_3px_12px_rgba(31,72,50,0.04)]">
            <span className="font-arabic absolute left-4 top-3.5 text-[9px] text-[#3a9a70]">متصل</span>
            <div className="rounded-lg bg-[#eff9f2] p-2 text-[#388c68]"><ShieldCheck className="h-4 w-4" /></div>
            <div className="mt-2 text-right">
              <h2 className="font-arabic text-[12px] font-bold text-[#26342d]">ذكاء مؤسستك</h2>
              <p className="font-arabic mt-1 text-[9px] leading-5 text-[#87948e]">السياق والتخصيص يعملان داخل نفس مساحة المحادثة.</p>
            </div>
          </div>
          <div className="relative rounded-[15px] border border-[#e1e9e4] bg-white px-4 py-3.5 shadow-[0_3px_12px_rgba(31,72,50,0.04)]">
            <span className="font-arabic absolute left-4 top-3.5 text-[9px] text-[#a9b2ad]">محلي</span>
            <div className="rounded-lg bg-[#fff9eb] p-2 text-[#dfa93e]"><Zap className="h-4 w-4" /></div>
            <div className="mt-2 text-right">
              <h2 className="font-arabic text-[12px] font-bold text-[#26342d]">استجابة محلية</h2>
              <p className="font-arabic mt-1 text-[9px] leading-5 text-[#87948e]">يعمل الذكاء المحلي بدون تبديل نموذج أو مسار محادثة.</p>
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
            {prompts.map((prompt) => (
              <button key={prompt} className="font-arabic flex h-8 items-center justify-between rounded-lg bg-[#f7f9fa] px-2.5 text-[9px] text-[#65716c]">
                <span>{prompt}</span>
                <ArrowLeft className="h-3 w-3 text-[#b0b9b5]" />
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[15px] border border-[#e1e9e4] bg-white p-3.5 shadow-[0_3px_12px_rgba(31,72,50,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <button className="font-arabic inline-flex h-7 items-center gap-1 rounded-lg bg-[#172532] px-2.5 text-[9px] text-white">
              فتح المحادثة
              <ArrowLeft className="h-3 w-3" />
            </button>
            <div className="text-right">
              <h2 className="font-arabic text-[12px] font-bold text-[#26342d]">الأدوات</h2>
              <p className="font-arabic mt-0.5 text-[9px] text-[#96a19c]">الأدوات المتاحة تظهر أولًا داخل المحادثة.</p>
            </div>
          </div>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {tools.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-center gap-2 rounded-lg border border-[#d8f1e2] bg-[#f0fbf5] px-2 py-2">
                <span className="rounded-md bg-white p-1.5 text-[#509578]"><Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1 text-right">
                  <p className="font-arabic text-[10px] font-bold text-[#40554b]">{title}</p>
                  <p className="font-arabic mt-0.5 truncate text-[8px] text-[#8b9b93]">{description}</p>
                </div>
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#25b77b]" />
              </div>
            ))}
          </div>
        </section>

        <section className="font-arabic mt-3 flex items-center justify-between gap-3 rounded-[15px] border border-[#d8eee1] bg-[#eef9f2] px-3.5 py-3.5">
          <div className="min-w-0 text-right">
            <h2 className="text-[11px] font-bold text-[#3e5b4d]">خصّص مساحة العمل</h2>
            <p className="mt-1 text-[8px] leading-5 text-[#779084]">اختر المجال وأسلوب الرد والمهام التي تريدها من ثنارة.</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button className="rounded-lg bg-[#20794f] px-2.5 py-2 text-[9px] font-semibold text-white">تخصيص الآن</button>
            <button className="flex items-center gap-0.5 text-[9px] text-[#8b9891]"><X className="h-3 w-3" /> لاحقًا</button>
          </div>
          <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-[#4c9d78]" />
        </section>
      </div>
    </main>
  );
}