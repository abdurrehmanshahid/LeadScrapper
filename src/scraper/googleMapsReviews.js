/**
 * Google Maps — Lowest-Rating Reviews Scraper
 *
 * Loads the business on Google Maps in a real (stealth) browser session, sorts
 * reviews by "Lowest rating", lazy-scrolls the feed, expands truncated reviews,
 * and extracts each review from the live DOM.
 *
 * Why a browser and not an HTTP/API call: bare HTTP to Google returns bot-degraded
 * HTML with no data, and the internal review RPC rejects self-built requests (403).
 * Running inside a genuine browser session is the reliable, free path — the same
 * cards a human sees, extracted via stable ARIA labels (rating/author) rather than
 * Google's churny minified class names.
 *
 * Robustness notes (learned the hard way):
 *  - For multi-location chains Google non-deterministically redirects the search
 *    to ONE store, sometimes a variant whose panel has no Reviews tab. So we try a
 *    few query variants and, from a results list, pick the location with the MOST
 *    reviews that name-matches.
 *  - Headless Maps renders asynchronously → we POLL for review cards instead of
 *    using fixed sleeps.
 */

const { launchBrowser, randomFingerprint, applyFingerprint } = require('./browserHelper');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} companyName
 * @param {string} location
 * @param {object} [opts]
 * @param {number} [opts.max=30]   target number of reviews to load
 * @param {object} [opts.browser]  reuse an existing puppeteer browser
 * @returns {Promise<Array<{rating:number|null, reviewer:string, date:string|null, text:string}>>}
 */
