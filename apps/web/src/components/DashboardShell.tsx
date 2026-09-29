'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { authApi, conversationsApi } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import NotificationCenter from '@/components/NotificationCenter';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, _hasHydrated, setHasHydrated, setUser } = useAuthStore();
  const { setConversations, setSidebar } = useChatStore();

  useEffect(() => {
    setSidebar(window.matchMedia('(min-width: 1024px)').matches);
  }, [setSidebar]);

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
      router.replace('/login');
      return;
    }
    Promise.all([
      authApi.me().then(setUser),
      conversationsApi.list().then(setConversations),
    ]).catch(() => {});
  }, [_hasHydrated, router, setConversations, setUser, token]);

  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f5f3]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-thanarah-600 border-t-transparent" />
      </div>
    );
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