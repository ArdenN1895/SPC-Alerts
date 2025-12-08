const CACHE_NAME = 'spc-alerts-v12';

const urlsToCache = [
  '/public/html/index.html',
  '/public/html/incident-report.html',
  '/public/html/profile.html',
  '/public/html/map.html',
  '/public/html/live-broadcast.html',
  '/public/html/news-outlet.html',
  '/public/html/donation.html',
  '/public/html/login.html',
  '/public/html/signup.html',
  '/public/html/admin-dashboard.html',
  '/public/html/admin-users.html',
  '/public/html/admin-incident.html',
  '/manifest.json',
  '/public/img/icon-192.png',
  '/public/img/icon-512.png',
  '/public/css/style.css',
  '/public/css/incident-report.css',
  '/public/css/admin-dashboard.css',
  '/public/javascript/index.js',
  '/public/javascript/incident-report.js',
  '/public/javascript/admin.js'
];

self.addEventListener('install', event => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching app shell...');
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`⚠️ Failed to cache ${url}:`, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('✅ Service Worker installed');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('❌ Install failed:', err);
      })
  );
});


self.addEventListener('activate', event => {
  console.log('🔄 Service Worker activating...');
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log(`🗑️ Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      }),
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Service Worker activated and controlling all clients');
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.origin.includes('vercel.app') && 
      !url.origin.includes('localhost') && 
      !url.hostname.includes('127.0.0.1')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseToCache = response.clone();
        
        if (response.ok && !event.request.url.includes('supabase.co')) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cached => {
            if (cached) {
              console.log('📂 Serving from cache:', event.request.url);
              return cached;
            }
            
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/public/html/index.html');
            }
            
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
      })
  );
});


self.addEventListener('push', event => {
  console.log('🔔 Push notification received at:', new Date().toISOString());
  console.log('Push data:', event.data ? event.data.text() : 'no data');
  
  let data = { 
    title: 'SPC Alerts', 
    body: 'New update!',
    icon: '/public/img/icon-192.png',
    badge: '/public/img/badge-72.png'
  };
  
  if (event.data) {
    try {
      data = event.data.json();
      console.log('Parsed push data:', data);
    } catch (e) {
      console.log('Failed to parse, using text:', e);
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'You have a new alert from SPC Alerts',
    icon: data.icon || '/public/img/icon-192.png',
    badge: '/public/img/badge-72.png',
    image: data.image,
    vibrate: [200, 100, 200, 100, 200],
    data: { 
      url: data.url || '/public/html/index.html',
      timestamp: Date.now()
    },
    tag: 'spc-alert-' + Date.now(), 
    requireInteraction: true, 
    silent: false, 
    actions: [
      { action: 'open', title: 'Open App', icon: '/public/img/icon-192.png' },
      { action: 'close', title: 'Dismiss' }
    ]
  };


  event.waitUntil(
    self.registration.showNotification(data.title || 'SPC Alerts', options)
      .then(() => {
        console.log('✅ Notification shown successfully');
        
    
        return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            data: data,
            timestamp: Date.now()
          });
        });
      })
      .catch(err => {
        console.error('❌ Failed to show notification:', err);
      })
  );
});


self.addEventListener('notificationclick', event => {
  console.log('🖱️ Notification clicked, action:', event.action);
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/public/html/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        console.log('Found', clientList.length, 'open windows');
        
        for (const client of clientList) {
          const clientUrl = new URL(client.url).pathname;
          const targetUrl = new URL(urlToOpen, self.location.origin).pathname;
          
          if (clientUrl === targetUrl && 'focus' in client) {
            console.log('Focusing existing window');
            return client.focus();
          }
        }
        

        if (clients.openWindow) {
          console.log('Opening new window:', urlToOpen);
          return clients.openWindow(urlToOpen);
        }
      })
      .catch(err => {
        console.error('❌ Failed to handle notification click:', err);
      })
  );
});


self.addEventListener('sync', event => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'keep-alive') {
    event.waitUntil(
      fetch('/public/img/icon-192.png', { cache: 'reload' })
        .then(() => console.log('✅ Keep-alive ping successful'))
        .catch(err => console.log('⚠️ Keep-alive ping failed:', err))
    );
  }
});

self.addEventListener('periodicsync', event => {
  console.log('📱 Periodic sync:', event.tag);
  
  if (event.tag === 'check-updates') {
    event.waitUntil(
      fetch('/public/img/icon-192.png', { cache: 'reload' })
        .then(() => console.log('✅ Periodic sync successful'))
        .catch(err => console.log('⚠️ Periodic sync failed:', err))
    );
  }
});

self.addEventListener('message', event => {
  console.log('💬 Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLAIM_CLIENTS') {
    self.clients.claim();
  }
  
  if (event.data && event.data.type === 'KEEP_ALIVE') {
    event.ports[0]?.postMessage({ type: 'ALIVE', timestamp: Date.now() });
  }
});
