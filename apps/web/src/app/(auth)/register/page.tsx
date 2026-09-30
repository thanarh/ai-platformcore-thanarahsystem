'use client';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { ThanarahLogoFull } from '@/components/ThanarahLogo';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <div className="app-viewport min-h-[100dvh] bg-[#f5f5f3] flex items-start sm:items-center justify-center px-4 py-6 safe-area-y overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6 sm:mb-8">
          <ThanarahLogoFull size="lg" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-8 animate-message-in">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1 font-arabic" dir="rtl">
              إنشاء حساب جديد
            </h1>
            <p className="text-sm text-gray-500" dir="rtl">ابدأ تجربتك مع ثنارة AI</p>
          </div>

          <RegisterForm />

          <div className="mt-6 text-center" dir="rtl">
            <p className="text-sm text-gray-500 font-arabic">
              لديك حساب بالفعل؟{' '}
              <Link href="/login" className="text-thanarah-600 hover:underline font-medium">تسجيل الدخول</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
