const VAPID_PUBLIC_KEY = "BA1RcIbho_qDHz-TEjBmAAG73hbLnI0ACtV_U0kZdT9z_Bnnx_FEEFH1ZsCb_I-IIRWIF3PClSoKe4DUKq5bPQQ";

let pushInitialized = false;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

// ==================== DEVICE DETECTION ====================
function getDeviceInfo() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       window.navigator.standalone === true ||
                       document.referrer.includes('android-app://');
  
  let iosVersion = null;
  if (isIOS) {
    const match = ua.match(/OS (\d+)_/);
    iosVersion = match ? parseInt(match[1]) : null;
  }
  
  return {
    isIOS,
    isAndroid,
    iosVersion,
    isStandalone,
    isMobile: isIOS || isAndroid,
    userAgent: ua
  };
}

// ==================== SHOW USER-FRIENDLY MESSAGES ====================
function showInstallationGuide(device) {
  const messages = {
    iosNotInstalled: `📱 iOS Installation Required

To receive emergency alerts, you must:

1. Open this site in Safari (not Chrome/Firefox)
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to install the app
5. Open the app from your Home Screen

After installation, notifications will work automatically.`,

    iosOldVersion: `⚠️ iOS Version Too Old

Your iOS version (${device.iosVersion}) doesn't support push notifications for web apps.

Please update to iOS 16.4 or later to receive emergency alerts.`,

    androidNotInstalled: `📱 Android Installation Required

To receive emergency alerts:

1. Tap the menu (⋮) in Chrome
2. Tap "Install app" or "Add to Home screen"
3. Tap "Install"
4. Open the app from your Home Screen

After installation, you'll be asked to allow notifications.`,

    genericNotInstalled: `📱 Installation Required

To receive push notifications, please install this app:

• Look for "Install" or "Add to Home Screen" in your browser menu
• Open the installed app from your device's home screen

Push notifications only work in installed apps, not mobile browsers.`
  };

  if (device.isIOS && !device.isStandalone) {
    if (device.iosVersion && device.iosVersion < 16) {
      return messages.iosOldVersion;
    }
    return messages.iosNotInstalled;
  }
  
  if (device.isAndroid && !device.isStandalone) {
    return messages.androidNotInstalled;
  }
  
  if (device.isMobile && !device.isStandalone) {
    return messages.genericNotInstalled;
  }
  
  return null;
}

