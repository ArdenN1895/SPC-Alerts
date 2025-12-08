// javascript/sos.js - FIXED Real-time Updates with Proper Channel Handling
let sosCooldown = false;
let currentUserSOSId = null;
let realtimeChannel = null;
let statusCheckInterval = null;

async function getAddressFromCoords(lat, lng) {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (window.sosAddressCache && window.sosAddressCache.has(key)) {
    return window.sosAddressCache.get(key);
  }

  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&limit=1`);
    const data = await res.json();
    let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

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

    if (!window.sosAddressCache) window.sosAddressCache = new Map();
    window.sosAddressCache.set(key, address);
    return address;
  } catch (err) {
    console.warn('SOS address lookup failed:', err);
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

async function getSupabaseClient() {
  return new Promise(resolve => {
    if (window.supabase) return resolve(window.supabase);
    window.addEventListener('supabase-ready', () => resolve(window.supabase), { once: true });
    setTimeout(() => window.supabase && resolve(window.supabase), 10000);
  });
}

function showSOSStatusModal() {
  let modal = document.getElementById('sosStatusModal');
  
  if (!modal) {
    const modalHTML = `
      <div id="sosStatusModal" class="sos-status-modal">
        <div class="sos-modal-overlay"></div>
        <div class="sos-modal-content">
          <button class="sos-modal-close" id="sosModalClose">&times;</button>
          <div class="sos-modal-header">
            <i class="fas fa-ambulance"></i>
            <h3>Your SOS Status</h3>
          </div>
          <div class="sos-modal-body">
            <div class="sos-status-display">
              <div class="status-item" id="sosStatusWaiting">
                <div class="status-icon waiting">
                  <i class="fas fa-clock"></i>
                </div>
                <div class="status-text">
                  <strong>Waiting</strong>
                  <p>Emergency request received</p>
                </div>
              </div>
              <div class="status-divider"></div>
              <div class="status-item" id="sosStatusDispatched">
                <div class="status-icon dispatched">
                  <i class="fas fa-truck-medical"></i>
                </div>
                <div class="status-text">
                  <strong>Dispatched</strong>
                  <p>Help is on the way</p>
                </div>
              </div>
              <div class="status-divider"></div>
              <div class="status-item" id="sosStatusArrived">
                <div class="status-icon arrived">
                  <i class="fas fa-check-circle"></i>
                </div>
                <div class="status-text">
                  <strong>Arrived</strong>
                  <p>Help has arrived</p>
                </div>
              </div>
            </div>
            <div id="sosStatusMessage" class="sos-status-message"></div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modal = document.getElementById('sosStatusModal');
    
    const style = document.createElement('style');
    style.textContent = `
      .sos-status-modal {
        display: none;
        position: fixed;
        z-index: 10000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      
      .sos-status-modal.show {
        display: flex;
      }
      
      .sos-modal-overlay {
        position: absolute;
        width: 100%;
        height: 100%;
      }
      
      .sos-modal-content {
        position: relative;
        background: white;
        border-radius: 16px;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 25px 70px rgba(0, 0, 0, 0.35);
        animation: modalSlideIn 0.4s ease;
      }
      
      @keyframes modalSlideIn {
        from {
          opacity: 0;
          transform: translateY(-50px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .sos-modal-close {
        position: absolute;
        top: 15px;
        right: 15px;
        width: 35px;
        height: 35px;
        border: none;
        background: rgba(0, 0, 0, 0.1);
        color: #333;
        font-size: 28px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s;
        z-index: 1;
      }
      
      .sos-modal-close:hover {
        background: #d32f2f;
        color: white;
        transform: rotate(90deg);
      }
      
      .sos-modal-header {
        background: linear-gradient(135deg, #d32f2f, #b71c1c);
        color: white;
        padding: 25px;
        border-radius: 16px 16px 0 0;
        text-align: center;
      }
      
      .sos-modal-header i {
        font-size: 48px;
        margin-bottom: 10px;
        animation: pulse 2s infinite;
      }
      
      .sos-modal-header h3 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
      }
      
      .sos-modal-body {
        padding: 30px 25px;
      }
      
      .sos-status-display {
        display: flex;
        flex-direction: column;
        gap: 15px;
      }
      
      .status-item {
        display: flex;
        align-items: center;
        gap: 15px;
        opacity: 0.4;
        transition: all 0.3s ease;
      }
      
      .status-item.active {
        opacity: 1;
        transform: scale(1.05);
      }
      
      .status-icon {
        width: 60px;
        height: 60px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        color: white;
        flex-shrink: 0;
      }
      
      .status-icon.waiting {
        background: linear-gradient(135deg, #f59e0b, #d97706);
      }
      
      .status-icon.dispatched {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
      }
      
      .status-icon.arrived {
        background: linear-gradient(135deg, #10b981, #059669);
      }
      
      .status-text {
        flex: 1;
      }
      
      .status-text strong {
        display: block;
        font-size: 18px;
        color: #333;
        margin-bottom: 4px;
      }
      
      .status-text p {
        margin: 0;
        color: #666;
        font-size: 14px;
      }
      
      .status-divider {
        width: 30px;
        height: 2px;
        background: #ddd;
        margin-left: 30px;
      }
      
      .sos-status-message {
        margin-top: 25px;
        padding: 15px;
        background: #f0f9ff;
        border-left: 4px solid #3b82f6;
        border-radius: 8px;
        font-size: 14px;
        color: #1e40af;
      }
      
      @media (max-width: 480px) {
        .sos-modal-content {
          max-width: 95%;
          margin: 10px;
        }
        
        .sos-modal-header {
          padding: 20px 15px;
        }
        
        .sos-modal-header i {
          font-size: 40px;
        }
        
        .sos-modal-header h3 {
          font-size: 20px;
        }
        
        .sos-modal-body {
          padding: 20px 15px;
        }
        
        .status-icon {
          width: 50px;
          height: 50px;
          font-size: 24px;
        }
        
        .status-text strong {
          font-size: 16px;
        }
        
        .status-text p {
          font-size: 13px;
        }
        
        .status-divider {
          margin-left: 25px;
        }
      }
    `;
    document.head.appendChild(style);
    
    document.getElementById('sosModalClose').addEventListener('click', () => {
      modal.classList.remove('show');
    });
    
    modal.querySelector('.sos-modal-overlay').addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }
  
  modal.classList.add('show');
}

