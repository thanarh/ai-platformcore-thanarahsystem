'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getEmbeddedBrowserContext } from '@/store/auth';

export function embeddedPath(href: string) {
  const context = getEmbeddedBrowserContext();
  if (!context || !href.startsWith('/') || href.startsWith('//')) return href;
  if (href.startsWith(`/embed/${context.id}`)) return href;
  const [path, hash] = href.split('#', 2);
  const [pathname, query] = path.split('?', 2);
  const url = new URLSearchParams(query || '');
  if (context.origin) url.set('origin', context.origin);
  return `/embed/${context.id}${pathname}${url.size ? `?${url}` : ''}${hash ? `#${hash}` : ''}`;
}

export function useEmbeddedRouter() {
  const router = useRouter();
  const push = useCallback(
    (href: string, options?: Parameters<typeof router.push>[1]) => router.push(embeddedPath(href), options),
    [router],
  );
  const replace = useCallback(
    (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(embeddedPath(href), options),
    [router],
  );

  return useMemo(() => ({ ...router, push, replace }), [router, push, replace]);
}
