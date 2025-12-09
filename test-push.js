// test-push.js - Comprehensive Mobile Push Notification Testing Script
// Add this to a test page or run in browser console

const PushTester = {
  vapidKey: 'BA1RcIbho_qDHz-TEjBmAAG73hbLnI0ACtV_U0kZdT9z_Bnnx_FEEFH1ZsCb_I-IIRWIF3PClSoKe4DUKq5bPQQ',
  
  // Utility function
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  },

  // Test 1: Check browser support
  async testBrowserSupport() {
    console.log('\n🧪 TEST 1: Browser Support');
    console.log('=' .repeat(50));
    
    const results = {
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
      notifications: 'Notification' in window,
      userAgent: navigator.userAgent,
      isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
    };
    
    console.log('✓ Service Worker:', results.serviceWorker);
    console.log('✓ Push Manager:', results.pushManager);
    console.log('✓ Notifications:', results.notifications);
    console.log('✓ Mobile Device:', results.isMobile);
    console.log('✓ User Agent:', results.userAgent);
    
    if (!results.serviceWorker || !results.pushManager) {
      console.error('❌ Browser does not support push notifications!');
      return false;
    }
    
    console.log('✅ Browser supports push notifications');
    return true;
  },

  // Test 2: Check notification permission
  async testPermission() {
    console.log('\n🧪 TEST 2: Notification Permission');
    console.log('='.repeat(50));
    
    const permission = Notification.permission;
    console.log('Current permission:', permission);
    
    if (permission === 'granted') {
      console.log('✅ Notifications are allowed');
      return true;
    } else if (permission === 'denied') {
      console.error('❌ Notifications are blocked. Please reset in browser settings.');
      return false;
    } else {
      console.log('⚠️ Permission not yet requested');
      console.log('Requesting permission...');
      
      const result = await Notification.requestPermission();
      console.log('Permission result:', result);
      
      if (result === 'granted') {
        console.log('✅ Permission granted!');
        return true;
      } else {
        console.error('❌ Permission denied');
        return false;
      }
    }
  },

  // Test 3: Check service worker registration
  async testServiceWorker() {
    console.log('\n🧪 TEST 3: Service Worker Registration');
    console.log('='.repeat(50));
    
    try {
      let registration = await navigator.serviceWorker.getRegistration();
      
      if (!registration) {
        console.log('⚠️ Service worker not registered, registering now...');
        registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service worker registered');
      } else {
        console.log('✅ Service worker already registered');
      }
      
      await navigator.serviceWorker.ready;
      console.log('✅ Service worker is ready');
      
      const sw = registration.active || registration.installing || registration.waiting;
      if (sw) {
        console.log('State:', sw.state);
        console.log('Script URL:', sw.scriptURL);
      }
      
      return registration;
      
    } catch (error) {
      console.error('❌ Service worker error:', error);
      return null;
    }
  },

  // Test 4: Check push subscription
  async testSubscription() {
    console.log('\n🧪 TEST 4: Push Subscription');
    console.log('='.repeat(50));
    
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        console.log('✅ Push subscription exists');
        console.log('Endpoint:', subscription.endpoint.substring(0, 60) + '...');
        console.log('Expiration:', subscription.expirationTime);
        
        // Verify keys exist
        const p256dh = subscription.getKey('p256dh');
        const auth = subscription.getKey('auth');
        
        console.log('Has p256dh key:', !!p256dh);
        console.log('Has auth key:', !!auth);
        
        return subscription;
      } else {
        console.log('⚠️ No subscription found');
        return null;
      }
      
    } catch (error) {
      console.error('❌ Subscription check error:', error);
      return null;
    }
  },

  // Test 5: Create new subscription
  async testSubscribe() {
    console.log('\n🧪 TEST 5: Creating Push Subscription');
    console.log('='.repeat(50));
    
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Unsubscribe first if exists
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        console.log('Unsubscribing from existing...');
        await existing.unsubscribe();
        console.log('✅ Unsubscribed');
      }
      
      console.log('Creating new subscription...');
      const applicationServerKey = this.urlBase64ToUint8Array(this.vapidKey);
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
      
      console.log('✅ Subscription created!');
      console.log('Endpoint:', subscription.endpoint.substring(0, 60) + '...');
      
      const subscriptionObject = {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
        }
      };
      
      console.log('Subscription object:', subscriptionObject);
      
      return subscription;
      
    } catch (error) {
      console.error('❌ Subscribe error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      
      if (error.name === 'NotAllowedError') {
        console.error('💡 Permission denied or blocked');
      } else if (error.name === 'NotSupportedError') {
        console.error('💡 Push not supported on this device/browser');
      }
      
      return null;
    }
  },

  // Test 6: Save to database
  async testDatabaseSave(subscription) {
    console.log('\n🧪 TEST 6: Saving to Database');
    console.log('='.repeat(50));
    
    if (!window.supabase) {
      console.error('❌ Supabase not available');
      return false;
    }
    
    try {
      const { data: { user } } = await window.supabase.auth.getUser();
      
      if (!user) {
        console.error('❌ User not authenticated');
        return false;
      }
      
      console.log('✓ User:', user.email);
      
      const subscriptionObject = {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
        }
      };
      
      console.log('Saving to database...');
      
      const { data, error } = await window.supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          subscription: subscriptionObject,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });
      
      if (error) throw error;
      
      console.log('✅ Saved to database successfully!');
      console.log('Database response:', data);
      
      return true;
      
    } catch (error) {
      console.error('❌ Database save error:', error);
      return false;
    }
  },

  // Test 7: Send local test notification
  async testLocalNotification() {
    console.log('\n🧪 TEST 7: Local Test Notification');
    console.log('='.repeat(50));
    
    try {
      const registration = await navigator.serviceWorker.ready;
      
      await registration.showNotification('🧪 Test Notification', {
        body: 'This is a local test notification from the browser',
        icon: '/public/img/icon-192.png',
        badge: '/public/img/badge-72.png',
        vibrate: [200, 100, 200],
        tag: 'test-notification',
        requireInteraction: false,
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'close', title: 'Close' }
        ]
      });
      
      console.log('✅ Local notification sent');
      return true;
      
    } catch (error) {
      console.error('❌ Local notification error:', error);
      return false;
    }
  },

  // Test 8: Send server push notification
  async testServerPush() {
    console.log('\n🧪 TEST 8: Server Push Notification');
    console.log('='.repeat(50));
    
    if (!window.supabase) {
      console.error('❌ Supabase not available');
      return false;
    }
    
    try {
      const { data: { user } } = await window.supabase.auth.getUser();
      
      if (!user) {
        console.error('❌ User not authenticated');
        return false;
      }
      
      console.log('Sending test push via Edge Function...');
      
      const response = await window.supabase.functions.invoke('send-push', {
        body: {
          title: '🧪 Server Test Push',
          body: 'This is a test notification from the server',
          icon: '/public/img/icon-192.png',
          badge: '/public/img/badge-72.png',
          url: '/public/html/index.html',
          urgency: 'high',
          user_ids: [user.id] // Targeted to current user only
        }
      });
      
      console.log('Server response:', response);
      
      if (response.error) {
        console.error('❌ Server push failed:', response.error);
        return false;
      }
      
      if (response.data?.delivered_to > 0) {
        console.log('✅ Server push sent successfully!');
        console.log('Delivered to:', response.data.delivered_to);
        return true;
      } else {
        console.warn('⚠️ Server push sent but no delivery confirmed');
        console.log('Response data:', response.data);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Server push error:', error);
      return false;
    }
  },

  // Run all tests
  async runAllTests() {
    console.log('\n🚀 STARTING COMPREHENSIVE PUSH NOTIFICATION TESTS');
    console.log('='.repeat(50));
    
    const results = {};
    
    // Test 1: Browser support
    results.browserSupport = await this.testBrowserSupport();
    if (!results.browserSupport) {
      console.error('\n❌ TESTS FAILED: Browser not supported');
      return results;
    }
    
    // Test 2: Permission
    results.permission = await this.testPermission();
    if (!results.permission) {
      console.error('\n❌ TESTS FAILED: Permission denied');
      return results;
    }
    
    // Test 3: Service Worker
    results.serviceWorker = await this.testServiceWorker();
    if (!results.serviceWorker) {
      console.error('\n❌ TESTS FAILED: Service Worker issue');
      return results;
    }
    
    // Test 4: Check existing subscription
    results.existingSubscription = await this.testSubscription();
    
    // Test 5: Create new subscription
    results.newSubscription = await this.testSubscribe();
    if (!results.newSubscription) {
      console.error('\n❌ TESTS FAILED: Subscription creation failed');
      return results;
    }
    
    // Test 6: Database save
    results.databaseSave = await this.testDatabaseSave(results.newSubscription);
    
    // Test 7: Local notification
    results.localNotification = await this.testLocalNotification();
    
    // Wait 2 seconds before server test
    console.log('\n⏳ Waiting 2 seconds before server test...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 8: Server push
    results.serverPush = await this.testServerPush();
    
    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log('Browser Support:', results.browserSupport ? '✅' : '❌');
    console.log('Permission:', results.permission ? '✅' : '❌');
    console.log('Service Worker:', results.serviceWorker ? '✅' : '❌');
    console.log('Existing Subscription:', results.existingSubscription ? '✅' : '⚠️');
    console.log('New Subscription:', results.newSubscription ? '✅' : '❌');
    console.log('Database Save:', results.databaseSave ? '✅' : '❌');
    console.log('Local Notification:', results.localNotification ? '✅' : '❌');
    console.log('Server Push:', results.serverPush ? '✅' : '❌');
    
    const allPassed = results.browserSupport && 
                      results.permission && 
                      results.serviceWorker && 
                      results.newSubscription && 
                      results.databaseSave && 
                      results.localNotification && 
                      results.serverPush;
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED! Push notifications are working!');
    } else {
      console.log('\n⚠️ SOME TESTS FAILED. Check the details above.');
    }
    
    return results;
  }
};

// Make it available globally
window.PushTester = PushTester;

// Auto-run on load (or comment out to run manually)
console.log('💡 Push Notification Tester loaded!');
console.log('Run: PushTester.runAllTests()');
console.log('Or individual tests: PushTester.testBrowserSupport(), etc.');