async function updateSOSStatusUI(status) {
  const waitingEl = document.getElementById('sosStatusWaiting');
  const dispatchedEl = document.getElementById('sosStatusDispatched');
  const arrivedEl = document.getElementById('sosStatusArrived');
  const messageEl = document.getElementById('sosStatusMessage');
  
  [waitingEl, dispatchedEl, arrivedEl].forEach(el => el?.classList.remove('active'));
  
  switch (status) {
    case 'waiting':
      waitingEl?.classList.add('active');
      if (messageEl) messageEl.innerHTML = '<strong> Your emergency request has been received.</strong><br>Help is being coordinated. Please stay safe.';
      break;
    case 'dispatched':
      waitingEl?.classList.add('active');
      dispatchedEl?.classList.add('active');
      if (messageEl) messageEl.innerHTML = '<strong>Emergency responders have been dispatched!</strong><br>Help is on the way to your location.';
      break;
    case 'arrived':
      waitingEl?.classList.add('active');
      dispatchedEl?.classList.add('active');
      arrivedEl?.classList.add('active');
      if (messageEl) messageEl.innerHTML = '<strong>Help has arrived at your location!</strong><br>Emergency responders are there to assist you.';
      break;
  }
}

async function checkSOSStatus(supabase, userId) {
  try {
    const { data, error } = await supabase
      .from('sos_requests')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error checking SOS status:', error);
      return null;
    }

    console.log('Current SOS status:', data);
    return data;
  } catch (err) {
    console.error('Error in checkSOSStatus:', err);
    return null;
  }
}

