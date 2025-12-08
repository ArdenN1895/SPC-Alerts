// Enhanced Live Broadcast JavaScript with Weather Overlay Map
class LiveBroadcast {
    constructor() {
        this.apiKey = '54c135938e9d7cc39c5532187a963f46'; // OpenWeatherMap API Key
        this.baseURL = 'https://api.openweathermap.org/data/2.5';
        this.currentCity = 'San Pablo City';
        this.updateInterval = 300000; // 5 minutes
        this.weatherMap = null;
        this.currentLayer = 'precipitation';
        
        // Philippine cities coordinates
        this.phCities = {
            'San Pablo City': { lat: 14.0700, lon: 121.3250 },
            'Manila': { lat: 14.5995, lon: 120.9842 },
            'Cebu': { lat: 10.3157, lon: 123.8854 },
            'Davao': { lat: 7.1907, lon: 125.4553 },
            'Cagayan de Oro': { lat: 8.4542, lon: 124.6319 },
            'Zamboanga': { lat: 6.9214, lon: 122.0790 },
            'Tacloban': { lat: 11.2436, lon: 125.0040 },
            'Baguio': { lat: 16.4023, lon: 120.5960 },
            'Iloilo': { lat: 10.7202, lon: 122.5621 }
        };
        
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
        this.startClock();
        this.initializeWeatherMap();
        this.loadInitialData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // City selector
        document.getElementById('citySelector').addEventListener('change', (e) => {
            this.currentCity = e.target.value;
            this.loadWeatherData();
            this.updateMapCenter();
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadWeatherData();
            this.refreshWeatherMap();
            this.addUpdate('Manual refresh triggered');
        });

        // Fullscreen button
        document.getElementById('fullscreenBtn').addEventListener('click', this.toggleFullscreen);

        // Map controls
        document.querySelectorAll('.map-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.map-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.switchMapLayer(e.target.dataset.layer);
            });
        });
    }

    initializeWeatherMap() {
        const mapContainer = document.getElementById('weatherMap');
        mapContainer.innerHTML = ''; // Clear placeholder
        
        const coords = this.phCities[this.currentCity];
        
        // Create iframe for Windy embed (more reliable than API)
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '300px';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '0';
        
        // Windy embed URL with your coordinates
        const windyUrl = `https://embed.windy.com/embed2.html?lat=${coords.lat}&lon=${coords.lon}&detailLat=${coords.lat}&detailLon=${coords.lon}&width=650&height=450&zoom=8&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
        
        iframe.src = windyUrl;
        mapContainer.appendChild(iframe);
        
        this.windyIframe = iframe;
        this.currentLayer = 'precipitation';
        
        console.log('✅ Windy weather map initialized (embed mode)');
        this.addUpdate('Weather map loaded successfully');
    }

    switchMapLayer(layer) {
        if (this.windyAPI) {
            // Map layer names to Windy overlay names
            const windyLayers = {
                'precipitation': 'rain',
                'temperature': 'temp',
                'wind': 'wind',
                'clouds': 'clouds'
            };
            
            const windyLayer = windyLayers[layer] || 'rain';
            this.windyAPI.store.set('overlay', windyLayer);
            this.currentLayer = layer;
            
            this.addUpdate(`Map layer switched to ${layer}`);
        }
    }

    updateMapCenter() {
        if (this.windyAPI && this.weatherMap) {
            const coords = this.phCities[this.currentCity];
            this.weatherMap.setView([coords.lat, coords.lon], 9);
        }
    }

    refreshWeatherMap() {
        // Windy auto-refreshes, but we can force update if needed
        if (this.windyAPI) {
            this.windyAPI.store.set('timestamp', Date.now());
        }
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            document.getElementById('currentTime').textContent = 
                now.toLocaleString('en-PH', { 
                    timeZone: 'Asia/Manila',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true 
                });
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    async loadInitialData() {
        await this.loadWeatherData();
        this.addUpdate('System initialized and monitoring started');
    }

    async loadWeatherData() {
        try {
            this.showLoadingState();
            
            const currentWeather = await this.getCurrentWeather();
            this.displayCurrentWeather(currentWeather);
            
            const forecast = await this.getForecast();
            this.displayForecast(forecast);
            
            this.updateStatistics(currentWeather, forecast);
            this.checkAlerts(currentWeather, forecast);
            
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('en-PH');
            document.getElementById('apiStatus').textContent = 'Connected';
            document.getElementById('apiStatus').className = 'status-online';
            
            this.addUpdate(`Weather data updated for ${this.currentCity}`);
            
        } catch (error) {
            console.error('Error loading weather data:', error);
            this.showErrorState();
            document.getElementById('apiStatus').textContent = 'Error';
            document.getElementById('apiStatus').className = 'status-offline';
            this.addUpdate('Error loading weather data', 'error');
        }
    }

    async getCurrentWeather() {
        const coords = this.phCities[this.currentCity];
        const response = await fetch(
            `${this.baseURL}/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${this.apiKey}&units=metric`
        );
        
        if (!response.ok) throw new Error('Weather data not available');
        return await response.json();
    }

    async getForecast() {
        const coords = this.phCities[this.currentCity];
        const response = await fetch(
            `${this.baseURL}/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${this.apiKey}&units=metric`
        );
        
        if (!response.ok) throw new Error('Forecast not available');
        return await response.json();
    }

    displayCurrentWeather(data) {
        const weather = {
            temperature: Math.round(data.main.temp),
            feelsLike: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            description: data.weather[0].description,
            icon: data.weather[0].icon,
            windSpeed: data.wind.speed,
            visibility: (data.visibility / 1000).toFixed(1),
            sunrise: new Date(data.sys.sunrise * 1000),
            sunset: new Date(data.sys.sunset * 1000)
        };

        const html = `
            <div class="current-weather-display">
                <div class="weather-icon-large">
                    <i class="${this.getWeatherIcon(weather.icon)}"></i>
                </div>
                <div class="temperature-display">${weather.temperature}°C</div>
                <div class="weather-description">${weather.description}</div>
                <div class="weather-details-grid">
                    <div class="weather-detail">
                        <span>Feels like:</span>
                        <span>${weather.feelsLike}°C</span>
                    </div>
                    <div class="weather-detail">
                        <span>Humidity:</span>
                        <span>${weather.humidity}%</span>
                    </div>
                    <div class="weather-detail">
                        <span>Wind:</span>
                        <span>${weather.windSpeed} m/s</span>
                    </div>
                    <div class="weather-detail">
                        <span>Pressure:</span>
                        <span>${weather.pressure} hPa</span>
                    </div>
                    <div class="weather-detail">
                        <span>Visibility:</span>
                        <span>${weather.visibility} km</span>
                    </div>
                    <div class="weather-detail">
                        <span>Sunrise:</span>
                        <span>${weather.sunrise.toLocaleTimeString('en-PH', {timeStyle: 'short'})}</span>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('currentWeather').innerHTML = html;
    }

    displayForecast(data) {
        const dailyForecasts = this.processForecastData(data);
        
        const html = `
            <div class="forecast-grid-mini">
                ${dailyForecasts.map(day => `
                    <div class="forecast-day">
                        <div class="day-name">${day.date.toLocaleDateString('en-PH', { weekday: 'short' })}</div>
                        <div class="weather-icon">
                            <i class="${this.getWeatherIcon(day.icon)}"></i>
                        </div>
                        <div class="temperature">${day.temp}°C</div>
                        <div class="description">${day.description}</div>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('forecastData').innerHTML = html;
    }

    processForecastData(data) {
        const dailyForecasts = [];
        const seenDays = new Set();
        
        data.list.forEach(item => {
            const date = new Date(item.dt * 1000).toDateString();
            if (!seenDays.has(date) && dailyForecasts.length < 5) {
                seenDays.add(date);
                dailyForecasts.push({
                    date: new Date(item.dt * 1000),
                    temp: Math.round(item.main.temp),
                    description: item.weather[0].description,
                    icon: item.weather[0].icon,
                    humidity: item.main.humidity
                });
            }
        });
        
        return dailyForecasts;
    }

    updateStatistics(currentWeather, forecast) {
        const temps = forecast.list.map(item => item.main.temp);
        const humidities = forecast.list.map(item => item.main.humidity);
        
        document.getElementById('maxTemp').textContent = `${Math.round(Math.max(...temps))}°C`;
        document.getElementById('minTemp').textContent = `${Math.round(Math.min(...temps))}°C`;
        document.getElementById('avgHumidity').textContent = `${Math.round(humidities.reduce((a, b) => a + b) / humidities.length)}%`;
        document.getElementById('rainTotal').textContent = '25 mm';
    }

    checkAlerts(currentWeather, forecast) {
        const alerts = [];
        const weather = currentWeather.weather[0].description.toLowerCase();
        const windSpeed = currentWeather.wind.speed;
        const humidity = currentWeather.main.humidity;
        const temp = currentWeather.main.temp;

        if (windSpeed > 15) {
            alerts.push({
                type: 'warning',
                title: 'High Wind Alert',
                message: `Strong winds detected (${windSpeed} m/s). Exercise caution.`
            });
        }

        if (temp > 35) {
            alerts.push({
                type: 'warning',
                title: 'Heat Advisory',
                message: `High temperature (${temp}°C). Stay hydrated and avoid prolonged exposure.`
            });
        }

        if (weather.includes('rain') || weather.includes('storm')) {
            alerts.push({
                type: 'info',
                title: 'Rainfall Alert',
                message: 'Precipitation detected. Monitor flood-prone areas.'
            });
        }

        if (humidity > 85) {
            alerts.push({
                type: 'info',
                title: 'High Humidity',
                message: 'High humidity levels may affect comfort and health.'
            });
        }

        this.displayAlerts(alerts);
    }

    displayAlerts(alerts) {
        const container = document.getElementById('emergencyAlerts');
        const countElement = document.getElementById('alertCount');

        if (alerts.length === 0) {
            container.innerHTML = `
                <div class="no-alerts">
                    <i class="fas fa-check-circle"></i>
                    <p>No active emergency alerts</p>
                </div>
            `;
            countElement.textContent = '0';
            return;
        }

        countElement.textContent = alerts.length.toString();

        const alertsHTML = alerts.map(alert => `
            <div class="alert-item ${alert.type}">
                <div class="alert-title">
                    <i class="fas fa-exclamation-circle"></i>
                    ${alert.title}
                </div>
                <div class="alert-message">${alert.message}</div>
            </div>
        `).join('');

        container.innerHTML = alertsHTML;
    }

    getWeatherIcon(iconCode) {
        const iconMap = {
            '01d': 'fas fa-sun',
            '01n': 'fas fa-moon',
            '02d': 'fas fa-cloud-sun',
            '02n': 'fas fa-cloud-moon',
            '03d': 'fas fa-cloud',
            '03n': 'fas fa-cloud',
            '04d': 'fas fa-cloud',
            '04n': 'fas fa-cloud',
            '09d': 'fas fa-cloud-rain',
            '09n': 'fas fa-cloud-rain',
            '10d': 'fas fa-cloud-sun-rain',
            '10n': 'fas fa-cloud-moon-rain',
            '11d': 'fas fa-bolt',
            '11n': 'fas fa-bolt',
            '13d': 'fas fa-snowflake',
            '13n': 'fas fa-snowflake',
            '50d': 'fas fa-smog',
            '50n': 'fas fa-smog'
        };
        return iconMap[iconCode] || 'fas fa-cloud';
    }

    addUpdate(message, type = 'info') {
        const feed = document.getElementById('updatesFeed');
        const update = document.createElement('div');
        update.className = 'update-item';
        
        const icon = type === 'emergency' ? 'fa-exclamation-triangle' : 
                    type === 'error' ? 'fa-times-circle' : 'fa-info-circle';
        
        update.innerHTML = `
            <div class="update-time">${new Date().toLocaleTimeString('en-PH')}</div>
            <div class="update-content">
                <i class="fas ${icon}"></i> ${message}
            </div>
        `;
        
        feed.insertBefore(update, feed.firstChild);
        
        while (feed.children.length > 10) {
            feed.removeChild(feed.lastChild);
        }
    }

    showLoadingState() {
        document.querySelectorAll('.loading').forEach(el => {
            el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        });
    }

    showErrorState() {
        document.querySelectorAll('.loading').forEach(el => {
            el.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed to load data';
        });
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            this.loadWeatherData();
            this.refreshWeatherMap();
        }, this.updateInterval);
    }
}

// Initialize the live broadcast when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LiveBroadcast();
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
