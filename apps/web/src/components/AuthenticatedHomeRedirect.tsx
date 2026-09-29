'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function AuthenticatedHomeRedirect() {
  const router = useRouter();
  const { token, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && token) router.replace('/chat');
  }, [token, _hasHydrated, router]);

  return null;
}