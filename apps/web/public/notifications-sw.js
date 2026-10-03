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
  const conversationId = event.notification.data?.conversationId;
  const targetUrl = conversationId
    ? `/chat/${encodeURIComponent(conversationId)}`
    : '/chat';
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (!client.url.startsWith(self.location.origin)) continue;
      await client.focus();
      if (client.url !== absoluteUrl && 'navigate' in client) {
        await client.navigate(absoluteUrl);
      }
      return;
    }
    await clients.openWindow(absoluteUrl);
  })());
});