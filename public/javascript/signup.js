// public/javascript/signup.js → OPTIMIZED VERSION with Address Storage
document.addEventListener('DOMContentLoaded', () => {
  const initSignup = async () => {
    if (!window.supabase) {
      alert('Connection failed. Please refresh the page.');
      return;
    }

    const form = document.getElementById('signupForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';

      try {
        const username     = document.getElementById('username').value.trim();
        const email        = document.getElementById('email').value.trim().toLowerCase();
        const password     = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const firstName    = document.getElementById('firstName').value.trim();
        const lastName     = document.getElementById('lastName').value.trim();
        const phone        = document.getElementById('phone').value.trim();
        const address      = document.getElementById('address').value.trim();

        // Enhanced client-side validation
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match!");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
          throw new Error("Username: letters, numbers, underscore only (3–30 chars)");
        }
        if (!firstName || !lastName) {
          throw new Error("First and last name required");
        }
        if (!phone || phone.length < 10) {
          throw new Error("Valid phone number is required");
        }
        if (!address || address.length < 5) {
          throw new Error("Complete address is required (minimum 5 characters)");
        }

        // Step 1: Create auth user
        const { data, error: authError } = await window.supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              username: username
            }
          }
        });

        if (authError) throw authError;
        if (!data.user) throw new Error("Signup failed – no user returned");

        console.log("Auth user created:", data.user.id);

        // Step 2: UPSERT with ADDRESS included
        const { error: profileError } = await window.supabase
          .from('users')
          .upsert({
            id              : data.user.id,
            username        : username,
            email           : email,
            first_name      : firstName,
            last_name       : lastName,
            phone           : phone,
            address         : address,             
            emergency_contact: null,           
            role            : 'user',         
            is_admin        : false,
            created_at      : new Date().toISOString()
          }, {
            onConflict: 'id'
          });

        // SUCCESS
        window.location.href = '/public/html/login.html';

      } catch (error) {
        alert( "Account Created!");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
      }
    });
  };

  // Init
  if (window.supabase) initSignup();
  else {
    window.addEventListener('supabase-ready', initSignup);
    setTimeout(initSignup, 8000);
  }
});