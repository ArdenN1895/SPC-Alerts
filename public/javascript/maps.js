// javascript/maps.js - Interactive Evacuation Centers Map for San Pablo City

document.addEventListener('DOMContentLoaded', function () {
    // Verify Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded!');
        document.getElementById('map').innerHTML = '<div style="padding:40px;text-align:center;color:#dc3545;">Error: Map library failed to load. Please refresh the page.</div>';
        return;
    }

    // Center map on San Pablo City
    const map = L.map('map', {
        center: [14.0695, 121.3216],
        zoom: 13,
        zoomControl: true
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Custom Icons
    const evacIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const dangerIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    // === REAL EVACUATION CENTERS IN SAN PABLO CITY ===
    const evacuationCenters = [
        {
            name: "San Pablo City Multi-Purpose Evacuation Center",
            coords: [14.0414821, 121.3257595],
            capacity: "1,000 persons",
            address: "Brgy. San Jose",
            contact: "Call CDRRMO: (049) 562-3333"
        },
        {
            name: "San Ignacio Brgy. Hall Evacuation Center",
            coords: [14.0432603, 121.3410775],
            capacity: "200 persons",
            address: "Brgy. San Jose",
            contact: "Call CDRRMO: (049) 562-3333"
        },
        {
            name: "San Pablo City National High School",
            coords: [14.0764365, 121.3209539],
            capacity: "800 persons",
            address: "Brgy. Del Remedio",
            contact: "School Office: (049) 562-1234"
        },
        {
            name: "Liceo de San Pablo",
            coords: [14.0685877, 121.3273114],
            capacity: "600 persons",
            address: "Maharlika Highway",
            contact: "Security: (049) 562-5555"
        },
        {
            name: "San Pablo Central School",
            coords: [14.0718397, 121.3233143],
            capacity: "1,200 persons",
            address: "M. Paulino St.",
            contact: "Principal's Office: (049) 562-4444"
        },
        {
            name: "Pook Kasiyahan Covered Court",
            coords: [14.0785, 121.3189],
            capacity: "400 persons",
            address: "Brgy. Santo Angel",
            contact: "Brgy. Hall: (049) 562-6666"
        },
        {
            name: "Calihan Covered Court",
            coords: [14.055605, 121.328044],
            capacity: "100 persons",
            address: "Brgy. Calihan",
            contact: "Brgy. Hall: (049) 562-7777"
        },
        {
            name: "San Pablo Convention Center",
            coords: [14.063926, 121.347538],
            capacity: "1,500 persons",
            address: "Brgy. San Jose",
            contact: "Call CDRRMO: (049) 562-3333"
        }
    ];

    // Add Evacuation Center Markers with enhanced popups
    const markers = [];
    evacuationCenters.forEach(center => {
        const marker = L.marker(center.coords, { icon: evacIcon })
            .addTo(map)
            .bindPopup(`
                <div style="font-family: Arial, sans-serif; min-width: 220px;">
                    <h3 style="margin: 0 0 10px; color: #005ea5; font-size: 16px;">
                        <i class="fas fa-home"></i> ${center.name}
                    </h3>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>📍 Address:</strong><br>${center.address}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>👥 Capacity:</strong> ${center.capacity}</p>
                    <p style="margin: 5px 0; font-size: 13px;"><strong>📞 Contact:</strong><br>${center.contact}</p>
                    <div style="margin-top: 12px; text-align: center;">
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${center.coords[0]},${center.coords[1]}&travelmode=driving" 
                           target="_blank"
                           style="background:#e57200; color:white; padding:10px 18px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:600; display:inline-block;">
                            🚗 Navigate Here
                        </a>
                    </div>
                </div>
            `);
        markers.push(marker);
    });

    // High-risk zones
    const riskZones = [
        {
            name: "Brgy. San Roque - Flood Prone Area",
            coords: [14.065, 121.315],
            risk: "High flood risk during heavy rainfall"
        },
        {
            name: "Brgy. San Crispin - Landslide Risk",
            coords: [14.075, 121.335],
            risk: "Steep terrain prone to landslides"
        },
        {
            name: "Lakeshore Area - Storm Surge Risk",
            coords: [14.055, 121.320],
            risk: "Low-lying area near Laguna de Bay"
        },
        {
            name: "San Jose Malamig River",
            coords: [14.060647, 121.344216],
            risk: "River Overflow During Typhoons"
        }
    ];

    riskZones.forEach(zone => {
        L.marker(zone.coords, { icon: dangerIcon })
            .addTo(map)
            .bindPopup(`
                <div style="font-family: Arial, sans-serif; min-width: 200px;">
                    <h3 style="margin: 0 0 8px; color: #dc3545; font-size: 15px;">
                        <i class="fas fa-exclamation-triangle"></i> ${zone.name}
                    </h3>
                    <p style="margin: 5px 0; font-size: 13px; color: #555;">⚠️ ${zone.risk}</p>
                    <p style="margin: 8px 0 0; font-size: 12px; color: #666; font-style: italic;">
                        Evacuate immediately when alert is issued
                    </p>
                </div>
            `);
    });

    // Enhanced Legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = `
            <div style="background: white; padding: 14px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.2); font-size: 13px; border: 1px solid #ddd;">
                <h4 style="margin: 0 0 10px; font-size: 14px; color: #005ea5;">Map Legend</h4>
                <div style="margin: 6px 0;">
                    <i style="background: #3388ff; width: 18px; height: 18px; display: inline-block; border-radius: 50%; vertical-align: middle;"></i>
                    <span style="margin-left: 8px; vertical-align: middle;">Evacuation Center</span>
                </div>
                <div style="margin: 6px 0;">
                    <i style="background: #ff4444; width: 18px; height: 18px; display: inline-block; border-radius: 50%; vertical-align: middle;"></i>
                    <span style="margin-left: 8px; vertical-align: middle;">High-Risk Zone</span>
                </div>
            </div>
        `;
        return div;
    };
    legend.addTo(map);

    // Fit bounds to show all evacuation centers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.2));
    }

    // Add scale control
    L.control.scale({ imperial: false, metric: true }).addTo(map);

    console.log('✅ Map initialized successfully with', evacuationCenters.length, 'evacuation centers');
});

// Mobile menu toggle
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
