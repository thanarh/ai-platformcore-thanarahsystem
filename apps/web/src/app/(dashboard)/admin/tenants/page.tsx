'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, RefreshCw, CheckCircle, XCircle, Users, MessageSquare, Calendar } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Tenant {
  _id: string;
  name: string;
  nameAr?: string;
  slug: string;
  type?: string;
  status?: string;
  isActive: boolean;
  settings?: { maxUsers?: number };
  aiConfig?: { preferredBackend?: string; ragEnabled?: boolean };
  createdAt: string;
}

export default function AdminTenantsPage() {
  const { isAdmin } = useAuthStore();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin()) { router.replace('/chat'); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.tenants();
      setTenants(Array.isArray(data) ? data : []);
    } catch { setTenants([]); }
    finally { setLoading(false); }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div dir="rtl">
            <h1 className="text-lg font-semibold text-gray-900 font-arabic">إدارة المؤسسات</h1>
            <p className="text-sm text-gray-500 font-arabic mt-0.5">
              جميع المؤسسات المسجلة — {tenants.length} مؤسسة
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-arabic" dir="rtl">
            لا توجد مؤسسات مسجلة
          </div>
        ) : (
          <div className="grid gap-4">
            {tenants.map((t) => (
              <div key={t._id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-thanarah-300 transition">
                <div className="flex items-start justify-between" dir="rtl">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-thanarah-50 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-thanarah-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 font-arabic">
                          {t.nameAr || t.name}
                        </h3>
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-arabic',
                          t.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-600'
                        )}>
                          {t.isActive
                            ? <><CheckCircle className="w-3 h-3" />نشط</>
                            : <><XCircle className="w-3 h-3" />غير نشط</>
                          }
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5 font-mono">{t.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {t.type && (
                      <span className="bg-gray-100 px-2 py-1 rounded-lg font-arabic capitalize">
                        {t.type}
                      </span>
                    )}
                  </div>
                </div>

                {/* Meta row */}
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4" dir="rtl">
                  <div className="flex items-center gap-2 text-sm text-gray-500 font-arabic">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span>حد المستخدمين: <strong className="text-gray-700">{t.settings?.maxUsers ?? '—'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 font-arabic">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <span>الباكند: <strong className="text-gray-700">{t.aiConfig?.preferredBackend || 'افتراضي'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 font-arabic">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>تاريخ الإنشاء: <strong className="text-gray-700">{formatDate(t.createdAt)}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
