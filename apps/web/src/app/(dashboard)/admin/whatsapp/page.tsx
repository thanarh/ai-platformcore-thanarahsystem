'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Check,
  CircleDot,
  Clock3,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';

interface Readiness {
  available: boolean;
  integration: string;
  state: string;
  reason: string;
  capabilities: {
    linkSession: boolean;
    receiveMessages: boolean;
    sendMessages: boolean;
    sendMedia: boolean;
  };
}

const unavailableItems = [
  { label: 'جلسات الاتصال', icon: Smartphone },
  { label: 'الرسائل الواردة', icon: ArrowDownLeft },
  { label: 'الرسائل الصادرة', icon: ArrowUpRight },
  { label: 'جهات الاتصال', icon: Users },
];

const rolloutSteps = [
  { title: 'اعتماد حزمة الاتصال', detail: 'Baileys محجوبة حاليًا بواسطة سياسة حزم المشروع.', complete: false },
  { title: 'إنشاء اتصال آمن', detail: 'ستُتاح تهيئة الجلسة بعد اعتماد الاعتمادية وربط الخدمة.', complete: false },
  { title: 'تفعيل أدوات التشغيل', detail: 'إدارة الرسائل وجهات الاتصال ستكون متاحة بعد الاتصال.', complete: false },
];