async function setupRealtimeUpdates(supabase, userId) {
  console.log('Setting up real-time updates for user:', userId);

  // Clean up previous channel
  if (realtimeChannel) {
    console.log('Removing previous channel');
    await supabase.removeChannel(realtimeChannel);
  }

  // Clear previous interval
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }

  // Create unique channel name
  const channelName = `sos-status-${userId}-${Date.now()}`;
  console.log('Creating channel:', channelName);

  let lastKnownStatus = null;

  // Initial status check
  const initialStatus = await checkSOSStatus(supabase, userId);
  if (initialStatus) {
    lastKnownStatus = initialStatus.status;
    console.log('Initial status:', lastKnownStatus);
  }

  // Setup realtime subscription
  realtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sos_requests',
        filter: `user_id=eq.${userId}`
      },
      async (payload) => {
        console.log('Real-time event received:', payload);
        
        const newStatus = payload.new?.status;
        const oldStatus = payload.old?.status || lastKnownStatus;
        
        if (newStatus && newStatus !== oldStatus) {
          console.log(`Status changed: "${oldStatus}" "${newStatus}"`);
          lastKnownStatus = newStatus;
          
          // Update UI
          await updateSOSStatusUI(newStatus);
          
          // Show notification
          if (Notification.permission === 'granted') {
            const statusMessages = {
              'waiting': 'Your emergency request is being processed',
              'dispatched': 'Emergency responders are on the way!',
              'arrived': 'Help has arrived at your location!'
            };
            
            new Notification('SOS Status Update', {
              body: statusMessages[newStatus] || 'Status updated',
              icon: '/img/icon-192.png',
              badge: '/img/badge-72.png',
              tag: 'sos-status',
              requireInteraction: true
            });
          }
          
          // Show modal
          showSOSStatusModal();
        }
      }
    )
    .subscribe((status) => {
      console.log('Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Successfully subscribed to real-time updates');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Channel error - setting up polling fallback');
        setupPollingFallback(supabase, userId);
      } else if (status === 'TIMED_OUT') {
        console.error('Subscription timed out - retrying...');
        setTimeout(() => setupRealtimeUpdates(supabase, userId), 5000);
      }
    });

  // Polling fallback (every 10 seconds)
  setupPollingFallback(supabase, userId);

  return realtimeChannel;
}

function setupPollingFallback(supabase, userId) {
  let lastPolledStatus = null;

  statusCheckInterval = setInterval(async () => {
    const statusData = await checkSOSStatus(supabase, userId);
    
    if (statusData && statusData.status !== lastPolledStatus) {
      console.log('Polling detected status change:', lastPolledStatus, '→', statusData.status);
      lastPolledStatus = statusData.status;
      
      await updateSOSStatusUI(statusData.status);
      
      if (Notification.permission === 'granted') {
        const statusMessages = {
          'waiting': 'Your emergency request is being processed',
          'dispatched': 'Emergency responders are on the way!',
          'arrived': 'Help has arrived at your location!'
        };
        
        new Notification('SOS Status Update', {
          body: statusMessages[statusData.status] || 'Status updated',
          icon: '/img/icon-192.png',
          badge: '/img/badge-72.png',
          tag: 'sos-status',
          requireInteraction: true
        });
      }
      
      showSOSStatusModal();
    }
  }, 10000); // Check every 10 seconds
}

