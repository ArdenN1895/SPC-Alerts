// incident-report.js - TRUE BROADCAST VERSION (Mobile Compatible)

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('incidentForm');
  const statusMessage = document.getElementById('statusMessage');
  const locationInput = document.getElementById('locationInput');
  const getLocationBtn = document.getElementById('getLocationBtn');
  const photoInput = document.getElementById('incidentPhoto');
  const previewImg = document.getElementById('previewImg');
  const photoPreview = document.getElementById('photoPreview');
  const removePhotoBtn = document.getElementById('removePhoto');

  let currentPosition = null;
  let photoFile = null;

  const supabase = await new Promise(r => {
    if (window.supabase) return r(window.supabase);
    window.addEventListener('supabase-ready', () => r(window.supabase), { once: true });
    setTimeout(() => window.supabase && r(window.supabase), 10000);
  });

  if (!supabase) return showStatus('Connection failed.', 'error');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return location.href = '/public/html/login.html';

  // Photo handling
  photoInput.addEventListener('change', () => {
    photoFile = photoInput.files[0];
    if (photoFile) {
      const reader = new FileReader();
      reader.onload = e => {
        previewImg.src = e.target.result;
        photoPreview.style.display = 'block';
      };
      reader.readAsDataURL(photoFile);
    }
  });

  removePhotoBtn.onclick = () => {
    photoFile = null; 
    photoInput.value = ''; 
    photoPreview.style.display = 'none';
  };

  // Location handling
  getLocationBtn.onclick = () => {
    getLocationBtn.disabled = true;
    getLocationBtn.textContent = 'Getting location...';
    locationInput.value = 'Detecting...';

    navigator.geolocation.getCurrentPosition(
      pos => {
        currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        locationInput.value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        getLocationBtn.textContent = '✓ Location Captured';
        getLocationBtn.style.background = '#4caf50';
      },
      () => {
        locationInput.value = '';
        locationInput.removeAttribute('readonly');
        locationInput.placeholder = 'Type location manually';
        getLocationBtn.disabled = false;
        getLocationBtn.textContent = 'Use My Current Location';
        showStatus('Could not get location. Please enter manually.', 'warning');
      },
      { timeout: 15000, enableHighAccuracy: true }
    );
  };

  // ==================== FORM SUBMISSION (TRUE BROADCAST) ====================
  form.onsubmit = async e => {
    e.preventDefault();
    
    const incidentType = document.getElementById('type').value;
    const description = document.getElementById('description').value.trim();

    if (!incidentType || !description) {
      return showStatus('Please fill in all required fields', 'error');
    }

    if (!currentPosition && !locationInput.value.trim()) {
      return showStatus('Please provide a location', 'error');
    }

    const submitBtn = form.querySelector('.submit-btn');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    showStatus('Uploading incident report...', 'loading');

    try {
      let photoUrl = null;

      // Upload photo
      if (photoFile) {
        showStatus('Uploading photo...', 'loading');
        
        const ext = photoFile.name.split('.').pop();
        const filename = `${user.id}/${Date.now()}.${ext}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('incident-photos')
          .upload(filename, photoFile, { upsert: true });

        if (uploadError && !uploadError.message.includes('duplicate')) {
          console.error('Photo upload error:', uploadError);
          showStatus('Warning: Photo upload failed, continuing without photo', 'warning');
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('incident-photos')
            .getPublicUrl(filename);
          
          photoUrl = publicUrl;
          console.log('✅ Photo uploaded:', photoUrl);
        }
      }

      // Save to database
      showStatus('Saving incident report...', 'loading');

      const incidentData = {
        type: incidentType,
        description: description,
        location: currentPosition || { manual: locationInput.value.trim() },
        photo_url: photoUrl,
        reported_by: user.id
      };

      const { data: insertedIncident, error: dbError } = await supabase
        .from('incidents')
        .insert(incidentData)
        .select()
        .single();

      if (dbError) throw dbError;

      console.log('✅ Incident saved to database:', insertedIncident.id);

      // ==================== BROADCAST PUSH NOTIFICATION ====================
      showStatus('Broadcasting to all users...', 'loading');

      try {
        // Format location for notification
        let locationText = 'San Pablo City';
        if (currentPosition) {
          locationText = `${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)}`;
        } else if (locationInput.value.trim()) {
          locationText = locationInput.value.trim().substring(0, 30);
        }

        // Mobile-friendly notification body (short and concise)
        const notificationBody = `${incidentType} in ${locationText}`;

        // ✅ TRUE BROADCAST: DO NOT include user_ids
        const notificationResult = await supabase.functions.invoke('send-push', {
          body: {
            title: '🚨 New Incident Report',
            body: notificationBody,
            icon: '/public/img/icon-192.png',
            badge: '/public/img/badge-72.png',
            image: photoUrl || undefined,
            url: '/public/html/index.html',
            urgency: 'high', // High priority for mobile
            data: {
              incidentId: insertedIncident.id,
              incidentType: incidentType,
              location: currentPosition || locationInput.value.trim(),
              timestamp: Date.now()
            }
            // ✅ NO user_ids = BROADCAST to ALL subscribers
          }
        });

        console.log('📊 Broadcast result:', notificationResult);

        if (notificationResult.error) {
          console.error('❌ Broadcast failed:', notificationResult.error);
          showStatus('⚠️ Report saved but notification failed', 'warning');
        } else if (notificationResult.data) {
          const result = notificationResult.data;
          console.log(`✅ Broadcast sent to ${result.delivered_to} user(s)`);
          
          if (result.delivered_to > 0) {
            showStatus(
              `✅ Report submitted and ${result.delivered_to} user(s) notified!`,
              'success'
            );
          } else {
            showStatus(
              '✅ Report submitted (no active subscribers)',
              'success'
            );
          }
        }

      } catch (pushError) {
        console.error('⚠️ Broadcast error (non-critical):', pushError);
        showStatus('✅ Report submitted (notification failed)', 'warning');
      }

      // Reset form
      setTimeout(() => {
        form.reset();
        photoPreview.style.display = 'none';
        currentPosition = null;
        photoFile = null;
        locationInput.setAttribute('readonly', 'readonly');
        getLocationBtn.style.background = '';
        getLocationBtn.textContent = 'Use My Current Location';
        getLocationBtn.disabled = false;
        
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 2000);
      }, 2000);

    } catch (err) {
      console.error('❌ Submission error:', err);
      showStatus('Error: ' + (err.message || 'Failed to submit report. Please try again.'), 'error');
      
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  };

  // ==================== STATUS MESSAGE ====================
  function showStatus(msg, type = 'info') {
    statusMessage.textContent = msg;
    statusMessage.className = 'status-message ' + type;
    statusMessage.style.display = 'block';

    if (type === 'success' || type === 'warning') {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 5000);
    }
  }

  // Auto-get location on page load
  setTimeout(() => {
    if (getLocationBtn && !getLocationBtn.disabled) {
      getLocationBtn.click();
    }
  }, 1000);
});
