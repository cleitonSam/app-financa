const CACHE = 'financeiro-casal-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: serve do cache na hora e atualiza em segundo plano. Mantém o app rápido e offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isApi = url.pathname.startsWith('/api/') || url.pathname.includes('/api/');
  const isCDN = /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.href);
  // A API NUNCA é cacheada — a sincronização do casal precisa sempre de dados frescos.
  // Só tratamos o app-shell (mesma origem) e as CDNs conhecidas; o resto passa direto pela rede.
  if (isApi || (!sameOrigin && !isCDN)) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaqueredirect') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Recebe um Web Push (mesmo com o app fechado) e mostra a notificação.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Financeiro do Casal';
  const opts = {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'financeiro-casal',
    renotify: true,
    lang: 'pt-BR',
    vibrate: [80, 40, 80],
    data: { url: d.url || 'index.html' },
    actions: [{ action: 'open', title: 'Ver' }],
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// Ao tocar na notificação (ou na ação), foca a aba aberta na tela certa ou abre o app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || 'index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { if (c.navigate) { try { c.navigate(url); } catch (_) {} } return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
