// javascript/profile.js - FIXED & WORKING (2025)
import '../javascript/supabase.js';

let currentUserData = null;
let supabaseClient = null;

function waitForSupabase() {
  return new Promise(resolve => {
    if (window.supabase) return resolve(window.supabase);
    window.addEventListener('supabase-ready', () => resolve(window.supabase), { once: true });
    // Fallback
    const check = setInterval(() => {
      if (window.supabase) {
        clearInterval(check);
        resolve(window.supabase);
      }
    }, 100);
    setTimeout(() => resolve(null), 10000);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  supabaseClient = await waitForSupabase();
  if (!supabaseClient) {
    alert('Failed to connect to database');
    return;
  }

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const fakeAdmin = JSON.parse(localStorage.getItem('currentUser') || 'null');

      if (session?.user) {
        await loadUserFromSupabase(session.user.id);
      } else if (fakeAdmin?.is_admin) {
        loadFakeAdmin(fakeAdmin);
      } else {
        if (confirm('Not logged in. Go to login?')) {
          location.href = 'login.html';
        }
      }
    } catch (err) {
      console.error(err);
      alert('Session error');
      location.href = 'login.html';
    }
  };

  const loadUserFromSupabase = async (userId) => {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) {
        alert('Profile not found. Please complete registration.');
        location.href = 'signup.html';
        return;
      }

      currentUserData = data;
      populateProfile(); // Now it runs!
    } catch (err) {
      console.error(err);
      alert('Failed to load profile');
    }
  };

  const loadFakeAdmin = (admin) => {
    currentUserData = {
      first_name: admin.first_name || 'Super',
      last_name: admin.last_name || 'Admin',
      email: admin.email || 'admin@spcalert.ph',
      phone: admin.phone || '',
      address: admin.address || '',
      role: 'admin',
      emergency_contact: admin.emergency_contact || {
        firstName: "Emergency", lastName: "Team", relationship: "Staff", phone: "+639171234567"
      }
    };
    populateProfile(); // Also called here
  };

  // MAIN POPULATE FUNCTION — ALL LOGIC INSIDE
  const populateProfile = () => {
    if (!currentUserData) return;

    const fullName = `${currentUserData.first_name || ''} ${currentUserData.last_name || ''}`.trim() || 'User';
    document.querySelectorAll('.profile-name').forEach(el => el.textContent = fullName);

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    set('fullName', fullName);
    set('phoneNumber', currentUserData.phone || '');
    set('address', currentUserData.address || '');

    // === EMERGENCY CONTACT LOGIC ===
    const contact = currentUserData.emergency_contact || {};
    const loading = document.getElementById('contact-loading');
    const display = document.getElementById('contact-display');
    const none = document.getElementById('no-contact');
    const formContainer = document.getElementById('contact-form-container');

    if (loading) loading.style.display = 'none';

    const showForm = (editMode = false) => {
      display.style.display = 'none';
      none.style.display = 'none';
      formContainer.style.display = 'block';

      if (editMode && contact.firstName) {
        document.getElementById('ecFirstName').value = contact.firstName || '';
        document.getElementById('ecLastName').value = contact.lastName || '';
        document.getElementById('ecRelationship').value = contact.relationship || '';
        document.getElementById('ecPhone').value = contact.phone || '';
      } else {
        document.getElementById('emergencyContactForm').reset();
      }
    };

    const showDisplay = () => {
      formContainer.style.display = 'none';
      if (contact && contact.firstName) {
        display.style.display = 'block';
        document.getElementById('contact-name').textContent = `${contact.firstName} ${contact.lastName || ''}`.trim();
        const rel = contact.relationship || '';
        const relMap = {
            spouse: 'Spouse',
            parent: 'Parent',
            child: 'Child',
            sibling: 'Sibling',
            friend: 'Friend',
            other: 'Other'
          };
        document.getElementById('contact-relationship').textContent = relMap[rel] || rel || 'Contact';
        document.getElementById('contact-phone').textContent = contact.phone || '—';
      } else {
        none.style.display = 'block';
      }
    };

    showDisplay();

    // Button Listeners
    document.getElementById('addContactBtn')?.addEventListener('click', () => showForm());
    document.getElementById('editContactBtn')?.addEventListener('click', () => showForm(true));
    document.getElementById('cancelEditBtn')?.addEventListener('click', showDisplay);

    // Save Emergency Contact
  document.getElementById('emergencyContactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  // FIX #1: Format phone number FIRST
  let phoneInput = document.getElementById('ecPhone').value.trim();
  let formattedPhone = phoneInput;

  if (phoneInput.startsWith('09') && phoneInput.length === 11) {
    formattedPhone = '+63' + phoneInput.slice(1);
  } else if (!phoneInput.startsWith('+')) {
    formattedPhone = '+63' + phoneInput.replace(/[^\d]/g, '');
  }

  const newContact = {
    firstName: document.getElementById('ecFirstName').value.trim(),
    lastName: document.getElementById('ecLastName').value.trim(),
    relationship: document.getElementById('ecRelationship').value.trim(),
    phone: formattedPhone 
  };

  // Validation
  if (!newContact.firstName || !newContact.relationship || !newContact.phone) {
    return alert('Please fill in all required fields');
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not logged in');

    const { error } = await supabaseClient
      .from('users')
      .update({ emergency_contact: newContact })
      .eq('id', session.user.id);

    if (error) throw error;

    // CRITICAL: Force update the in-memory data
    currentUserData.emergency_contact = newContact;

    // FORCE RE-RENDER EVERYTHING
    document.getElementById('contact-loading').style.display = 'none';
    document.getElementById('contact-form-container').style.display = 'none';
    document.getElementById('no-contact').style.display = 'none';
    document.getElementById('contact-display').style.display = 'block';

    // Manually update every text field — this guarantees it shows
    document.getElementById('contact-name').textContent = 
      `${newContact.firstName} ${newContact.lastName || ''}`.trim();

    const relMap = {
      spouse: 'Spouse', parent: 'Parent', child: 'Child',
      sibling: 'Sibling', friend: 'Friend', other: 'Other'
    };
    document.getElementById('contact-relationship').textContent = 
      relMap[newContact.relationship] || newContact.relationship || 'Contact';

    document.getElementById('contact-phone').textContent = 
      newContact.phone || '—';

    alert('Emergency contact saved successfully!');

    // Smooth scroll to show the user it updated
    document.getElementById('contact-display').scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });

  } catch (err) {
    console.error(err);
    alert('Save failed: ' + err.message);
  }
});

    // === SAVE PERSONAL INFO ===
    document.querySelector('.profile-form button[type="submit"]')?.addEventListener('click', async (e) => {
      e.preventDefault();

      const name = document.getElementById('fullName').value.trim();
      if (!name) return alert('Full name is required');

      const [first, ...rest] = name.split(' ');
      const updates = {
        first_name: first || null,
        last_name: rest.join(' ') || null,
        phone: document.getElementById('phoneNumber').value.trim() || null,
        address: document.getElementById('address').value.trim() || null,
      };

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('No session');

        const { error } = await supabaseClient
          .from('users')
          .update(updates)
          .eq('id', session.user.id);

        if (error) throw error;

        alert('Profile updated successfully!');
        document.querySelectorAll('.profile-name').forEach(el => el.textContent = name);
      } catch (err) {
        console.error(err);
        alert('Save failed: ' + err.message);
      }
    });

    // Admin badge
    if (currentUserData.role === 'admin') {
      if (!document.querySelector('.admin-badge')) {
        const badge = document.createElement('div');
        badge.textContent = 'ADMINISTRATOR';
        badge.className = 'admin-badge';
        badge.style.cssText = 'background:#d32f2f;color:white;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:bold;margin-top:12px;display:inline-block;';
        document.querySelector('.profile-header-centered')?.appendChild(badge);
      }
    }
  };

  // Start everything
  await checkAuth();
});

// Burger menu (unchanged)
const burgerBtn = document.getElementById("burgerBtn");
const mainNav = document.getElementById("mainNav");

if (burgerBtn && mainNav) {
  burgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mainNav.classList.toggle("show");
    burgerBtn.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    if (!mainNav.contains(e.target) && !burgerBtn.contains(e.target)) {
      mainNav.classList.remove("show");
      burgerBtn.classList.remove("active");
    }
  });
}