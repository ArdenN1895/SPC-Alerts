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
  if (pushInitialized) return;
  pushInitialized = true;

  console.log("🔔 Initializing push subscription...");

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("🚫 Push not supported on this browser");
    return;
  }

  try {
    console.log("⏳ Waiting for service worker...");
    const reg = await navigator.serviceWorker.ready;
    console.log("✔ Service worker ready:", reg.active?.scriptURL);

    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      console.warn("🚫 No logged-in user — push not initialized");
      return;
    }

    console.log("👤 Logged in as:", user.email);

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      console.log("📨 Requesting permission...");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("🚫 Notification permission denied");
        return;
      }

      console.log("🔐 Subscribing user...");
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    console.log("📍 Subscription endpoint:", sub.endpoint);

    const subscriptionObject = {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))),
        auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth"))))
      }
    };

    console.log("💾 Saving subscription...");
    const { error } = await window.supabase
      .from("push_subscriptions")
      .upsert({
        user_id: user.id,
        subscription: subscriptionObject
      }, {
        onConflict: "user_id"
      });

    if (error) throw error;

    console.log("🎉 Subscription saved successfully!");

  } catch (err) {
    console.error("❌ Push subscription failed:", err);
  }
}

window.addEventListener("supabase-ready", () => {
  console.log("🚀 Supabase ready — starting push setup");
  subscribeUser();
});

window.debugPushSubscription = subscribeUser;

export { subscribeUser as initPushNotifications };
