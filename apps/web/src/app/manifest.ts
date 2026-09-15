import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Thanarah AI | ثنارة للذكاء الاصطناعي',
    short_name: 'Thanarah AI',
    description: 'منصة ذكاء اصطناعي عربية للمحادثة وإدارة المعرفة.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f5f3',
    theme_color: '#174d3e',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      {
        src: '/favicon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
