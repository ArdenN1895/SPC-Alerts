// javascript/pwa.js - Enhanced Install + Auto Push Subscribe
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const installBtns = document.querySelectorAll('#installBtn');
  installBtns.forEach(btn => {
    btn.style.display = 'flex';
    btn.onclick = async () => {
      btn.style.display = 'none';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User installed the PWA');
      }
      deferredPrompt = null;
    };
  });
});

// Auto-subscribe to push after login (call this from your pages)
window.subscribeToPush = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (!sub) {
      await Notification.requestPermission();
      if (Notification.permission === 'granted') {
        import('../javascript/push.js').then(module => module.initPushNotifications());
      }
    }
  } catch (err) {
    console.log('Push init failed:', err);
  }
};
