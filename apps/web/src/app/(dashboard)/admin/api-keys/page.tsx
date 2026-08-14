'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key, RefreshCw, Clock, Activity, Building2, User, Shield } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface ApiKey {
  _id: string;
  name: string;
  keyPrefix: string;
  environment: 'live' | 'test';
  scopes: string[];
  isActive: boolean;
  usageCount: number;
  rateLimit: number;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  tenantId?: { _id: string; name: string; nameAr?: string } | string;
  createdBy?: { _id: string; firstName: string; lastName: string; email: string } | string;
}

export default function AdminApiKeysPage() {
  const { isAdmin } = useAuthStore();
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'live' | 'test'>('all');

  useEffect(() => {
    if (!isAdmin()) { router.replace('/chat'); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.apiKeys();
      setKeys(Array.isArray(data) ? data : []);
    } catch { setKeys([]); }
    finally { setLoading(false); }
  };

  const getTenantName = (t: ApiKey['tenantId']) => {
    if (!t) return '—';
    if (typeof t === 'object') return t.nameAr || t.name;
    return '—';
  };

  const getCreatorName = (c: ApiKey['createdBy']) => {
    if (!c) return '—';
    if (typeof c === 'object') return `${c.firstName} ${c.lastName}`;
    return '—';
  };

  const formatDate = (d?: string) => {
    if (!d) return 'لم يُستخدم';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} ساعة`;
    return `منذ ${Math.floor(hrs / 24)} يوم`;
  };

  const filtered = filter === 'all' ? keys : keys.filter((k) => k.environment === filter);
  const totalUsage = keys.reduce((a, k) => a + k.usageCount, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div dir="rtl">
            <h1 className="text-lg font-semibold text-gray-900 font-arabic">مفاتيح API</h1>
            <p className="text-sm text-gray-500 font-arabic mt-0.5">
              {keys.length} مفتاح نشط — {totalUsage.toLocaleString()} طلب إجمالي
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter tabs */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-arabic">
              {(['all', 'live', 'test'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1.5 rounded-md transition',
                    filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {f === 'all' ? 'الكل' : f === 'live' ? 'إنتاج' : 'تجربة'}
                </button>
              ))}
            </div>
            <button onClick={load} disabled={loading}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {/* Keys list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-arabic" dir="rtl">لا توجد مفاتيح</div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((k) => (
              <div key={k._id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between" dir="rtl">
                  {/* Left: name + prefix */}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      k.environment === 'live' ? 'bg-green-50' : 'bg-yellow-50'
                    )}>
                      <Key className={cn('w-4 h-4', k.environment === 'live' ? 'text-green-600' : 'text-yellow-600')} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 font-arabic">{k.name}</span>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-arabic',
                          k.environment === 'live'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-yellow-50 text-yellow-700'
                        )}>
                          {k.environment === 'live' ? 'إنتاج' : 'تجربة'}
                        </span>
                      </div>
                      <code className="text-xs text-gray-400 mt-0.5">{k.keyPrefix}</code>
                    </div>
                  </div>

                  {/* Right: usage count */}
                  <div className="text-right" dir="rtl">
                    <div className="flex items-center gap-1 text-2xl font-bold text-gray-900 font-mono justify-end">
                      <Activity className="w-4 h-4 text-thanarah-500" />
                      {k.usageCount.toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-400 font-arabic">طلب مُستخدَم</p>
                  </div>
                </div>

                {/* Meta row */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2" dir="rtl">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-arabic">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    {getTenantName(k.tenantId)}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-arabic">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    {getCreatorName(k.createdBy)}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-arabic">
                    <Shield className="w-3.5 h-3.5 text-gray-400" />
                    {k.scopes.join(', ')} — حد {k.rateLimit.toLocaleString()}/ساعة
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-arabic">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    آخر استخدام: {formatDate(k.lastUsedAt)}
                  </div>
                  {k.expiresAt && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 font-arabic">
                      ينتهي: {new Date(k.expiresAt).toLocaleDateString('ar-SA')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
