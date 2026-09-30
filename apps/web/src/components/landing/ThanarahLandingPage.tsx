import Image from 'next/image';
import Link from 'next/link';
import { ThanarahLogoFull } from '@/components/ThanarahLogo';
import { LandingAuthButton, LandingAuthProvider } from './LandingAuthProvider';
import styles from './thanarah-landing.module.css';

type MarkName = 'people' | 'shield' | 'file' | 'spark' | 'heart' | 'building' | 'cap' | 'landmark';

const features: { icon: MarkName; title: string; copy: string }[] = [
  {
    icon: 'people',
    title: 'تعاون بين الفرق',
    copy: 'مساحة عمل تجمع فريقك وتساعده على إنجاز المهام بكفاءة.',
  },
  {
    icon: 'shield',
    title: 'أمان وخصوصية',
    copy: 'بياناتك ومعارفك محمية، وتبقى دائمًا تحت سيطرتك.',
  },
  {
    icon: 'file',
    title: 'مستندات متعددة',
    copy: 'ارفع ملفات PDF وWord واجعلها جاهزة للبحث.',
  },
  {
    icon: 'spark',
    title: 'محادثة ذكية',
    copy: 'إجابات دقيقة مدعومة بمصادر من قاعدة معرفتك.',
  },
];

const industries: { icon: MarkName; title: string; copy: string }[] = [
  { icon: 'heart', title: 'القطاع الصحي', copy: 'مساعدة الفرق الصحية على تنظيم المعرفة وتقديم رعاية أفضل.' },
  { icon: 'building', title: 'الشركات', copy: 'إدارة المعرفة المؤسسية ومشاركتها بين فرق العمل.' },
  { icon: 'cap', title: 'التعليم', copy: 'مساعدة المعلمين والطلاب على الوصول إلى المعرفة.' },
  { icon: 'landmark', title: 'الجهات الحكومية', copy: 'الوصول إلى المعلومات والخدمات بكفاءة وسرعة.' },
];

const metrics = [
  { value: '+50', label: 'فريقًا يعمل بذكاء' },
  { value: '+500', label: 'مؤسسة تستخدم ثنارة' },
  { value: '+900', label: 'ملف تم معالجته' },
  { value: '+10,000', label: 'سؤال يوميًا' },
];

function Mark({ name }: { name: MarkName }) {
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
    case 'landmark':
      return <svg {...common}><path d="M4 20h16M6 20V9h12v11M4 9l8-6 8 6M9 12v2m3-2v2m3-2v2" /></svg>;
  }
}

function CheckMark() {
  return <span className={styles.check} aria-hidden="true">✓</span>;
}

