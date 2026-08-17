const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function testReverseSearch(companyName, location) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log(`\n=== 1. Testing Google Maps Reverse Search for: "${companyName} ${location}" ===`);
  const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(companyName + ' ' + location)}`;
  await page.goto(gmapsUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await new Promise(r => setTimeout(r, 2500));

  const gmapsData = await page.evaluate(() => {
    let phone = '';
    let address = '';
    let website = '';
    let rating = '';
    let reviews = '';

    // Phone
    const phoneEl = document.querySelector('button[data-tooltip*="phone" i], button[aria-label*="Phone:" i], [data-item-id*="phone:"]');
    if (phoneEl) {
      const text = phoneEl.getAttribute('aria-label') || phoneEl.innerText || '';
      phone = text.replace(/Phone:\s*/i, '').trim();
    }

    // Address
    const addrEl = document.querySelector('button[data-tooltip*="address" i], button[aria-label*="Address:" i], [data-item-id*="address"]');
    if (addrEl) {
      const text = addrEl.getAttribute('aria-label') || addrEl.innerText || '';
      address = text.replace(/Address:\s*/i, '').trim();
    }

    // Website
    const webEl = document.querySelector('a[data-tooltip*="website" i], a[aria-label*="Website:" i], [data-item-id*="authority"]');
    if (webEl) {
      website = webEl.href || webEl.getAttribute('href') || '';
    }

    // Rating
    const starEl = document.querySelector('div.F7nice span[aria-hidden="true"], span.ceNzKf');
    if (starEl) rating = starEl.innerText.trim();

    // Reviews
    const revEl = document.querySelector('div.F7nice span:nth-child(2) > span > span');
    if (revEl) reviews = revEl.innerText.replace(/[()]/g, '').trim();

    return { phone, address, website, rating, reviews };
  });

  console.log('Google Maps Result:', JSON.stringify(gmapsData, null, 2));

  console.log(`\n=== 2. Testing Bing Reverse Search for: "${companyName} ${location}" ===`);
  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(companyName + ' ' + location)}&setlang=en`;
  await page.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));

  const bingData = await page.evaluate(() => {
    let phone = '';
    let address = '';
    let website = '';

    // Bing sidebar business card / knowledge entity
    const phoneEl = document.querySelector('a[href^="tel:"], .csrc_phn, .b_factrow a[href^="tel:"]');
    if (phoneEl) phone = phoneEl.innerText.trim() || phoneEl.href.replace('tel:', '');

    const addrEl = document.querySelector('.csrc_adr, .b_address, .b_factrow .b_address');
    if (addrEl) address = addrEl.innerText.trim();

    const webEl = document.querySelector('.b_algo h2 a, .csrc_site a, .b_factrow a[target="_blank"]');
    if (webEl) website = webEl.href;

    return { phone, address, website };
  });

  console.log('Bing Result:', JSON.stringify(bingData, null, 2));

  await browser.close();
}

testReverseSearch('Alan Bradley Windows & Doors', 'USA').then(() => process.exit(0));
