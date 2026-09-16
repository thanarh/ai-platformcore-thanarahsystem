'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { knowledgeApi } from '@/lib/api';
import { BookOpen, Plus, Trash2, Search, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

export default function KnowledgePage() {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', type: 'document', text: '' });

  useEffect(() => { loadSources(); }, []);

  const loadSources = () => {
    setLoading(true);
    setError('');
    knowledgeApi.list()
      .then(setSources)
      .catch(() => setError('تعذر تحميل قاعدة المعرفة. تحقق من اتصال الخدمة وقاعدة البيانات.'))
      .finally(() => setLoading(false));
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.text.trim() || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await knowledgeApi.create({ name: form.name.trim(), type: form.type, text: form.text.trim() });
      setForm({ name: '', type: 'document', text: '' });
      setShowAdd(false);
      setNotice('تمت إضافة المصدر وتجهيزه للبحث بنجاح.');
      loadSources();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'تعذر إضافة المصدر إلى قاعدة المعرفة.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المصدر؟')) return;
    setError('');
    try {
      await knowledgeApi.delete(id);
      setNotice('تم حذف المصدر.');
      loadSources();
    } catch {
      setError('تعذر حذف المصدر حالياً.');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError('');
    try {
      const res = await knowledgeApi.search(searchQuery.trim());
      setSearchResults(res.results || []);
      if (!res.results?.length) setNotice('لم يتم العثور على نتائج مطابقة.');
    } catch {
      setError('تعذر البحث في قاعدة المعرفة حالياً.');
    } finally {
      setSearching(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'ready') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === 'processing') return <Clock className="w-4 h-4 text-yellow-500 animate-spin" />;
    return <AlertCircle className="w-4 h-4 text-red-500" />;
  };

  return (
    <div className="flex-1 overflow-auto p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 font-arabic">قاعدة المعرفة</h1>
            <p className="text-sm text-gray-500 mt-0.5 font-arabic">
              المستندات والمعلومات التي يستخدمها الذكاء الاصطناعي
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-thanarah-700 text-white rounded-xl px-4 py-2.5 text-sm hover:bg-thanarah-600 transition font-arabic"
          >
            <Plus className="w-4 h-4" />
            إضافة مصدر
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-arabic">
            {error}
          </div>
        )}
        {notice && !error && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 font-arabic">
            {notice}
          </div>
        )}

        {/* Search */}
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="ابحث في قاعدة المعرفة..."
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-400 font-arabic"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            <Search className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700 font-arabic">
              نتائج البحث ({searchResults.length})
            </div>
            {searchResults.map((r, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-thanarah-600 font-arabic">
                    تطابق: {Math.round((r.score || 0) * 100)}%
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed font-arabic">{r.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="font-medium text-gray-900 font-arabic">إضافة مصدر جديد</h3>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="اسم المصدر"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-400 font-arabic"
            />
            <textarea
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="أدخل النص هنا..."
              rows={5}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-thanarah-400 font-arabic resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || !form.name.trim() || !form.text.trim()}
                className="flex-1 bg-thanarah-700 text-white rounded-lg py-2 text-sm hover:bg-thanarah-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-arabic"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 border border-gray-200 rounded-lg py-2 text-sm hover:bg-gray-50 transition font-arabic"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Sources list */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sources.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-arabic">لا توجد مصادر معرفة بعد</p>
            </div>
          ) : (
            sources.map((source) => (
              <div key={source._id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                {statusIcon(source.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate font-arabic">{source.name}</p>
                  <p className="text-xs text-gray-400 font-arabic">
                    {source.chunkCount} قسم · {source.type}
                    {source.createdAt && ` · ${formatDate(source.createdAt)}`}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(source._id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
