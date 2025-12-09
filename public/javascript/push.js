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
    console.log("🔔 Push already initialized, skipping...");
    return;
  }
  pushInitialized = true;

  console.log("🔔 Initializing push subscription...");

  // ✅ CHECK 1: Browser support
  if (!("serviceWorker" in navigator)) {
    console.warn("🚫 Service Worker not supported on this browser");
    return;
  }

  if (!("PushManager" in window)) {
    console.warn("🚫 Push API not supported on this browser");
    return;
  }

  try {
    // ✅ CHECK 2: Wait for service worker to be ready (with timeout)
    console.log("⏳ Waiting for service worker...");
    
    const registrationPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Service Worker timeout')), 15000)
    );
    
    const reg = await Promise.race([registrationPromise, timeoutPromise]);
    
    if (!reg || !reg.active) {
      throw new Error('Service Worker not active');
    }
    
    console.log("✅ Service worker ready:", reg.active?.scriptURL);

    // ✅ CHECK 3: User authentication
    const { data: { user }, error: authError } = await window.supabase.auth.getUser();
    if (authError || !user) {
      console.warn("🚫 No logged-in user — push not initialized");
      return;
    }

    console.log("👤 Logged in as:", user.email);

    // ✅ CHECK 4: Check for existing subscription
    let sub = await reg.pushManager.getSubscription();
    
    if (sub) {
      console.log("🔔 Existing subscription found:", sub.endpoint.substring(0, 50) + "...");
      
      // Verify subscription is still valid by testing the keys
      try {
        const testKeys = sub.getKey("p256dh") && sub.getKey("auth");
        if (!testKeys) {
          console.log("🗑️ Invalid subscription, unsubscribing...");
          await sub.unsubscribe();
          sub = null;
        }
      } catch (e) {
        console.log("🗑️ Corrupted subscription, unsubscribing...");
        await sub.unsubscribe();
        sub = null;
      }
    }

    // ✅ CHECK 5: Request permission if needed
    if (!sub) {
      console.log("🔨 No valid subscription, requesting permission...");
      
      const permission = await Notification.requestPermission();
      console.log("🔔 Notification permission:", permission);
      
      if (permission !== "granted") {
        console.warn("🚫 Notification permission denied");
        return;
      }

      // ✅ CHECK 6: Wait a bit before subscribing (helps with mobile)
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log("📝 Creating new subscription...");
      
      // ✅ CHECK 7: Convert VAPID key properly
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      
      // ✅ CHECK 8: Subscribe with error handling
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey
        });
        
        console.log("✅ Push subscription created successfully!");
        console.log("📍 Subscription endpoint:", sub.endpoint.substring(0, 80) + "...");
        
      } catch (subError) {
        console.error("❌ Push subscription failed:", subError);
        
        // ✅ CHECK 9: Provide detailed error information
        if (subError.name === 'AbortError') {
          console.error("❌ AbortError - Possible causes:");
          console.error("   1. Service worker scope issues");
          console.error("   2. Invalid VAPID key");
          console.error("   3. Browser push service unavailable");
          console.error("   4. Network connectivity issues");
          console.error("   5. Too many registration attempts");
          
          // Try to clear old subscriptions
          try {
            const oldSub = await reg.pushManager.getSubscription();
            if (oldSub) {
              await oldSub.unsubscribe();
              console.log("🗑️ Cleared old subscription, please reload page");
            }
          } catch (e) {
            console.error("Failed to clear old subscription:", e);
          }
        }
        
        // Show user-friendly message
        console.warn("⚠️ Push notifications unavailable. You can still use the app.");
        return;
      }
    }

    // ✅ CHECK 10: Convert keys to base64
    const subscriptionObject = {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))),
        auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth"))))
      }
    };

    console.log("💾 Saving subscription to database...");
    
    // ✅ CHECK 11: Save to database with retry logic
    let retries = 3;
    let saved = false;
    
    while (retries > 0 && !saved) {
      const { error } = await window.supabase
        .from("push_subscriptions")
        .upsert({
          user_id: user.id,
          subscription: subscriptionObject
        }, {
          onConflict: "user_id"
        });

      if (!error) {
        saved = true;
        console.log("🎉 Subscription saved successfully!");
      } else {
        console.error(`❌ Save attempt failed (${4 - retries}/3):`, error.message);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (!saved) {
      console.error("❌ Failed to save subscription after 3 attempts");
      console.warn("⚠️ You may not receive push notifications");
    }

  } catch (err) {
    console.error("❌ Push subscription setup failed:", err);
    console.error("Stack:", err.stack);
    
    // Reset flag so user can try again
    pushInitialized = false;
  }
}

// ✅ CHECK 12: Multiple initialization triggers
window.addEventListener("supabase-ready", () => {
  console.log("🚀 Supabase ready — starting push setup");
  subscribeUser();
});

// Fallback: Try after page load
if (document.readyState === 'complete') {
  setTimeout(subscribeUser, 2000);
} else {
  window.addEventListener('load', () => {
    setTimeout(subscribeUser, 2000);
  });
}

// Debug function
window.debugPushSubscription = async function() {
  console.log("🔍 PUSH NOTIFICATION DEBUG INFO");
  console.log("================================");
  
  console.log("1. Browser Support:");
  console.log("   - Service Worker:", "serviceWorker" in navigator);
  console.log("   - Push Manager:", "PushManager" in window);
  console.log("   - Notifications:", "Notification" in window);
  
  console.log("\n2. Notification Permission:", Notification.permission);
  
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    console.log("\n3. Service Worker:", reg ? "Registered" : "Not registered");
    if (reg) {
      console.log("   - Active:", reg.active ? "Yes" : "No");
      console.log("   - Scope:", reg.scope);
      
      const sub = await reg.pushManager.getSubscription();
      console.log("\n4. Push Subscription:", sub ? "Active" : "None");
      if (sub) {
        console.log("   - Endpoint:", sub.endpoint.substring(0, 80) + "...");
        console.log("   - Expiration:", sub.expirationTime || "Never");
      }
    }
  }
  
  console.log("\n5. Supabase:", window.supabase ? "Connected" : "Not connected");
  
  if (window.supabase) {
    const { data: { user } } = await window.supabase.auth.getUser();
    console.log("   - User:", user ? user.email : "Not logged in");
  }
  
  console.log("\n6. Push Initialized:", pushInitialized);
  
  console.log("\n💡 To retry subscription, run:");
  console.log("   pushInitialized = false; subscribeUser();");
};

// Manual retry function
window.retryPushSubscription = async function() {
  console.log("🔄 Manually retrying push subscription...");
  pushInitialized = false;
  await subscribeUser();
};

export { subscribeUser as initPushNotifications };
