'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, RefreshCw, CheckCircle, XCircle, Calendar, Save, Stethoscope } from 'lucide-react';
import { adminApi, tenantsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Tenant {
  _id: string;
  name: string;
  nameAr?: string;
  slug: string;
  type?: string;
  industry?: string;
  status?: string;
  isActive: boolean;
  medicalMode?: { enabled?: boolean; systemPrompt?: string; disclaimer?: string; configuredByAdmin?: boolean };
  subscription?: { plan?: 'free' | 'pro_daily'; status?: string; dailyPriceSar?: number };
  usagePolicy?: { appDailyCoins?: number; appMessageCost?: number; apiDailyRequests?: number };
  createdAt: string;
}

type TenantDraft = {
  industry: string;
  plan: 'free' | 'pro_daily';
  medicalEnabled: boolean;
  medicalPrompt: string;
  appDailyCoins: number;
  appMessageCost: number;
  apiDailyRequests: number;
};

const INDUSTRIES = [
  ['general', 'عام'], ['healthcare', 'الطب والرعاية الصحية'], ['legal', 'القانون'],
  ['education', 'التعليم'], ['retail', 'التجارة'], ['real_estate', 'العقارات'],
  ['hospitality', 'الضيافة'], ['technology', 'التقنية'],
] as const;

function makeDraft(tenant: Tenant): TenantDraft {
  const paid = tenant.subscription?.plan === 'pro_daily';
  return {
    industry: tenant.industry || tenant.type || 'general',
    plan: paid ? 'pro_daily' : 'free',
    medicalEnabled: tenant.medicalMode?.enabled === true,
    medicalPrompt: tenant.medicalMode?.systemPrompt || '',
    appDailyCoins: tenant.usagePolicy?.appDailyCoins ?? (paid ? 5000 : 500),
    appMessageCost: tenant.usagePolicy?.appMessageCost ?? 50,
    apiDailyRequests: tenant.usagePolicy?.apiDailyRequests ?? (paid ? 1000 : 50),
  };
}

export default function AdminTenantsPage() {
  const { isAdmin } = useAuthStore();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TenantDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isAdmin()) { router.replace('/chat'); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.tenants();
      const rows = Array.isArray(data) ? data : [];
      setTenants(rows);
      setDrafts(Object.fromEntries(rows.map((tenant: Tenant) => [tenant._id, makeDraft(tenant)])));
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  const patchDraft = (id: string, patch: Partial<TenantDraft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const saveTenant = async (tenant: Tenant) => {
    const draft = drafts[tenant._id];
    if (!draft) return;
    setSaving(tenant._id);
    setNotice('');
    try {
      const updated = await tenantsApi.update(tenant._id, {
        industry: draft.industry,
        type: draft.industry === 'healthcare' ? 'clinic' : 'organization',
        medicalMode: {
          enabled: draft.medicalEnabled,
          configuredByAdmin: true,
          systemPrompt: draft.medicalPrompt.trim(),
          disclaimer: 'المعلومات الطبية للتثقيف والدعم ولا تغني عن تقييم الطبيب المختص.',
        },
        subscription: draft.plan === 'pro_daily'
          ? { plan: 'pro_daily', status: 'active', dailyPriceSar: 10, activatedByAdmin: true, startedAt: new Date().toISOString() }
          : { plan: 'free', status: 'free', dailyPriceSar: 0, activatedByAdmin: true },
        usagePolicy: {
          appDailyCoins: Math.max(0, Number(draft.appDailyCoins)),
          appMessageCost: Math.max(1, Number(draft.appMessageCost)),
          apiDailyRequests: Math.max(0, Number(draft.apiDailyRequests)),
        },
      });
      setTenants((current) => current.map((item) => item._id === tenant._id ? updated : item));
      setNotice(`تم حفظ إعدادات ${tenant.nameAr || tenant.name}`);
    } catch (error: any) {
      setNotice(error.response?.data?.message || 'تعذر حفظ إعدادات العميل');
    } finally {
      setSaving(null);
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base sm:text-sm outline-none focus:border-thanarah-400 focus:ring-1 focus:ring-thanarah-300';

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex-shrink-0 safe-area-x">
        <div className="flex items-center justify-between gap-3">
          <div dir="rtl">
            <h1 className="text-lg font-semibold text-gray-900 font-arabic">إدارة العملاء والقطاعات</h1>
            <p className="text-sm text-gray-500 font-arabic mt-0.5">{tenants.length} مؤسسة · الإعداد الطبي والخطط من الأدمن</p>
          </div>
          <button onClick={load} disabled={loading} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
        {notice && <p className="mt-3 text-sm text-thanarah-700 font-arabic" dir="rtl">{notice}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-arabic" dir="rtl">لا توجد مؤسسات مسجلة</div>
        ) : (
          <div className="grid gap-4">
            {tenants.map((tenant) => {
              const draft = drafts[tenant._id] || makeDraft(tenant);
              return (
                <section key={tenant._id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 animate-message-in" dir="rtl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-thanarah-50 flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5 text-thanarah-600" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900 font-arabic truncate">{tenant.nameAr || tenant.name}</h3>
                          <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-arabic', tenant.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                            {tenant.isActive ? <><CheckCircle className="w-3 h-3" />نشط</> : <><XCircle className="w-3 h-3" />غير نشط</>}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 font-mono truncate" dir="ltr">{tenant.slug}</p>
                      </div>
                    </div>
                    <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400"><Calendar className="w-3.5 h-3.5" />{formatDate(tenant.createdAt)}</span>
                  </div>

                  <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-gray-50 p-4 space-y-3">
                      <label className="block text-xs font-medium text-gray-600 font-arabic">قطاع العميل
                        <select value={draft.industry} onChange={(e) => patchDraft(tenant._id, { industry: e.target.value })} className={`${fieldClass} mt-1`}>
                          {INDUSTRIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-gray-600 font-arabic">الخطة
                        <select value={draft.plan} onChange={(e) => {
                          const plan = e.target.value as TenantDraft['plan'];
                          patchDraft(tenant._id, plan === 'pro_daily'
                            ? { plan, appDailyCoins: 5000, apiDailyRequests: 1000 }
                            : { plan, appDailyCoins: 500, apiDailyRequests: 50 });
                        }} className={`${fieldClass} mt-1`}>
                          <option value="free">مجانية</option>
                          <option value="pro_daily">احترافية · 10 ريال يومياً (تفعيل إداري)</option>
                        </select>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[11px] text-gray-500 font-arabic">كوين/يوم<input type="number" value={draft.appDailyCoins} onChange={(e) => patchDraft(tenant._id, { appDailyCoins: Number(e.target.value) })} className={`${fieldClass} mt-1`} /></label>
                        <label className="text-[11px] text-gray-500 font-arabic">تكلفة رسالة<input type="number" value={draft.appMessageCost} onChange={(e) => patchDraft(tenant._id, { appMessageCost: Number(e.target.value) })} className={`${fieldClass} mt-1`} /></label>
                        <label className="text-[11px] text-gray-500 font-arabic">API/يوم<input type="number" value={draft.apiDailyRequests} onChange={(e) => patchDraft(tenant._id, { apiDailyRequests: Number(e.target.value) })} className={`${fieldClass} mt-1`} /></label>
                      </div>
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="flex items-center gap-2 text-sm font-medium text-emerald-900 font-arabic"><Stethoscope className="w-4 h-4" />وضع ثنارة الطبي</span>
                        <input type="checkbox" checked={draft.medicalEnabled} onChange={(e) => patchDraft(tenant._id, { medicalEnabled: e.target.checked })} className="w-4 h-4 accent-thanarah-600" />
                      </label>
                      <textarea value={draft.medicalPrompt} onChange={(e) => patchDraft(tenant._id, { medicalPrompt: e.target.value })} disabled={!draft.medicalEnabled} placeholder="تعليمات طبية خاصة يحددها الأدمن..." className={`${fieldClass} min-h-24 resize-y disabled:opacity-50 font-arabic`} />
                      <p className="text-[11px] leading-5 text-emerald-800 font-arabic">الوضع الطبي لا يفعّله العميل بنفسه، ويضيف ضوابط سلامة ولا يدّعي استبدال الطبيب.</p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button onClick={() => saveTenant(tenant)} disabled={saving === tenant._id} className="inline-flex items-center gap-2 rounded-xl bg-thanarah-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-thanarah-600 disabled:opacity-60 font-arabic">
                      <Save className="w-4 h-4" />{saving === tenant._id ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
