// service-worker.js - FIXED VERSION for Mobile Push Notifications
const CACHE_NAME = 'spc-alerts-v13';

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

// ==================== INSTALL EVENT ====================
self.addEventListener('install', event => {
  console.log('🔧 [SW] Installing Service Worker v13...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 [SW] Opened cache:', CACHE_NAME);
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url)
              .then(() => console.log(`✅ [SW] Cached: ${url}`))
              .catch(err => console.warn(`⚠️ [SW] Failed to cache ${url}:`, err.message))
          )
        );
      })
      .then(() => {
        console.log('✅ [SW] Service Worker installed');
        return self.skipWaiting();
      })
      .catch(err => console.error('❌ [SW] Install failed:', err))
  );
});

// ==================== ACTIVATE EVENT ====================
self.addEventListener('activate', event => {
  console.log('🔄 [SW] Activating Service Worker...');
  
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log(`🗑️ [SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      }),
      self.clients.claim()
    ]).then(() => {
      console.log('✅ [SW] Service Worker activated and controlling all clients');
    })
  );
});

// ==================== FETCH EVENT ====================
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  if (!url.origin.includes(self.location.origin) &&
      !url.hostname.includes('vercel.app') && 
      !url.hostname.includes('localhost') && 
      !url.hostname.includes('127.0.0.1')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseToCache = response.clone();
        
        if (response.ok && !url.hostname.includes('supabase.co')) {
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
              console.log('📂 [SW] Serving from cache:', event.request.url);
              return cached;
            }
            
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('/public/html/index.html');
            }
            
            return new Response('Offline - Please check your connection', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
      })
  );
});

// ==================== PUSH EVENT (CRITICAL - SIMPLIFIED FOR MOBILE) ====================
self.addEventListener('push', event => {
  console.log('🔔 [SW] Push notification received:', new Date().toISOString());
  
  // ✅ DEFAULT PAYLOAD (fallback)
  let notification = {
    title: 'SPC Alerts',
    body: 'You have a new emergency alert',
    icon: '/public/img/icon-192.png',
    badge: '/public/img/badge-72.png',
    url: '/public/html/index.html',
    data: {}
  };
  
  // ✅ PARSE PUSH DATA (synchronously, no await)
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('📦 [SW] Parsed payload:', payload);
      
      // Merge with defaults
      notification = {
        title: payload.title || notification.title,
        body: payload.body || notification.body,
        icon: payload.icon || notification.icon,
        badge: payload.badge || notification.badge,
        image: payload.image,
        url: payload.url || payload.data?.url || notification.url,
        data: payload.data || {}
      };
    } catch (e) {
      console.warn('⚠️ [SW] JSON parse failed, using text:', e.message);
      notification.body = event.data.text();
    }
  }
  
  // ✅ NOTIFICATION OPTIONS (optimized for mobile)
  const options = {
    body: notification.body,
    icon: notification.icon,
    badge: notification.badge,
    image: notification.image,
    
    // Mobile-critical settings
    requireInteraction: true,  // Keep visible until user acts
    vibrate: [200, 100, 200],  // Vibration pattern
    silent: false,              // Play sound
    renotify: true,             // Re-alert on update
    
    // Data and actions
    data: {
      url: notification.url,
      timestamp: Date.now(),
      ...notification.data
    },
    tag: `spc-${Date.now()}`,   // Unique tag
    
    // Action buttons (mobile-compatible)
    actions: [
      { action: 'open', title: '👁️ View' },
      { action: 'close', title: '✕ Dismiss' }
    ]
  };
  
  // ✅ SHOW NOTIFICATION IMMEDIATELY (critical for mobile)
  event.waitUntil(
    self.registration.showNotification(notification.title, options)
      .then(() => {
        console.log('✅ [SW] Notification displayed successfully');
        
        // Notify open clients
        return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      })
      .then(clients => {
        console.log(`📢 [SW] Notifying ${clients.length} open client(s)`);
        clients.forEach(client => {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            data: notification,
            timestamp: Date.now()
          });
        });
      })
      .catch(err => {
        console.error('❌ [SW] Notification failed:', err);
        
        // ✅ FALLBACK: Show basic notification
        return self.registration.showNotification('SPC Emergency Alert', {
          body: 'New alert received - tap to view',
          icon: '/public/img/icon-192.png',
          badge: '/public/img/badge-72.png',
          tag: 'fallback',
          requireInteraction: true
        }).catch(fallbackErr => {
          console.error('❌ [SW] Fallback notification also failed:', fallbackErr);
        });
      })
  );
});

// ==================== NOTIFICATION CLICK EVENT ====================
self.addEventListener('notificationclick', event => {
  console.log('🖱️ [SW] Notification clicked');
  
  event.notification.close();

  // Handle dismiss action
  if (event.action === 'close') {
    console.log('🚪 [SW] User dismissed notification');
    return;
  }

  const urlToOpen = event.notification.data?.url || '/public/html/index.html';
  console.log('🔗 [SW] Opening URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Try to focus existing window with same path
        const targetUrl = new URL(urlToOpen, self.location.origin);
        
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
              console.log('✅ [SW] Focusing existing window');
              return client.focus();
            }
          } catch (e) {
            console.warn('⚠️ [SW] Failed to parse client URL:', e);
          }
        }
        
        // Focus first available window and navigate
        if (clientList.length > 0) {
          const client = clientList[0];
          console.log('🔄 [SW] Navigating existing window');
          
          return client.focus().then(() => {
            if ('navigate' in client) {
              return client.navigate(urlToOpen);
            }
            return client;
          }).catch(() => {
            // Navigate failed, open new window
            return clients.openWindow(urlToOpen);
          });
        }
        
        // No windows open, create new one
        console.log('🆕 [SW] Opening new window');
        return clients.openWindow(urlToOpen);
      })
      .catch(err => {
        console.error('❌ [SW] Click handler failed:', err);
        // Final fallback
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// ==================== NOTIFICATION CLOSE EVENT ====================
self.addEventListener('notificationclose', event => {
  console.log('🚪 [SW] Notification closed without action:', event.notification.tag);
});

// ==================== PUSH SUBSCRIPTION CHANGE ====================
self.addEventListener('pushsubscriptionchange', event => {
  console.log('🔄 [SW] Push subscription changed/expired');
  
  const vapidKey = 'BA1RcIbho_qDHz-TEjBmAAG73hbLnI0ACtV_U0kZdT9z_Bnnx_FEEFH1ZsCb_I-IIRWIF3PClSoKe4DUKq5bPQQ';
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    })
    .then(newSubscription => {
      console.log('✅ [SW] Push subscription renewed');
      
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SUBSCRIPTION_CHANGED',
            subscription: newSubscription
          });
        });
      });
    })
    .catch(err => {
      console.error('❌ [SW] Failed to renew subscription:', err);
    })
  );
});

// ==================== MESSAGE EVENT ====================
self.addEventListener('message', event => {
  console.log('💬 [SW] Message from client:', event.data?.type);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CLAIM_CLIENTS') {
    self.clients.claim();
  }
  
  if (event.data?.type === 'KEEP_ALIVE') {
    event.ports[0]?.postMessage({ type: 'ALIVE', timestamp: Date.now() });
  }
  
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ type: 'VERSION', version: CACHE_NAME });
  }
});

// ==================== HELPER FUNCTIONS ====================
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

console.log('✅ [SW] Service Worker script loaded - v13');
console.log('🌐 [SW] Origin:', self.location.origin);