export function ThanarahLandingPage() {
  return (
    <LandingAuthProvider>
    <main className={`${styles.page} font-arabic`} dir="rtl" lang="ar">
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="التنقل الرئيسي">
          <div className={styles.auth}>
            <LandingAuthButton mode="login" className={styles.loginLink}>تسجيل الدخول</LandingAuthButton>
            <LandingAuthButton mode="register" className={styles.button}>
              ابدأ معنا مجانًا <span aria-hidden="true">←</span>
            </LandingAuthButton>
          </div>
          <div className={styles.navLinks}>
            <Link href="/">الرئيسية</Link>
            <Link href="#features">المميزات</Link>
            <Link href="#industries">القطاعات</Link>
            <Link href="#workflow">كيف تعمل</Link>
            <Link href="#about">عن ثنارة</Link>
          </div>
          <Link className={styles.logoLink} href="/" aria-label="ثنارة - الصفحة الرئيسية">
            <ThanarahLogoFull size="sm" className={styles.logo} />
          </Link>
        </nav>
      </header>

      <section className={`${styles.hero} ${styles.wrap}`} id="about" aria-labelledby="hero-title">
        <div className={styles.heroArt}>
          <Image
            src="/landing/hero.png"
            alt="واجهة ثنارة للمحادثة الذكية وإدارة معرفة الفريق"
            width={1736}
            height={906}
            priority
            sizes="(max-width: 680px) 100vw, 56vw"
          />
        </div>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>منصة ثنارة للذكاء الاصطناعي</span>
          <h1 id="hero-title">معرفة مؤسستك<br />في متناول فريقك</h1>
          <p className={styles.heroCopy}>
            منصة ذكاء اصطناعي تجمع المعرفة المؤسسية، تساعدك على طرح الأسئلة، وإجابة استفساراتك،
            واستخراج المعرفة من مستنداتك بكل سهولة وسرعة.
          </p>
          <div className={styles.actions}>
            <LandingAuthButton mode="register" className={styles.button}>
              ابدأ معنا مجانًا <span aria-hidden="true">←</span>
            </LandingAuthButton>
            <LandingAuthButton mode="login" className={styles.buttonLight}>تسجيل الدخول</LandingAuthButton>
          </div>
          <div className={styles.proofPoints} aria-label="مميزات المنصة">
            <span><CheckMark /> حماية عالية</span>
            <span><CheckMark /> سهل الاستخدام</span>
            <span><CheckMark /> معرفة دقيقة</span>
          </div>
        </div>
      </section>

      <section className={styles.featuresSection} id="features" aria-labelledby="features-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>لماذا ثنارة؟</span>
            <h2 id="features-title">مميزات مصممة لفرق العمل</h2>
            <p>كل ما تحتاجه لإدارة المعرفة والتواصل مع فريقك، في مكان واحد.</p>
          </div>
          <div className={styles.featureGrid}>
            {features.map((feature) => (
              <article className={styles.featureCard} dir="rtl" key={feature.title}>
                <div className={styles.featureIcon}><Mark name={feature.icon} /></div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <LandingAuthButton mode="register" className={styles.cardLink}>
                  اكتشف المزيد <span aria-hidden="true">←</span>
                </LandingAuthButton>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.workflow} id="workflow" aria-labelledby="workflow-title">
        <div className={`${styles.wrap} ${styles.workflowGrid}`}>
          <div className={styles.workflowCopy}>
            <span className={styles.eyebrow}>من المعرفة إلى العمل</span>
            <h2 id="workflow-title">حوّل المعرفة إلى قوة عمل حقيقية</h2>
            <p>
              ثنارة تدمج مستنداتك وملفاتك في صندوق ذكي يسهل على فريقك العثور على المعلومة الصحيحة،
              وتحويلها إلى عمل واضح ومنجز.
            </p>
            <div className={styles.metrics} dir="ltr">
              {metrics.map((metric) => (
                <div className={styles.metric} dir="rtl" key={metric.value}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
          </div>
          <Image
            className={styles.flowArt}
            src="/landing/knowledge-flow.png"
            alt="تتصل ملفات المعرفة بمساعد ثنارة لتقديم إجابات واضحة"
            width={2106}
            height={747}
            sizes="(max-width: 680px) 100vw, 56vw"
          />
        </div>
      </section>

      <section className={styles.industriesSection} id="industries" aria-labelledby="industries-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>من نخدم؟</span>
            <h2 id="industries-title">ثنارة في مختلف المجالات</h2>
            <p>ذكاء يواكب احتياجات الفرق، ويلائم احتياجات مؤسستك.</p>
          </div>
          <div className={styles.industryGrid}>
            {industries.map((industry) => (
              <article className={styles.industryCard} dir="rtl" key={industry.title}>
                <div className={styles.featureIcon}><Mark name={industry.icon} /></div>
                <h3>{industry.title}</h3>
                <p>{industry.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.testimonial} aria-label="آراء العملاء">
        <Image
          className={styles.testimonialImage}
          src="/landing/testimonial-scene.png"
          alt=""
          fill
          sizes="100vw"
          aria-hidden="true"
        />
        <div className={styles.testimonialVeil} aria-hidden="true" />
        <div className={styles.testimonialInner} dir="ltr">
          <blockquote className={styles.quote} dir="rtl">
            <div className={styles.quoteMark} aria-hidden="true">”</div>
            <p>ساعدتنا ثنارة في الوصول إلى معلوماتنا بسرعة ووفرت علينا الكثير من الوقت، فأصبح فريقنا أكثر كفاءة.</p>
            <cite>— فريق العمل في إحدى المؤسسات</cite>
          </blockquote>
          <div className={styles.trustStat} dir="rtl">
            <span className={styles.eyebrow}>ثقة مؤسساتنا</span>
            <h2>فرق أكثر إنتاجية<br />بمعرفة موثوقة</h2>
            <strong>98%</strong>
            <p>من الفرق وجدت سهولة في الوصول إلى المعرفة.</p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footerMain} dir="ltr">
            <div className={styles.footerBrand} dir="rtl">
              <Link href="/" aria-label="ثنارة - الصفحة الرئيسية">
                <ThanarahLogoFull size="sm" className={styles.footerLogo} />
              </Link>
              <p>منصة عربية لإدارة المعرفة والمحادثة الذكية، تساعد فريقك على العمل بوضوح وكفاءة.</p>
            </div>
            <div className={styles.footerColumn} dir="rtl">
              <h3>المنتج</h3>
              <div className={styles.footerLinks}>
                <Link href="#features">المميزات</Link>
                <Link href="#workflow">كيف تعمل</Link>
                <Link href="#industries">القطاعات</Link>
                <LandingAuthButton mode="register">ابدأ الآن</LandingAuthButton>
              </div>
            </div>
            <div className={styles.footerColumn} dir="rtl">
              <h3>الموارد</h3>
              <div className={styles.footerLinks}>
                <Link href="#workflow">المعرفة</Link>
                <Link href="#features">مميزات المنصة</Link>
                <Link href="#industries">مجالات الاستخدام</Link>
              </div>
            </div>
            <div className={styles.footerColumn} dir="rtl">
              <h3>الشركة</h3>
              <div className={styles.footerLinks}>
                <Link href="#about">عن ثنارة</Link>
                <Link href="#about">تعرّف على ثنارة</Link>
              </div>
            </div>
            <div className={styles.footerCta} dir="rtl">
              <h3>ابدأ رحلتك مع ثنارة</h3>
              <p>اجمع معرفة فريقك، واجعل الوصول إليها أسهل وأسرع.</p>
              <LandingAuthButton mode="register" className={styles.footerButton}>
                ابدأ معنا مجانًا <span aria-hidden="true">←</span>
              </LandingAuthButton>
            </div>
          </div>
          <div className={styles.footerBottom} dir="ltr">
            <span dir="rtl">© ثنارة 2025. جميع الحقوق محفوظة.</span>
            <nav aria-label="روابط الصفحة">
              <Link href="#about">العربية</Link>
              <Link href="#features">المميزات</Link>
              <Link href="#workflow">كيف تعمل</Link>
              <LandingAuthButton mode="login">تسجيل الدخول</LandingAuthButton>
            </nav>
          </div>
        </div>
      </footer>
    </main>
    </LandingAuthProvider>
  );
}

export default ThanarahLandingPage;