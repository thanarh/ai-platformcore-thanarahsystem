import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_API_URL || 'http://localhost:3001';

export async function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/embed\/([a-f\d]{24})(?:\/(.*))?$/i);
  if (!match) return NextResponse.next();
  const id = match[1].toLowerCase();
  const origin = request.nextUrl.searchParams.get('origin');
  if (!origin) return new NextResponse('رابط التضمين غير مكتمل.', { status: 400 });
  let config: { id: string; allowedOrigins: string[] };
  try {
    const response = await fetch(`${API_BASE}/api/embedded/${id}/config?origin=${encodeURIComponent(origin)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return new NextResponse('الموقع غير مصرح له بتضمين ثنارة.', { status: 403 });
    config = await response.json();
  } catch {
    return new NextResponse('تعذّر التحقق من إعدادات التضمين.', { status: 503 });
  }
  if (config.id?.toLowerCase() !== id || !config.allowedOrigins?.includes(origin)) {
    return new NextResponse('الموقع غير مصرح له بتضمين ثنارة.', { status: 403 });
  }
  const target = request.nextUrl.clone();
  const internalPath = match[2] ? `/${match[2]}` : '/chat';
  target.pathname = internalPath.replace(/\/+/g, '/');
  const response = NextResponse.rewrite(target);
  response.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${origin}; object-src 'none'; base-uri 'self'`);
  response.headers.delete('X-Frame-Options');
  response.headers.set('Referrer-Policy', 'strict-origin');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/embed/:path*'],
};
