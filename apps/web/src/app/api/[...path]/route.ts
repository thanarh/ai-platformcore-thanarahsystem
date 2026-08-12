/**
 * Next.js API proxy — forwards all /api/* requests to the NestJS backend.
 * This is a fallback; primary routing is handled by next.config.js rewrites.
 * Next.js 16+: params is a Promise and must be awaited.
 */
import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_API_URL || 'http://localhost:3001';

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
) {
  const { path: pathParts } = await params;
  const path = pathParts.join('/');
  const url = new URL(request.url);
  const targetUrl = `${API_BASE}/api/${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.arrayBuffer()
          : undefined,
      // @ts-ignore — duplex required for streaming bodies
      duplex: 'half',
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'API service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  return proxyRequest(req, params);
}
export async function POST(req: NextRequest, { params }: RouteContext) {
  return proxyRequest(req, params);
}
export async function PUT(req: NextRequest, { params }: RouteContext) {
  return proxyRequest(req, params);
}
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  return proxyRequest(req, params);
}
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return proxyRequest(req, params);
}
