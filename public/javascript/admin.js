let currentUsers = [];
let currentIncidents = [];

window.addressCache = new Map();

async function getAddressFromCoords(lat, lng) {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (window.addressCache.has(key)) return window.addressCache.get(key);

  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&limit=1`);
    const data = await res.json();
    let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    if (data.features?.[0]?.properties) {
      const p = data.features[0].properties;
      address = [
        p.name || p.street || '',
        p.house_number ? `#${p.house_number}` : '',
        p.suburb || p.city || p.town || 'San Pablo City',
        'Laguna',
        'Philippines'
      ].filter(Boolean).join(', ');
    }

    window.addressCache.set(key, address);
    return address;
  } catch (err) {
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    window.addressCache.set(key, fallback);
    return fallback;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const supabase = await new Promise(resolve => {
    if (window.supabase) return resolve(window.supabase);
    window.addEventListener('supabase-ready', () => resolve(window.supabase), { once: true });
    setTimeout(() => window.supabase && resolve(window.supabase), 10000);
  });

  if (!supabase) return alert('Supabase connection failed');

  const { data: { session } } = await supabase.auth.getSession();
  const stored = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const isAdmin = session?.user?.id && (stored?.is_admin === true || stored?.id === 'admin-001');

  if (!isAdmin) {
    alert('Access denied Admin rights required');
    window.location.href = '/public/html/login.html';
    return;
  }

  document.getElementById('role-text')?.replaceChildren(stored?.role || 'Administrator');

  const page = location.pathname.split('/').pop();

  if (page === 'admin-dashboard.html' || page === '') {
    updateStats(supabase);
    setupQuickActions(supabase, session);
  }

  if (page === 'admin-users.html') {
    await loadUsers(supabase);
    setupUserSearchAndFilter();
    setupUserModal(supabase);
    setupRealtime('users', () => loadUsers(supabase));
  }

  if (page === 'admin-incident.html') {
    await loadIncidents(supabase);
    setupIncidentSearchAndFilter();
    setupRealtime('incidents', () => loadIncidents(supabase));
  }

  window.logout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = '/public/html/login.html';
  };

  setInterval(() => {
    if (page.includes('dashboard')) updateStats(supabase);
    if (page.includes('users')) loadUsers(supabase);
    if (page.includes('incident')) loadIncidents(supabase);
  }, 30000);
});

async function loadIncidents(supabase) {
  const tbody = document.querySelector('#incidentsTableBody') || document.querySelector('tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#666;">Loading incidents...</td></tr>';

  const { data, error } = await supabase
    .from('incidents')
    .select(`
      id, type, description, location, photo_url, created_at,
      reported_by (first_name, last_name, username)
    `)
    .order('created_at', { ascending: false });

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#d32f2f;">Error loading incidents.</td></tr>`;
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:50px;color:#999;">No incidents reported yet.</td></tr>';
    return;
  }

  currentIncidents = data;

  const rows = await Promise.all(data.map(async (incident) => {
    const reporter = incident.reported_by || {};
    const name = `${reporter.first_name || ''} ${reporter.last_name || ''}`.trim() || reporter.username || 'Anonymous';
    const photo = incident.photo_url
      ? `<img src="${incident.photo_url}" alt="Photo" style="width:60px;height:60px;object-fit:cover;border-radius:6px;">`
      : '<div style="width:60px;height:60px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">No Photo</div>';

    const date = new Date(incident.created_at).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    let locationDisplay = 'Not provided';
    if (incident.location?.lat && incident.location?.lng) {
      const lat = incident.location.lat;
      const lng = incident.location.lng;
      const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const address = await getAddressFromCoords(lat, lng);
      locationDisplay = `<a href="${mapUrl}" target="_blank" style="color:#005ea5;font-weight:600;text-decoration:underline;">${escapeHtml(address)}</a>`;
    }

    return `
      <tr>
        <td><strong>${escapeHtml(incident.type || 'General')}</strong></td>
        <td style="max-width:300px;word-wrap:break-word;">${escapeHtml(incident.description || '')}</td>
        <td style="max-width:280px;">${locationDisplay}</td>
        <td>${escapeHtml(name)}</td>
        <td style="font-size:0.9em;">${date}</td>
        <td>${photo}</td>
        <td>
          <button onclick="deleteIncident('${incident.id}')" style="background:#d32f2f;color:white;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:0.85em;">Delete</button>
        </td>
      </tr>
    `;
  }));

  tbody.innerHTML = rows.join('');
}

