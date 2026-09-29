import type { Metadata, Viewport } from 'next';
import './globals.css';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Thanarah AI',
  title: {
    default: 'Thanarah AI | ثنارة للذكاء الاصطناعي',
    template: '%s | ثنارة AI',
  },
  description:
    'ثنارة منصة ذكاء اصطناعي عربية للمحادثة والبحث في قاعدة المعرفة وصياغة الردود.',
  keywords: [
    'Thanarah AI',
    'ثنارة',
    'ذكاء اصطناعي عربي',
    'مساعد ذكي',
    'قاعدة معرفة',
  ],
  authors: [{ name: 'Thanarah AI' }],
  creator: 'Thanarah AI',
  publisher: 'Thanarah AI',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon.ico'],
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    alternateLocale: 'en_US',
    siteName: 'Thanarah AI',
    title: 'Thanarah AI | ثنارة للذكاء الاصطناعي',
    description:
      'منصة ذكاء اصطناعي عربية للمحادثة، إدارة المعرفة، والأتمتة الذكية.',
    images: [
      {
        url: '/thanarah-logo.png',
        width: 888,
        height: 456,
        alt: 'شعار Thanarah AI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Thanarah AI | ثنارة للذكاء الاصطناعي',
    description: 'منصة ذكاء اصطناعي عربية للمحادثة وإدارة المعرفة.',
    images: ['/thanarah-logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#174d3e',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'Thanarah AI',
        alternateName: 'ثنارة للذكاء الاصطناعي',
        url: siteUrl,
        logo: new URL('/icon-512.png', siteUrl).toString(),
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'Thanarah AI',
        alternateName: 'ثنارة للذكاء الاصطناعي',
        url: siteUrl,
        inLanguage: ['ar', 'en'],
        publisher: { '@id': `${siteUrl}/#organization` },
      },
    ],
  };

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
