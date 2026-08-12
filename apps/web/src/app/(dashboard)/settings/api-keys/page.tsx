'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { apiKeysApi } from '@/lib/api';
import { Key, Plus, Trash2, Copy, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', environment: 'live' });

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = () => {
    setLoading(true);
    apiKeysApi.list().then(setKeys).catch(() => {}).finally(() => setLoading(false));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const result = await apiKeysApi.create({
      name: form.name,
      environment: form.environment as any,
    });
    setNewKey(result.key);
    setForm({ name: '', environment: 'live' });
    setShowCreate(false);
    loadKeys();
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذا المفتاح؟')) return;
    await apiKeysApi.revoke(id);
    loadKeys();
  };

  return (
    <div className="flex-1 overflow-auto p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 font-arabic">مفاتيح API</h1>
            <p className="text-sm text-gray-500 mt-0.5 font-arabic">
              أنشئ مفاتيح للوصول إلى ثنارة AI من تطبيقاتك
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-thanarah-700 text-white rounded-xl px-4 py-2.5 text-sm hover:bg-thanarah-600 transition font-arabic"
          >
            <Plus className="w-4 h-4" />
            مفتاح جديد
          </button>
        </div>

        {/* Show new key (only once) */}
        {newKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" dir="rtl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-800 font-arabic text-sm mb-2">
                  احفظ هذا المفتاح الآن — لن يظهر مرة أخرى
                </p>
                <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                  <code className="flex-1 text-xs text-gray-800 font-mono break-all">{newKey}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(newKey)}
                    className="p-1 hover:bg-amber-100 rounded transition flex-shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-600" />
                  </button>
                </div>
                <button
                  onClick={() => setNewKey(null)}
                  className="text-xs text-amber-600 mt-2 font-arabic hover:underline"
                >
                  فهمت، تم الحفظ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="font-medium text-gray-900 font-arabic">مفتاح API جديد</h3>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="اسم المفتاح (مثال: تطبيق المواعيد)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-400 font-arabic"
            />
            <select
              value={form.environment}
              onChange={(e) => setForm({ ...form, environment: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-400 font-arabic bg-white"
            >
              <option value="live">إنتاج (live)</option>
              <option value="test">اختبار (test)</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 bg-thanarah-700 text-white rounded-lg py-2 text-sm hover:bg-thanarah-600 transition font-arabic"
              >
                إنشاء
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 border border-gray-200 rounded-lg py-2 text-sm hover:bg-gray-50 transition font-arabic"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Keys list */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Key className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-arabic">لا توجد مفاتيح API بعد</p>
            </div>
          ) : (
            keys.map((key) => (
              <div key={key._id} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 last:border-0">
                <div className="flex-shrink-0">
                  <Key className="w-4 h-4 text-thanarah-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 font-arabic">{key.name}</p>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded font-arabic',
                      key.environment === 'live' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    )}>
                      {key.environment}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{key.keyPrefix}</p>
                  <p className="text-xs text-gray-400 font-arabic">
                    استُخدم {key.usageCount} مرة
                    {key.lastUsedAt && ` · آخر استخدام: ${formatDate(key.lastUsedAt)}`}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(key._id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* API reference */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="font-medium text-gray-800 mb-3 text-sm font-arabic">مثال على استخدام API</h3>
          <pre className="text-xs text-gray-600 font-mono overflow-x-auto" dir="ltr">
{`curl -X POST https://your-domain.com/api/v1/chat/completions \\
  -H "Authorization: Bearer thn_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "مرحبا"}]}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}
