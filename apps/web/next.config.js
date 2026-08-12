/** @type {import('next').NextConfig} */

const nextConfig = {
  // Allow Replit proxy and local dev origins
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '*.replit.dev',
    '*.repl.co',
    '*.archer.replit.dev',
    '*.replit.app',
    process.env.REPLIT_DEV_DOMAIN,
  ].filter(Boolean),

  // Proxy /api/* calls to NestJS backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },

  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
