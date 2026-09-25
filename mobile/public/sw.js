// Takyon servis çalışanı: yalnızca anlık bildirim (Web Push). Önbellekleme YAPMAZ; uygulama
// dosyaları her zaman ağdan gelir (eski paket sunma riski olmasın).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Takyon', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Takyon';
  const options = {
    body: payload.body || '',
    icon: '/bildirim-simge.png',
    badge: '/bildirim-simge.png',
    data: { kind: payload.kind || '', data: payload.data || {} },
  };
  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

// Bildirime dokununca: açık pencere varsa öne getirilir ve hedef ona iletilir; yoksa uygulama
// hedefi adres çubuğundaki "bildirim" parametresinden okuyacak biçimde açılır.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'texflow-push-open', target });
          return;
        }
      }
      const param = encodeURIComponent(JSON.stringify(target));
      await self.clients.openWindow('/?bildirim=' + param);
    })()
  );
});