document.addEventListener('DOMContentLoaded', async () => {
  const sosButton = document.getElementById('sosButton');
  const statusEl = document.getElementById('sosStatus');

  if (!sosButton) return;

  const supabase = await getSupabaseClient();
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      console.log('User logged in:', session.user.id);
      
      // Request notification permission
      if (Notification.permission === 'default') {
        console.log('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
      }
      
      // Setup realtime updates
      await setupRealtimeUpdates(supabase, session.user.id);
    } else {
      console.warn('No user session found');
    }
  }

  sosButton.addEventListener('click', async () => {
    if (sosCooldown) {
      alert('SOS already sent! Please wait before sending again.');
      return;
    }

    statusEl.style.display = 'block';
    statusEl.textContent = 'Getting your location...';

    if (!navigator.geolocation) {
      statusEl.textContent = 'Geolocation is not supported on your device.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
        const timestamp = new Date().toLocaleString('en-PH');

        statusEl.textContent = 'Converting location to address...';
        const readableAddress = await getAddressFromCoords(lat, lng);

        statusEl.textContent = 'Fetching emergency contact...';

        try {
          const supabase = await getSupabaseClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (!session) {
            statusEl.textContent = 'You must be logged in to use SOS.';
            return;
          }

          const { data: userData, error } = await supabase
            .from('users')
            .select('first_name, emergency_contact')
            .eq('id', session.user.id)
            .single();

          if (error || !userData?.emergency_contact?.phone) {
            statusEl.textContent = 'No emergency contact found. Go to Profile to add one.';
            return;
          }

          const contact = userData.emergency_contact;
          const userName = userData.first_name || 'Someone';

          const message = `${userName} needs urgent help!\n\nLocation: ${readableAddress}\nMap: ${mapsLink}\nTime: ${timestamp}\n\nSent from SPC Alerts App`;

          statusEl.textContent = 'Saving SOS request...';

          // Save SOS to database
          const { data: sosData, error: sosError } = await supabase
            .from('sos_requests')
            .insert({
              user_id: session.user.id,
              location: { lat, lng },
              contact_phone: contact.phone,
              status: 'waiting'
            })
            .select()
            .single();

          if (sosError) {
            throw new Error('Failed to save SOS request: ' + sosError.message);
          }

          currentUserSOSId = sosData.id;
          console.log('SOS saved to database:', sosData.id);

          statusEl.textContent = 'Sending emergency SMS...';

          // Send SMS
          const { data: smsResult, error: smsError } = await supabase.functions.invoke('send-sos-sms', {
            body: {
              to: contact.phone,
              message: message
            }
          });

          if (smsError) {
            throw new Error(smsError.message || 'Failed to send SMS');
          }

          if (smsResult.success) {
            statusEl.style.color = '#28a745';
            statusEl.textContent = `SOS sent to ${contact.firstName || 'your contact'}! Help is coming.`;

            await updateSOSStatusUI('waiting');
            setTimeout(() => showSOSStatusModal(), 1000);

            sosCooldown = true;
            sosButton.disabled = true;
            sosButton.innerHTML = 'SOS Sent (60s)';

            let seconds = 60;
            const timer = setInterval(() => {
              seconds--;
              sosButton.innerHTML = `SOS Sent (${seconds}s)`;
              if (seconds <= 0) {
                clearInterval(timer);
                sosCooldown = false;
                sosButton.disabled = false;
                sosButton.innerHTML = 'SOS - EMERGENCY';
                statusEl.style.display = 'none';
              }
            }, 1000);
          } else {
            throw new Error(smsResult.error || 'SMS send failed');
          }

        } catch (err) {
          console.error('SOS Error:', err);
          statusEl.style.color = '#d32f2f';
          statusEl.textContent = `Failed to send SOS: ${err.message}`;
        }
      },
      (err) => {
        statusEl.textContent = 'Location access denied. Enable GPS and refresh.';
        console.error(err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

  // View SOS Status button
  const heroButtons = document.querySelector('.hero-buttons');
  if (heroButtons && !document.getElementById('viewSOSStatusBtn')) {
    const statusBtn = document.createElement('button');
    statusBtn.id = 'viewSOSStatusBtn';
    statusBtn.className = 'btn btn-outline';
    statusBtn.style.cssText = 'background: #3b82f6; color: white; border-color: #3b82f6;';
    statusBtn.innerHTML = '<i class="fas fa-info-circle"></i> View SOS Status';
    statusBtn.addEventListener('click', async () => {
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert('Please log in to view SOS status');
        return;
      }

      const statusData = await checkSOSStatus(supabase, session.user.id);

      if (statusData) {
        await updateSOSStatusUI(statusData.status);
        showSOSStatusModal();
      } else {
        alert('No SOS requests found. Send an SOS first.');
      }
    });
    heroButtons.appendChild(statusBtn);
  }
});