'use client';

import { Bell, BellRing, Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { notificationsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type AppNotification = {
  _id?: string;
  id?: string;
  title: string;
  body: string;
  kind?: string;
  readAt?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
};

type PushState = 'idle' | 'enabled' | 'unavailable' | 'blocked' | 'install-required';

function decodeVapidKey(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isIosDevice() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function NotificationCenter() {
  const { token } = useAuthStore();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>('idle');
  const [pushMessage, setPushMessage] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    notificationsApi.list().then((data) => {
      if (!cancelled) setItems(Array.isArray(data) ? data : []);
    }).catch(() => {});

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/notifications/ws?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type !== 'notification' || !parsed.notification) return;
        const next = parsed.notification as AppNotification;
        setItems((current) => [next, ...current].slice(0, 50));
      } catch {}
    };
    return () => {
      cancelled = true;
      socket.close();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const inspectPushState = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) {
          setPushState('unavailable');
          setPushMessage('هذا المتصفح لا يدعم إشعارات الويب.');
        }
        return;
      }

      const config = await notificationsApi.pushConfig().catch(() => null);
      if (cancelled) return;
      if (!config?.enabled || !config.publicKey) {
        setPushState('unavailable');
        setPushMessage('خدمة الإشعارات غير مهيأة على الخادم حاليًا.');
        return;
      }

      if (isIosDevice() && !isInstalledApp()) {
        setPushState('install-required');
        setPushMessage('على iPhone أو iPad: أضيفي ثنارة إلى الشاشة الرئيسية من Safari، ثم افتحيها من الأيقونة وفعّلي الإشعارات.');
        return;
      }

      if (Notification.permission === 'denied') {
        setPushState('blocked');
        setPushMessage('الإشعارات محظورة لهذا الموقع. اسمحي بها من إعدادات المتصفح ثم أعيدي فتح ثنارة.');
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) {
        setPushState(subscription ? 'enabled' : 'idle');
        setPushMessage(subscription ? 'إشعارات الرد مفعّلة على هذا الجهاز.' : '');
      }
    };

    void inspectPushState().catch(() => {
      if (!cancelled) {
        setPushState('unavailable');
        setPushMessage('تعذر التحقق من إعداد الإشعارات. أعيدي تحميل الصفحة وحاولي مرة أخرى.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const enablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushState('unavailable');
        setPushMessage('هذا المتصفح لا يدعم إشعارات الويب.');
        return;
      }
      if (isIosDevice() && !isInstalledApp()) {
        setPushState('install-required');
        setPushMessage('على iPhone أو iPad: من Safari اضغطي «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتحي ثنارة من الأيقونة قبل تفعيل الإشعارات.');
        return;
      }

      const config = await notificationsApi.pushConfig().catch(() => null);
      if (!config?.enabled || !config.publicKey) {
        setPushState('unavailable');
        setPushMessage('خدمة الإشعارات غير مهيأة على الخادم حاليًا.');
        return;
      }

      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        setPushState('blocked');
        setPushMessage('لم يتم السماح بالإشعارات. غيّري الإذن من إعدادات المتصفح ثم أعيدي المحاولة.');
        return;
      }

      const registration = await navigator.serviceWorker.register('/notifications-sw.js', { scope: '/' });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey),
      });
      await notificationsApi.savePushSubscription(subscription.toJSON() as Record<string, unknown>);
      setPushState('enabled');
      setPushMessage('إشعارات اكتمال الرد مفعّلة على هذا الجهاز.');
    } catch {
      setPushState('idle');
      setPushMessage('تعذر تفعيل الإشعارات. تحققي من إذن المتصفح واتصال الإنترنت ثم حاولي مرة أخرى.');
    } finally {
      setPushBusy(false);
    }
  };

  const markRead = async (item: AppNotification) => {
    const id = item._id || item.id;
    if (!id || item.readAt) return;
    setItems((current) => current.map((entry) => (
      (entry._id || entry.id) === id ? { ...entry, readAt: new Date().toISOString() } : entry
    )));
    await notificationsApi.markRead(id).catch(() => {});
  };

  if (!token) return null;
  return (
    <div className="fixed left-4 top-4 z-50" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl border border-[#e4ebe7] bg-white p-2.5 text-[#187b57] shadow-sm transition hover:bg-[#f1f8f4]"
        aria-label="الإشعارات"
      >
        {unread > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#d95d4f] px-1 text-[9px] text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#e4ebe7] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="font-arabic text-xs font-semibold text-[#314048]">الإشعارات</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="h-3.5 w-3.5 text-gray-400" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <p className="font-arabic px-3 py-6 text-center text-xs text-gray-400">لا توجد إشعارات جديدة</p>
            ) : items.map((item, index) => (
              <button
                type="button"
                key={item._id || item.id || index}
                onClick={() => void markRead(item)}
                className={`flex w-full gap-2 border-b border-gray-50 px-3 py-2.5 text-right hover:bg-[#f7faf8] ${item.readAt ? 'opacity-60' : ''}`}
              >
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[#187b57]" />
                <span className="min-w-0 flex-1">
                  <span className="font-arabic block text-xs font-semibold text-[#314048]">{item.title}</span>
                  <span className="font-arabic block truncate text-[11px] text-gray-500">{item.body}</span>
                </span>
                {item.readAt && <Check className="mt-1 h-3 w-3 text-[#187b57]" />}
              </button>
            ))}
          </div>
          {pushMessage && (
            <p
              role={pushState === 'blocked' || pushState === 'unavailable' ? 'alert' : 'status'}
              className="font-arabic border-t border-gray-100 px-3 py-2 text-center text-[11px] leading-5 text-[#52635b]"
            >
              {pushMessage}
            </p>
          )}
          {pushState === 'idle' && (
            <button
              type="button"
              onClick={() => void enablePush()}
              disabled={pushBusy}
              className="font-arabic w-full border-t border-gray-100 px-3 py-2 text-xs text-[#187b57] hover:bg-[#f7faf8] disabled:opacity-60"
            >
              {pushBusy ? 'جارٍ تفعيل الإشعارات...' : 'تفعيل إشعارات اكتمال الرد على هذا الجهاز'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}