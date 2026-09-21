'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Circle, ListTodo, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AssistantTask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

interface TaskAssistantPanelProps {
  storageKey: string;
  onClose: () => void;
  onAskAboutTask: (task: AssistantTask) => void;
}

export default function TaskAssistantPanel({
  storageKey,
  onClose,
  onAskAboutTask,
}: TaskAssistantPanelProps) {
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [draft, setDraft] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setTasks(parsed);
      }
    } catch {}
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(tasks));
  }, [hydrated, storageKey, tasks]);

  const openCount = useMemo(() => tasks.filter((task) => !task.completed).length, [tasks]);

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    setTasks((current) => [
      {
        id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        completed: false,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setDraft('');
  };

  const toggleTask = (id: string) => {
    setTasks((current) => current.map((task) => (
      task.id === id ? { ...task, completed: !task.completed } : task
    )));
  };

  const removeTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
  };

  return (
    <aside
      className="absolute inset-y-0 left-0 z-30 flex w-[min(340px,92vw)] flex-col border-r border-[#e7eeee] bg-white shadow-[10px_0_35px_rgba(30,70,60,0.12)] lg:relative lg:inset-auto lg:z-auto lg:w-[310px] lg:flex-shrink-0 lg:shadow-none"
      dir="rtl"
      aria-label="مساعد تنظيم المهام"
    >
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-[#edf1f1] px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f7ef] text-[#187b57]">
            <Sparkles className="h-[18px] w-[18px]" />
          </div>
          <div className="font-arabic">
            <p className="text-[13px] font-bold text-[#1d2d34]">مساعد ثنارة</p>
            <p className="mt-0.5 text-[9px] text-[#849095]">ينظم مهامك ويفهم ملفاتك</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[#7b888d] transition hover:bg-[#f1f6f4] hover:text-[#187b57]"
          aria-label="إغلاق مساعد المهام"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-[#edf1f1] bg-[#fbfdfc] px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-[#187b57]" />
            <h2 className="font-arabic text-[12px] font-bold text-[#27363c]">مهامي</h2>
          </div>
          <span className="font-arabic rounded-full bg-[#e9f7ef] px-2 py-0.5 text-[10px] text-[#187b57]">
            {openCount} مفتوحة
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#e4ece8] bg-white p-1.5 focus-within:border-[#9dceb4]">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTask();
              }
            }}
            placeholder="أضف مهمة جديدة..."
            className="font-arabic min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[11px] text-[#28373d] outline-none placeholder:text-[#a0aaad]"
            aria-label="اسم المهمة الجديدة"
          />
          <button
            type="button"
            onClick={addTask}
            disabled={!draft.trim()}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#187b57] text-white transition hover:bg-[#126b4b] disabled:cursor-not-allowed disabled:bg-[#dce9e2]"
            aria-label="إضافة المهمة"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tasks.length === 0 ? (
          <div className="flex h-full min-h-[210px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0f7f3] text-[#75ac8f]">
              <ListTodo className="h-6 w-6" />
            </div>
            <p className="font-arabic mt-4 text-[12px] font-bold text-[#425158]">لا توجد مهام بعد</p>
            <p className="font-arabic mt-1.5 text-[10px] leading-5 text-[#8a969a]">
              أضف أول مهمة وسأساعدك في ترتيبها وتنفيذها.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  'group rounded-xl border px-3 py-2.5 transition',
                  task.completed
                    ? 'border-[#edf1ef] bg-[#fbfcfb]'
                    : 'border-[#e5eee9] bg-white hover:border-[#c9e2d3]',
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className={cn(
                      'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full',
                      task.completed ? 'bg-[#187b57] text-white' : 'text-[#9aaba3] hover:text-[#187b57]',
                    )}
                    aria-label={task.completed ? 'إعادة فتح المهمة' : 'إكمال المهمة'}
                  >
                    {task.completed ? <Check className="h-3 w-3" /> : <Circle className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAskAboutTask(task)}
                    className={cn(
                      'font-arabic min-w-0 flex-1 text-right text-[11px] leading-5',
                      task.completed ? 'text-[#9aa5a7] line-through' : 'text-[#3d4d53] hover:text-[#187b57]',
                    )}
                    title="اطلب من ثنارة المساعدة في هذه المهمة"
                  >
                    {task.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTask(task.id)}
                    className="rounded p-1 text-[#b3bdbc] opacity-0 transition hover:bg-[#fff2f2] hover:text-red-500 group-hover:opacity-100"
                    aria-label="حذف المهمة"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!task.completed && (
                  <button
                    type="button"
                    onClick={() => onAskAboutTask(task)}
                    className="font-arabic mr-6 mt-2 text-[9px] text-[#6a9b7d] hover:text-[#187b57]"
                  >
                    اطلب من ثنارة ترتيبها ←
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[#edf1f1] bg-[#fbfdfc] px-4 py-3">
        <p className="font-arabic text-[10px] leading-5 text-[#879398]">
          يمكنك إرفاق ملف من شريط الكتابة، وسأقرأ محتواه وأساعدك في تلخيصه أو استخراج المهام منه.
        </p>
      </div>
    </aside>
  );
}