import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'حساب ثنارة AI',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
