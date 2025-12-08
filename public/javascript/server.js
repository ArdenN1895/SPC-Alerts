// server.js — Real-time ABS-CBN Calamity Hub Scraper (Fixed)
const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let cachedNews = [];
let lastFetched = null;
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

async function scrapeAbsCbnCalamityHub() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Block images, fonts, etc. for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    // Use Calamity Hub as primary; fallback to /news/disasters for more articles
    await page.goto('https://www.abs-cbn.com/calamity-hub', {
        waitUntil: 'networkidle2', // Wait for JS to load content
        timeout: 30000
    });

    // If no content, try disasters section
    let articles = await page.evaluate(() => {
        const items = [];
        // Updated selectors based on site: target headlines, links, and potential article elements
        const headlineSelectors = document.querySelectorAll('.headlines article, .news-item, h2 a, h3 a, [data-testid="article"]');
        headlineSelectors.forEach(el => {
            const linkEl = el.querySelector('a') || el.closest('a');
            const titleEl = el.querySelector('h2, h3, .title, .headline');
            const descEl = el.querySelector('p, .excerpt, .summary');
            const dateEl = el.querySelector('time, .date, .published');

            if (linkEl && titleEl) {
                const href = linkEl.href;
                items.push({
                    title: (titleEl.innerText || titleEl.textContent || '').trim(),
                    description: (descEl?.innerText || descEl?.textContent || '').trim().substring(0, 300),
                    url: href.startsWith('http') ? href : 'https://www.abs-cbn.com' + href,
                    date: dateEl?.innerText || dateEl?.getAttribute('datetime') || dateEl?.textContent || new Date().toISOString(),
                    type: 'Calamity'
                });
            }
        });
        return items.slice(0, 30); // Latest 30
    });

    if (articles.length === 0) {
        console.log('No articles on Calamity Hub; falling back to /news/disasters');
        await page.goto('https://news.abs-cbn.com/news/disasters', { waitUntil: 'networkidle2', timeout: 30000 });
        articles = await page.evaluate(() => {
            const items = [];
            // Similar selectors for disasters page
            const selectors = document.querySelectorAll('article, .story, h2 a, h3 a');
            selectors.forEach(el => {
                const linkEl = el.querySelector('a') || el;
                const titleEl = el.querySelector('h2, h3, .title');
                const descEl = el.querySelector('p, .lead');
                const dateEl = el.querySelector('time, .date');

                if (linkEl && titleEl && linkEl.href) {
                    items.push({
                        title: titleEl.innerText.trim(),
                        description: (descEl?.innerText || '').trim().substring(0, 300),
                        url: linkEl.href.startsWith('http') ? linkEl.href : 'https://news.abs-cbn.com' + linkEl.href,
                        date: dateEl?.innerText || new Date().toISOString(),
                        type: 'Calamity'
                    });
                }
            });
            return items.slice(0, 30);
        });
    }

    await browser.close();
    return articles;
}

// Fixed API Endpoint — Call this from frontend
app.get('/api/calamity-news', async (req, res) => {
    try {
        const now = Date.now();

        // Return cache if still fresh
        if (cachedNews.length > 0 && lastFetched && (now - lastFetched) < CACHE_DURATION) {
            return res.json({ data: cachedNews, cached: true });
        }

        console.log('Scraping fresh calamity news...');
        const freshNews = await scrapeAbsCbnCalamityHub();

        // Enhance type detection (unchanged)
        freshNews.forEach(item => {
            const lower = (item.title + ' ' + item.description).toLowerCase();
            if (lower.includes('typhoon') || lower.includes('bagyo') || lower.includes('signal')) item.type = 'Typhoon';
            else if (lower.includes('earthquake') || lower.includes('lindol') || lower.includes('magnitude')) item.type = 'Earthquake';
            else if (lower.includes('flood') || lower.includes('baha')) item.type = 'Flood';
            else if (lower.includes('volcano') || lower.includes('bulkan') || lower.includes('eruption') || lower.includes('ashfall')) item.type = 'Volcanic';
            else if (lower.includes('landslide') || lower.includes('pagguho')) item.type = 'Landslide';
            else item.type = 'Calamity';
        });

        cachedNews = freshNews;
        lastFetched = now;

        res.json({ data: freshNews, cached: false, fetchedAt: new Date().toISOString() });
    } catch (err) {
        console.error('Scrape failed:', err);
        res.status(500).json({
            data: cachedNews, // Fallback to cache
            error: 'Scrape failed, showing cached data',
            originalError: err.message
        });
    }
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
    console.log(`ABS-CBN Calamity Scraper API running on port ${PORT}`);
    console.log(`→ http://localhost:${PORT}/api/calamity-news`); // Test this endpoint in browser
});