'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { conversationsApi } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token } = useAuthStore();
  const { setConversations, sidebarOpen } = useChatStore();

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    conversationsApi.list().then(setConversations).catch(() => {});
  }, [token]);

  if (!token) return null;

  return (
    <div className="flex h-screen bg-[#f5f5f3] overflow-hidden">
      <Sidebar />
      <main
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
        style={{ marginRight: sidebarOpen ? undefined : undefined }}
      >
        {children}
      </main>
    </div>
  );
}
