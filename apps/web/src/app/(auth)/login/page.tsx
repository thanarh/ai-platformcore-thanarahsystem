'use client';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { ThanarahLogoFull, ThanarahIcon } from '@/components/ThanarahLogo';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="app-viewport min-h-[100dvh] bg-[#f5f5f3] flex items-start sm:items-center justify-center px-4 py-6 safe-area-y overflow-y-auto">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <ThanarahLogoFull size="lg" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-8 animate-message-in">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1 font-arabic" dir="rtl">
              تسجيل الدخول
            </h1>
            <p className="text-sm text-gray-500" dir="rtl">
              مرحباً بك في ثنارة AI
            </p>
          </div>

          <LoginForm />

          <div className="mt-6 text-center" dir="rtl">
            <p className="text-sm text-gray-500 font-arabic">
              ليس لديك حساب؟{' '}
              <Link href="/register" className="text-thanarah-600 hover:underline font-medium">
                إنشاء حساب
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 font-arabic" dir="rtl">
          © {new Date().getFullYear()} ثنارة AI — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
