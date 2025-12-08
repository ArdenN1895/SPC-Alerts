// javascript/incident-report.js - ENHANCED WITH RELIABLE PUSH NOTIFICATIONS

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

  // ==================== FORM SUBMISSION ====================
  form.onsubmit = async e => {
    e.preventDefault();
    
    const incidentType = document.getElementById('type').value;
    const description = document.getElementById('description').value.trim();

    // Validation
    if (!incidentType || !description) {
      return showStatus('Please fill in all required fields', 'error');
    }

    if (!currentPosition && !locationInput.value.trim()) {
      return showStatus('Please provide a location', 'error');
    }

    // Disable submit button to prevent double submission
    const submitBtn = form.querySelector('.submit-btn');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    showStatus('Uploading incident report...', 'loading');

    try {
      let photoUrl = null;

      // ==================== UPLOAD PHOTO ====================
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

      // ==================== SAVE TO DATABASE ====================
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

      // ==================== SEND PUSH NOTIFICATIONS ====================
      showStatus('Notifying users...', 'loading');

      try {
        // Get fresh session token
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          console.warn('⚠️ Session error, push may fail:', sessionError);
        }

        // Format location for notification
        let locationText = 'San Pablo City';
        if (currentPosition) {
          locationText = `${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)}`;
        } else if (locationInput.value.trim()) {
          locationText = locationInput.value.trim().substring(0, 30);
        }

        // Prepare notification payload
        const notificationPayload = {
          title: '🚨 New Incident Reported',
          body: `${incidentType} reported in ${locationText}. ${description.substring(0, 80)}${description.length > 80 ? '...' : ''}`,
          icon: '/public/img/icon-192.png',
          badge: '/public/img/badge-72.png',
          image: photoUrl || undefined,
          url: '/public/html/index.html', // Open map to show incident location
          data: {
            incidentId: insertedIncident.id,
            incidentType: incidentType,
            timestamp: Date.now()
          }
        };

        console.log('📤 Sending push notification...', notificationPayload);

        // Call Edge Function
        const pushResponse = await fetch('https://oqmfjwlpuwfpbnpiavhp.supabase.co/functions/v1/send-push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xbWZqd2xwdXdmcGJucGlhdmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTgxNzYsImV4cCI6MjA3OTQ3NDE3Nn0.yywiH3q3g1Rbyypt5mxvhRgDXZrSFENZn5s1EWVp8Z8'
          },
          body: JSON.stringify(notificationPayload)
        });

        const pushResult = await pushResponse.json();
        console.log('📊 Push notification result:', pushResult);

        if (pushResponse.ok) {
          if (pushResult.delivered_to > 0) {
            console.log(`✅ Push notifications sent to ${pushResult.delivered_to} user(s)`);
          } else {
            console.warn('⚠️ No users subscribed to push notifications');
          }
        } else {
          console.error('❌ Push notification failed:', pushResult.error);
        }

      } catch (pushError) {
        // Don't fail the whole submission if push fails
        console.error('⚠️ Push notification error (non-critical):', pushError);
      }

      // ==================== SUCCESS ====================
      showStatus('✅ Report submitted successfully! Thank you for helping keep San Pablo City safe.', 'success');

      // Reset form after 2 seconds
      setTimeout(() => {
        form.reset();
        photoPreview.style.display = 'none';
        currentPosition = null;
        photoFile = null;
        locationInput.setAttribute('readonly', 'readonly');
        getLocationBtn.style.background = '';
        getLocationBtn.textContent = 'Use My Current Location';
        getLocationBtn.disabled = false;
        
        // Optionally redirect to map
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 2000);
      }, 2000);

    } catch (err) {
      console.error('❌ Submission error:', err);
      showStatus('Error: ' + (err.message || 'Failed to submit report. Please try again.'), 'error');
      
      // Re-enable submit button on error
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  };

  // ==================== STATUS MESSAGE ====================
  function showStatus(msg, type = 'info') {
    statusMessage.textContent = msg;
    statusMessage.className = 'status-message ' + type;
    statusMessage.style.display = 'block';

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
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
