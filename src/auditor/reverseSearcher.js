/**
 * BPO Reverse Search Engine (GMB & Bing)
 * Enriches existing Odoo reference leads with verified phone numbers, street addresses,
 * websites, Google Maps review ratings, and decision makers.
 */

const { extractCompanyAndPersonFromTitle } = require('../utils/entityParser');

/**
 * Executes multi-strategy reverse search on a company
 * @param {object} params
 * @param {string} params.rawName - Raw listing name
 * @param {string} [params.location] - Country / region
 * @param {object} page - Puppeteer page instance
 * @returns {Promise<object>} Enriched company intelligence
 */
async function reverseSearchCompany({ rawName, location }, page) {
  // Strategy 1: Distinction between Corporate Suffix vs. Person Name
  const { companyName: cleanCompany, personName } = extractCompanyAndPersonFromTitle(rawName);

  // Strategy 2: Clean search term on company name ONLY (no "CEO", "GM", or person in company search query)
  const loc = (location && location !== 'ALL' && location !== 'North America') ? location : 'USA';
  const cleanCompQuery = `${cleanCompany} ${loc}`.trim();

  let gmbPhone = '';
  let gmbAddress = '';
  let gmbWebsite = '';
  let gmbRating = null;
  let gmbReviews = null;

  // Strategy 3A: Google Maps (GMB) Search
  try {
    const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(cleanCompQuery)}`;
    await page.goto(gmapsUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1800));

    const gmapsData = await page.evaluate(() => {
      let phone = '';
      let address = '';
      let website = '';
      let rating = null;
      let reviews = null;

      // Phone
      const phoneEl = document.querySelector('button[data-tooltip*="phone" i], button[aria-label*="Phone:" i], [data-item-id*="phone:"]');
      if (phoneEl) {
        const text = phoneEl.getAttribute('aria-label') || phoneEl.innerText || '';
        phone = text.replace(/^Phone:\s*/i, '').trim();
      }

      // Address
      const addrEl = document.querySelector('button[data-tooltip*="address" i], button[aria-label*="Address:" i], [data-item-id*="address"]');
      if (addrEl) {
        const text = addrEl.getAttribute('aria-label') || addrEl.innerText || '';
        address = text.replace(/^Address:\s*/i, '').trim();
      }

      // Website
      const webEl = document.querySelector('a[data-tooltip*="website" i], a[aria-label*="Website:" i], [data-item-id*="authority"]');
      if (webEl) {
        website = webEl.href || webEl.getAttribute('href') || '';
      }

      // Rating
      const starEl = document.querySelector('div.F7nice span[aria-hidden="true"], span.ceNzKf');
      if (starEl) {
        const parsed = parseFloat(starEl.innerText.replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0) rating = parsed;
      }

      // Reviews count
      const revEl = document.querySelector('div.F7nice span:nth-child(2) > span > span, [aria-label*="reviews"]');
      if (revEl) {
        const text = revEl.innerText || revEl.getAttribute('aria-label') || '';
        const numMatch = text.replace(/,/g, '').match(/\d+/);
        if (numMatch) reviews = parseInt(numMatch[0], 10);
      }

      return { phone, address, website, rating, reviews };
    });

    if (gmapsData.phone) gmbPhone = gmapsData.phone;
    if (gmapsData.address) gmbAddress = gmapsData.address;
    if (gmapsData.website && !gmapsData.website.includes('google.com')) gmbWebsite = gmapsData.website;
    if (gmapsData.rating) gmbRating = gmapsData.rating;
    if (gmapsData.reviews) gmbReviews = gmapsData.reviews;
  } catch (_) {}

  // Strategy 3B: Bing Search for fallback website & corporate knowledge entity
  let bingWebsite = '';
  let bingPhone = '';
  let bingAddress = '';

  if (!gmbPhone || !gmbWebsite || !gmbAddress) {
    try {
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanCompQuery)}&setlang=en`;
      await page.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1200));

      const bingData = await page.evaluate(() => {
        let web = '';
        let ph = '';
        let addr = '';

        // Phone
        const pEl = document.querySelector('a[href^="tel:"], .csrc_phn, .b_factrow a[href^="tel:"]');
        if (pEl) ph = pEl.innerText.trim() || pEl.href.replace('tel:', '');

        // Address
        const aEl = document.querySelector('.csrc_adr, .b_address, .b_factrow .b_address');
        if (aEl) addr = aEl.innerText.trim();

        // Website from top organic result or sidebar
        const wEl = document.querySelector('.b_algo h2 a, .csrc_site a, .b_factrow a[target="_blank"]');
        if (wEl && wEl.href && !wEl.href.includes('bing.com') && !wEl.href.includes('microsoft.com') && !wEl.href.includes('wikipedia.org')) {
          web = wEl.href;
        }

        return { web, ph, addr };
      });

      if (bingData.ph) bingPhone = bingData.ph;
      if (bingData.addr) bingAddress = bingData.addr;
      if (bingData.web) bingWebsite = bingData.web;
    } catch (_) {}
  }

  // Decision Maker resolution
  const decisionMakers = [];
  if (personName) {
    decisionMakers.push({
      name: personName,
      title: 'Founder / CEO',
      linkedin_url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(personName + ' ' + cleanCompany)}`,
      source: 'listing_title'
    });
  }

  const finalWebsite = gmbWebsite || bingWebsite || '';
  const finalPhone = gmbPhone || bingPhone || '';
  const finalAddress = gmbAddress || bingAddress || location || '';

  return {
    cleanName: cleanCompany,
    personName: personName || null,
    phone: finalPhone,
    address: finalAddress,
    website: finalWebsite,
    rating: gmbRating,
    reviews_count: gmbReviews,
    decision_makers: decisionMakers
  };
}

module.exports = {
  reverseSearchCompany
};
