// public/javascript/keep-alive.js
// Keeps service worker active for push notifications

console.log('🔄 Keep-alive script loaded');

let keepAliveInterval = null;

async function initKeepAlive() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    console.log('✅ Service Worker ready for keep-alive');

    // Register background sync (keeps SW active)
    if ('sync' in registration) {
      try {
        await registration.sync.register('keep-alive');
        console.log('✅ Background sync registered');
      } catch (err) {
        console.warn('Background sync not available:', err);
      }
    }

    // Register periodic sync (Chrome/Edge only)
    if ('periodicSync' in registration) {
      try {
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync',
        });
        
        if (status.state === 'granted') {
          await registration.periodicSync.register('check-updates', {
            minInterval: 24 * 60 * 60 * 1000, // 24 hours
          });
          console.log('✅ Periodic sync registered');
        }
      } catch (err) {
        console.warn('Periodic sync not available:', err);
      }
    }

    // Ping service worker every 5 minutes while app is open
    keepAliveInterval = setInterval(async () => {
      try {
        const sw = registration.active || registration.waiting || registration.installing;
        if (sw) {
          const messageChannel = new MessageChannel();
          
          messageChannel.port1.onmessage = (event) => {
            if (event.data.type === 'ALIVE') {
              console.log('💓 Service Worker heartbeat:', new Date().toLocaleTimeString());
            }
          };

          sw.postMessage({ type: 'KEEP_ALIVE' }, [messageChannel.port2]);
        }
      } catch (err) {
        console.warn('Keep-alive ping failed:', err);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    console.log('✅ Keep-alive monitoring started');

  } catch (err) {
    console.error('❌ Failed to initialize keep-alive:', err);
  }
}

// Listen for push notifications received
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data.type === 'PUSH_RECEIVED') {
    console.log('🔔 Push notification received in app:', event.data);
    
    // You can show an in-app notification here
    // Or update the UI with new data
  }
});

// Start keep-alive when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initKeepAlive);
} else {
  initKeepAlive();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
});

export { initKeepAlive };
