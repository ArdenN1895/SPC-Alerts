// sw.js - Service Worker with Mobile Push Notification Support
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

// ==================== INSTALL EVENT ====================
self.addEventListener('install', event => {
  console.log('🔧 [SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 [SW] Opened cache:', CACHE_NAME);
        
        // Use Promise.allSettled to continue even if some files fail
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
        // ✅ CRITICAL FOR MOBILE: Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('❌ [SW] Install failed:', err);
        // Don't throw - allow SW to install even if caching fails
      })
  );
});

// ==================== ACTIVATE EVENT ====================
self.addEventListener('activate', event => {
  console.log('🔄 [SW] Activating Service Worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
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
      // ✅ CRITICAL FOR MOBILE: Take control of all clients immediately
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
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // Skip external requests (except for same origin)
  if (!url.origin.includes(self.location.origin) &&
      !url.hostname.includes('vercel.app') && 
      !url.hostname.includes('localhost') && 
      !url.hostname.includes('127.0.0.1')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone response for caching
        const responseToCache = response.clone();
        
        // Cache successful responses (except Supabase API calls)
        if (response.ok && !url.hostname.includes('supabase.co')) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then(cached => {
            if (cached) {
              console.log('📂 [SW] Serving from cache:', event.request.url);
              return cached;
            }
            
            // For HTML requests, return index.html as fallback
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('/public/html/index.html');
            }
            
            // Return offline response
            return new Response('Offline - Please check your connection', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
      })
  );
});

// ==================== PUSH EVENT (CRITICAL FOR MOBILE) ====================
self.addEventListener('push', event => {
  console.log('🔔 [SW] Push notification received at:', new Date().toISOString());
  
  // ✅ FIX 1: Always show a notification when push is received
  // Mobile browsers REQUIRE a notification to be shown for every push event
  
  let notificationData = { 
    title: 'SPC Alerts', 
    body: 'You have a new alert',
    icon: '/public/img/icon-192.png',
    badge: '/public/img/badge-72.png',
    data: {}
  };
  
  // Parse push payload
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('📦 [SW] Parsed push data:', payload);
      
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        image: payload.image,
        data: payload.data || {},
        url: payload.url || '/public/html/index.html'
      };
      
    } catch (parseError) {
      console.warn('⚠️ [SW] Failed to parse push data, using text:', parseError);
      notificationData.body = event.data.text();
    }
  }

  // ✅ FIX 2: Mobile-optimized notification options
  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    image: notificationData.image,
    
    // ✅ Mobile-specific options
    vibrate: [200, 100, 200, 100, 200], // Vibration pattern
    requireInteraction: true, // Keep notification visible until user interacts
    silent: false, // Play notification sound
    renotify: true, // Allow same tag notifications to re-alert
    
    // Data payload
    data: {
      url: notificationData.url || '/public/html/index.html',
      timestamp: Date.now(),
      ...notificationData.data
    },
    
    // Unique tag to prevent duplicate notifications
    tag: `spc-alert-${Date.now()}`,
    
    // ✅ Action buttons (works on most mobile browsers)
    actions: [
      { 
        action: 'open', 
        title: '👁️ View', 
        icon: '/public/img/icon-192.png' 
      },
      { 
        action: 'close', 
        title: '✕ Dismiss' 
      }
    ]
  };

  // ✅ FIX 3: ALWAYS show notification (critical for mobile)
  event.waitUntil(
    self.registration.showNotification(
      notificationData.title, 
      notificationOptions
    )
    .then(() => {
      console.log('✅ [SW] Notification displayed successfully');
      
      // Notify open clients about the push
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
      
      // ✅ FIX 4: Even if showing fails, try a fallback notification
      return self.registration.showNotification('SPC Alerts', {
        body: 'New alert received',
        icon: '/public/img/icon-192.png',
        badge: '/public/img/badge-72.png',
        tag: 'fallback-notification'
      });
    })
  );
});

// ==================== NOTIFICATION CLICK EVENT ====================
self.addEventListener('notificationclick', event => {
  console.log('🖱️ [SW] Notification clicked');
  console.log('Action:', event.action);
  console.log('Tag:', event.notification.tag);
  
  // Close the notification
  event.notification.close();

  // Handle close action
  if (event.action === 'close') {
    console.log('🚪 [SW] User dismissed notification');
    return;
  }

  // Get URL to open
  const urlToOpen = event.notification.data?.url || '/public/html/index.html';
  console.log('🔗 [SW] Opening URL:', urlToOpen);

  // ✅ FIX 5: Better window focusing logic for mobile
  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    })
    .then(clientList => {
      console.log(`🔍 [SW] Found ${clientList.length} open window(s)`);
      
      // Try to focus an existing window with the same URL
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetUrl = new URL(urlToOpen, self.location.origin);
        
        // Check if paths match
        if (clientUrl.pathname === targetUrl.pathname) {
          console.log('✅ [SW] Focusing existing window');
          if ('focus' in client) {
            return client.focus();
          }
        }
      }
      
      // If any window is open, focus the first one and navigate
      if (clientList.length > 0 && clientList[0].url !== 'about:blank') {
        console.log('🔄 [SW] Focusing and navigating first window');
        return clientList[0].focus().then(() => {
          return clientList[0].navigate(urlToOpen);
        }).catch(() => {
          // Navigate failed, open new window
          return clients.openWindow(urlToOpen);
        });
      }
      
      // No suitable window found, open new one
      if (clients.openWindow) {
        console.log('🆕 [SW] Opening new window');
        return clients.openWindow(urlToOpen);
      }
    })
    .catch(err => {
      console.error('❌ [SW] Failed to handle notification click:', err);
      
      // Fallback: Try to open window anyway
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ==================== NOTIFICATION CLOSE EVENT ====================
self.addEventListener('notificationclose', event => {
  console.log('🚪 [SW] Notification closed:', event.notification.tag);
  
  // Optional: Track notification dismissals
  event.waitUntil(
    Promise.resolve().then(() => {
      console.log('📊 [SW] User dismissed notification without clicking');
    })
  );
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
      
      // Notify the app about the new subscription
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
    console.log('⏩ [SW] Skipping waiting phase');
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CLAIM_CLIENTS') {
    console.log('🎯 [SW] Claiming clients');
    self.clients.claim();
  }
  
  if (event.data?.type === 'KEEP_ALIVE') {
    console.log('💓 [SW] Keep-alive ping received');
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

// ==================== PERIODIC BACKGROUND SYNC ====================
self.addEventListener('periodicsync', event => {
  console.log('📱 [SW] Periodic sync:', event.tag);
  
  if (event.tag === 'check-updates') {
    event.waitUntil(
      fetch('/public/img/icon-192.png', { cache: 'reload' })
        .then(() => console.log('✅ [SW] Periodic sync successful'))
        .catch(err => console.warn('⚠️ [SW] Periodic sync failed:', err))
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

// Log when service worker is loaded
console.log('✅ [SW] Service Worker script loaded successfully');
console.log('📋 [SW] Cache version:', CACHE_NAME);
console.log('🌐 [SW] Origin:', self.location.origin);
