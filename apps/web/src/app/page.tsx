'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function HomePage() {
  const router = useRouter();
  const { token } = useAuthStore();

  useEffect(() => {
    if (token) {
      router.replace('/chat');
    } else {
      router.replace('/login');
    }
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f3]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-arabic">جارٍ التحميل...</p>
      </div>
    </div>
  );
}
