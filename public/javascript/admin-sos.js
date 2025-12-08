// admin-sos.js - SOS Management for Admin
let currentSOSRecords = [];
window.sosAddressCache = new Map();

async function getAddressFromCoords(lat, lng) {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (window.sosAddressCache.has(key)) {
    return window.sosAddressCache.get(key);
  }

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

    window.sosAddressCache.set(key, address);
    return address;
  } catch (err) {
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    window.sosAddressCache.set(key, fallback);
    return fallback;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return past.toLocaleDateString('en-PH');
}

async function loadSOSRecords(supabase) {
  const tbody = document.querySelector('#sosTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#666;">Loading SOS records...</td></tr>';

  try {
    // First, get SOS requests
    const { data: sosData, error: sosError } = await supabase
      .from('sos_requests')
      .select('id, user_id, location, contact_phone, status, created_at')
      .order('created_at', { ascending: false });

    if (sosError) throw sosError;

    // Then, get user details for each SOS
    const sosWithUsers = await Promise.all((sosData || []).map(async (sos) => {
      const { data: userData } = await supabase
        .from('users')
        .select('first_name, last_name, phone')
        .eq('id', sos.user_id)
        .single();

      return {
        ...sos,
        user: userData
      };
    }));

    currentSOSRecords = sosWithUsers;
    await renderSOSRecords(currentSOSRecords);
    updateStats(currentSOSRecords);
  } catch (err) {
    console.error('Error loading SOS records:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="color:#d32f2f;text-align:center;padding:40px;">Error loading SOS records: ${err.message}</td></tr>`;
  }
}

async function renderSOSRecords(records) {
  const tbody = document.querySelector('#sosTableBody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:50px;color:#999;">No SOS requests yet.</td></tr>';
    return;
  }

  const rows = await Promise.all(records.map(async (sos) => {
    const user = sos.user || {};
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User';
    const contactPhone = sos.contact_phone || user.phone || 'N/A';

    const time = new Date(sos.created_at).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    const timeAgo = getTimeAgo(sos.created_at);

    let locationDisplay = 'Location not provided';
    let mapLink = '#';

    if (sos.location?.lat && sos.location?.lng) {
      const lat = sos.location.lat;
      const lng = sos.location.lng;
      mapLink = `https://maps.google.com/?q=${lat},${lng}`;
      const address = await getAddressFromCoords(lat, lng);
      locationDisplay = escapeHtml(address);
    }

    // Highlight new SOS (within 10 seconds)
    const isNew = Date.now() - new Date(sos.created_at) < 10000;
    const rowClass = isNew ? 'sos-alert-new' : '';

    return `
      <tr class="${rowClass}">
        <td>
          <div class="sos-time">${time}</div>
          <span class="sos-time-ago">${timeAgo}</span>
        </td>
        <td>
          <div class="sos-sender">${escapeHtml(userName)}</div>
        </td>
        <td>
          <div class="sos-contact">${escapeHtml(contactPhone)}</div>
        </td>
        <td>
          <div class="sos-location">
            ${sos.location?.lat && sos.location?.lng ? 
              `<a href="${mapLink}" target="_blank" title="Open in Google Maps">${locationDisplay}</a>` : 
              locationDisplay}
          </div>
        </td>
        <td>
          <span class="status-badge ${sos.status}">${sos.status}</span>
        </td>
        <td>
          <div class="action-buttons-sos">
            <button class="btn-update-status" data-sos-id="${sos.id}" data-status="${sos.status}">
              <i class="fas fa-edit"></i> Update
            </button>
            ${sos.location?.lat && sos.location?.lng ? 
              `<a href="${mapLink}" target="_blank" class="btn-view-location">
                <i class="fas fa-map-marker-alt"></i> Map
              </a>` : 
              ''}
          </div>
        </td>
      </tr>
    `;
  }));

  tbody.innerHTML = rows.join('');

  // Attach event listeners to update buttons
  document.querySelectorAll('.btn-update-status').forEach(btn => {
    btn.addEventListener('click', () => {
      const sosId = btn.getAttribute('data-sos-id');
      const currentStatus = btn.getAttribute('data-status');
      openStatusModal(sosId, currentStatus);
    });
  });
}

function updateStats(records) {
  const today = new Date().toDateString();
  const todayRecords = records.filter(r => new Date(r.created_at).toDateString() === today);

  const waiting = todayRecords.filter(r => r.status === 'waiting').length;
  const dispatched = todayRecords.filter(r => r.status === 'dispatched').length;
  const arrived = todayRecords.filter(r => r.status === 'arrived').length;

  document.getElementById('waitingCount').textContent = waiting;
  document.getElementById('dispatchedCount').textContent = dispatched;
  document.getElementById('arrivedCount').textContent = arrived;
  document.getElementById('totalCount').textContent = todayRecords.length;
}

function openStatusModal(sosId, currentStatus) {
  const modal = document.getElementById('statusModal');
  const currentStatusEl = document.getElementById('currentStatus');
  const newStatusSelect = document.getElementById('newStatus');
  const sosIdInput = document.getElementById('sosId');

  sosIdInput.value = sosId;
  currentStatusEl.textContent = currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1);
  newStatusSelect.value = currentStatus;

  modal.classList.add('show');
}

function closeStatusModal() {
  const modal = document.getElementById('statusModal');
  modal.classList.remove('show');
}

async function updateSOSStatus(supabase, sosId, newStatus) {
  try {
    // Get the SOS request details first
    const { data: sosData, error: fetchError } = await supabase
      .from('sos_requests')
      .select('user_id')
      .eq('id', sosId)
      .single();

    if (fetchError) throw fetchError;

    // Update the status
    const { error } = await supabase
      .from('sos_requests')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', sosId);

    if (error) throw error;

    console.log('Status updated to:', newStatus, 'for SOS:', sosId);
    
    // Send push notification to the user
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const statusMessages = {
        'waiting': 'Your emergency request is being processed',
        'dispatched': 'Emergency responders are on the way!',
        'arrived': 'Help has arrived at your location!'
      };

      const notificationResult = await supabase.functions.invoke('send-push', {
        body: {
          title: 'SOS Status Update',
          body: statusMessages[newStatus],
          icon: '/img/icon-192.png',
          badge: '/img/badge-72.png',
          url: '/public/html/index.html',
          urgency: 'high',
          user_ids: [sosData.user_id]
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      console.log('Push notification sent:', notificationResult);
    } catch (notifError) {
      console.warn('Failed to send push notification:', notifError);
      // Don't fail the status update if notification fails
    }

    alert(`Status updated to: ${newStatus}`);
    closeStatusModal();
    await loadSOSRecords(supabase);
  } catch (err) {
    console.error('Error updating status:', err);
    alert('Failed to update status: ' + err.message);
  }
}

function setupSearchAndFilter() {
  const searchInput = document.getElementById('sosSearch');
  const statusFilter = document.getElementById('sosStatusFilter');

  const applyFilters = async () => {
    const searchQuery = searchInput?.value.toLowerCase() || '';
    const statusValue = statusFilter?.value || 'all';

    const filtered = currentSOSRecords.filter(sos => {
      const user = sos.user || {};
      const userName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      const matchesSearch = userName.includes(searchQuery);
      const matchesStatus = statusValue === 'all' || sos.status === statusValue;

      return matchesSearch && matchesStatus;
    });

    await renderSOSRecords(filtered);
  };

  searchInput?.addEventListener('input', applyFilters);
  statusFilter?.addEventListener('change', applyFilters);
}

document.addEventListener('DOMContentLoaded', async () => {
  const supabase = await new Promise(resolve => {
    if (window.supabase) return resolve(window.supabase);
    window.addEventListener('supabase-ready', () => resolve(window.supabase), { once: true });
    setTimeout(() => window.supabase && resolve(window.supabase), 10000);
  });

  if (!supabase) return alert('Supabase connection failed');

  // Check admin access
  const { data: { session } } = await supabase.auth.getSession();
  const stored = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const isAdmin = session?.user?.id && (stored?.is_admin === true || stored?.id === 'admin-001');

  if (!isAdmin) {
    alert('Access denied – Admin rights required');
    window.location.href = '/public/html/login.html';
    return;
  }

  // Load SOS records
  await loadSOSRecords(supabase);
  setupSearchAndFilter();

  // Setup realtime subscription
  supabase.channel('sos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_requests' }, () => {
      loadSOSRecords(supabase);
    })
    .subscribe();

  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    loadSOSRecords(supabase);
  });

  // Status modal handlers
  const modal = document.getElementById('statusModal');
  const updateStatusBtn = document.getElementById('updateStatusBtn');
  const closeButtons = document.querySelectorAll('.close, .btn-cancel');

  updateStatusBtn?.addEventListener('click', async () => {
    const sosId = document.getElementById('sosId').value;
    const newStatus = document.getElementById('newStatus').value;
    await updateSOSStatus(supabase, sosId, newStatus);
  });

  closeButtons.forEach(btn => {
    btn.addEventListener('click', closeStatusModal);
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) closeStatusModal();
  });

  // Auto-refresh every 2 minutes
  setInterval(() => loadSOSRecords(supabase), 120000);
});