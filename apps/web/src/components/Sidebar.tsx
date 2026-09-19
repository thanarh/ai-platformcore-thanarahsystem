'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  MessageSquare, Plus, Trash2, Edit3, Settings,
  LayoutDashboard, Key, BookOpen, LogOut, ChevronLeft,
  Menu, Users, Zap, Bot, Building2
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { authApi, conversationsApi, tenantsApi } from '@/lib/api';
import { ThanarahLogoFull, ThanarahIcon } from './ThanarahLogo';
import { cn, formatDate, truncate } from '@/lib/utils';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, isAdmin } = useAuthStore();
  const {
    conversations, activeConversationId, sidebarOpen,
    setActiveConversation, removeConversation, updateConversation,
    toggleSidebar, addConversation, setSidebar,
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await conversationsApi.delete(id);
      removeConversation(id);
      if (activeConversationId === id) router.push('/chat');
    } catch {}
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) { setRenaming(null); return; }
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

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Always-visible toggle button on mobile when sidebar is closed */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 p-2 bg-white shadow-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:relative top-0 bottom-0 right-0 z-30 flex flex-col h-[100dvh]',
          'bg-white border-l border-gray-200 sidebar-transition',
          sidebarOpen ? 'w-[min(20rem,88vw)] lg:w-64' : 'w-0 lg:w-14 overflow-hidden'
        )}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-100 h-14 flex-shrink-0">
          {sidebarOpen ? (
            <>
              <ThanarahLogoFull size="sm" />
              <button
                onClick={toggleSidebar}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition"
                aria-label="إغلاق القائمة"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={toggleSidebar}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition mx-auto"
              aria-label="فتح القائمة"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>

        {sidebarOpen && (
          <>
            {/* New Chat Button */}
            <div className="p-3 flex-shrink-0">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 bg-thanarah-700 hover:bg-thanarah-600 text-white rounded-xl px-3 py-2.5 text-sm font-medium transition font-arabic"
              >
                <Plus className="w-4 h-4 flex-shrink-0" />
                محادثة جديدة
              </button>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {conversations.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-arabic">لا توجد محادثات بعد</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((conv) => (
                    <div
                      key={conv._id}
                      className={cn(
                        'group relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm cursor-pointer transition hover:bg-gray-100',
                        activeConversationId === conv._id && 'bg-gray-100'
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
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => handleRename(conv._id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(conv._id);
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          className="flex-1 bg-white border border-thanarah-300 rounded px-1 py-0.5 text-xs outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate text-gray-700 text-xs leading-5 font-arabic">
                          {conv.title || 'محادثة جديدة'}
                        </span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition absolute left-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenaming(conv._id);
                            setRenameValue(conv.title);
                          }}
                          className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, conv._id)}
                          className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom nav */}
            <div className="p-2 border-t border-gray-100 space-y-0.5 flex-shrink-0">
              {isAdmin() && (
                <div>
                  <Link
                    href="/admin"
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition font-arabic',
                      pathname?.startsWith('/admin') && 'bg-gray-100 text-thanarah-700'
                    )}
                  >
                    <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                    لوحة التحكم
                  </Link>
                  {/* Admin sub-links */}
                  {pathname?.startsWith('/admin') && (
                    <div className="mr-4 mt-0.5 border-r-2 border-thanarah-100 pr-2 space-y-0.5">
                      {[
                        { href: '/admin/tenants', label: 'المؤسسات', icon: Building2 },
                        { href: '/admin/api-keys', label: 'مفاتيح API', icon: Key },
                        { href: '/admin/messages', label: 'سجل الرسائل', icon: MessageSquare },
                        { href: '/admin/users', label: 'المستخدمون', icon: Users },
                      ].map(({ href, label, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          className={cn(
                            'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition font-arabic',
                            pathname === href && 'bg-thanarah-50 text-thanarah-700 font-medium'
                          )}
                        >
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          {label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Link
                href="/settings/ai"
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition font-arabic',
                  pathname === '/settings/ai' && 'bg-gray-100 text-thanarah-700'
                )}
              >
                <Bot className="w-4 h-4 flex-shrink-0" />
                إعدادات AI
              </Link>
              <Link
                href="/settings/api-keys"
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition font-arabic',
                  pathname === '/settings/api-keys' && 'bg-gray-100 text-thanarah-700'
                )}
              >
                <Key className="w-4 h-4 flex-shrink-0" />
                مفاتيح API
              </Link>
              <Link
                href="/knowledge"
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition font-arabic',
                  pathname?.startsWith('/knowledge') && 'bg-gray-100'
                )}
              >
                <BookOpen className="w-4 h-4 flex-shrink-0" />
                قاعدة المعرفة
              </Link>

              {!isAdmin() && usage && (
                <div className="mx-1 my-2 rounded-xl border border-thanarah-100 bg-thanarah-50 p-3 font-arabic">
                  <div className="flex items-center justify-between text-xs text-thanarah-800">
                    <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />الرصيد اليومي</span>
                    <strong>{usage.appCoinsRemaining} كوين</strong>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-thanarah-100">
                    <div
                      className="h-full rounded-full bg-thanarah-600 transition-[width] duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, (usage.appCoinsRemaining / Math.max(1, usage.appDailyCoins)) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-thanarah-700">
                    {Math.floor(usage.appCoinsRemaining / Math.max(1, usage.appMessageCost))} رسائل متبقية · API: {usage.apiRequestsRemaining}
                  </p>
                </div>
              )}

              {/* User row */}
              <div className="flex items-center gap-2 px-2.5 py-2 mt-1">
                <div className="w-7 h-7 rounded-full bg-thanarah-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-thanarah-700">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate font-arabic">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
