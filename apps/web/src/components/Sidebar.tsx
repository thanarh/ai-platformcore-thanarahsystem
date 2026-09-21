'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  ChevronLeft,
  Edit3,
  Globe2,
  Grid2X2,
  HelpCircle,
  KeyRound,
  LogOut,
  Menu,
  MessageSquare,
  Pin,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { authApi, conversationsApi, tenantsApi } from '@/lib/api';
import { ThanarahLogoFull } from './ThanarahLogo';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, isAdmin } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    sidebarOpen,
    setActiveConversation,
    removeConversation,
    updateConversation,
    toggleSidebar,
    addConversation,
    setSidebar,
  } = useChatStore();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    const loadUsage = () => tenantsApi.usage().then(setUsage).catch(() => {});
    loadUsage();
    window.addEventListener('thanarah-usage-changed', loadUsage);
    return () => window.removeEventListener('thanarah-usage-changed', loadUsage);
  }, []);

  useEffect(() => {
    if (window.innerWidth < 1024) setSidebar(false);
  }, [pathname, setSidebar]);

  const handleNewChat = async () => {
    try {
      const conv = await conversationsApi.create();
      addConversation(conv);
      setActiveConversation(conv._id);
      router.push(`/chat/${conv._id}`);
    } catch {}
  };

  const handleDelete = async (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await conversationsApi.delete(id);
      removeConversation(id);
      if (activeConversationId === id) router.push('/chat');
    } catch {}
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenaming(null);
      return;
    }
    try {
      await conversationsApi.rename(id, renameValue.trim());
      updateConversation(id, { title: renameValue.trim() });
    } catch {}
    setRenaming(null);
  };

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    clearAuth();
    router.replace('/login');
  };

  const renderConversation = (conv: (typeof conversations)[number]) => (
    <div
      key={conv._id}
      className={cn(
        'group relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition hover:bg-[#f2f7f5]',
        activeConversationId === conv._id && 'bg-[#eef7f2]',
      )}
      onClick={() => {
        setActiveConversation(conv._id);
        router.push(`/chat/${conv._id}`);
      }}
    >
      {renaming === conv._id ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onBlur={() => handleRename(conv._id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleRename(conv._id);
            if (event.key === 'Escape') setRenaming(null);
          }}
          className="flex-1 rounded border border-[#b8dcca] bg-white px-1 py-0.5 text-xs outline-none"
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <>
          {conv.isPinned && <Pin className="h-3 w-3 flex-shrink-0 text-[#16815b]" />}
          <span className="flex-1 truncate text-right text-[11px] leading-5 text-[#53616a] font-arabic">
            {conv.title || 'محادثة جديدة'}
          </span>
          <div className="absolute left-1 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={(event) => {
                event.stopPropagation();
                setRenaming(conv._id);
                setRenameValue(conv.title);
              }}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="تعديل العنوان"
            >
              <Edit3 className="h-3 w-3" />
            </button>
            <button
              onClick={(event) => void handleDelete(event, conv._id)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
              title="حذف المحادثة"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );

  const navItems = [
    { href: '/chat', label: 'المحادثات', icon: MessageSquare },
    { href: '/chat?tool=search', label: 'البحث في الإنترنت', icon: Globe2 },
    { href: '/settings/ai', label: 'أدوات AI', icon: Grid2X2 },
    { href: '/settings/api-keys', label: 'مفاتيح API', icon: KeyRound },
    { href: '/knowledge', label: 'قاعدة المعرفة', icon: BookOpen },
    { href: '/settings/intelligence', label: 'الإعدادات', icon: Settings },
  ];

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={toggleSidebar} />
      )}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed right-3 top-3 z-40 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <aside
        className={cn(
          'fixed bottom-0 right-0 top-0 z-30 flex h-[100dvh] flex-col border-l border-[#edf0f1] bg-[#fbfcfc] sidebar-transition lg:relative',
          sidebarOpen ? 'w-[min(20rem,88vw)] lg:w-[204px]' : 'w-0 overflow-hidden lg:w-14',
        )}
        dir="rtl"
      >
        <div className="flex h-[70px] flex-shrink-0 items-center justify-between border-b border-[#eff2f2] px-3.5">
          {sidebarOpen ? (
            <>
              <ThanarahLogoFull size="sm" className="h-9 w-auto" />
              <button
                onClick={toggleSidebar}
                className="rounded-lg p-1.5 text-[#56636a] transition hover:bg-[#f0f4f3]"
                aria-label="إغلاق القائمة"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button onClick={toggleSidebar} className="mx-auto rounded-lg p-1.5 text-gray-500" aria-label="فتح القائمة">
              <Menu className="h-4 w-4" />
            </button>
          )}
        </div>

        {sidebarOpen && (
          <>
            <div className="px-3 py-3">
              <button
                onClick={() => void handleNewChat()}
                className="font-arabic flex h-11 w-full items-center justify-between rounded-xl bg-[#187b57] px-3.5 text-[13px] font-medium text-white shadow-[0_5px_12px_rgba(24,123,87,0.16)] transition hover:bg-[#126b4b]"
              >
                <Plus className="h-5 w-5" />
                <span className="flex-1 text-center">محادثة جديدة</span>
              </button>
            </div>

            <nav className="space-y-0.5 px-2.5" aria-label="التنقل الرئيسي">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = href === '/chat'
                  ? pathname === '/chat' || pathname?.startsWith('/chat/')
                  : pathname?.startsWith(href.split('?')[0]);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'font-arabic flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[12px] text-[#4c5961] transition hover:bg-[#f0f5f3]',
                      active && 'bg-[#eef7f2] text-[#167854]',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.7} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            {conversations.length > 0 && (
              <div className="mt-3 flex-1 overflow-y-auto border-t border-[#edf0f1] px-2.5 pt-3">
                <p className="font-arabic px-2.5 pb-1.5 text-[10px] font-semibold text-[#a0aaaf]">المحادثات الأخيرة</p>
                <div className="space-y-0.5">{conversations.map(renderConversation)}</div>
              </div>
            )}

            {conversations.length === 0 && <div className="flex-1" />}

            <div className="space-y-0.5 border-t border-[#e8eded] px-2.5 py-3">
              <button
                type="button"
                className="font-arabic flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-[12px] text-[#59656c] transition hover:bg-[#f0f5f3]"
              >
                <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.7} />
                <span>المساعدة</span>
              </button>
              {isAdmin() && (
                <Link
                  href="/admin"
                  className="font-arabic flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[12px] text-[#59656c] transition hover:bg-[#f0f5f3]"
                >
                  <Grid2X2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
                  <span>لوحة التحكم</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="font-arabic flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-[12px] text-[#59656c] transition hover:bg-[#fff2f2] hover:text-red-600"
              >
                <LogOut className="h-[18px] w-[18px]" strokeWidth={1.7} />
                <span>تسجيل الخروج</span>
              </button>
              <div className="font-arabic mt-3 rounded-xl bg-[#f3f8f7] px-3 py-3 text-center">
                <p className="text-[13px] font-bold text-[#1e2b32]">Thanarah AI</p>
                <p className="mt-1 text-[9px] text-[#78868b]">ذكاء عملي لنتائج حقيقية</p>
              </div>
              {!isAdmin() && usage && (
                <p className="pt-1 text-center text-[9px] text-[#839097] font-arabic">
                  {usage.appCoinsRemaining} كوين متبقية
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}