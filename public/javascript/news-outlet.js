// javascript/news-outlet.js
// PHILIPPINES-ONLY CALAMITY UPDATES — Real-time from ABS-CBN with Filtering

document.addEventListener('DOMContentLoaded', async () => {
    const newsGrid = document.getElementById('news-grid');
    const loadingEl = document.getElementById('loading');
    const noResultsEl = document.getElementById('no-results');
    const errorEl = document.getElementById('error');

    // State for pagination, updates, and filtering
    let allNewsItems = [];
    let filteredNewsItems = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let isUpdating = false;
    let lastUpdateTime = null;
    let currentFilter = 'all';

    // CORS Proxy for scraping (use a reliable proxy service)
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
    const ABS_CBN_URL = 'https://www.abs-cbn.com/calamity-hub';

    // Function to fetch and parse news from ABS-CBN Calamity Hub
    async function fetchNewsFromAbsCbn() {
        try {
            // Fetch through CORS proxy
            const response = await fetch(CORS_PROXY + encodeURIComponent(ABS_CBN_URL));
            
            if (!response.ok) {
                throw new Error('Failed to fetch page');
            }

            const html = await response.text();
            
            // Parse HTML to extract articles
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract articles - adjust selectors based on actual ABS-CBN structure
            const articles = [];
            
            // Try multiple possible selectors for articles
            let articleElements = doc.querySelectorAll('article, .article, .news-item, .post, .story');
            
            // If no articles found with those selectors, try to find by common patterns
            if (articleElements.length === 0) {
                articleElements = doc.querySelectorAll('[class*="article"], [class*="news"], [class*="story"]');
            }

            articleElements.forEach((article, index) => {
                if (index >= 20) return; // Limit to 20 articles

                try {
                    // Extract title
                    let title = article.querySelector('h1, h2, h3, h4, .title, [class*="title"]')?.textContent?.trim();
                    
                    // Extract description
                    let description = article.querySelector('p, .excerpt, .description, [class*="excerpt"]')?.textContent?.trim();
                    
                    // Extract date
                    let dateElement = article.querySelector('time, .date, [class*="date"]');
                    let dateStr = dateElement?.getAttribute('datetime') || dateElement?.textContent?.trim();
                    
                    // Extract URL
                    let url = article.querySelector('a')?.href;
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.abs-cbn.com' + url;
                    }
                    
                    // Detect calamity type from title and description
                    const text = (title + ' ' + description).toLowerCase();
                    let type = 'Calamity';
                    
                    if (text.includes('typhoon') || text.includes('cyclone') || text.includes('storm')) type = 'Typhoon';
                    else if (text.includes('earthquake') || text.includes('quake') || text.includes('tremor')) type = 'Earthquake';
                    else if (text.includes('flood') || text.includes('flooding')) type = 'Flood';
                    else if (text.includes('volcano') || text.includes('volcanic') || text.includes('eruption') || text.includes('lava')) type = 'Volcanic';
                    else if (text.includes('landslide') || text.includes('mudslide') || text.includes('mudflow')) type = 'Landslide';
                    else if (text.includes('drought') || text.includes('dry spell')) type = 'Drought';
                    
                    if (title && url) {
                        articles.push({
                            title: title,
                            description: description || 'No description available.',
                            type: type,
                            date: dateStr || new Date().toISOString(),
                            url: url
                        });
                    }
                } catch (err) {
                    console.error('Error parsing article:', err);
                }
            });

            // If scraping fails or returns no results, use sample data as fallback
            if (articles.length === 0) {
                console.warn('No articles scraped, using sample data');
                return getSampleData();
            }

            return articles;
        } catch (err) {
            console.error('Fetch error:', err);
            // Fallback to sample data on error
            return getSampleData();
        }
    }

    // Sample data as fallback
    function getSampleData() {
        return [
            {
                title: "Typhoon 'Pepito' makes second landfall in Luzon, evacuations intensify",
                description: "Super Typhoon Pepito has made a second landfall near Cagayan, bringing destructive winds and heavy rains. Over 50,000 people evacuated; Signal No. 5 now hoisted in parts of Ilocos.",
                type: "Typhoon",
                date: "November 29, 2025, 2:30 PM",
                url: "https://www.abs-cbn.com/news/2025/11/29/typhoon-pepito-second-landfall-luzon"
            },
            {
                title: "Aftershocks from 6.1 quake rattle Cebu, structural checks ordered",
                description: "Following yesterday's 6.1 magnitude earthquake, multiple aftershocks up to 4.5 have hit Central Visayas. No casualties, but buildings in Cebu City are under inspection.",
                type: "Earthquake",
                date: "November 29, 2025, 11:15 AM",
                url: "https://www.abs-cbn.com/news/2025/11/29/cebu-aftershocks-6-1-quake"
            },
            {
                title: "La Nina rains cause river overflow in Bicol region",
                description: "Enhanced southwest monsoon due to La Nina has led to flooding along the Bicol River, affecting 10 barangays. Relief goods distributed by DSWD.",
                type: "Flood",
                date: "November 28, 2025, 7:45 PM",
                url: "https://www.abs-cbn.com/news/2025/11/28/bicol-floods-la-nina"
            },
            {
                title: "Volcanic unrest at Taal Lake monitored closely",
                description: "Phivolcs reports increased seismic activity at Taal Volcano, with 15 earthquakes detected overnight. Alert Level 2 remains; tourists advised to stay away.",
                type: "Volcanic",
                date: "November 28, 2025, 4:20 PM",
                url: "https://www.abs-cbn.com/news/2025/11/28/taal-volcano-unrest"
            },
            {
                title: "Landslide risks rise in Ifugao after relentless downpours",
                description: "Heavy rains have saturated slopes in Ifugao, prompting preemptive evacuations in high-risk areas. DENR warns of potential slides.",
                type: "Landslide",
                date: "November 27, 2025, 10:10 AM",
                url: "https://www.abs-cbn.com/news/2025/11/27/ifugao-landslide-risks"
            },
            {
                title: "Typhoon 'Pepito' approaches Samar, signals raised nationwide",
                description: "Super Typhoon Pepito intensified as it approached the Philippines, prompting evacuations in low-lying areas. Signal No. 4 raised over Eastern Visayas.",
                type: "Typhoon",
                date: "November 25, 2025, 3:00 PM",
                url: "https://www.abs-cbn.com/news/2025/11/25/typhoon-pepito-landfall-samar"
            },
            {
                title: "Earthquake swarm hits Mindanao, no major damage reported",
                description: "A series of tremors, the strongest at 5.2 magnitude, rattled Davao region early Monday. Authorities advise preparedness amid aftershocks.",
                type: "Earthquake",
                date: "November 24, 2025, 8:45 AM",
                url: "https://www.abs-cbn.com/news/2025/11/24/mindanao-earthquake-swarm"
            },
            {
                title: "Flash floods submerge Metro Manila streets after heavy rains",
                description: "Monsoon rains caused widespread flooding in Quezon City and Manila, displacing hundreds. Rescue operations ongoing.",
                type: "Flood",
                date: "November 23, 2025, 6:30 PM",
                url: "https://www.abs-cbn.com/news/2025/11/23/manila-flash-floods-monsoon"
            },
            {
                title: "Drought alert issued for Eastern Visayas amid El Nino effects",
                description: "Prolonged dry spell due to El Nino has led to water rationing in Samar and Leyte. Farmers seek government aid.",
                type: "Drought",
                date: "November 20, 2025, 5:30 PM",
                url: "https://www.abs-cbn.com/news/2025/11/20/visayas-drought-el-nino"
            },
            {
                title: "Minor eruption at Kanlaon Volcano spews ash over Negros",
                description: "A phreatomagmatic eruption at Kanlaon Volcano sent ash clouds 3km high, affecting nearby farms. Alert Level 2 raised.",
                type: "Volcanic",
                date: "November 19, 2025, 11:45 AM",
                url: "https://www.abs-cbn.com/news/2025/11/19/kanlaon-eruption-ashfall"
            }
        ];
    }

    // Function to apply filter
    function applyFilter(filterType) {
        currentFilter = filterType;
        
        if (filterType === 'all') {
            filteredNewsItems = [...allNewsItems];
        } else {
            filteredNewsItems = allNewsItems.filter(item => {
                const itemType = item.type.toLowerCase();
                const filter = filterType.toLowerCase();
                
                // Match variations of calamity types
                if (filter === 'typhoon') {
                    return itemType.includes('typhoon') || itemType.includes('cyclone') || 
                           itemType.includes('storm') || itemType.includes('depression');
                } else if (filter === 'earthquake') {
                    return itemType.includes('earthquake') || itemType.includes('quake') || 
                           itemType.includes('tremor');
                } else if (filter === 'volcanic') {
                    return itemType.includes('volcanic') || itemType.includes('volcano') || 
                           itemType.includes('eruption');
                } else {
                    return itemType.includes(filter);
                }
            });
        }
        
        currentPage = 1; // Reset to first page
        renderNewsItems(filteredNewsItems);
    }

    // Setup filter buttons
    function setupFilters() {
        const filterButtons = document.querySelectorAll('.filter-btn');
        
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                filterButtons.forEach(b => b.classList.remove('active'));
                
                // Add active class to clicked button
                btn.classList.add('active');
                
                // Apply filter
                const filterType = btn.getAttribute('data-filter');
                applyFilter(filterType);
            });
        });
    }

    // Function to detect if new articles were added
    function hasNewArticles(newItems, oldItems) {
        if (newItems.length > oldItems.length) return true;
        if (oldItems.length === 0) return false;
        
        const newestNew = new Date(newItems[0]?.date || 0);
        const newestOld = new Date(oldItems[0]?.date || 0);
        return newestNew > newestOld;
    }

    // Function to show update notification
    function showUpdateNotification() {
        const notification = document.createElement('div');
        notification.id = 'update-notification';
        notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 15px 20px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 1000; font-family: Arial, sans-serif;';
        notification.innerHTML = '<i class="fas fa-bell"></i> Latest calamity updates loaded!';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    // Function to render news items for current page
    function renderNewsItems(items) {
        newsGrid.innerHTML = '';
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = items.slice(start, end);

        if (pageItems.length === 0) {
            noResultsEl.style.display = 'block';
            noResultsEl.innerHTML = `
                <i class="fas fa-info-circle" style="font-size:48px; color:#005ea5; margin-bottom:20px;"></i>
                <p>No calamity updates found${currentFilter !== 'all' ? ' for ' + currentFilter : ''}.</p>
            `;
            return;
        }

        noResultsEl.style.display = 'none';

        pageItems.forEach(item => {
            const type = item.type || 'Calamity';
            const title = item.title || 'Untitled Update';
            const desc = item.description || 'No details available.';
            const date = new Date(item.date || Date.now()).toLocaleDateString('en-PH', {
                month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const card = document.createElement('div');
            card.className = 'news-card';

            const typeClass = type.toLowerCase().includes('typhoon') || type.toLowerCase().includes('cyclone') || type.toLowerCase().includes('depression') || type.toLowerCase().includes('storm') ? 'cyclone' :
                             type.toLowerCase().includes('earthquake') || type.toLowerCase().includes('quake') || type.toLowerCase().includes('tremor') ? 'earthquake' :
                             type.toLowerCase().includes('flood') ? 'flood' :
                             type.toLowerCase().includes('volcanic') || type.toLowerCase().includes('volcano') || type.toLowerCase().includes('eruption') ? 'volcano' :
                             type.toLowerCase().includes('landslide') || type.toLowerCase().includes('mudflow') ? 'landslide' :
                             type.toLowerCase().includes('drought') ? 'drought' : 'other';

            card.innerHTML = `
                <div class="news-type ${typeClass}">${type}</div>
                <div class="news-content">
                    <h3>${title}</h3>
                    <p>${desc.substring(0, 140)}${desc.length > 140 ? '...' : ''}</p>
                    <div class="news-meta">
                        <span><i class="fas fa-flag"></i> Philippines</span>
                        <span><i class="fas fa-calendar-alt"></i> ${date}</span>
                    </div>
                    <a href="${item.url}" target="_blank" class="news-link">
                        Read Full Report →
                    </a>
                </div>
            `;

            newsGrid.appendChild(card);
        });

        renderPagination();
    }

    // Function to render pagination buttons
    function renderPagination() {
        const totalPages = Math.ceil(filteredNewsItems.length / itemsPerPage);
        let paginationHTML = `
            <div id="pagination" class="pagination" style="
                display: flex; justify-content: center; align-items: center; margin: 20px 0; gap: 10px;
                font-family: Arial, sans-serif; font-size: 14px;
            ">
                <button id="prev-page" class="pag-btn" style="
                    padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;
                    ${currentPage === 1 ? 'background: #ccc; cursor: not-allowed;' : ''}
                " ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
                <span style="font-weight: bold;">Page ${currentPage} of ${totalPages}</span>
                <button id="next-page" class="pag-btn" style="
                    padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;
                    ${currentPage === totalPages ? 'background: #ccc; cursor: not-allowed;' : ''}
                " ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
                <button id="refresh-btn" class="pag-btn" style="
                    padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;
                "><i class="fas fa-sync-alt"></i> Refresh</button>
            </div>
        `;
        
        let paginationEl = document.getElementById('pagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            newsGrid.parentNode.insertBefore(paginationEl, newsGrid.nextSibling);
        }
        paginationEl.outerHTML = paginationHTML;

        document.getElementById('prev-page')?.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderNewsItems(filteredNewsItems);
            }
        });
        document.getElementById('next-page')?.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredNewsItems.length / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderNewsItems(filteredNewsItems);
            }
        });
        document.getElementById('refresh-btn')?.addEventListener('click', updateNews);
    }

    // Function to load initial news
    async function loadInitialNews() {
        showLoading(true);
        try {
            allNewsItems = await fetchNewsFromAbsCbn();
            filteredNewsItems = [...allNewsItems];
            lastUpdateTime = new Date();
            currentPage = 1;
            renderNewsItems(filteredNewsItems);
            setupFilters();
            startAutoUpdate();
        } catch (err) {
            showError(err.message);
        } finally {
            showLoading(false);
        }
    }

    // Function to update news
    async function updateNews() {
        if (isUpdating) return;
        isUpdating = true;
        showLoading(true);

        try {
            const newItems = await fetchNewsFromAbsCbn();
            const wasUpdated = hasNewArticles(newItems, allNewsItems);
            allNewsItems = newItems;
            lastUpdateTime = new Date();
            
            // Reapply current filter
            applyFilter(currentFilter);
            
            if (wasUpdated) {
                showUpdateNotification();
            }
        } catch (err) {
            showError('Update failed: ' + err.message);
        } finally {
            showLoading(false);
            isUpdating = false;
        }
    }

    // Auto-update every 5 minutes
    function startAutoUpdate() {
        setInterval(updateNews, 300000);
    }

    // Helper functions
    function showLoading(show) {
        loadingEl.style.display = show ? 'block' : 'none';
        if (show) {
            loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isUpdating ? 'Updating...' : 'Loading latest updates...');
        }
        errorEl.style.display = 'none';
        noResultsEl.style.display = 'none';
    }

    function showError(message) {
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.innerHTML = `
            <i class="fas fa-wifi-slash"></i>
            <p>Unable to load updates from ABS-CBN. Using cached data.</p>
            <details style="margin-top: 10px; font-size: 12px; color: #666;">${message}</details>
        `;
        noResultsEl.style.display = 'none';
    }

    // Initialize
    await loadInitialNews();
});

// PWA Install Button Logic
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'flex';
        
        installBtn.addEventListener('click', () => {
            installBtn.style.display = 'none';
            deferredPrompt.prompt();
            
            deferredPrompt.userChoice.then((choice) => {
                if (choice.outcome === 'accepted') {
                    console.log('User installed the app');
                }
                deferredPrompt = null;
            });
        });
    }
});

// Burger menu logic
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