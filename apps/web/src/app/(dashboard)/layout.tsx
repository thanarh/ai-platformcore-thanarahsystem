'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { authApi, conversationsApi } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, _hasHydrated, setHasHydrated, setUser } = useAuthStore();
  const { setConversations, sidebarOpen, setSidebar } = useChatStore();

  useEffect(() => {
    setSidebar(window.matchMedia('(min-width: 1024px)').matches);
  }, [setSidebar]);

  useEffect(() => {
    let active = true;
    Promise.resolve(useAuthStore.persist.rehydrate()).finally(() => {
      if (active) setHasHydrated(true);
    });
    return () => { active = false; };
  }, [setHasHydrated]);

  useEffect(() => {
    // Wait for Zustand to rehydrate from localStorage before deciding
    if (!_hasHydrated) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    Promise.all([
      authApi.me().then(setUser),
      conversationsApi.list().then(setConversations),
    ]).catch(() => {});
  }, [token, _hasHydrated, router, setConversations, setUser]);

  // Show nothing while store is rehydrating (avoids flash redirect)
  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f5f3]">
        <div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="app-viewport flex bg-[#f5f5f3] overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
