'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function RootPage() {
  const router = useRouter();
  const { token, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (!_hasHydrated) return;
    router.replace(token ? '/chat' : '/login');
  }, [token, _hasHydrated, router]);

  // Spinner while hydrating
  return (
    <div className="flex h-screen items-center justify-center bg-[#f5f5f3]">
      <div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
