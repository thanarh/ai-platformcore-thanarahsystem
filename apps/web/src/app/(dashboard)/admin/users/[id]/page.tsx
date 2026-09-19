'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle,
  Save,
  Shield,
  User,
  WalletCards,
  XCircle,
  Zap,
} from 'lucide-react';

const INDUSTRIES = [
  ['general', 'عام'],
  ['healthcare', 'رعاية صحية'],
  ['education', 'تعليم'],
  ['retail', 'تجزئة'],
  ['technology', 'تقنية'],
  ['finance', 'مالية'],
];

export default function CustomerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [customer, setCustomer] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setNotice('');
    try {
      const { data } = await api.get(`/admin/users/${params.id}/customer`);
      setCustomer(data);
      const organization = data.organization || {};
      const subscription = organization.subscription || {};
      const policy = organization.usagePolicy || {};
      setDraft({
        userActive: data.user?.isActive !== false,
        organizationActive: organization.isActive !== false,
        status: organization.status || 'active',
        industry: organization.industry || 'general',
        medicalEnabled: organization.medicalMode?.enabled === true,
        plan: subscription.plan || 'free',
        subscriptionStatus: subscription.status || 'free',
        dailyPriceSar: subscription.dailyPriceSar || 0,
        endsAt: subscription.endsAt ? new Date(subscription.endsAt).toISOString().slice(0, 10) : '',
        appDailyCoins: policy.appDailyCoins ?? 500,
        appMessageCost: policy.appMessageCost ?? 50,
        apiDailyRequests: policy.apiDailyRequests ?? 50,
      });
    } catch (error: any) {
      setNotice(error.response?.data?.message || 'تعذر تحميل ملف العميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      router.replace('/admin/users');
      return;
    }
    void load();
  }, [params.id, currentUser?.role]);

  const patch = (values: any) => setDraft((current: any) => ({ ...current, ...values }));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setNotice('');
    try {
      const { data } = await api.patch(`/admin/users/${params.id}/customer`, {
        userActive: draft.userActive,
        organizationActive: draft.organizationActive,
        status: draft.status,
        industry: draft.industry,
        medicalEnabled: draft.medicalEnabled,
        subscription: {
          plan: draft.plan,
          status: draft.plan === 'free' ? 'free' : draft.subscriptionStatus,
          dailyPriceSar: draft.plan === 'free' ? 0 : Number(draft.dailyPriceSar),
          startedAt: customer.organization?.subscription?.startedAt,
          endsAt: draft.endsAt || null,
        },
        usagePolicy: {
          appDailyCoins: Number(draft.appDailyCoins),
          appMessageCost: Number(draft.appMessageCost),
          apiDailyRequests: Number(draft.apiDailyRequests),
        },
      });
      setCustomer(data);
      setNotice('تم حفظ إعدادات العميل');
    } catch (error: any) {
      setNotice(error.response?.data?.message || 'تعذر حفظ إعدادات العميل');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-thanarah-400 focus:ring-1 focus:ring-thanarah-300';

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!customer || !draft) {
    return <div className="flex-1 p-6 text-center text-red-600 font-arabic" dir="rtl">{notice || 'العميل غير موجود'}</div>;
  }

  const { user, organization, usage } = customer;

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-4 sm:p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-thanarah-700 font-arabic mb-3">
              <ArrowRight className="w-4 h-4" /> العودة إلى المستخدمين
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 font-arabic">{user.firstName} {user.lastName}</h1>
            <p className="text-sm text-gray-500 mt-1" dir="ltr">{user.email}</p>
          </div>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-thanarah-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-thanarah-600 disabled:opacity-60 font-arabic">
            <Save className="w-4 h-4" />{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>

        {notice && <div className="rounded-xl border border-thanarah-100 bg-thanarah-50 px-4 py-3 text-sm text-thanarah-800 font-arabic">{notice}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoCard icon={User} label="نوع الحساب" value={user.role} />
          <InfoCard icon={Calendar} label="تاريخ التسجيل" value={formatDate(user.createdAt)} />
          <InfoCard icon={Shield} label="آخر دخول" value={formatDate(user.lastLoginAt)} />
        </div>

        <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 font-arabic flex items-center gap-2"><User className="w-5 h-5 text-thanarah-600" />حالة الحساب</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Toggle label="الحساب مفعل" checked={draft.userActive} disabled={user._id === currentUser?._id} onChange={(checked) => patch({ userActive: checked })} />
            <Toggle label="البريد موثق" checked={user.isEmailVerified === true} disabled />
          </div>
        </section>

        {organization ? (
          <>
            <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 font-arabic flex items-center gap-2"><Building2 className="w-5 h-5 text-thanarah-600" />المنظمة</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-arabic">{organization.nameAr || organization.name}</span>
                <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono" dir="ltr">{organization.slug}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Toggle label="المنظمة مفعلة" checked={draft.organizationActive} onChange={(checked) => patch({ organizationActive: checked })} />
                <label className="text-xs font-medium text-gray-600 font-arabic">حالة المنظمة
                  <select value={draft.status} onChange={(e) => patch({ status: e.target.value })} className={`${fieldClass} mt-1`}>
                    <option value="active">نشطة</option><option value="trial">تجريبية</option><option value="suspended">موقوفة</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600 font-arabic">القطاع
                  <select value={draft.industry} onChange={(e) => patch({ industry: e.target.value })} className={`${fieldClass} mt-1`}>
                    {INDUSTRIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <Toggle label="الوضع الطبي" checked={draft.medicalEnabled} onChange={(checked) => patch({ medicalEnabled: checked })} />
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 font-arabic flex items-center gap-2"><WalletCards className="w-5 h-5 text-thanarah-600" />الاشتراك</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="text-xs font-medium text-gray-600 font-arabic">الخطة
                  <select value={draft.plan} onChange={(e) => patch({ plan: e.target.value, subscriptionStatus: e.target.value === 'free' ? 'free' : 'active' })} className={`${fieldClass} mt-1`}>
                    <option value="free">مجانية</option><option value="pro_daily">احترافية يومية</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600 font-arabic">حالة الاشتراك
                  <select disabled={draft.plan === 'free'} value={draft.subscriptionStatus} onChange={(e) => patch({ subscriptionStatus: e.target.value })} className={`${fieldClass} mt-1 disabled:opacity-50`}>
                    <option value="active">نشط</option><option value="paused">متوقف مؤقتًا</option><option value="expired">منتهي</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600 font-arabic">السعر اليومي (ر.س)
                  <input type="number" min="0" disabled={draft.plan === 'free'} value={draft.dailyPriceSar} onChange={(e) => patch({ dailyPriceSar: e.target.value })} className={`${fieldClass} mt-1 disabled:opacity-50`} />
                </label>
                <label className="text-xs font-medium text-gray-600 font-arabic">تاريخ الانتهاء
                  <input type="date" value={draft.endsAt} onChange={(e) => patch({ endsAt: e.target.value })} className={`${fieldClass} mt-1`} />
                </label>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 font-arabic flex items-center gap-2"><Zap className="w-5 h-5 text-thanarah-600" />الاستخدام والحدود اليومية</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <NumberField label="كوين يوميًا" value={draft.appDailyCoins} onChange={(value) => patch({ appDailyCoins: value })} />
                <NumberField label="تكلفة الرسالة" value={draft.appMessageCost} onChange={(value) => patch({ appMessageCost: value })} min={1} />
                <NumberField label="طلبات API يوميًا" value={draft.apiDailyRequests} onChange={(value) => patch({ apiDailyRequests: value })} />
              </div>
              {usage && (
                <div className="grid sm:grid-cols-2 gap-3 pt-2">
                  <UsageBar label="رصيد المحادثة" used={usage.appCoinsUsed} total={usage.appDailyCoins} />
                  <UsageBar label="طلبات API" used={usage.apiRequestsUsed} total={usage.apiDailyRequests} />
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 font-arabic">هذا الحساب غير مرتبط بمنظمة.</div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: any) {
  return <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3"><Icon className="w-5 h-5 text-thanarah-600" /><div><p className="text-xs text-gray-500 font-arabic">{label}</p><p className="text-sm font-medium text-gray-900 mt-0.5">{value || '—'}</p></div></div>;
}

function Toggle({ label, checked, onChange, disabled = false }: any) {
  return <label className={`flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}><span className="text-sm text-gray-700 font-arabic flex items-center gap-2">{checked ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} className="w-4 h-4 accent-thanarah-600" /></label>;
}

function NumberField({ label, value, onChange, min = 0 }: any) {
  return <label className="text-xs font-medium text-gray-600 font-arabic">{label}<input type="number" min={min} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-thanarah-400" /></label>;
}

function UsageBar({ label, used, total }: any) {
  const percentage = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return <div className="rounded-xl bg-gray-50 p-3"><div className="flex justify-between text-xs text-gray-600 font-arabic"><span>{label}</span><span>{used.toLocaleString('ar-SA')} / {total.toLocaleString('ar-SA')}</span></div><div className="h-2 bg-gray-200 rounded-full mt-2 overflow-hidden"><div className="h-full bg-thanarah-600 rounded-full" style={{ width: `${percentage}%` }} /></div></div>;
}