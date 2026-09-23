self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'ثنارة', body: 'لديك إشعار جديد' };
  }
  const title = payload.title || 'ثنارة';
  const options = {
    body: payload.body || 'اكتملت مهمة في ثنارة',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    dir: 'rtl',
    lang: 'ar',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/chat'));
});