'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { conversationsApi } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, _hasHydrated } = useAuthStore();
  const { setConversations, sidebarOpen } = useChatStore();

  useEffect(() => {
    // Wait for Zustand to rehydrate from localStorage before deciding
    if (!_hasHydrated) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    conversationsApi.list().then(setConversations).catch(() => {});
  }, [token, _hasHydrated]);

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
    <div className="flex h-screen bg-[#f5f5f3] overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
