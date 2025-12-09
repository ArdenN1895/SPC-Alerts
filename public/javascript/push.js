const VAPID_PUBLIC_KEY = "BA1RcIbho_qDHz-TEjBmAAG73hbLnI0ACtV_U0kZdT9z_Bnnx_FEEFH1ZsCb_I-IIRWIF3PClSoKe4DUKq5bPQQ";

// Prevent duplicate execution
let pushInitialized = false;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function subscribeUser() {
  if (pushInitialized) {
    console.log("⚠️ Push already initialized, skipping...");
    return;
  }
  pushInitialized = true;

  console.log("🔔 ===== PUSH SUBSCRIPTION DEBUG START =====");
  console.log("📱 User Agent:", navigator.userAgent);
  console.log("🌐 Platform:", navigator.platform);
  console.log("📍 Location:", window.location.href);

  // ✅ CHECK 1: Browser Support
  if (!("serviceWorker" in navigator)) {
    console.error("❌ Service Worker NOT supported");
    alert("Push notifications not supported: No Service Worker");
    return;
  }
  console.log("✅ Service Worker supported");

  if (!("PushManager" in window)) {
    console.error("❌ Push Manager NOT supported");
    alert("Push notifications not supported: No Push Manager");
    return;
  }
  console.log("✅ Push Manager supported");

  // ✅ CHECK 2: HTTPS
  if (location.protocol !== 'https:' && !location.hostname.includes('localhost')) {
    console.error("❌ Not running on HTTPS");
    alert("Push notifications require HTTPS");
    return;
  }
  console.log("✅ Running on HTTPS");

  // ✅ CHECK 3: Current Permission State
  if ('Notification' in window) {
    console.log("🔔 Current permission:", Notification.permission);
    if (Notification.permission === 'denied') {
      console.error("❌ Notification permission DENIED by user");
      alert("⚠️ Push notifications are blocked. Please enable them in your browser settings:\n\n" +
            "iOS: Settings > Safari > [Your Site] > Notifications\n" +
            "Android: Site Settings > Notifications > Allow");
      return;
    }
  }

  try {
    // ✅ CHECK 4: Service Worker Registration
    console.log("⏳ Waiting for service worker to be ready...");
    const reg = await navigator.serviceWorker.ready;
    console.log("✅ Service worker ready:", reg.active?.scriptURL);
    console.log("📦 Service worker state:", reg.active?.state);

    // ✅ CHECK 5: User Authentication
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      console.warn("🚫 No logged-in user — push not initialized");
      return;
    }
    console.log("👤 Logged in as:", user.email, "| ID:", user.id);

    // ✅ CHECK 6: Existing Subscription
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      console.log("ℹ️ Existing subscription found:", sub.endpoint);
    } else {
      console.log("📝 No existing subscription, requesting permission...");
      
      // Request permission BEFORE subscribing
      const permission = await Notification.requestPermission();
      console.log("🔔 Permission result:", permission);
      
      if (permission !== "granted") {
        console.error("❌ Notification permission denied:", permission);
        alert("⚠️ Push notifications were not enabled. Please allow notifications when prompted.");
        return;
      }
      console.log("✅ Permission GRANTED");

      // Subscribe to push
      console.log("🔐 Subscribing with VAPID key...");
      try {
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        console.log("✅ Successfully subscribed to push service");
      } catch (subError) {
        console.error("❌ Subscription failed:", subError);
        alert("Failed to subscribe to push notifications: " + subError.message);
        return;
      }
    }

    console.log("📍 Subscription endpoint:", sub.endpoint);
    console.log("⏰ Expiration time:", sub.expirationTime || "Never");

    // ✅ CHECK 7: Extract Keys
    const p256dhKey = sub.getKey("p256dh");
    const authKey = sub.getKey("auth");
    
    if (!p256dhKey || !authKey) {
      console.error("❌ Missing encryption keys");
      alert("Push subscription is missing required encryption keys");
      return;
    }
    console.log("🔑 Encryption keys present:", {
      p256dh: p256dhKey.byteLength + " bytes",
      auth: authKey.byteLength + " bytes"
    });

    const subscriptionObject = {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dhKey))),
        auth: btoa(String.fromCharCode(...new Uint8Array(authKey)))
      }
    };

    // ✅ CHECK 8: Save to Database
    console.log("💾 Saving subscription to database...");
    const { data, error } = await window.supabase
      .from("push_subscriptions")
      .upsert({
        user_id: user.id,
        subscription: subscriptionObject
      }, {
        onConflict: "user_id"
      })
      .select();

    if (error) {
      console.error("❌ Database save failed:", error);
      alert("Failed to save push subscription: " + error.message);
      return;
    }

    console.log("✅ Subscription saved to database:", data);
    console.log("🎉 ===== PUSH SUBSCRIPTION COMPLETE =====");
    
    // Show success message
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification("🎉 Notifications Enabled!", {
        body: "You'll now receive emergency alerts and incident reports",
        icon: "/public/img/icon-192.png",
        badge: "/public/img/badge-72.png"
      });
    }

  } catch (err) {
    console.error("❌ PUSH SUBSCRIPTION FAILED:", err);
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    
    alert("Push notification setup failed:\n\n" + err.message + 
          "\n\nPlease check browser console for details.");
  }
}

// Listen for supabase-ready event
window.addEventListener("supabase-ready", () => {
  console.log("🚀 Supabase ready — starting push setup");
  subscribeUser();
});

// Fallback: Try after a delay if event already fired
setTimeout(() => {
  if (window.supabase && !pushInitialized) {
    console.log("⏰ Fallback: Starting push setup");
    subscribeUser();
  }
}, 2000);

// Export for manual debugging
window.debugPushSubscription = subscribeUser;

// Add test notification function
window.testPushNotification = async () => {
  console.log("🧪 Testing local notification...");
  
  if (!('Notification' in window)) {
    alert("This browser doesn't support notifications");
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification("Test Notification", {
      body: "If you see this, notifications are working!",
      icon: "/public/img/icon-192.png",
      badge: "/public/img/badge-72.png",
      vibrate: [200, 100, 200]
    });
    console.log("✅ Test notification sent");
  } else {
    alert("Notification permission: " + Notification.permission);
  }
};

console.log("✅ Push.js loaded successfully");
console.log("💡 Debug commands available:");
console.log("  - window.debugPushSubscription() - Retry subscription");
console.log("  - window.testPushNotification() - Test local notification");

export { subscribeUser as initPushNotifications };