async function scrapeLowestReviews(companyName, location = '', opts = {}) {
  const { max = 30 } = opts;
  const ownBrowser = !opts.browser;
  const browser = opts.browser || (await launchBrowser());

  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(inc|llc|ltd|corp|co|the|and)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const nameTokens = norm(companyName).split(' ').filter((t) => t.length > 2);
  // Word-level match (not substring) so e.g. "whole" doesn't match "wholesale"
  // in "Costco Wholesale" — that let a wrong business's reviews through before.
  const placeMatches = (title) => {
    const titleWords = new Set(norm(title).split(' ').filter(Boolean));
    if (!titleWords.size || !nameTokens.length) return true; // can't verify → don't block
    return nameTokens.some((tok) => titleWords.has(tok));
  };

  // Query variants — trying more than one dodges Google's sticky redirect to a
  // single (sometimes review-less) store for chains.
  const variants = [
    [companyName, location].filter(Boolean).join(' '),
    [companyName, location, 'reviews'].filter(Boolean).join(' '),
    companyName
  ].map((q) => q.replace(/\s+/g, ' ').trim()).filter((q, i, a) => q && a.indexOf(q) === i);

  try {
    for (const query of variants) {
      const page = await browser.newPage();
      try {
        await applyFingerprint(page, randomFingerprint());
        const reviews = await attemptOnce(page, query, { max, nameTokens, placeMatches, companyName });
        if (reviews && reviews.length) {
          console.log(`[GMaps Reviews] "${companyName}": extracted ${reviews.length} reviews (query="${query}")`);
          return reviews;
        }
      } catch (err) {
        console.warn(`[GMaps Reviews] "${companyName}" attempt failed (query="${query}"): ${err.message}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
    console.warn(`[GMaps Reviews] "${companyName}": no reviews found after ${variants.length} attempts`);
    return [];
  } finally {
    if (ownBrowser) await browser.close().catch(() => {});
  }
}

async function attemptOnce(page, query, ctx) {
  const { max, nameTokens, placeMatches, companyName } = ctx;

  // 1) Search, resolve to a place.
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en&gl=us`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(2500);

  if (!page.url().includes('/maps/place/')) {
    // From the results list, pick the name-matching result with the MOST reviews.
    const href = await page.evaluate((tokens) => {
      const norm = (s) => (s || '').toLowerCase();
      const links = [...document.querySelectorAll('a[href*="/maps/place/"]')];
      let best = null, bestCount = -1;
      for (const a of links) {
        const card = a.closest('[role="article"]') || a.parentElement;
        const label = norm(a.getAttribute('aria-label') || '');
        const cardText = norm((card && card.innerText) || label);
        if (tokens.length && !tokens.some((t) => label.includes(t) || cardText.includes(t))) continue;
        const m = (cardText.match(/\(([\d,]+)\)/) || [])[1];
        const count = m ? parseInt(m.replace(/,/g, ''), 10) : 0;
        if (count > bestCount) { bestCount = count; best = a.href; }
      }
      if (!best && links[0]) best = links[0].href;
      return best;
    }, nameTokens);
    if (!href) return [];
    await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(2500);
  }

  // Guard: right business?
  const placeTitle = await page.evaluate(() => (document.querySelector('h1') || {}).innerText || '');
  if (placeTitle && !placeMatches(placeTitle)) {
    console.warn(`[GMaps Reviews] Skipped — "${placeTitle.trim()}" ≠ "${companyName}" (name mismatch)`);
    return [];
  }

  const countCards = () => page.evaluate(() => document.querySelectorAll('div[data-review-id]').length);
  const waitForCards = async (min, timeoutMs) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { if ((await countCards()) >= min) return true; await sleep(500); }
    return (await countCards()) >= min;
  };

  // 2) Open the Reviews section (tab "Reviews for X" / "Reviews", or "N reviews" summary).
  const openReviews = () => page.evaluate(() => {
    const txt = (e) => (e.getAttribute('aria-label') || e.textContent || '').trim();
    const clickable = [...document.querySelectorAll('button, [role="tab"], [role="button"], a')];
    let rev = clickable.find((e) => /^reviews\b|reviews for /i.test(txt(e)) && !/write/i.test(e.textContent || ''));
    if (!rev) rev = clickable.find((e) => /\b\d[\d,]*\s+reviews?\b/i.test(txt(e)) && !/write/i.test(e.textContent || ''));
    if (rev) { rev.click(); return true; }
    return false;
  });
  for (let attempt = 1; attempt <= 4; attempt++) {
    await openReviews();
    if (await waitForCards(1, 6000)) break;
    await page.evaluate(() => { const p = document.querySelector('div[role="main"]') || document.scrollingElement; if (p) p.scrollTop = p.scrollHeight; });
    await sleep(1000);
  }
  if (!(await countCards())) return []; // this place variant has no reviews panel → caller tries next variant

  // 3) Sort → "Lowest rating". The menu contains hidden duplicate items, so we
  //    click only the VISIBLE "Lowest rating" (offsetParent !== null).
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('button, [role="button"]')].find((e) => /^sort\b/i.test((e.getAttribute('aria-label') || e.textContent || '').trim()));
    if (s) s.click();
  });
  await sleep(1200);
  const sortPicked = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')]
      .filter((m) => m.offsetParent !== null && /lowest/i.test((m.textContent || '').trim()) && (m.textContent || '').trim().length < 30);
    if (items[0]) { items[0].click(); return true; }
    return false;
  });
  if (sortPicked) {
    // The list re-renders from scratch — wait for it to repopulate.
    await sleep(1500);
    await waitForCards(1, 8000);
  }

  // 4) Intelligent infinite scroll (Instant-Data-Scraper style, but smarter):
  //    auto-detect the scroll container, keep loading, and STOP as soon as we've
  //    scrolled past the bad reviews (sorted lowest → once the freshly-loaded tail
  //    is all ≥3★ we've captured every 1–2★). Falls back to stall detection and a
  //    hard safety cap so it can never run away.
  const HARD_CAP = Math.max(max, 250);
  let last = 0, stable = 0;
  for (let i = 0; i < 150; i++) {
    const info = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('div[data-review-id]')];
      // Auto-detect the scrollable ancestor of the review list.
      let sc = cards[0];
      while (sc && sc !== document.body) {
        const oy = getComputedStyle(sc).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight + 50) break;
        sc = sc.parentElement;
      }
      if (sc && sc !== document.body) sc.scrollTop = sc.scrollHeight;
      else if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'end' });

      const ratingOf = (card) => {
        let r = null;
        card.querySelectorAll('[aria-label]').forEach((e) => {
          const m = (e.getAttribute('aria-label') || '').match(/^(\d)\s+stars?$/i);
          if (m && r == null) r = +m[1];
        });
        return r;
      };
      const firstRating = cards.length ? ratingOf(cards[0]) : null;
      const tail = cards.slice(-3).map(ratingOf).filter((r) => r != null);
      const tailMin = tail.length ? Math.min(...tail) : null;
      return { count: cards.length, firstRating, tailMin };
    });

    if (info.count >= HARD_CAP) break;
    // Confirmed ascending sort (first card is 1–2★) AND the tail has climbed to
    // ≥3★ → every bad review is now loaded; stop early.
    if (info.count > 8 && info.firstRating != null && info.firstRating <= 2 &&
        info.tailMin != null && info.tailMin >= 3) break;
    // Stall detection: no new rows for several rounds → end of list.
    if (info.count === last) { if (++stable >= 6) break; } else { stable = 0; last = info.count; }
    await sleep(1200);
  }

  // 5) Expand truncated reviews.
  await page.evaluate(() => document.querySelectorAll('button[aria-label="See more"], button.w8nwRe').forEach((b) => b.click()));
  await sleep(800);

  // 6) Extract. Rating & author from stable ARIA labels; text from the review-body
  //    class with a longest-text fallback; owner responses (.CDe7pd) excluded.
  return page.evaluate(() => {
    const seen = new Set();
    const out = [];
    document.querySelectorAll('div[data-review-id]').forEach((card) => {
      const id = card.getAttribute('data-review-id');
      if (!id || seen.has(id)) return;
      seen.add(id);

      let rating = null;
      card.querySelectorAll('[aria-label]').forEach((e) => {
        const m = (e.getAttribute('aria-label') || '').match(/^(\d+(?:\.\d+)?)\s+stars?$/i);
        if (m && rating == null) rating = parseFloat(m[1]);
      });

      let author = null;
      card.querySelectorAll('[aria-label]').forEach((e) => {
        const a = e.getAttribute('aria-label') || '';
        const m = a.match(/^Photo of (.+)$/) || a.match(/^Actions for (.+)'s review$/);
        if (m && !author) author = m[1].trim();
      });

      const el = card.querySelector('.wiI7pd, .MyEned');
      let text = el ? (el.innerText || '').trim() : '';
      if (!text) {
        text = [...card.querySelectorAll('span, div')]
          .filter((e) => !e.closest('.CDe7pd'))
          .map((e) => (e.innerText || '').trim())
          .filter((t) => t.length > 20)
          .sort((a, b) => b.length - a.length)[0] || '';
      }

      let date = null;
      const d = card.querySelector('.rsqaWe');
      if (d) date = d.innerText.trim();
      else {
        const m = (card.innerText || '').match(/(?:a|\d+)\s+(?:year|month|week|day|hour)s?\s+ago/i);
        if (m) date = m[0];
      }

      if (text && text.length > 15) {
        out.push({ rating, reviewer: author || 'Customer', date, text: text.replace(/\s+/g, ' ').slice(0, 600) });
      }
    });
    return out;
  });
}

module.exports = { scrapeLowestReviews };
