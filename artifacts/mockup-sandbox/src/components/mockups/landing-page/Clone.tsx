import './_group.css';

const features = [
  {
    icon: 'people',
    title: 'تعاون بين الفرق',
    copy: 'مساحة عمل تجمع فريقك وتساعده على إنجاز المهام بكفاءة.',
    link: 'اكتشف المزيد',
  },
  {
    icon: 'shield',
    title: 'أمان وخصوصية',
    copy: 'بياناتك ومعارفك محمية، وتبقى دائمًا تحت سيطرتك.',
    link: 'اكتشف المزيد',
  },
  {
    icon: 'file',
    title: 'مستندات متعددة',
    copy: 'ارفع ملفات PDF وWord واجعلها جاهزة للبحث.',
    link: 'اكتشف المزيد',
  },
  {
    icon: 'spark',
    title: 'محادثة ذكية',
    copy: 'إجابات دقيقة مدعومة بمصادر من قاعدة معرفتك.',
    link: 'اكتشف المزيد',
  },
];

const industries = [
  { icon: 'heart', title: 'القطاع الصحي', copy: 'مساعدة الفرق الصحية على تنظيم المعرفة وتقديم رعاية أفضل.' },
  { icon: 'building', title: 'الشركات', copy: 'إدارة المعرفة المؤسسية ومشاركتها بين فرق العمل.' },
  { icon: 'cap', title: 'التعليم', copy: 'مساعدة المعلمين والطلاب على الوصول إلى المعرفة.' },
  { icon: 'landmark', title: 'الجهات الحكومية', copy: 'الوصول إلى المعلومات والخدمات بكفاءة وسرعة.' },
];

function Mark({ name }: { name: string }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'people':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5a5.5 5.5 0 0 1 11 0V19zM16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V19h-3" /></svg>;
    case 'shield':
      return <svg {...common}><path d="M12 3 19 6v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'file':
      return <svg {...common}><path d="M6 3.5h8l4 4V21H6z" /><path d="M14 3.5v5h4M9 13h6M9 17h6" /></svg>;
    case 'spark':
      return <svg {...common}><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></svg>;
    case 'heart':
      return <svg {...common}><path d="M20.5 8.8c0 4.2-8.5 10-8.5 10s-8.5-5.8-8.5-10a4.5 4.5 0 0 1 8.5-2.1 4.5 4.5 0 0 1 8.5 2.1Z" /></svg>;
    case 'building':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M8 8h2m4 0h2M8 12h2m4 0h2M8 16h2m4 0h2M11 20v-3h2v3" /></svg>;
    case 'cap':
      return <svg {...common}><path d="m2 9 10-5 10 5-10 5zM6 11v5c3.5 3 8.5 3 12 0v-5M22 9v6" /></svg>;
    default:
      return <svg {...common}><path d="M4 20h16M6 20V9h12v11M4 9l8-6 8 6M9 12v2m3-2v2m3-2v2" /></svg>;
  }
}

