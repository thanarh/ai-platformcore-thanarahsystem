import type { Metadata } from 'next';
import AuthenticatedHomeRedirect from '@/components/AuthenticatedHomeRedirect';
import { ThanarahLandingPage } from '@/components/landing/ThanarahLandingPage';
import { siteUrl } from '@/lib/site';

const description =
  'ثنارة منصة ذكاء اصطناعي عربية تجمع المحادثة والبحث في قاعدة المعرفة لمساعدتك على الوصول إلى المعلومات وصياغة الردود.';

export const metadata: Metadata = {
  title: 'ذكاء اصطناعي عربي للمحادثة وإدارة المعرفة',
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'ar_SA',
    title: 'ثنارة AI | ذكاء اصطناعي عربي للمحادثة والمعرفة',
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ثنارة AI | ذكاء اصطناعي عربي للمحادثة والمعرفة',
    description,
  },
};

const homeSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#application`,
      name: 'Thanarah AI',
      alternateName: 'ثنارة للذكاء الاصطناعي',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: ['ar', 'en'],
      url: siteUrl,
      description,
      featureList: [
        'محادثة باللغة العربية والإنجليزية',
        'البحث في قاعدة المعرفة',
        'صياغة الردود والمحتوى',
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <AuthenticatedHomeRedirect />
      <ThanarahLandingPage />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homeSchema).replace(/</g, '\\u003c'),
        }}
      />
    </>
  );
}