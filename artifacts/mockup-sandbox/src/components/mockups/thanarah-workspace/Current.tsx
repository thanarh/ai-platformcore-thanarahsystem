import './_group.css';
import {
  ArrowLeft,
  BarChart3,
  FileText,
  LockKeyhole,
  MessageSquare,
  Mic,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Table2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

function ThanarahMark({ className = 'h-11 w-11' }: { className?: string }) {
  return (
    <div className={`${className} relative rounded-[34%] bg-white shadow-[0_10px_24px_rgba(31,115,80,0.12)]`}>
      <div className="absolute left-[31%] top-[15%] h-[37%] w-[37%] rounded-[40%] bg-[#16845b]" />
      <div className="absolute left-[13%] top-[39%] h-[37%] w-[37%] rounded-[40%] bg-[#25a36e]" />
      <div className="absolute left-[48%] top-[40%] h-[37%] w-[37%] rounded-[40%] bg-[#75cfa1]" />
      <div className="absolute left-[35%] top-[49%] h-[24%] w-[24%] rounded-[40%] bg-[#d7f3e4]" />
    </div>
  );
}

export function Current() {
  const suggestions = ['لخّص هذا النص لي', 'اكتب لي مسودة احترافية', 'حلّل هذه الفكرة', 'ساعدني في تنظيم يومي'];
  const tools = [
    { icon: FileText, name: 'تلخيص', description: 'تلخيص النصوص والمحادثات' },
    { icon: Wand2, name: 'كتابة', description: 'كتابة وإعادة صياغة النصوص' },
  ];

  return (
    <main className="min-h-screen overflow-y-auto bg-[#f6f8f7] p-4" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ThanarahMark />
            <div>
              <p className="text-xs font-semibold tracking-wide text-[#227a55]">THANARAH INTELLIGENCE</p>
              <p className="font-arabic mt-0.5 text-xs text-gray-500">مساحة عملك الذكية</p>
            </div>
          </div>
          <div className="font-arabic hidden items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-xs text-emerald-700 shadow-sm sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            AI Core جاهز
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1f7350] via-[#2d8a5e] to-[#73b894] p-6 text-white shadow-[0_20px_50px_-28px_rgba(31,115,80,0.7)] sm:p-8">
            <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative max-w-2xl">
              <span className="font-arabic inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px]">
                <Sparkles className="h-3.5 w-3.5" />
                مساحة العمل جاهزة
              </span>
              <h1 className="font-arabic mt-5 text-3xl font-semibold leading-tight sm:text-4xl">مرحبًا بك في ذكاء Thanarah</h1>
              <p className="font-arabic mt-3 max-w-xl text-sm leading-7 text-white/80">
                تحدث مع نفس الذكاء في الكتابة والصوت، واختر الأداة المناسبة من داخل المحادثة بدون تشتيت.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button className="font-arabic inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#1a6b49] shadow-sm">
                  <MessageSquare className="h-4 w-4" />
                  ابدأ محادثة
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button className="font-arabic inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm text-white">
                  <Mic className="h-4 w-4" />
                  جرّب الصوت
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-[#effaf3] p-2.5 text-[#27865c]"><ShieldCheck className="h-5 w-5" /></div>
                <span className="font-arabic text-[10px] text-emerald-600">متصل</span>
              </div>
              <h2 className="font-arabic mt-4 text-base font-semibold text-gray-900">ذكاء مؤسستك</h2>
              <p className="font-arabic mt-1 text-xs leading-6 text-gray-500">السياق والتخصيص يعملان داخل نفس مساحة المحادثة.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><Zap className="h-5 w-5" /></div>
                <span className="font-arabic text-[10px] text-gray-400">محلي</span>
              </div>
              <h2 className="font-arabic mt-4 text-base font-semibold text-gray-900">استجابة محلية</h2>
              <p className="font-arabic mt-1 text-xs leading-6 text-gray-500">يعمل الذكاء المحلي بدون تبديل نموذج أو مسار محادثة.</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-arabic text-base font-semibold text-gray-900">ابدأ من هنا</h2>
                <p className="font-arabic mt-1 text-xs text-gray-500">أسئلة سريعة تفتح محادثة جديدة.</p>
              </div>
              <MessageSquare className="h-5 w-5 text-[#25835a]" />
            </div>
            <div className="mt-4 grid gap-2">
              {suggestions.map((suggestion) => (
                <button key={suggestion} className="font-arabic flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3 text-right text-xs text-gray-700">
                  <span>{suggestion}</span>
                  <ArrowLeft className="h-3.5 w-3.5 text-gray-400" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-arabic text-base font-semibold text-gray-900">الأدوات</h2>
                <p className="font-arabic mt-1 text-xs text-gray-500">الأدوات المتاحة تظهر أولًا داخل المحادثة.</p>
              </div>
              <button className="font-arabic inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-[11px] text-white">
                فتح المحادثة
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {tools.map(({ icon: Icon, name, description }) => (
                <div key={name} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <span className="rounded-lg bg-white p-2 text-[#27865c] shadow-sm"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="font-arabic truncate text-xs font-semibold text-gray-800">{name}</p>
                    <p className="font-arabic mt-0.5 truncate text-[10px] text-gray-500">{description}</p>
                  </div>
                  <span className="mr-auto h-2 w-2 rounded-full bg-emerald-500" />
                </div>
              ))}
            </div>
            <div className="font-arabic mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
              <LockKeyhole className="h-3.5 w-3.5" />
              أدوات إضافية تنتظر تفعيل التنفيذ والصلاحيات
            </div>
          </div>
        </section>

        <div className="font-arabic mt-5 flex flex-col gap-4 rounded-2xl border border-[#d9eee1] bg-[#eef9f2] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sliders className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#227a55]" />
            <div>
              <p className="font-medium text-gray-800">خصّص مساحة العمل</p>
              <p className="mt-1 text-xs leading-6 text-gray-600">اختر المجال وأسلوب الرد والمهام التي تريدها من ثنارة.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-lg bg-[#237d55] px-3 py-2 text-xs text-white">تخصيص الآن</button>
            <button className="inline-flex items-center gap-1 text-xs text-gray-500"><X className="h-3.5 w-3.5" /> لاحقًا</button>
          </div>
        </div>
      </div>
    </main>
  );
}