'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { authApi, conversationsApi } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import NotificationCenter from '@/components/NotificationCenter';
import EmbeddedEntry from '@/components/EmbeddedEntry';
import { getEmbeddedBrowserContext } from '@/store/auth';
import { useEmbeddedRouter } from '@/lib/embedded-navigation';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useEmbeddedRouter();
  const { token, user, _hasHydrated, setHasHydrated, setUser } = useAuthStore();
  const { setConversations, setSidebar } = useChatStore();
  const [embedded, setEmbedded] = useState<{ id: string; origin?: string } | null>(
    () => getEmbeddedBrowserContext(),
  );

  useEffect(() => {
    setSidebar(window.matchMedia('(min-width: 1024px)').matches);
  }, [setSidebar]);

  useEffect(() => {
    if (!embedded) return;
    const handleEmbeddedLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const targetUrl = new URL(anchor.href, window.location.href);
      if (targetUrl.origin !== window.location.origin || !targetUrl.pathname.startsWith('/')) return;
      if (targetUrl.pathname.startsWith(`/embed/${embedded.id}`)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      targetUrl.pathname = `/embed/${embedded.id}${targetUrl.pathname}`;
      if (embedded.origin) targetUrl.searchParams.set('origin', embedded.origin);
      window.location.assign(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
    };
    document.addEventListener('click', handleEmbeddedLink, true);
    return () => document.removeEventListener('click', handleEmbeddedLink, true);
  }, [embedded]);

  useEffect(() => {
    let active = true;
    Promise.resolve(useAuthStore.persist.rehydrate()).finally(() => {
      if (active) setHasHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [setHasHydrated]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) {
      if (!embedded) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      }
      return;
    }
    Promise.all([
      authApi.me().then(setUser),
      conversationsApi.list().then(setConversations),
    ]).catch(() => {});
  }, [_hasHydrated, embedded, router, setConversations, setUser, token]);

  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f5f3]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-thanarah-600 border-t-transparent" />
      </div>
    );
  }

  if (embedded && (!token || !user?.isEmbedded || user.embeddedIntegrationId?.toLowerCase() !== embedded.id.toLowerCase())) {
    return <EmbeddedEntry integrationId={embedded.id} origin={embedded.origin || ''} />;
  }

  if (!token) {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f3] px-6 text-center"
        dir="rtl"
      >
        <p className="font-arabic text-sm text-[#46535d]">يلزم تسجيل الدخول لفتح المحادثات.</p>
        <Link
          href="/login"
          className="font-arabic rounded-xl bg-thanarah-700 px-4 py-2 text-sm text-white hover:bg-thanarah-600"
        >
          الانتقال إلى تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div className="app-viewport flex overflow-hidden bg-[#f5f5f3]">
      <NotificationCenter />
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}