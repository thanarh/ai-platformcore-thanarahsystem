'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Users, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  OWNER: { label: 'مالك', color: 'bg-purple-50 text-purple-700' },
  ADMIN: { label: 'مدير', color: 'bg-blue-50 text-blue-700' },
  AI_ADMIN: { label: 'مدير AI', color: 'bg-thanarah-50 text-thanarah-700' },
  DEVELOPER: { label: 'مطور', color: 'bg-orange-50 text-orange-700' },
  STAFF: { label: 'موظف', color: 'bg-gray-100 text-gray-700' },
  USER: { label: 'مستخدم', color: 'bg-gray-50 text-gray-600' },
};

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      setError('');
      try {
        const tenantResponse = await api.get('/tenants/my');
        if (!tenantResponse.data?._id) {
          setError('حسابك غير مرتبط بمنظمة.');
          return;
        }
        const usersResponse = await api.get(`/tenants/${tenantResponse.data._id}/users`);
        if (!Array.isArray(usersResponse.data)) {
          throw new Error('Invalid users response');
        }
        setUsers(usersResponse.data);
      } catch {
        setError('تعذر تحميل المستخدمين. تحقق من صلاحيات الحساب ثم أعد المحاولة.');
      } finally {
        setLoading(false);
      }
    };

    void loadUsers();
  }, []);

  return (
    <div className="flex-1 overflow-auto p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-arabic">المستخدمون</h1>
          <p className="text-sm text-gray-500 mt-0.5 font-arabic">
            إدارة مستخدمي المنظمة
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">
              <p className="text-sm font-arabic">{error}</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-arabic">لا توجد بيانات مستخدمين متاحة</p>
            </div>
          ) : (
            users.map((u) => (
              <div key={u._id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                <div className="w-8 h-8 rounded-full bg-thanarah-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-thanarah-700">
                    {u.firstName?.[0]}{u.lastName?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 font-arabic">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-arabic',
                  ROLE_LABELS[u.role]?.color || 'bg-gray-100 text-gray-600'
                )}>
                  {ROLE_LABELS[u.role]?.label || u.role}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
