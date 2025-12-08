// javascript/supabase.js - FIXED & SAFE VERSION (2025)
const supabaseUrl = 'https://oqmfjwlpuwfpbnpiavhp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xbWZqd2xwdXdmcGJucGlhdmhwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mzg5ODE3NiwiZXhwIjoyMDc5NDc0MTc2fQ.fj7Uz0vCundy05Lw73lpRUd1yZuDYqVw4PqkXpOZ1uU';

import('https://esm.sh/@supabase/supabase-js@2').then(module => {
  const { createClient } = module;
  window.supabase = createClient(supabaseUrl, supabaseAnonKey);

  // GLOBAL AUTH LISTENER â€” DO NOT REDIRECT HERE!
  window.supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event, session?.user?.email || 'no user');

    // Only handle logout â†’ go to login
    if (event === 'SIGNED_OUT') {
      localStorage.clear();
      if (!location.pathname.includes('login.html') && !location.pathname.includes('signup.html')) {
        location.href = '/public/html/login.html';
      }
    }
  });

  // Signal that Supabase is ready
  window.dispatchEvent(new Event('supabase-ready'));
});