window.deleteIncident = async (id) => {
  if (!confirm('Delete this incident permanently?')) return;
  const { error } = await window.supabase.from('incidents').delete().eq('id', id);
  if (error) alert('Delete failed: ' + error.message);
  else loadIncidents(window.supabase);
};

async function updateStats(supabase) {
  try {
    const [users, incidents] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('incidents').select('*', { count: 'exact', head: true })
    ]);
    document.querySelector('.stat-card:nth-child(1) h3')?.replaceChildren(users.count || 0);
    document.querySelector('.stat-card:nth-child(2) h3')?.replaceChildren(incidents.count || 0);
  } catch (e) { console.error(e); }
}

async function loadUsers(supabase) {
  const tbody = document.querySelector('.user-list tbody');
  if (!tbody) return;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, address, username, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    currentUsers = data || [];
    renderUsers(currentUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:red;">${err.message}</td></tr>`;
  }
}

function renderUsers(users) {
  const tbody = document.querySelector('.user-list tbody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:60px; color:#888;">
      <i class="fas fa-users" style="font-size:3rem; margin-bottom:16px;"></i>No users found
    </td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown User';
    return `
      <tr data-user-id="${u.id}">
        <td>${name}</td>
        <td>${u.email || 'â€”'}</td>
        <td>${u.phone || 'â€”'}</td>
        <td>${u.address || 'â€”'}</td>
        <td><span style="color:var(--success);">Active</span></td>
        <td class="actions">
          <button class="edit-user-btn" data-id="${u.id}">Edit</button>
        </td>
      </tr>`;
  }).join('');
}

function setupUserSearchAndFilter() {
  const search = document.getElementById('userSearch');
  if (!search) return;

  const apply = () => {
    const query = search.value.toLowerCase();
    const filtered = currentUsers.filter(u => {
      const text = `${u.first_name} ${u.last_name} ${u.email} ${u.phone} ${u.username}`.toLowerCase();
      return text.includes(query);
    });
    renderUsers(filtered);
  };

  search.addEventListener('input', apply);
}

function setupIncidentSearchAndFilter() {
  const search = document.getElementById('incidentSearch');
  const typeFilter = document.getElementById('incidentTypeFilter');
  if (!search && !typeFilter) return;

  const apply = async () => {
    const query = search?.value.toLowerCase() || '';
    const type = typeFilter?.value || 'all';

    // Filter the currentIncidents array instead of reloading
    const filtered = currentIncidents.filter(i => {
      const matchesSearch = (i.description || '').toLowerCase().includes(query) || 
                           (i.type || '').toLowerCase().includes(query);
      const matchesType = type === 'all' || i.type === type;
      return matchesSearch && matchesType;
    });

    // Render filtered results
    await renderFilteredIncidents(filtered);
  };

  search?.addEventListener('input', apply);
  typeFilter?.addEventListener('change', apply);
}

// New function to render filtered incidents
async function renderFilteredIncidents(incidents) {
  const tbody = document.querySelector('#incidentsTableBody') || document.querySelector('tbody');
  if (!tbody) return;

  if (incidents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:50px;color:#999;">No incidents match your filters.</td></tr>';
    return;
  }

  const rows = await Promise.all(incidents.map(async (incident) => {
    const reporter = incident.reported_by || {};
    const name = `${reporter.first_name || ''} ${reporter.last_name || ''}`.trim() || reporter.username || 'Anonymous';
    const photo = incident.photo_url
      ? `<img src="${incident.photo_url}" alt="Photo" style="width:60px;height:60px;object-fit:cover;border-radius:6px;">`
      : '<div style="width:60px;height:60px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">No Photo</div>';

    const date = new Date(incident.created_at).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    let locationDisplay = 'Not provided';
    if (incident.location?.lat && incident.location?.lng) {
      const lat = incident.location.lat;
      const lng = incident.location.lng;
      const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const address = await getAddressFromCoords(lat, lng);
      locationDisplay = `<a href="${mapUrl}" target="_blank" style="color:#005ea5;font-weight:600;text-decoration:underline;">${escapeHtml(address)}</a>`;
    }

    return `
      <tr>
        <td><strong>${escapeHtml(incident.type || 'General')}</strong></td>
        <td style="max-width:300px;word-wrap:break-word;">${escapeHtml(incident.description || '')}</td>
        <td style="max-width:280px;">${locationDisplay}</td>
        <td>${escapeHtml(name)}</td>
        <td style="font-size:0.9em;">${date}</td>
        <td>${photo}</td>
      </tr>
    `;
  }));

  tbody.innerHTML = rows.join('');
}

