'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle, XCircle, Clock, Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface LogEntry {
  _id: string;
  requestId: string;
  tenantId?: { _id: string; name: string } | string;
  userId?: string;
  conversationId?: string;
  backend?: string;
  model?: string;
  routeDecision?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: string;
  error?: string;
  ragUsed?: boolean;
  toolCalls?: string[];
  createdAt: string;
}

export default function AdminMessagesPage() {
  const { isAdmin } = useAuthStore();
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin()) { router.replace('/chat'); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.logs();
      setLogs(Array.isArray(data) ? data : []);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  const getTenantName = (t: LogEntry['tenantId']) => {
    if (!t) return '—';
    if (typeof t === 'object') return t.name;
    return String(t).slice(-6);
  };

  const formatTime = (d: string) =>
    new Date(d).toLocaleString('ar-SA', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const successCount = logs.filter((l) => l.status === 'success').length;
  const errorCount = logs.filter((l) => l.status === 'error').length;
  const avgLatency = logs.length
    ? Math.round(logs.reduce((a, l) => a + l.latencyMs, 0) / logs.length)
    : 0;
  const totalTokens = logs.reduce((a, l) => a + l.inputTokens + l.outputTokens, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div dir="rtl">
            <h1 className="text-lg font-semibold text-gray-900 font-arabic">سجل الرسائل والطلبات</h1>
            <p className="text-sm text-gray-500 font-arabic mt-0.5">آخر {logs.length} طلب</p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>

        {/* Summary cards */}
        {!loading && logs.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mt-4" dir="rtl">
            {[
              { label: 'ناجح', value: successCount, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'فشل', value: errorCount, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'متوسط الوقت', value: `${avgLatency}ms`, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'إجمالي التوكن', value: totalTokens.toLocaleString(), color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map((s) => (
              <div key={s.label} className={cn('rounded-lg p-3', s.bg)}>
                <p className={cn('text-lg font-bold font-mono', s.color)}>{s.value}</p>
                <p className={cn('text-xs font-arabic', s.color)}>{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-arabic" dir="rtl">لا توجد سجلات</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Row */}
                <button
                  className="w-full text-right px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
                  onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                  dir="rtl"
                >
                  {/* Status */}
                  {log.status === 'success'
                    ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  }

                  {/* Tenant */}
                  <span className="text-xs bg-thanarah-50 text-thanarah-700 px-2 py-0.5 rounded-lg font-arabic flex-shrink-0">
                    {getTenantName(log.tenantId)}
                  </span>

                  {/* Backend + model */}
                  <span className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                    {log.backend || '—'} {log.model ? `/ ${log.model}` : ''}
                  </span>

                  {/* Tokens */}
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    ↑{log.inputTokens} ↓{log.outputTokens} tok
                  </span>

                  {/* Latency */}
                  <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {log.latencyMs}ms
                  </span>

                  {/* RAG badge */}
                  {log.ragUsed && (
                    <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-arabic flex-shrink-0">RAG</span>
                  )}

                  {/* Time */}
                  <span className="flex-1 text-xs text-gray-300 text-left">{formatTime(log.createdAt)}</span>

                  {/* Expand icon */}
                  {expanded === log._id
                    ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                </button>

                {/* Expanded details */}
                {expanded === log._id && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50" dir="rtl">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                      {[
                        ['Request ID', log.requestId],
                        ['Conversation', log.conversationId ? log.conversationId.slice(-8) : '—'],
                        ['قرار التوجيه', log.routeDecision || '—'],
                        ['Tool Calls', log.toolCalls?.length ? log.toolCalls.join(', ') : '—'],
                        ['الحالة', log.status],
                        ['الخطأ', log.error || '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-gray-400 font-arabic min-w-max">{k}:</span>
                          <span className="text-gray-700 font-mono break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
