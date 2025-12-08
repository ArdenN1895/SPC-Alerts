// javascript/index.js - REAL ADDRESS + 100% FREE (2025) + MODAL
document.addEventListener('DOMContentLoaded', async () => {
  const cardsContainer = document.querySelector('.cards');
  if (!cardsContainer) return;

  // Cache for addresses
  window.addressCache = new Map();

  let supabase;
  try {
    supabase = await new Promise(resolve => {
      if (window.supabase) return resolve(window.supabase);
      window.addEventListener('supabase-ready', () => resolve(window.supabase), { once: true });
      setTimeout(() => window.supabase && resolve(window.supabase), 10000);
    });
  } catch {
    cardsContainer.innerHTML = '<p style="text-align:center;color:#d32f2f;">Connection failed.</p>';
    return;
  }

  // FREE Reverse Geocoding (Photon + OSM)
  async function getAddressFromCoords(lat, lng) {
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (window.addressCache.has(key)) return window.addressCache.get(key);

    try {
      const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&limit=1`);
      const data = await res.json();
      let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`; // fallback

      if (data.features?.[0]?.properties) {
        const p = data.features[0].properties;
        address = [p.name, p.street, p.city || p.suburb || p.town, 'San Pablo City', 'Laguna', 'Philippines']
          .filter(Boolean).join(', ');
      }

      window.addressCache.set(key, address);
      return address;
    } catch {
      const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      window.addressCache.set(key, fallback);
      return fallback;
    }
  }

  // Show Modal Function
  const showIncidentModal = async (incident) => {
    const reporter = incident.reported_by || {};
    const name = `${reporter.first_name || ''} ${reporter.last_name || ''}`.trim() || 'Anonymous';
    const photo = incident.photo_url || '../img/default-incident.jpg';
    const date = new Date(incident.created_at).toLocaleString('en-PH', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    let locationDisplay = 'Location not provided';
    let mapLink = '#';

    if (incident.location?.lat && incident.location?.lng) {
      const lat = incident.location.lat;
      const lng = incident.location.lng;
      mapLink = `https://maps.google.com/?q=${lat},${lng}`;
      const address = await getAddressFromCoords(lat, lng);
      locationDisplay = `<a href="${mapLink}" target="_blank" class="modal-map-link">${escapeHtml(address)}</a>`;
    }

    const modalHTML = `
      <div class="incident-modal" id="incidentModal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <button class="modal-close" id="modalClose">&times;</button>
          
          <div class="modal-header">
            <h2>${escapeHtml(incident.type)}</h2>
            ${Date.now() - new Date(incident.created_at) < 30000 ? 
              '<span class="modal-badge-new">NEW</span>' : ''}
          </div>

          <div class="modal-body">
            <div class="modal-image">
              <img src="${photo}" alt="Incident photo" onerror="this.src='../img/default-incident.jpg'">
            </div>

            <div class="modal-details">
              <div class="modal-detail-item">
                <i class="fas fa-user"></i>
                <div>
                  <strong>Reported By</strong>
                  <p>${name}</p>
                </div>
              </div>

              <div class="modal-detail-item">
                <i class="fas fa-align-left"></i>
                <div>
                  <strong>Description</strong>
                  <p>${escapeHtml(incident.description)}</p>
                </div>
              </div>

              <div class="modal-detail-item">
                <i class="fas fa-map-marker-alt"></i>
                <div>
                  <strong>Location</strong>
                  <p>${locationDisplay}</p>
                </div>
              </div>

              <div class="modal-detail-item">
                <i class="fas fa-clock"></i>
                <div>
                  <strong>Reported On</strong>
                  <p>${date}</p>
                </div>
              </div>
            </div>

            ${incident.location?.lat && incident.location?.lng ? `
              <div class="modal-actions">
                <a href="${mapLink}" target="_blank" class="btn-view-map">
                  <i class="fas fa-map"></i> View on Map
                </a>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('incidentModal');
    if (existingModal) existingModal.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add event listeners
    const modal = document.getElementById('incidentModal');
    const closeBtn = document.getElementById('modalClose');
    const overlay = modal.querySelector('.modal-overlay');

    const closeModal = () => {
      modal.classList.add('modal-closing');
      setTimeout(() => modal.remove(), 300);
    };

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    // Close on ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Animate in
    setTimeout(() => modal.classList.add('modal-active'), 10);
  };

  const renderIncidents = async (incidents) => {
    if (!incidents.length) {
      cardsContainer.innerHTML = '<p style="text-align:center;padding:50px;color:#999;">No incidents reported yet.</p>';
      return;
    }

    incidents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    cardsContainer.innerHTML = '<p style="text-align:center;color:#666;">Loading locations...</p>';

    const cards = await Promise.all(incidents.map(async (incident) => {
      const reporter = incident.reported_by || {};
      const name = `${reporter.first_name || ''} ${reporter.last_name || ''}`.trim() || 'Anonymous';
      const photo = incident.photo_url || '../img/default-incident.jpg';
      const date = new Date(incident.created_at).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });

      let locationDisplay = 'Location not provided';

      if (incident.location?.lat && incident.location?.lng) {
        const lat = incident.location.lat;
        const lng = incident.location.lng;
        const address = await getAddressFromCoords(lat, lng);
        locationDisplay = escapeHtml(address);
      }

      return `
        <div class="card incident-card" data-incident-id="${incident.id}" style="position:relative;cursor:pointer;">
          <div class="card-img" style="background-image:url('${photo}');"></div>
          <div class="card-content">
            <h3>${escapeHtml(incident.type)}</h3>
            <p><strong>By:</strong> ${name}</p>
            <p class="card-description"><strong>Description:</strong> ${escapeHtml(incident.description)}</p>
            <p><strong>Location:</strong> ${locationDisplay}</p>
            <p style="margin-top:10px;font-size:0.9em;color:#666;">${date}</p>
          </div>
          ${Date.now() - new Date(incident.created_at) < 30000 ? 
            `<div class="card-badge-new">NEW</div>` : ''}
          <div class="card-overlay">
            <i class="fas fa-eye"></i>
            <span>View Details</span>
          </div>
        </div>
      `;
    }));

    cardsContainer.innerHTML = cards.join('');

    // Add click handlers to cards
    document.querySelectorAll('.incident-card').forEach((card) => {
      card.addEventListener('click', () => {
        const incidentId = card.getAttribute('data-incident-id');
        const incident = incidents.find(i => i.id === incidentId);
        if (incident) showIncidentModal(incident);
      });
    });
  };

  const loadIncidents = async () => {
    const { data, error } = await supabase
      .from('incidents')
      .select(`
        id, type, description, location, photo_url, created_at,
        reported_by (first_name, last_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      cardsContainer.innerHTML = '<p style="text-align:center;color:#d32f2f;">Load failed.</p>';
      return;
    }
    renderIncidents(data || []);
  };

  // Realtime
  supabase.channel('incidents-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidents' }, () => loadIncidents())
    .subscribe();

  loadIncidents();
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const burgerBtn = document.getElementById("burgerBtn");
const mainNav = document.getElementById("mainNav");

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
