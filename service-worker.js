// sw.js - Service Worker with Mobile Push Notification Support
const CACHE_NAME = 'spc-alerts-v12';

// Get the origin dynamically
const APP_ORIGIN = self.location.origin;

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
  console.log('🔧 [SW] Installing Service Worker...');
  
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
        console.log('✅ [SW] Service Worker installed successfully');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('❌ [SW] Install failed:', err);
      })
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
    }).catch(err => {
      console.error('❌ [SW] Activation failed:', err);
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

// ==================== PUSH EVENT (FIXED FOR MOBILE) ====================
self.addEventListener('push', event => {
  console.log('🔔 [SW] Push notification received at:', new Date().toISOString());
  console.log('🌐 [SW] Origin:', APP_ORIGIN);
  
  // ✅ FIX: Use absolute URLs for all resources
  let notificationData = { 
    title: 'SPC Alerts', 
    body: 'You have a new alert',
    icon: `${APP_ORIGIN}/public/img/icon-192.png`,
    badge: `${APP_ORIGIN}/public/img/badge-72.png`,
    data: {}
  };
  
  // Parse push payload
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('📦 [SW] Parsed push data:', payload);
      
      // ✅ FIX: Ensure all URLs are absolute
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: makeAbsoluteUrl(payload.icon || notificationData.icon),
        badge: makeAbsoluteUrl(payload.badge || notificationData.badge),
        image: payload.image ? makeAbsoluteUrl(payload.image) : undefined,
        data: payload.data || {},
        url: makeAbsoluteUrl(payload.url || '/public/html/index.html')
      };
      
    } catch (parseError) {
      console.warn('⚠️ [SW] Failed to parse push data:', parseError);
      notificationData.body = event.data.text();
    }
  }

  // ✅ FIX: Mobile-optimized notification options
  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    image: notificationData.image,
    
    // ✅ CRITICAL: Changed requireInteraction to false for better mobile compatibility
    requireInteraction: false, // Mobile browsers handle this differently
    silent: false,
    renotify: true,
    
    // ✅ Vibration pattern (works on Android)
    vibrate: [200, 100, 200],
    
    // Data payload
    data: {
      url: notificationData.url,
      timestamp: Date.now(),
      ...notificationData.data
    },
    
    // Unique tag
    tag: `spc-alert-${Date.now()}`,
    
    // ✅ Simplified actions for better mobile support
    actions: [
      { 
        action: 'open', 
        title: '👁️ View'
      },
      { 
        action: 'close', 
        title: '✕ Dismiss' 
      }
    ]
  };

  console.log('📤 [SW] Showing notification with options:', notificationOptions);

  // ✅ CRITICAL: Always show notification
  event.waitUntil(
    self.registration.showNotification(
      notificationData.title, 
      notificationOptions
    )
    .then(() => {
      console.log('✅ [SW] Notification displayed successfully');
      
      return self.clients.matchAll({ 
        includeUncontrolled: true, 
        type: 'window' 
      });
    })
    .then(clients => {
      console.log(`📢 [SW] Notifying ${clients.length} open client(s)`);
      
      clients.forEach(client => {
        client.postMessage({
          type: 'PUSH_RECEIVED',
          data: notificationData,
          timestamp: Date.now()
        });
      });
    })
    .catch(err => {
      console.error('❌ [SW] Failed to show notification:', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      });
      
      // Fallback notification with minimal options
      return self.registration.showNotification('SPC Alerts', {
        body: 'New alert received',
        icon: `${APP_ORIGIN}/public/img/icon-192.png`,
        badge: `${APP_ORIGIN}/public/img/badge-72.png`,
        tag: 'fallback-notification',
        requireInteraction: false
      });
    })
  );
});

// ==================== NOTIFICATION CLICK EVENT ====================
self.addEventListener('notificationclick', event => {
  console.log('🖱️ [SW] Notification clicked');
  console.log('Action:', event.action);
  
  event.notification.close();

  if (event.action === 'close') {
    console.log('🚪 [SW] User dismissed notification');
    return;
  }

  const urlToOpen = event.notification.data?.url || `${APP_ORIGIN}/public/html/index.html`;
  console.log('🔗 [SW] Opening URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    })
    .then(clientList => {
      console.log(`🔍 [SW] Found ${clientList.length} open window(s)`);
      
      // Try to focus an existing window
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(urlToOpen);
          
          if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
            console.log('✅ [SW] Focusing existing window');
            return client.focus();
          }
        } catch (e) {
          console.warn('⚠️ [SW] Error comparing URLs:', e);
        }
      }
      
      // Navigate first window or open new one
      if (clientList.length > 0 && clientList[0].url !== 'about:blank') {
        console.log('🔄 [SW] Navigating first window');
        return clientList[0].focus().then(() => {
          if ('navigate' in clientList[0]) {
            return clientList[0].navigate(urlToOpen);
          }
        }).catch(() => {
          return clients.openWindow(urlToOpen);
        });
      }
      
      // Open new window
      console.log('🆕 [SW] Opening new window');
      return clients.openWindow(urlToOpen);
    })
    .catch(err => {
      console.error('❌ [SW] Failed to handle notification click:', err);
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ==================== NOTIFICATION CLOSE EVENT ====================
self.addEventListener('notificationclose', event => {
  console.log('🚪 [SW] Notification closed:', event.notification.tag);
});

// ==================== PUSH SUBSCRIPTION CHANGE EVENT ====================
self.addEventListener('pushsubscriptionchange', event => {
  console.log('🔄 [SW] Push subscription changed/expired');
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        'BA1RcIbho_qDHz-TEjBmAAG73hbLnI0ACtV_U0kZdT9z_Bnnx_FEEFH1ZsCb_I-IIRWIF3PClSoKe4DUKq5bPQQ'
      )
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
      console.error('❌ [SW] Failed to renew push subscription:', err);
    })
  );
});

// ==================== MESSAGE EVENT ====================
self.addEventListener('message', event => {
  console.log('💬 [SW] Message received from client:', event.data);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CLAIM_CLIENTS') {
    self.clients.claim();
  }
  
  if (event.data?.type === 'KEEP_ALIVE') {
    event.ports[0]?.postMessage({ 
      type: 'ALIVE', 
      timestamp: Date.now() 
    });
  }
  
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ 
      type: 'VERSION', 
      version: CACHE_NAME 
    });
  }
});

// ==================== BACKGROUND SYNC ====================
self.addEventListener('sync', event => {
  console.log('🔄 [SW] Background sync:', event.tag);
  
  if (event.tag === 'keep-alive') {
    event.waitUntil(
      fetch('/public/img/icon-192.png', { cache: 'reload' })
        .then(() => console.log('✅ [SW] Keep-alive ping successful'))
        .catch(err => console.warn('⚠️ [SW] Keep-alive ping failed:', err))
    );
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

// ✅ NEW: Helper to ensure URLs are absolute
function makeAbsoluteUrl(url) {
  if (!url) return null;
  
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Make absolute using origin
  if (url.startsWith('/')) {
    return `${APP_ORIGIN}${url}`;
  }
  
  return `${APP_ORIGIN}/${url}`;
}

console.log('✅ [SW] Service Worker script loaded successfully');
console.log('📋 [SW] Cache version:', CACHE_NAME);
console.log('🌐 [SW] Origin:', APP_ORIGIN);
