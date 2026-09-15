import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  'https://thanarah-ai.onrender.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Thanarah AI',
  title: {
    default: 'Thanarah AI | ثنارة للذكاء الاصطناعي',
    template: '%s | Thanarah AI',
  },
  description:
    'منصة ثنارة للذكاء الاصطناعي: محادثة عربية، قاعدة معرفة، وذكاء اصطناعي محلي وآمن.',
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
  alternates: { canonical: '/' },
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
    url: '/',
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
  themeColor: '#174d3e',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Thanarah AI',
    alternateName: 'ثنارة للذكاء الاصطناعي',
    url: siteUrl,
    logo: new URL('/icon-512.png', siteUrl).toString(),
  };

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
