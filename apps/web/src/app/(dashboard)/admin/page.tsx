'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { adminApi, aiApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Users, Building2, Zap, Activity,
  AlertCircle, CheckCircle, Clock, Database, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Stats {
  users?: { total: number };
  tenants?: { total: number };
  messages?: { today: number };
  usage?: {
    today: { requestsToday: number; failedToday: number };
    total: { totalRequests: number };
    avgLatencyMs: number;
  };
  aiHealth?: { status: string; backends: any[] };
}

export default function AdminPage() {
  const { isAdmin } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [backends, setBackends] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdmin()) { router.replace('/chat'); return; }
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [statsData, backendsData] = await Promise.all([
      adminApi.stats().catch(() => ({})),
      aiApi.backends().catch(() => ({ backends: [] })),
    ]);
    setStats(statsData);
    setBackends(backendsData.backends || []);
    setLoading(false);
  };

  const handleToggleBackend = async (id: string, enabled: boolean) => {
    await aiApi.updateBackend(id, { enabled: !enabled });
    loadData();
  };

  const handleTestBackend = async (id: string) => {
    const result = await aiApi.testBackend(id);
    alert(result.success ? `✅ ${result.response}` : `❌ ${result.error}`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    { icon: MessageSquare, label: 'رسائل اليوم', value: stats.messages?.today ?? 0, color: 'text-blue-600 bg-blue-50' },
    { icon: Users, label: 'إجمالي المستخدمين', value: stats.users?.total ?? 0, color: 'text-purple-600 bg-purple-50' },
    { icon: Building2, label: 'المنظمات النشطة', value: stats.tenants?.total ?? 0, color: 'text-thanarah-600 bg-thanarah-50' },
    { icon: Zap, label: 'إجمالي الطلبات', value: stats.usage?.total?.totalRequests ?? 0, color: 'text-orange-600 bg-orange-50' },
    { icon: AlertCircle, label: 'طلبات فاشلة اليوم', value: stats.usage?.today?.failedToday ?? 0, color: 'text-red-600 bg-red-50' },
    { icon: Clock, label: 'متوسط وقت الاستجابة', value: `${Math.round(stats.usage?.avgLatencyMs ?? 0)} ms`, color: 'text-gray-600 bg-gray-50' },
  ];

  return (
    <div className="flex-1 overflow-auto p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 font-arabic">لوحة التحكم</h1>
            <p className="text-sm text-gray-500 font-arabic mt-0.5">نظرة عامة على ثنارة AI</p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl px-3 py-2 transition hover:bg-gray-50 font-arabic"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-lg', card.color)}>
                  <card.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-arabic">{card.label}</p>
                  <p className="text-xl font-semibold text-gray-900 mt-0.5">
                    {typeof card.value === 'number' ? card.value.toLocaleString('ar-SA') : card.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AI Infrastructure */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 font-arabic flex items-center gap-2">
              <Activity className="w-4 h-4 text-thanarah-600" />
              بنية الذكاء الاصطناعي
            </h2>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-arabic',
              stats.aiHealth?.status === 'ok'
                ? 'bg-green-50 text-green-600'
                : 'bg-yellow-50 text-yellow-600'
            )}>
              {stats.aiHealth?.status === 'ok' ? 'متاح' : 'مقيّد'}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {backends.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm font-arabic">
                لا توجد خلفيات مُهيأة
              </div>
            ) : (
              backends.map((backend) => (
                <div key={backend.id} className="p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        backend.healthy ? 'bg-green-500' : 'bg-red-400'
                      )} />
                      <span className="font-medium text-sm text-gray-800">{backend.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                        أولوية: {backend.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-gray-500 font-arabic">
                        طلبات: {backend.requestCount?.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500 font-arabic">
                        فشل: {backend.failureCount}
                      </span>
                      {backend.latencyMs != null && (
                        <span className="text-xs text-gray-500">
                          {Math.round(backend.latencyMs)} ms
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestBackend(backend.id)}
                      className="text-xs text-thanarah-600 hover:text-thanarah-700 border border-thanarah-200 rounded-lg px-2.5 py-1.5 transition hover:bg-thanarah-50 font-arabic"
                    >
                      اختبار
                    </button>
                    <button
                      onClick={() => handleToggleBackend(backend.id, backend.enabled)}
                      className={cn(
                        'text-xs rounded-lg px-2.5 py-1.5 transition font-arabic border',
                        backend.enabled
                          ? 'text-gray-600 border-gray-200 hover:bg-gray-50'
                          : 'text-thanarah-600 border-thanarah-200 hover:bg-thanarah-50'
                      )}
                    >
                      {backend.enabled ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Nav */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/admin/users', icon: Users, label: 'المستخدمون' },
            { href: '/admin/tenants', icon: Building2, label: 'المنظمات' },
            { href: '/knowledge', icon: Database, label: 'قاعدة المعرفة' },
            { href: '/settings/api-keys', icon: Zap, label: 'مفاتيح API' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 text-center hover:border-thanarah-300 hover:shadow-sm transition"
            >
              <item.icon className="w-5 h-5 text-thanarah-600" />
              <span className="text-xs font-medium text-gray-700 font-arabic">{item.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