export default function WhatsAppAdminPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const authorized = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessFailed, setReadinessFailed] = useState(false);

  useEffect(() => {
    if (hasHydrated && !authorized) router.replace('/chat');
  }, [authorized, hasHydrated, router]);

  useEffect(() => {
    if (!hasHydrated || !authorized) return;
    let cancelled = false;
    api.get<Readiness>('/admin/whatsapp/readiness')
      .then(({ data }) => {
        if (!cancelled) setReadiness(data);
      })
      .catch(() => {
        if (!cancelled) setReadinessFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authorized, hasHydrated]);

  if (!hasHydrated || !authorized) {
    return (
      <main className="flex min-h-[100dvh] flex-1 items-center justify-center bg-[#f4f7f5]" dir="rtl">
        <div className="w-full max-w-sm space-y-3 px-6" aria-label="جارٍ التحقق من الصلاحية">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-[#e2ebe6]" />
          <div className="h-24 animate-pulse rounded-2xl bg-[#e8efeb]" />
          <div className="h-40 animate-pulse rounded-2xl bg-[#e8efeb]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex-1 overflow-y-auto bg-[#f4f7f5] text-[#20332b]" dir="rtl">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
        <header className="mb-7 flex flex-col gap-5 border-b border-[#dfe8e2] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-[#71847a]">
              <span>الإدارة</span>
              <span className="text-[#b2c0b8]">/</span>
              <span>قنوات التواصل</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e1eee7] text-[#1a6849]">
                <MessageCircle className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="font-arabic text-2xl font-bold tracking-tight text-[#20332b] sm:text-[28px]">إدارة واتساب</h1>
                <p className="font-arabic mt-1 text-sm text-[#728078]">مساحة تشغيلية داخلية لقنوات واتساب في ثنارة</p>
              </div>
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e8d7af] bg-[#fbf5e8] px-3.5 py-2 font-arabic text-xs font-semibold text-[#8a6727]">
            <CircleDot className="h-3.5 w-3.5" />
            {readinessFailed
              ? 'تعذّر التحقق من الحالة'
              : readiness
                ? 'غير متصل — لم يُفعّل'
                : 'جارٍ التحقق من الجاهزية'}
          </div>
        </header>

        <section className="relative mb-6 overflow-hidden rounded-[22px] border border-[#d8e4dc] bg-[#eaf2ed] p-5 sm:p-7">
          <div className="pointer-events-none absolute -left-12 -top-16 h-64 w-64 rounded-full border border-[#cbdcd1] opacity-70" />
          <div className="pointer-events-none absolute -left-1 top-0 h-40 w-40 rounded-full border border-[#d5e2d9] opacity-80" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-[#f8e8c8] px-2.5 py-1.5 font-arabic text-[11px] font-bold text-[#876222]">
                <AlertTriangle className="h-3.5 w-3.5" />
                تنبيه الجاهزية
              </div>
              <h2 className="font-arabic text-lg font-bold text-[#263b30] sm:text-xl">لا يوجد اتصال بواتساب في الوقت الحالي</h2>
              <p className="font-arabic mt-2 max-w-2xl text-sm leading-7 text-[#607168]">
                هذه واجهة تمهيدية فقط. {readinessFailed
                  ? 'تعذّر الوصول إلى واجهة حالة التكامل.'
                  : readiness
                    ? 'اعتماد Baileys محجوب بسياسة أمان الحزم، لذلك لا توجد جلسة حية.'
                    : 'جارٍ التحقق من جاهزية خدمة واتساب.'}
                {' '}لن يتم عرض محادثات أو رسائل تجريبية، ولن تُرسل أي رسائل من هذه الصفحة.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-[#d7e3da] bg-[#f6faf7] px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e7eee9] text-[#74837a]">
                <Ban className="h-[18px] w-[18px]" />
              </div>
              <div className="font-arabic">
                <p className="text-xs font-bold text-[#45584d]">الربط غير متاح</p>
                <p className="mt-1 text-[10px] text-[#839087]">بانتظار اعتماد الاعتمادية</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="مؤشرات واتساب" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {unavailableItems.map(({ label, icon: Icon }, index) => (
            <div key={label} className="rounded-2xl border border-[#e1e9e4] bg-[#fbfcfb] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-arabic text-xs text-[#75837b]">{label}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf3ef] text-[#71877a]">
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                </span>
              </div>
              <p className="font-arabic text-sm font-semibold text-[#8a9890]">غير متاح</p>
              <p className="font-arabic mt-1 text-[10px] text-[#a0aaa4]">{index === 0 ? 'لا توجد جلسة' : 'يتطلب اتصالًا فعّالًا'}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-[20px] border border-[#e0e8e3] bg-[#fbfcfb]">
            <div className="flex items-center justify-between border-b border-[#e8eee9] px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-arabic text-sm font-bold text-[#2c4035]">حالة الاتصال</h2>
                <p className="font-arabic mt-1 text-[11px] text-[#87938b]">لن تُنشأ جلسة قبل جاهزية التكامل</p>
              </div>
              <span className="rounded-full bg-[#f5ebd8] px-2.5 py-1 font-arabic text-[10px] font-semibold text-[#8a6727]">موقوف مؤقتًا</span>
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-[1fr_180px] sm:p-6">
              <div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3eee3] text-[#927640]">
                    <ShieldCheck className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <h3 className="font-arabic text-sm font-semibold text-[#36493e]">لا توجد قناة مرتبطة</h3>
                    <p className="font-arabic mt-1.5 text-xs leading-6 text-[#7c8981]">
                      بيانات الجلسة ورمز QR غير متاحين لأن مكوّن الاتصال لم يُعتمد بعد.
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled
                    title="يتطلب اعتماد خدمة الاتصال أولًا"
                    className="font-arabic inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-[#b7c9bd] px-4 py-2.5 text-xs font-semibold text-white opacity-70"
                  >
                    <Smartphone className="h-4 w-4" />
                    ربط رقم واتساب
                  </button>
                  <button
                    type="button"
                    disabled
                    title="رمز QR غير متاح قبل تفعيل خدمة الاتصال"
                    className="font-arabic inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-[#e1e8e3] bg-[#f5f8f6] px-4 py-2.5 text-xs font-medium text-[#9aa69e]"
                  >
                    <QrCode className="h-4 w-4" />
                    عرض رمز QR
                  </button>
                </div>
              </div>
              <div className="flex min-h-[130px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9e3dc] bg-[#f4f8f5] px-3 text-center">
                <QrCode className="mb-2 h-7 w-7 text-[#a6b5aa]" strokeWidth={1.4} />
                <p className="font-arabic text-[11px] font-semibold text-[#74847a]">لا يوجد رمز اتصال</p>
                <p className="font-arabic mt-1 text-[10px] text-[#9aa69e]">سيظهر عند جاهزية الربط</p>
              </div>
            </div>
          </section>

          <section className="rounded-[20px] border border-[#e0e8e3] bg-[#fbfcfb]">
            <div className="border-b border-[#e8eee9] px-5 py-4 sm:px-6">
              <h2 className="font-arabic text-sm font-bold text-[#2c4035]">متطلبات التفعيل</h2>
              <p className="font-arabic mt-1 text-[11px] text-[#87938b]">لا توجد إجراءات تشغيلية متاحة بعد</p>
            </div>
            <ol className="space-y-0 px-5 py-2 sm:px-6">
              {rolloutSteps.map((step, index) => (
                <li key={step.title} className="relative flex gap-3 py-4">
                  {index < rolloutSteps.length - 1 && <span className="absolute right-[13px] top-10 h-[calc(100%-12px)] w-px bg-[#e4ebe6]" />}
                  <span className="relative z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border border-[#dce5df] bg-[#f3f7f4] text-[#83948a]">
                    {step.complete ? <Check className="h-3.5 w-3.5" /> : <span className="font-mono text-[10px]">{String(index + 1).padStart(2, '0')}</span>}
                  </span>
                  <div>
                    <p className="font-arabic text-xs font-semibold text-[#43564a]">{step.title}</p>
                    <p className="font-arabic mt-1 text-[11px] leading-5 text-[#859189]">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#e2e9e4] bg-[#f8faf8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#87968c]" />
            <p className="font-arabic text-[11px] leading-6 text-[#78867d]">
              لا تُعرض هنا أي بيانات محادثات أو جهات اتصال. ستُربط هذه المساحة بخدمة واتساب بعد تجاوز قيد الاعتماد ومراجعة التكامل.
            </p>
          </div>
          <span className="font-arabic shrink-0 text-[10px] font-medium text-[#8e9b92]">واجهة تمهيدية · لا يوجد إرسال أو استقبال</span>
        </section>
      </div>
    </main>
  );
}
