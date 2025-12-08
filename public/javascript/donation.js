// PWA Install Button Logic
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show the install button
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'flex';
        
        installBtn.addEventListener('click', () => {
            installBtn.style.display = 'none';
            deferredPrompt.prompt();
            
            deferredPrompt.userChoice.then((choice) => {
                if (choice.outcome === 'accepted') {
                    console.log('User installed the app');
                }
                deferredPrompt = null;
            });
        });
    }
});

const burgerBtn = document.getElementById("burgerBtn");
const mainNav = document.getElementById("mainNav");

burgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mainNav.classList.toggle("show");
    burgerBtn.classList.toggle("active"); // animate
});

// Close menu on outside click
document.addEventListener("click", (e) => {
    if (!mainNav.contains(e.target) && !burgerBtn.contains(e.target)) {
        mainNav.classList.remove("show");
        burgerBtn.classList.remove("active"); // reset animation
    }
});