function setupUserModal(supabase) {
  const modal = document.getElementById('userModal');
  const form = document.getElementById('userForm');
  if (!modal || !form) return;

  document.getElementById('addUserBtn')?.addEventListener('click', () => {
    form.reset();
    document.getElementById('userId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New User';
    document.getElementById('passwordGroup').style.display = 'block';
    modal.classList.add('show');
  });

  document.addEventListener('click', async e => {
    if (e.target.matches('.edit-user-btn')) {
      const user = currentUsers.find(u => u.id === e.target.dataset.id);
      if (!user) return;

      document.getElementById('userId').value = user.id;
      document.getElementById('first_name').value = user.first_name || '';
      document.getElementById('last_name').value = user.last_name || '';
      document.getElementById('username').value = user.username || '';
      document.getElementById('phone').value = user.phone || '';
      document.getElementById('address').value = user.address || '';
      document.getElementById('email').value = user.email || '';
      document.getElementById('password').value = '';
      document.getElementById('modalTitle').textContent = 'Edit User';
      document.getElementById('passwordGroup').style.display = 'block';
      modal.classList.add('show');
    }
  });

  form.onsubmit = async e => {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const payload = {
      first_name: document.getElementById('first_name').value.trim(),
      last_name: document.getElementById('last_name').value.trim(),
      username: document.getElementById('username').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      address: document.getElementById('address').value.trim(),
      email: document.getElementById('email').value.trim(),
    };

    try {
      if (id) {
        const { error } = await supabase.from('users').update(payload).eq('id', id);
        if (error) throw error;
        alert('User updated!');
      } else {
        const password = document.getElementById('password').value;
        if (password.length < 6) throw new Error('Password must be 6+ characters');
        const { data, error } = await supabase.auth.signUp({
          email: payload.email,
          password,
          options: { data: payload }
        });
        if (error) throw error;
        await supabase.from('users').insert({ id: data.user.id, ...payload });
        alert('User created!');
      }
      modal.classList.remove('show');
      loadUsers(supabase);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  document.querySelectorAll('.close, .btn-cancel').forEach(el => {
    el.onclick = () => modal.classList.remove('show');
  });
  window.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('show');
  });
}

function setupRealtime(table, callback) {
  supabase.channel(`realtime-${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
}


// admin.js - setupQuickActions function (BROADCAST ALERT - MOBILE COMPATIBLE)

function setupQuickActions(supabase, session) {
  const alertModal = document.getElementById('alertModal');
  const alertForm = document.getElementById('alertForm');
  const alertTitle = document.getElementById('alertTitle');
  const alertMessage = document.getElementById('alertMessage');
  const urgentAlert = document.getElementById('urgentAlert');
  const previewTitle = document.getElementById('previewTitle');
  const previewMessage = document.getElementById('previewMessage');
  const charCount = document.getElementById('charCount');
  const alertStatus = document.getElementById('alertStatus');
  const sendAlertBtn = document.getElementById('sendAlertBtn');

  // Open modal
  document.querySelector('.action-btn:nth-child(1)')?.addEventListener('click', () => {
    alertModal.classList.add('show');
    alertTitle.focus();
  });

  // Close modal functions
  const closeModal = () => {
    alertModal.classList.remove('show');
    alertStatus.style.display = 'none';
    alertForm.reset();
    updatePreview();
  };

  document.getElementById('closeAlertModal')?.addEventListener('click', closeModal);
  document.getElementById('cancelAlertBtn')?.addEventListener('click', closeModal);
  alertModal.addEventListener('click', (e) => {
    if (e.target === alertModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && alertModal.classList.contains('show')) closeModal();
  });

  // Preview update
  const updatePreview = () => {
    previewTitle.textContent = alertTitle.value.trim() || 'Emergency Alert';
    previewMessage.textContent = alertMessage.value.trim() || 'Please stay safe and follow official instructions.';
    const remaining = 200 - alertMessage.value.length;
    charCount.textContent = `${remaining} characters remaining`;
    charCount.style.color = remaining < 20 ? '#d32f2f' : '#666';
  };

  alertTitle.addEventListener('input', updatePreview);
  alertMessage.addEventListener('input', updatePreview);

  // ==================== BROADCAST ALERT SUBMISSION ====================
  alertForm.onsubmit = async (e) => {
    e.preventDefault();

    const title = alertTitle.value.trim();
    const body = alertMessage.value.trim();
    const isUrgent = urgentAlert.checked;

    if (!title || !body) {
      showStatus('Please fill in all required fields', 'error');
      return;
    }

    sendAlertBtn.disabled = true;
    sendAlertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Broadcasting...';
    showStatus('Preparing broadcast alert...', 'loading');

    try {
      console.log('📢 Starting broadcast alert to ALL users...');

      // ✅ TRUE BROADCAST: DO NOT include user_ids
      const response = await supabase.functions.invoke('send-push', {
        body: {
          title: `🚨 ${title}`,
          body: body, // Keep concise for mobile
          icon: '/public/img/icon-192.png',
          badge: isUrgent ? '/public/img/urgent-badge.png' : '/public/img/badge-72.png',
          url: '/public/html/index.html',
          urgency: isUrgent ? 'high' : 'normal',
          data: {
            alertType: 'admin_broadcast',
            isUrgent: isUrgent,
            timestamp: Date.now()
          }
          // ✅ NO user_ids = BROADCAST to ALL subscribers
        }
      });

      console.log('📊 Broadcast response:', response);

      if (response.error) {
        throw new Error(response.error.message || 'Broadcast failed');
      }

      const result = response.data;

      if (result && result.delivered_to > 0) {
        showStatus(
          `✅ Alert broadcast successfully!\n\nDelivered to: ${result.delivered_to} user(s)\nFailed: ${result.failed || 0}`,
          'success'
        );
        console.log(`✅ Broadcast delivered to ${result.delivered_to} user(s)`);
        setTimeout(() => closeModal(), 3000);
      } else if (result && result.delivered_to === 0) {
        showStatus(
          '⚠️ Alert prepared but no active subscribers found.\nUsers may not have notifications enabled.',
          'warning'
        );
      } else {
        throw new Error('Unexpected response from broadcast service');
      }

    } catch (err) {
      console.error('❌ Broadcast error:', err);
      showStatus('Failed to broadcast alert: ' + err.message, 'error');
    } finally {
      sendAlertBtn.disabled = false;
      sendAlertBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Alert';
    }
  };

  function showStatus(message, type) {
    alertStatus.textContent = message;
    alertStatus.className = `alert-status ${type}`;
    alertStatus.style.display = 'block';
  }

  // Generate Report button (existing code)
  document.querySelector('.action-btn:nth-child(2)')?.addEventListener('click', async () => {
    const { data } = await supabase.from('incidents').select('*').order('created_at', { ascending: false });
    if (!data?.length) return alert('No incidents to export');

    const csv = [
      ['ID', 'Type', 'Description', 'Lat', 'Lng', 'Photo', 'Date'],
      ...data.map(i => [
        i.id,
        i.type || '',
        `"${(i.description || '').replace(/"/g, '""')}"`,
        i.location?.lat || '',
        i.location?.lng || '',
        i.photo_url || '',
        new Date(i.created_at).toLocaleString('en-PH')
      ])
    ].map(r => r.join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SPC-Incidents-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