// ==================== MAIN SUBSCRIPTION FUNCTION ====================
async function subscribeUser() {
  if (pushInitialized) {
    console.log("⚠️ Push already initialized");
    return { success: false, reason: 'already_initialized' };
  }
  pushInitialized = true;

  console.log("🔔 ===== PUSH SUBSCRIPTION START =====");
  
  const device = getDeviceInfo();
  console.log("📱 Device Info:", device);

  // ✅ CHECK 1: Basic Browser Support
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.error("❌ Browser doesn't support push notifications");
    alert("Your browser doesn't support push notifications. Please use Chrome, Safari, or Firefox.");
    return { success: false, reason: 'unsupported_browser' };
  }

  // ✅ CHECK 2: HTTPS Required
  if (location.protocol !== 'https:' && !location.hostname.includes('localhost')) {
    console.error("❌ HTTPS required");
    alert("Push notifications require a secure connection (HTTPS)");
    return { success: false, reason: 'not_https' };
  }

  // ✅ CHECK 3: iOS Version Check
  if (device.isIOS && device.iosVersion && device.iosVersion < 16) {
    console.error("❌ iOS version too old:", device.iosVersion);
    alert(showInstallationGuide(device));
    return { success: false, reason: 'ios_too_old' };
  }

  // ✅ CHECK 4: Installation Check (Critical for Mobile)
  if (device.isMobile && !device.isStandalone) {
    console.warn("⚠️ App not installed to home screen");
    const guide = showInstallationGuide(device);
    if (guide) {
      alert(guide);
      return { success: false, reason: 'not_installed' };
    }
  }

  // ✅ CHECK 5: Permission State
  if (Notification.permission === 'denied') {
    console.error("❌ Notifications blocked by user");
    alert(`⚠️ Notifications are blocked.

To enable:

iOS: Settings > Safari > [This Site] > Notifications > Allow
Android: Site Settings > Notifications > Allow

Then refresh this page.`);
    return { success: false, reason: 'permission_denied' };
  }

  try {
    // ✅ STEP 1: Wait for Service Worker
    console.log("⏳ Waiting for service worker...");
    const registration = await navigator.serviceWorker.ready;
    console.log("✅ Service worker ready:", registration.active?.state);

    // ✅ STEP 2: Check User Authentication
    if (!window.supabase) {
      console.error("❌ Supabase not initialized");
      return { success: false, reason: 'no_supabase' };
    }

    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      console.warn("🚫 No authenticated user");
      return { success: false, reason: 'not_authenticated' };
    }
    console.log("👤 User authenticated:", user.email);

    // ✅ STEP 3: Check Existing Subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      console.log("ℹ️ Existing subscription found");
      
      // Verify it's still valid
      try {
        // Try to get the keys to ensure it's valid
        const p256dh = subscription.getKey('p256dh');
        const auth = subscription.getKey('auth');
        
        if (!p256dh || !auth) {
          console.warn("⚠️ Subscription invalid, unsubscribing...");
          await subscription.unsubscribe();
          subscription = null;
        }
      } catch (err) {
        console.warn("⚠️ Subscription check failed, unsubscribing...");
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    // ✅ STEP 4: Request Permission (if needed)
    if (!subscription) {
      console.log("📝 Requesting notification permission...");
      
      const permission = await Notification.requestPermission();
      console.log("🔔 Permission result:", permission);
      
      if (permission !== 'granted') {
        console.error("❌ Permission denied:", permission);
        alert("Please allow notifications to receive emergency alerts.");
        return { success: false, reason: 'permission_denied' };
      }
    }

    // ✅ STEP 5: Subscribe to Push Service
    if (!subscription) {
      console.log("🔐 Subscribing to push service...");
      
      try {
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        
        console.log("✅ Push subscription created");
        
      } catch (subscribeError) {
        console.error("❌ Push subscription failed:", subscribeError);
        
        // Handle specific error
        if (subscribeError.name === 'AbortError') {
          console.error("💡 AbortError - Push service rejected subscription");
          
          let errorMessage = "Push notification setup failed.\n\n";
          
          if (device.isMobile && !device.isStandalone) {
            errorMessage += showInstallationGuide(device);
          } else if (device.isIOS) {
            errorMessage += `iOS Troubleshooting:

1. Make sure you installed the app from Safari (not Chrome)
2. Open Settings > Safari > [This Site]
3. Enable notifications
4. Try deleting the app and reinstalling

If issues persist, iOS push notifications may be temporarily unavailable.`;
          } else {
            errorMessage += `Troubleshooting:

1. Check your internet connection
2. Try clearing browser cache
3. Disable VPN if active
4. Try again in a few minutes

If the problem persists, your device may not support push notifications.`;
          }
          
          alert(errorMessage);
        } else {
          alert(`Notification setup failed: ${subscribeError.message}`);
        }
        
        return { 
          success: false, 
          reason: 'subscription_failed',
          error: subscribeError.message 
        };
      }
    }

    // ✅ STEP 6: Extract Subscription Data
    console.log("📍 Subscription endpoint:", subscription.endpoint);
    
    const p256dh = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    
    if (!p256dh || !auth) {
      console.error("❌ Missing encryption keys");
      alert("Subscription is missing required encryption keys. Please try again.");
      return { success: false, reason: 'missing_keys' };
    }

    const subscriptionObject = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
        auth: btoa(String.fromCharCode(...new Uint8Array(auth)))
      }
    };

    // ✅ STEP 7: Save to Database
    console.log("💾 Saving subscription to database...");
    
    const { data, error } = await window.supabase
      .from("push_subscriptions")
      .upsert({
        user_id: user.id,
        subscription: subscriptionObject,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error("❌ Database save failed:", error);
      alert("Failed to save notification settings: " + error.message);
      return { success: false, reason: 'database_error', error: error.message };
    }

    console.log("✅ Subscription saved:", data);
    console.log("🎉 ===== PUSH SUBSCRIPTION COMPLETE =====");

    // Show success notification
    try {
      new Notification("🎉 Notifications Enabled!", {
        body: "You'll receive emergency alerts and incident reports",
        icon: "/public/img/icon-192.png",
        badge: "/public/img/badge-72.png"
      });
    } catch (notifErr) {
      console.warn("⚠️ Success notification failed:", notifErr);
    }

    return { success: true, subscription: subscriptionObject };

  } catch (err) {
    console.error("❌ FATAL ERROR:", err);
    console.error("Stack:", err.stack);
    
    alert(`Notification setup error: ${err.message}\n\nPlease try refreshing the page.`);
    return { success: false, reason: 'fatal_error', error: err.message };
  }
}

// ==================== EVENT LISTENERS ====================
window.addEventListener("supabase-ready", () => {
  console.log("🚀 Supabase ready - starting push setup");
  
  // Small delay to ensure everything is loaded
  setTimeout(() => {
    subscribeUser();
  }, 1000);
});

// Fallback timer
setTimeout(() => {
  if (window.supabase && !pushInitialized) {
    console.log("⏰ Fallback: Starting push setup");
    subscribeUser();
  }
}, 3000);

// ==================== DEBUG FUNCTIONS ====================
window.debugPushSubscription = subscribeUser;

window.testPushNotification = async () => {
  console.log("🧪 Testing local notification...");
  
  if (!('Notification' in window)) {
    alert("This browser doesn't support notifications");
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification("Test Notification", {
      body: "If you see this, local notifications work!",
      icon: "/public/img/icon-192.png",
      badge: "/public/img/badge-72.png",
      vibrate: [200, 100, 200]
    });
    console.log("✅ Test notification sent");
  } else {
    alert("Notification permission: " + Notification.permission + "\n\nPlease allow notifications first.");
  }
};

window.checkPushStatus = async () => {
  console.log("🔍 Checking push notification status...");
  
  const device = getDeviceInfo();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  
  const status = {
    device,
    permission: Notification.permission,
    hasSubscription: !!sub,
    subscriptionEndpoint: sub?.endpoint || null,
    serviceWorkerState: reg.active?.state,
    isInstalled: device.isStandalone
  };
  
  console.table(status);
  alert(JSON.stringify(status, null, 2));
  
  return status;
};

console.log("✅ Push.js loaded");
console.log("💡 Debug commands:");
console.log("  - window.debugPushSubscription()");
console.log("  - window.testPushNotification()");
console.log("  - window.checkPushStatus()");

export { subscribeUser as initPushNotifications };
