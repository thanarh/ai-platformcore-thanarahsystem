import './_group.css';

const faqs = [
  {
    question: 'ما هي ثنارة للذكاء الاصطناعي؟',
    answer:
      'ثنارة منصة عربية للمحادثة الذكية وإدارة المعرفة، تساعدك على طرح الأسئلة والعمل مع المعلومات المتاحة في مساحة العمل.',
  },
  {
    question: 'هل يمكن لثنارة الإجابة بالاستناد إلى قاعدة المعرفة؟',
    answer:
      'عند تفعيل البحث المعزز وإضافة محتوى إلى قاعدة المعرفة، يمكن للمساعد استرجاع المقاطع ذات الصلة بسؤالك واستخدامها في صياغة الرد.',
  },
  {
    question: 'هل تدعم ثنارة اللغة العربية؟',
    answer:
      'نعم. الواجهة عربية من اليمين إلى اليسار، ويمكنك التفاعل بالعربية أو الإنجليزية.',
  },
];

export function Current() {
  return (
    <main className="min-h-screen bg-[#f7f9f7] font-arabic text-[#1d3329]" dir="rtl">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <a href="/" aria-label="ثنارة للذكاء الاصطناعي">
          <img
            src="/__mockup/images/thanarah-logo.png"
            alt="شعار ثنارة للذكاء الاصطناعي"
            className="h-10 w-auto"
          />
        </a>
        <nav className="flex items-center gap-3 text-sm">
          <a href="/login" className="rounded-xl px-4 py-2.5 text-[#345344] hover:bg-white">
            تسجيل الدخول
          </a>
          <a
            href="/register"
            className="rounded-xl bg-[#1a5f3f] px-4 py-2.5 font-medium text-white hover:bg-[#174d3e]"
          >
            إنشاء حساب
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 sm:px-8 md:grid-cols-[1.15fr_0.85fr] md:pb-28 md:pt-20">
        <div>
          <p className="mb-4 text-sm font-semibold text-[#397352]">
            منصة ثنارة للذكاء الاصطناعي
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-[#183b2b] sm:text-5xl">
            محادثة عربية وبحث في المعرفة، في مساحة عمل واحدة
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-9 text-[#586a60]">
            اسأل بوضوح، اعثر على المعلومات ذات الصلة في قاعدة المعرفة، وصغ ردودك
            بمساعدة ثنارة.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/register"
              className="rounded-xl bg-[#1a5f3f] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#174d3e]"
            >
              ابدأ مع ثنارة
            </a>
            <a
              href="/login"
              className="rounded-xl border border-[#d9e4dc] bg-white px-6 py-3 text-sm font-semibold text-[#345344] hover:border-[#a9c4b2]"
            >
              تسجيل الدخول
            </a>
          </div>
        </div>

        <div className="rounded-3xl border border-[#e1e9e2] bg-white p-6 shadow-[0_24px_70px_-48px_rgba(26,95,63,0.45)] sm:p-8">
          <p className="text-sm font-semibold text-[#397352]">ما الذي تقدمه ثنارة؟</p>
          <ul className="mt-5 space-y-5">
            <li className="border-b border-[#edf1ed] pb-5">
              <h2 className="font-semibold text-[#1d3329]">تفاعل باللغة التي تناسبك</h2>
              <p className="mt-1.5 text-sm leading-7 text-[#66756d]">
                اطرح أسئلتك بالعربية أو الإنجليزية من واجهة مصممة لدعم العربية.
              </p>
            </li>
            <li className="border-b border-[#edf1ed] pb-5">
              <h2 className="font-semibold text-[#1d3329]">اعمل مع معرفة مؤسستك</h2>
              <p className="mt-1.5 text-sm leading-7 text-[#66756d]">
                استخدم محتوى قاعدة المعرفة للعثور على المقاطع المرتبطة بسؤالك.
              </p>
            </li>
            <li>
              <h2 className="font-semibold text-[#1d3329]">اكتب بوضوح</h2>
              <p className="mt-1.5 text-sm leading-7 text-[#66756d]">
                اطلب تلخيصًا أو شرحًا أو مساعدة في صياغة الردود والمحتوى.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="border-y border-[#e7ece8] bg-white px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-semibold text-[#183b2b]">أسئلة شائعة</h2>
          <div className="mt-6 divide-y divide-[#e7ece8]">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group py-5">
                <summary className="cursor-pointer list-none font-semibold text-[#294b39] marker:hidden">
                  {question}
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-8 text-[#64736a]">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-[#718077] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>ثنارة AI — ذكاء اصطناعي عربي للمحادثة وإدارة المعرفة.</p>
        <a href="/login" className="text-[#345344] hover:underline">
          الدخول إلى مساحة العمل
        </a>
      </footer>
    </main>
  );
}