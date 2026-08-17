/**
 * BPO Reverse Search Engine (GMB & Bing)
 * Robust multi-selector extractor for Google Maps direct cards and search lists.
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

  // Strategy 2: Clean search term on company name ONLY (no "CEO", "GM", or person in query)
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
    await new Promise(r => setTimeout(r, 2000));

    // If Google Maps rendered a search results list, click the top matching place link to open the full details card
    const hasPlaceLink = await page.$('a[href*="/maps/place/"], div.Nv2pk a');
    if (hasPlaceLink) {
      try {
        await page.click('a[href*="/maps/place/"], div.Nv2pk a');
        await new Promise(r => setTimeout(r, 2200));
      } catch (_) {}
    }

    const gmapsData = await page.evaluate(() => {
      let phone = '';
      let address = '';
      let website = '';
      let rating = null;
      let reviews = null;

      // ── 1. Check if direct Single Place view opened ─────────────────────────
      const phoneEl = document.querySelector('button[data-tooltip*="phone" i], button[aria-label*="Phone:" i], [data-item-id*="phone:"]');
      if (phoneEl) {
        const text = phoneEl.getAttribute('aria-label') || phoneEl.innerText || '';
        phone = text.replace(/^Phone:\s*/i, '').trim();
      }

      const addrEl = document.querySelector('button[data-tooltip*="address" i], button[aria-label*="Address:" i], [data-item-id*="address"]');
      if (addrEl) {
        const text = addrEl.getAttribute('aria-label') || addrEl.innerText || '';
        address = text.replace(/^Address:\s*/i, '').trim();
      }

      const webEl = document.querySelector('a[data-tooltip*="website" i], a[aria-label*="Website:" i], [data-item-id*="authority"]');
      if (webEl) {
        website = webEl.href || webEl.getAttribute('href') || '';
      }

      // Rating from Direct Card
      const starEl = document.querySelector('div.F7nice span[aria-hidden="true"], span.ceNzKf, [aria-label*="stars" i]');
      if (starEl) {
        const text = starEl.getAttribute('aria-label') || starEl.innerText || '';
        const m = text.match(/([\d,.]+)\s*(?:stars?|★)?/i);
        if (m) {
          const parsed = parseFloat(m[1].replace(',', '.'));
          if (!isNaN(parsed) && parsed > 0 && parsed <= 5) rating = parsed;
        }
      }

      // Reviews Count from Direct Card (handles "(152)", "152 reviews", "(2.4K)")
      const revElements = document.querySelectorAll('div.F7nice span:nth-child(2) > span > span, [aria-label*="review" i], button[aria-label*="review" i], span.F7nice');
      for (const el of revElements) {
        const text = el.getAttribute('aria-label') || el.innerText || '';
        const m = text.match(/([\d,.]+)\s*(?:k|thousand)?\s*reviews?/i) || text.match(/\(([\d,.]+[kK]?)\)/) || text.match(/(\d+[\d,.]*)\s*(?:reviews?|ratings?)/i);
        if (m) {
          let val = m[1].replace(/,/g, '');
          if (text.toLowerCase().includes('k') || val.toLowerCase().endsWith('k')) {
            reviews = Math.round(parseFloat(val) * 1000);
          } else {
            reviews = parseInt(val, 10);
          }
          if (!isNaN(reviews) && reviews > 0) break;
        }
      }

      // ── 2. If Multiple Places List returned (Sidebar Feed) ───────────────────
      if (!phone || !rating || !reviews) {
        const firstCard = document.querySelector('div.Nv2pk, div[role="feed"] > div, div.m6QErb div.Nv2pk');
        if (firstCard) {
          // Extract rating from list card
          if (!rating) {
            const cardStar = firstCard.querySelector('span.MW4etd, span[aria-hidden="true"]');
            if (cardStar) {
              const p = parseFloat(cardStar.innerText.replace(',', '.'));
              if (!isNaN(p) && p > 0 && p <= 5) rating = p;
            }
          }

          // Extract reviews count from list card
          if (!reviews) {
            const cardRev = firstCard.querySelector('span.UY7F9, span[aria-label*="reviews" i]');
            if (cardRev) {
              const text = cardRev.getAttribute('aria-label') || cardRev.innerText || '';
              const m = text.match(/\(([\d,.]+[kK]?)\)/) || text.match(/([\d,.]+)\s*(?:k|thousand)?\s*reviews?/i);
              if (m) {
                let val = m[1].replace(/,/g, '');
                if (text.toLowerCase().includes('k') || val.toLowerCase().endsWith('k')) {
                  reviews = Math.round(parseFloat(val) * 1000);
                } else {
                  reviews = parseInt(val, 10);
                }
              }
            }
          }

          // Extract phone and address text from list card
          const cardText = firstCard.innerText || '';
          if (!phone) {
            const phoneMatch = cardText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
            if (phoneMatch) phone = phoneMatch[0];
          }

          if (!website) {
            const link = firstCard.querySelector('a[data-value*="Website" i], a.lcr4fd, a[href^="http"]:not([href*="google.com"])');
            if (link) website = link.href || '';
          }
        }
      }

      return { phone, address, website, rating, reviews };
    });

    if (gmapsData.phone) gmbPhone = gmapsData.phone;
    if (gmapsData.address) gmbAddress = gmapsData.address;
    if (gmapsData.website && !gmapsData.website.includes('google.com')) gmbWebsite = gmapsData.website;
    if (gmapsData.rating) gmbRating = gmapsData.rating;
    if (gmapsData.reviews != null && gmapsData.reviews > 0) gmbReviews = gmapsData.reviews;
  } catch (_) {}

  // Strategy 3B: Bing Search Fallback for reviews, website & phone
  let bingWebsite = '';
  let bingPhone = '';
  let bingAddress = '';
  let bingRating = null;
  let bingReviews = null;

  if (!gmbPhone || !gmbWebsite || !gmbAddress || !gmbReviews) {
    try {
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanCompQuery)}&setlang=en`;
      await page.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1200));

      const bingData = await page.evaluate(() => {
        let site = '';
        let ph = '';
        let addr = '';
        let bRate = null;
        let bRev = null;

        // Bing Knowledge Entity Card
        const bCard = document.querySelector('div.b_entityTP, div.ent_info, div.b_ans');
        if (bCard) {
          const cardText = bCard.innerText || '';
          const phoneM = cardText.match(/Phone:\s*([+\d\s().-]{7,25})/i) || cardText.match(/(\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
          if (phoneM) ph = phoneM[1].trim();

          const addrM = cardText.match(/Address:\s*([^\n]+)/i);
          if (addrM) addr = addrM[1].trim();

          const revM = cardText.match(/([\d.]+)\/5\s*·\s*([\d,]+)\s*reviews?/i) || cardText.match(/([\d.]+)\s*★\s*\(([\d,]+)\)/i);
          if (revM) {
            bRate = parseFloat(revM[1]);
            bRev = parseInt(revM[2].replace(/,/g, ''), 10);
          }
        }

        // Top Organic Result Domain
        const topOrganic = document.querySelector('li.b_algo h2 a');
        if (topOrganic) {
          const href = topOrganic.getAttribute('href') || '';
          if (href.startsWith('http') && !href.includes('bing.com') && !href.includes('wikipedia') && !href.includes('facebook') && !href.includes('linkedin') && !href.includes('yellowpages')) {
            site = href;
          }
        }

        return { site, ph, addr, bRate, bRev };
      });

      if (bingData.site) bingWebsite = bingData.site;
      if (bingData.ph) bingPhone = bingData.ph;
      if (bingData.addr) bingAddress = bingData.addr;
      if (bingData.bRate) bingRating = bingData.bRate;
      if (bingData.bRev) bingReviews = bingData.bRev;
    } catch (_) {}
  }

  const finalDMs = [];
  if (personName) {
    finalDMs.push({
      name: personName,
      title: 'Founder / CEO',
      source: 'listing_title',
      verified: true
    });
  }

  return {
    cleanName: cleanCompany,
    phone: gmbPhone || bingPhone || '',
    address: gmbAddress || bingAddress || '',
    website: gmbWebsite || bingWebsite || '',
    rating: gmbRating || bingRating || null,
    reviews_count: (gmbReviews != null && gmbReviews > 0) ? gmbReviews : (bingReviews || null),
    decision_makers: finalDMs
  };
}

module.exports = { reverseSearchCompany };