export function Clone() {
  return (
    <main className="thanarah-clone font-arabic" dir="rtl" lang="ar">
      <style>{`
        .thanarah-clone {
          --tc-ink: #153c30;
          --tc-green: #174d3d;
          --tc-mid: #37745b;
          --tc-muted: #75827a;
          --tc-cream: #f8f7f1;
          --tc-card: #f0f1ec;
          --tc-line: #e7e8e1;
          background: var(--tc-cream);
          color: var(--tc-ink);
          min-height: 100vh;
          overflow: hidden;
          font-family: 'Noto Sans Arabic', Tahoma, sans-serif;
        }
        .thanarah-clone * { box-sizing: border-box; }
        .thanarah-clone a { color: inherit; text-decoration: none; }
        .thanarah-clone a:focus-visible { outline: 3px solid #92b49e; outline-offset: 4px; border-radius: 5px; }
        .tc-wrap { width: min(1140px, calc(100% - 64px)); margin-inline: auto; }
        .tc-header { height: 72px; display:flex; align-items:center; border-bottom: 1px solid rgba(43,64,53,.035); }
        .tc-nav { width:min(1260px, calc(100% - 56px)); margin:auto; display:flex; align-items:center; justify-content:space-between; gap:24px; }
        .tc-logo { display:block; width:95px; height:auto; flex:0 0 auto; }
        .tc-links { display:flex; align-items:center; gap:27px; color:#47544d; font-size:12px; font-weight:500; }
        .tc-links a, .tc-footer a { transition: color .18s ease, opacity .18s ease; }
        .tc-links a:hover, .tc-footer a:hover { color:#8aae96; }
        .tc-auth { display:flex; align-items:center; gap:9px; font-size:11px; font-weight:600; white-space:nowrap; }
        .tc-auth .tc-login { padding:10px 14px; color:#42544a; }
        .tc-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:39px; border-radius:7px; padding:0 18px; background:var(--tc-green); color:#fff !important; font-size:12px; font-weight:600; transition:transform .18s ease, background .18s ease; }
        .tc-button:hover { background:#103e31; transform:translateY(-1px); }
        .tc-button svg { width:14px; height:14px; }
        .tc-button-light { background:#fff; color:var(--tc-ink) !important; border:1px solid #e2e5de; }
        .tc-button-light:hover { background:#f1f4ef; }
        .tc-hero { display:grid; grid-template-columns: 1.08fr .92fr; align-items:center; gap:48px; min-height:436px; padding-block:43px 48px; }
        .tc-hero-art { position:relative; margin-inline-start:-20px; }
        .tc-hero-art:before { content:''; position:absolute; inset:10% 9%; border-radius:50%; background:#dfe7dd; filter:blur(36px); opacity:.46; }
        .tc-hero-art img { display:block; position:relative; width:112%; max-width:none; border-radius:20px; mix-blend-mode:multiply; }
        .tc-eyebrow { display:inline-block; color:#427158; background:#eaf0e7; border-radius:20px; padding:5px 11px; font-size:10px; font-weight:600; }
        .tc-hero h1 { margin:16px 0 13px; font-size:clamp(32px,3.15vw,47px); line-height:1.42; letter-spacing:-1.15px; font-weight:700; color:#123a2d; }
        .tc-hero-copy { max-width:470px; margin:0; color:#68766d; font-size:13px; line-height:2.15; }
        .tc-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:23px; }
        .tc-proof-points { display:flex; gap:20px; flex-wrap:wrap; margin-top:25px; color:#53645a; font-size:10px; }
        .tc-proof-points span { display:flex; align-items:center; gap:7px; }
        .tc-check { display:inline-grid; place-items:center; width:15px; height:15px; border:1px solid #6d927d; border-radius:50%; color:#43715a; font-size:9px; }
        .tc-section { padding:40px 0 43px; }
        .tc-section-head { text-align:center; margin-bottom:23px; }
        .tc-kicker { color:#67816e; font-size:9px; font-weight:600; }
        .tc-section h2 { margin:5px 0 7px; font-size:25px; line-height:1.5; font-weight:700; letter-spacing:-.4px; color:#173d30; }
        .tc-section-head p { margin:0; color:#7a857d; font-size:11px; }
        .tc-feature-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:13px; direction:ltr; }
        .tc-feature { min-height:151px; padding:18px 18px 15px; border-radius:8px; background:#f0f1ec; direction:rtl; transition:transform .2s ease, background .2s ease; }
        .tc-feature:hover, .tc-industry:hover { transform:translateY(-3px); background:#e9eee7; }
        .tc-feature-icon { display:grid; place-items:center; width:27px; height:27px; color:#234b3c; margin-bottom:9px; }
        .tc-feature h3 { margin:0 0 5px; color:#18382c; font-size:13px; font-weight:700; }
        .tc-feature p { min-height:38px; margin:0; color:#79847c; font-size:9px; line-height:1.8; }
        .tc-feature a { display:inline-flex; margin-top:9px; color:#55725f; font-size:9px; }
        .tc-feature a:hover { color:#183d30; text-decoration:underline; }
        .tc-work { border-block:1px solid #edeee8; background:#f4f4ee; padding:31px 0 30px; }
        .tc-work-grid { display:grid; grid-template-columns:.9fr 1.1fr; align-items:center; gap:36px; direction:ltr; }
        .tc-work-copy { direction:rtl; }
        .tc-work-copy h2 { max-width:390px; margin:10px 0 11px; font-size:27px; line-height:1.48; }
        .tc-work-copy p { max-width:390px; margin:0; color:#718078; font-size:11px; line-height:2; }
        .tc-metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; max-width:450px; margin-top:23px; direction:ltr; }
        .tc-metric { direction:rtl; text-align:center; }
        .tc-metric strong { display:block; color:#184a37; font-size:19px; line-height:1.35; font-weight:700; }
        .tc-metric span { display:block; margin-top:3px; color:#7a857d; font-size:8px; }
        .tc-flow-art { width:100%; display:block; mix-blend-mode:multiply; border-radius:12px; }
        .tc-industries { padding:34px 0 39px; }
        .tc-industries .tc-section-head { margin-bottom:19px; }
        .tc-industries h2 { font-size:25px; }
        .tc-industry-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:13px; direction:ltr; }
        .tc-industry { min-height:124px; text-align:center; padding:15px 17px 13px; border-radius:7px; background:#f0f1ec; direction:rtl; transition:transform .2s ease, background .2s ease; }
        .tc-industry .tc-feature-icon { margin:0 auto 6px; }
        .tc-industry h3 { margin:0 0 5px; font-size:12px; }
        .tc-industry p { margin:0; color:#7a857d; font-size:9px; line-height:1.8; }
        .tc-testimonial { position:relative; min-height:184px; display:flex; align-items:center; padding:22px 0; background:#eae7dc url('/__mockup/images/thanarah-testimonial-scene.png') center 55% / cover no-repeat; }
        .tc-testimonial:before { content:''; position:absolute; inset:0; background:linear-gradient(90deg,rgba(249,247,238,.12),rgba(249,247,238,.26) 48%,rgba(249,247,238,.42)); }
        .tc-testimonial-inner { position:relative; width:min(1140px,calc(100% - 64px)); margin:auto; display:grid; grid-template-columns:1.08fr .92fr; align-items:center; gap:35px; direction:ltr; }
        .tc-quote, .tc-stat { direction:rtl; }
        .tc-quote { max-width:500px; padding:17px 21px 15px; background:rgba(250,249,244,.9); border:1px solid rgba(218,221,211,.82); border-radius:8px; box-shadow:0 12px 30px rgba(30,55,42,.08); }
        .tc-quote-mark { color:#183e30; font-family:Georgia,serif; font-size:36px; line-height:.8; }
        .tc-quote p { margin:4px 0 9px; color:#34453b; font-size:13px; line-height:1.9; font-weight:600; }
        .tc-quote small { color:#7b867d; font-size:9px; }
        .tc-stat { text-align:center; justify-self:center; }
        .tc-stat .tc-eyebrow { background:rgba(250,249,244,.62); }
        .tc-stat h2 { margin:7px 0 0; color:#18392e; font-size:19px; line-height:1.55; }
        .tc-stat strong { display:block; margin:0; color:#173e30; font-size:38px; line-height:1.3; }
        .tc-stat p { margin:0; color:#66746b; font-size:9px; }
        .tc-footer { background:#102d24; color:#e7eee7; padding:27px 0 14px; }
        .tc-footer-main { display:grid; grid-template-columns:1.45fr .85fr .85fr .95fr 1.15fr; gap:35px; padding-bottom:22px; direction:ltr; }
        .tc-footer-main > * { direction:rtl; }
        .tc-footer-logo { width:88px; height:auto; display:block; filter:brightness(0) invert(1); }
        .tc-footer-brand p { max-width:220px; color:#b7c4bb; font-size:9px; line-height:1.9; }
        .tc-socials { display:flex; gap:7px; margin-top:12px; }
        .tc-socials span { width:20px; height:20px; display:grid; place-items:center; border:1px solid rgba(238,245,237,.34); border-radius:50%; font-size:9px; color:#f2f5ef; }
        .tc-footer h3 { margin:4px 0 11px; color:#f0f3ed; font-size:10px; font-weight:700; }
        .tc-footer-links { display:grid; gap:8px; color:#b8c6bc; font-size:9px; }
        .tc-footer-news p { margin:0 0 8px; color:#b8c6bc; font-size:9px; line-height:1.8; }
        .tc-news-button { display:flex; align-items:center; justify-content:center; width:100%; min-height:34px; margin-top:8px; border:0; border-radius:5px; background:#1b5540; color:#fff !important; font:inherit; font-size:9px; cursor:pointer; }
        .tc-news-button:hover { background:#27684f; }
        .tc-footer-bottom { display:flex; justify-content:space-between; gap:20px; padding-top:11px; border-top:1px solid rgba(237,244,236,.12); color:#98aaa0; font-size:8px; direction:ltr; }
        .tc-footer-bottom > * { direction:rtl; }
        .tc-footer-bottom nav { display:flex; gap:15px; flex-wrap:wrap; }
        @media (min-width: 1400px) {
          .tc-hero { min-height:495px; }
          .tc-section { padding-block:54px; }
          .tc-work { padding-block:45px; }
          .tc-industries { padding-block:45px; }
          .tc-testimonial { min-height:215px; }
        }
        @media (max-width: 850px) {
          .tc-wrap { width:min(100% - 40px, 680px); }
          .tc-nav { width:calc(100% - 36px); }
          .tc-links { gap:14px; font-size:10px; }
          .tc-hero { gap:20px; min-height:370px; }
          .tc-hero h1 { font-size:34px; }
          .tc-hero-art { margin-inline-start:-6px; }
          .tc-hero-art img { width:108%; }
          .tc-feature-grid, .tc-industry-grid { gap:9px; }
          .tc-feature { padding:15px 12px; }
          .tc-footer-main { gap:22px; }
        }
        @media (max-width: 620px) {
          .tc-header { height:62px; }
          .tc-nav { width:calc(100% - 30px); }
          .tc-logo { width:79px; }
          .tc-links { display:none; }
          .tc-auth { gap:3px; font-size:10px; }
          .tc-auth .tc-login { padding:8px 9px; }
          .tc-button { min-height:36px; padding-inline:13px; font-size:10px; }
          .tc-wrap { width:calc(100% - 34px); }
          .tc-hero { display:flex; flex-direction:column; gap:16px; padding:35px 0 28px; text-align:center; }
          .tc-hero-copy { margin-inline:auto; font-size:12px; }
          .tc-hero h1 { margin-top:13px; font-size:31px; line-height:1.52; }
          .tc-actions, .tc-proof-points { justify-content:center; }
          .tc-proof-points { gap:11px; font-size:9px; margin-top:18px; }
          .tc-hero-art { width:100%; order:2; margin:0; }
          .tc-hero-art img { width:100%; border-radius:13px; }
          .tc-section { padding:32px 0; }
          .tc-section h2 { font-size:22px; }
          .tc-feature-grid, .tc-industry-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
          .tc-feature { min-height:145px; padding:15px 14px 13px; }
          .tc-feature p { min-height:35px; }
          .tc-work { padding:30px 0; }
          .tc-work-grid { grid-template-columns:1fr; gap:18px; text-align:center; }
          .tc-work-copy h2, .tc-work-copy p { margin-inline:auto; }
          .tc-work-copy h2 { font-size:24px; }
          .tc-metrics { margin-inline:auto; gap:8px; }
          .tc-metric strong { font-size:17px; }
          .tc-flow-art { border-radius:8px; }
          .tc-industries { padding-block:30px; }
          .tc-industry { min-height:129px; padding:13px 12px; }
          .tc-testimonial { min-height:280px; background-position:center; }
          .tc-testimonial:before { background:rgba(249,247,238,.48); }
          .tc-testimonial-inner { width:calc(100% - 34px); grid-template-columns:1fr; gap:17px; }
          .tc-quote { order:2; margin-inline:auto; padding:14px 17px; }
          .tc-quote p { font-size:12px; }
          .tc-stat { order:1; }
          .tc-stat h2 { font-size:17px; }
          .tc-stat strong { font-size:34px; }
          .tc-footer { padding-top:25px; }
          .tc-footer-main { grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px 28px; padding-bottom:19px; }
          .tc-footer-brand { grid-column:1/-1; }
          .tc-footer-brand p { max-width:280px; }
          .tc-footer-news { grid-column:1/-1; }
          .tc-footer-bottom { flex-direction:column; align-items:flex-start; gap:11px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .thanarah-clone *, .thanarah-clone *::before, .thanarah-clone *::after { scroll-behavior:auto !important; transition:none !important; }
        }
      `}</style>
      <header className="tc-header">
        <nav className="tc-nav" aria-label="التنقل الرئيسي">
          <a href="/" aria-label="ثنارة - الصفحة الرئيسية">
            <img className="tc-logo" src="/__mockup/images/thanarah-logo.png" alt="ثنارة" />
          </a>
          <div className="tc-links">
            <a href="/">الرئيسية</a>
            <a href="#features">المميزات</a>
            <a href="#industries">القطاعات</a>
            <a href="#workflow">كيف تعمل</a>
            <a href="#about">عن ثنارة</a>
          </div>
          <div className="tc-auth">
            <a className="tc-login" href="/login">تسجيل الدخول</a>
            <a className="tc-button" href="/register">ابدأ معنا مجانًا <span aria-hidden="true">←</span></a>
          </div>
        </nav>
      </header>

      <section className="tc-hero tc-wrap" id="about">
        <div>
          <span className="tc-eyebrow">منصة ثنارة للذكاء الاصطناعي</span>
          <h1>معرفة مؤسستك<br />في متناول فريقك</h1>
          <p className="tc-hero-copy">منصة ذكاء اصطناعي تجمع المعرفة المؤسسية، تساعدك على طرح الأسئلة، وإجابة استفساراتك، واستخراج المعرفة من مستنداتك بكل سهولة وسرعة.</p>
          <div className="tc-actions">
            <a className="tc-button" href="/register">ابدأ معنا مجانًا <span aria-hidden="true">←</span></a>
            <a className="tc-button tc-button-light" href="/login">تسجيل الدخول</a>
          </div>
          <div className="tc-proof-points" aria-label="مميزات المنصة">
            <span><i className="tc-check">✓</i> حماية عالية</span>
            <span><i className="tc-check">✓</i> سهل الاستخدام</span>
            <span><i className="tc-check">✓</i> معرفة دقيقة</span>
          </div>
        </div>
        <div className="tc-hero-art">
          <img src="/__mockup/images/thanarah-hero.png" alt="واجهة ثنارة للمحادثة الذكية وإدارة معرفة الفريق" />
        </div>
      </section>

      <section className="tc-section" id="features">
        <div className="tc-wrap">
          <div className="tc-section-head">
            <span className="tc-kicker">لماذا ثنارة؟</span>
            <h2>مميزات مصممة لفرق العمل</h2>
            <p>كل ما تحتاجه لإدارة المعرفة والتواصل مع فريقك، في مكان واحد.</p>
          </div>
          <div className="tc-feature-grid">
            {features.map((feature) => (
              <article className="tc-feature" key={feature.title}>
                <div className="tc-feature-icon"><Mark name={feature.icon} /></div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <a href="/register">{feature.link} <span aria-hidden="true">←</span></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tc-work" id="workflow">
        <div className="tc-wrap tc-work-grid">
          <div className="tc-work-copy">
            <span className="tc-eyebrow">من المعرفة إلى العمل</span>
            <h2>حوّل المعرفة إلى قوة عمل حقيقية</h2>
            <p>ثنارة تدمج مستنداتك وملفاتك في صندوق ذكي يسهل على فريقك العثور على المعلومة الصحيحة، وتحويلها إلى عمل واضح ومنجز.</p>
            <div className="tc-metrics">
              <div className="tc-metric"><strong>+10,000</strong><span>سؤال يوميًا</span></div>
              <div className="tc-metric"><strong>+900</strong><span>ملف تم معالجته</span></div>
              <div className="tc-metric"><strong>+500</strong><span>مؤسسة تستخدم ثنارة</span></div>
              <div className="tc-metric"><strong>+50</strong><span>فريقًا يعمل بذكاء</span></div>
            </div>
          </div>
          <img className="tc-flow-art" src="/__mockup/images/thanarah-knowledge-flow.png" alt="تتصل ملفات المعرفة بمساعد ثنارة لتقديم إجابات واضحة" />
        </div>
      </section>

      <section className="tc-industries" id="industries">
        <div className="tc-wrap">
          <div className="tc-section-head">
            <span className="tc-kicker">من نخدم؟</span>
            <h2>ثنارة في مختلف المجالات</h2>
            <p>ذكاء يواكب احتياجات الفرق، ويلائم احتياجات مؤسستك.</p>
          </div>
          <div className="tc-industry-grid">
            {industries.map((industry) => (
              <article className="tc-industry" key={industry.title}>
                <div className="tc-feature-icon"><Mark name={industry.icon} /></div>
                <h3>{industry.title}</h3>
                <p>{industry.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tc-testimonial" aria-label="آراء العملاء">
        <div className="tc-testimonial-inner">
          <blockquote className="tc-quote">
            <div className="tc-quote-mark" aria-hidden="true">”</div>
            <p>ساعدتنا ثنارة في الوصول إلى معلوماتنا بسرعة ووفرت علينا الكثير من الوقت، فأصبح فريقنا أكثر كفاءة.</p>
            <small>— فريق العمل في إحدى المؤسسات</small>
          </blockquote>
          <div className="tc-stat">
            <span className="tc-eyebrow">ثقة مؤسساتنا</span>
            <h2>فرق أكثر إنتاجية<br />بمعرفة موثوقة</h2>
            <strong>98%</strong>
            <p>من الفرق وجدت سهولة في الوصول إلى المعرفة.</p>
          </div>
        </div>
      </section>

      <footer className="tc-footer">
        <div className="tc-wrap">
          <div className="tc-footer-main">
            <div className="tc-footer-brand">
              <a href="/" aria-label="ثنارة - الصفحة الرئيسية"><img className="tc-footer-logo" src="/__mockup/images/thanarah-logo.png" alt="ثنارة" /></a>
              <p>منصة عربية لإدارة المعرفة والمحادثة الذكية، تساعد فريقك على العمل بوضوح وكفاءة.</p>
              <div className="tc-socials" aria-hidden="true">
                <span>in</span><span>x</span><span>▶</span><span>◎</span>
              </div>
            </div>
            <div>
              <h3>المنتج</h3>
              <div className="tc-footer-links"><a href="#features">المميزات</a><a href="#workflow">كيف تعمل</a><a href="#industries">القطاعات</a><a href="/register">ابدأ الآن</a></div>
            </div>
            <div>
              <h3>الموارد</h3>
              <div className="tc-footer-links"><a href="#workflow">المعرفة</a><a href="#features">المميزات</a><a href="/login">مساحة العمل</a><a href="/register">إنشاء حساب</a></div>
            </div>
            <div>
              <h3>الشركة</h3>
              <div className="tc-footer-links"><a href="#about">عن ثنارة</a><a href="#industries">القطاعات</a><a href="/login">تسجيل الدخول</a><a href="/register">إنشاء حساب</a></div>
            </div>
            <div className="tc-footer-news" id="footer">
              <h3>ابدأ مع ثنارة</h3>
              <p>أنشئ حسابك وابدأ العمل مع معرفة فريقك.</p>
              <a className="tc-news-button" href="/register">إنشاء حساب <span aria-hidden="true">←</span></a>
            </div>
          </div>
          <div className="tc-footer-bottom">
            <span>© ثنارة 2026. جميع الحقوق محفوظة.</span>
            <nav aria-label="روابط الصفحة"><a href="#features">المميزات</a><a href="#workflow">كيف تعمل</a><a href="#industries">القطاعات</a><a href="#about">العربية ⌄</a></nav>
          </div>
        </div>
      </footer>
    </main>
  );
}