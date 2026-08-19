/**
 * Deep Research Intelligence Module — Big Binary Tech
 *
 * Runs parallel public-source research on each scraped lead so SDRs have
 * hyper-specific intel before dialing. All fetches use Promise.allSettled()
 * so a single source failing never blocks the pipeline.
 *
 * Sources:
 *  • Yelp        — real review text (best NLI fuel), rating, categories
 *  • Google News — recent news headlines about the company
 *  • Job postings — hiring signals = operational pain indicators
 *  • BBB         — years in business, accreditation, complaints
 *  • OpenCorporates — legal registration, incorporation date, officers
 */

const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache'
};

// ─── Yelp ──────────────────────────────────────────────────────────────────────

async function searchYelp(companyName, location) {
  const url = `https://www.yelp.com/search?find_desc=${encodeURIComponent(companyName)}&find_loc=${encodeURIComponent(location || '')}`;
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  const $ = cheerio.load(data);

  // First pass: JSON-LD structured data (Yelp embeds this in SSR)
  let yelpJson = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      if (parsed && (parsed['@type'] === 'LocalBusiness' || parsed.name)) {
        yelpJson = parsed;
        return false;
      }
    } catch (e) {}
  });

  if (yelpJson) {
    const reviews = (yelpJson.review || [])
      .slice(0, 4)
      .map(r => (r.reviewBody || r.description || '').trim())
      .filter(Boolean);
    return {
      yelp_rating: yelpJson.aggregateRating?.ratingValue || null,
      yelp_review_count: yelpJson.aggregateRating?.reviewCount || null,
      yelp_categories: Array.isArray(yelpJson.hasOfferCatalog) ? [] : (yelpJson['@type'] ? [yelpJson['@type']] : []),
      yelp_review_snippets: reviews,
      yelp_url: yelpJson.url || url
    };
  }

  // Second pass: scrape search result cards from SSR HTML
  const cards = $('[class*="businessName"], h3 a, .biz-name').slice(0, 3);
  const snippets = [];
  $('[class*="reviewText"], [class*="review-content"], p[class*="css"]').slice(0, 3).each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 30) snippets.push(t.substring(0, 250));
  });

  const rating = $('[aria-label*="star rating"]').first().attr('aria-label') || '';
  const ratingMatch = rating.match(/([\d.]+)/);

  if (cards.length > 0 || snippets.length > 0) {
    return {
      yelp_rating: ratingMatch ? ratingMatch[1] : null,
      yelp_review_count: null,
      yelp_categories: [],
      yelp_review_snippets: snippets,
      yelp_url: url
    };
  }

  return null;
}

// ─── Google News RSS ────────────────────────────────────────────────────────────

async function searchGoogleNews(companyName) {
  const q = encodeURIComponent(`"${companyName}"`);
  const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const { data } = await axios.get(rssUrl, { headers: HEADERS, timeout: 8000 });
  const $ = cheerio.load(data, { xmlMode: true });

  const articles = [];
  $('item').slice(0, 5).each((_, el) => {
    const title = $(el).find('title').text().replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const pubDate = $(el).find('pubDate').text().trim();
    const source = $(el).find('source').text().trim();
    if (title && title.length > 5) {
      articles.push({ title, pub_date: pubDate, source });
    }
  });

  return articles.length > 0
    ? { articles, latest_headline: articles[0]?.title, latest_date: articles[0]?.pub_date }
    : null;
}

// ─── Job Postings ───────────────────────────────────────────────────────────────

const JOB_TITLE_PATTERN = /\b(engineer|manager|coordinator|technician|dispatcher|field tech|service tech|installer|sales|account exec|analyst|developer|designer|specialist|director|lead|senior|junior|associate|recruiter|estimator|superintendent|foreman)\b/i;

async function searchJobPostings(companyName, website) {
  const jobs = [];

  // Strategy 1: fetch all common career paths concurrently (never sequential — avoids 36s worst case)
  if (website && website.startsWith('http')) {
    const base = website.replace(/\/+$/, '');
    const careerPaths = ['/careers', '/jobs', '/work-with-us', '/join-our-team', '/about/careers', '/join-us'];
    const fetches = await Promise.allSettled(
      careerPaths.map(path =>
        axios.get(`${base}${path}`, { headers: HEADERS, timeout: 5000 })
          .then(r => ({ path, data: r.data }))
      )
    );
    for (const result of fetches) {
      if (result.status !== 'fulfilled') continue;
      const $ = cheerio.load(result.value.data);
      $('h1, h2, h3, h4, li, [class*="job"], [class*="position"], [class*="opening"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 4 && text.length < 120 && JOB_TITLE_PATTERN.test(text)) {
          if (!jobs.find(j => j.title === text)) {
            jobs.push({ title: text, source: `${base}${result.value.path}` });
          }
        }
      });
    }
  }

  // Strategy 2: Indeed company page (if website had nothing)
  if (jobs.length === 0) {
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const { data } = await axios.get(`https://www.indeed.com/cmp/${slug}/jobs`, {
        headers: HEADERS, timeout: 7000
      });
      const $ = cheerio.load(data);
      $('[class*="jobTitle"], h2 a, .title a, [data-testid*="job"] h2').slice(0, 6).each((_, el) => {
        const title = $(el).text().trim();
        if (title && title.length > 3) jobs.push({ title, source: 'indeed.com' });
      });
    } catch (e) {}
  }

  if (jobs.length === 0) return null;

  return {
    jobs_found: jobs.slice(0, 6),
    total_openings: jobs.length,
    hiring_signals: classifyHiringSignals(jobs)
  };
}

function classifyHiringSignals(jobs) {
  const allTitles = jobs.map(j => j.title.toLowerCase()).join(' ');
  const signals = [];
  if (/dispatch|field tech|service tech|installer|foreman|crew/.test(allTitles)) {
    signals.push('Expanding field operations — dispatch & install roles open');
  }
  if (/accountant|bookkeeper|billing|invoice|finance|controller/.test(allTitles)) {
    signals.push('Finance/billing pain — hiring to handle manual workload');
  }
  if (/project manager|coordinator|operations manager|superintendent/.test(allTitles)) {
    signals.push('Scaling operations — adding coordination overhead');
  }
  if (/sales|business dev|account exec|sdr|bdr|estimator/.test(allTitles)) {
    signals.push('Actively growing revenue pipeline');
  }
  if (/software|developer|it support|data|digital|tech lead/.test(allTitles)) {
    signals.push('Investing in internal tech infrastructure');
  }
  if (signals.length === 0 && jobs.length > 0) {
    signals.push(`Actively hiring (${jobs.length} open ${jobs.length === 1 ? 'role' : 'roles'} found)`);
  }
  return signals;
}

// ─── BBB ───────────────────────────────────────────────────────────────────────

async function searchBBB(companyName, location) {
  const url = `https://www.bbb.org/search?find_country=USA&find_text=${encodeURIComponent(companyName)}&find_loc=${encodeURIComponent(location || '')}`;
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  const $ = cheerio.load(data);

  // BBB search results page
  const firstCard = $('[data-testid="search-result-card"], .result-item, [class*="BusinessCard"], article').first();
  if (firstCard.length === 0) return null;

  // Extract rating (often "A+", "B", etc.)
  const ratingText = firstCard.find('[aria-label*="BBB Rating"], [class*="rating"], [class*="Rating"]').text().trim()
    || firstCard.text().match(/BBB Rating[:\s]+([A-F][+-]?)/i)?.[1]
    || null;

  // Accreditation badge
  const accredited = firstCard.find('[alt*="Accredited"], [class*="accredit"], [class*="Accredit"], img[src*="accredited"]').length > 0;

  // Years in business
  const cardText = firstCard.text();
  const yearsMatch = cardText.match(/(\d+)\s*years?\s*in\s*business/i) || cardText.match(/in\s*business\s*since\s*(\d{4})/i);
  const yearSince = cardText.match(/Since\s*(\d{4})/i);
  const yearsInBusiness = yearsMatch ? yearsMatch[1] : (yearSince ? (new Date().getFullYear() - parseInt(yearSince[1])) + ' years' : null);

  // Complaint count
  const complaintsMatch = cardText.match(/(\d+)\s*complaints?/i);

  const profileLink = firstCard.find('a').first().attr('href');

  return {
    bbb_rating: ratingText,
    bbb_accredited: accredited,
    years_in_business: yearsInBusiness,
    complaints_count: complaintsMatch ? parseInt(complaintsMatch[1]) : null,
    bbb_url: profileLink ? `https://www.bbb.org${profileLink}` : url
  };
}

// ─── OpenCorporates ────────────────────────────────────────────────────────────

async function searchOpenCorporates(companyName) {
  const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(companyName)}&jurisdiction_code=us&per_page=1`;
  const { data } = await axios.get(url, { timeout: 9000 });

  const results = data?.results?.companies;
  if (!results || results.length === 0) return null;

  const company = results[0]?.company;
  if (!company) return null;

  const officers = (company.officers || []).slice(0, 3).map(o => ({
    name: o.officer?.name || '',
    position: o.officer?.position || ''
  })).filter(o => o.name);

  return {
    legal_name: company.name,
    incorporation_date: company.incorporation_date,
    company_type: company.company_type,
    current_status: company.current_status,
    jurisdiction: company.jurisdiction_code?.toUpperCase(),
    registered_address: company.registered_address_in_full || null,
    opencorporates_url: company.opencorporates_url || null,
    officers
  };
}

// ─── Dual-Engine Lowest Reviews Dataset Scraper ───────────────────────────────

/**
 * Scrapes Google Maps reviews filtered by "Lowest rating" using Puppeteer with semantic ARIA sort
 * and exhaustive container scrolling.
 *
 * @param {string} companyName
 * @param {string} location
 * @param {object} browser - Puppeteer browser instance
 * @returns {Promise<Array<{ rating: number, reviewer: string, date: string, text: string }>>}
 */
async function scrapeGoogleMapsLowestReviews(companyName, location, browser) {
  if (!browser) return [];
  let page = null;
  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // Clean query: strip corporate suffixes and punctuation for clean search matching
    const cleanComp = (companyName || '').replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/(\b(inc|llc|ltd|corp|corporation|co|group|services|company)\b\.?)/gi, '').replace(/\s+/g, ' ').trim();
    const cleanLoc = (location || '').replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const query = `${cleanComp} ${cleanLoc}`.trim();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise(r => setTimeout(r, 2500));

    // 1. Open Place card if in search list
    await page.evaluate(() => {
      const placeLinks = Array.from(document.querySelectorAll('a[href*="/maps/place/"], [role="feed"] a, [role="article"] a'));
      if (placeLinks.length > 0) placeLinks[0].click();
    });
    await new Promise(r => setTimeout(r, 2500));

    // 2. Open Reviews panel (Semantic ARIA / text matching)
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, div[role="tab"], div[role="button"], span'));
      const revBtn = allButtons.find(b => {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return (txt.includes('review') || aria.includes('review') || aria.includes('rating') || aria.includes('stars')) && !txt.includes('write');
      });
      if (revBtn) revBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // 3. Find and click reviews sort button / chip
    const sortOpened = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, div[role="radio"], div[role="button"], span'));
      
      const lowestDirect = allButtons.find(b => {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return txt === 'lowest rating' || aria.includes('lowest rating') || txt.includes('lowest');
      });
      if (lowestDirect) {
        lowestDirect.click();
        return 'chip_clicked';
      }

      const sortBtn = allButtons.find(b => {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const title = (b.getAttribute('title') || '').toLowerCase();
        return txt.includes('sort') || aria.includes('sort') || title.includes('sort');
      });

      if (sortBtn) {
        sortBtn.click();
        return 'sort_opened';
      }
      return 'not_found';
    });

    // 4. Select "Lowest rating" from the sort menu
    if (sortOpened === 'sort_opened') {
      await new Promise(r => setTimeout(r, 1200));
      await page.evaluate(() => {
        const menuItems = Array.from(document.querySelectorAll('[role="menu"] [role="menuitemradio"], [role="menuitem"], [role="radiogroup"] div, div[role="radio"], div'));
        const lowest = menuItems.find(m => {
          const txt = (m.innerText || m.textContent || '').trim().toLowerCase();
          const aria = (m.getAttribute('aria-label') || '').toLowerCase();
          return txt.includes('lowest') || aria.includes('lowest');
        });
        if (lowest) lowest.click();
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    // 5. Scroll through the review container to load reviews
    for (let scroll = 0; scroll < 4; scroll++) {
      await page.evaluate(() => {
        const scrollables = Array.from(document.querySelectorAll('div[role="main"], div[tabindex="-1"], div'));
        const container = scrollables.find(el => el.scrollHeight > 1000 && el.clientHeight > 200);
        if (container) container.scrollTop += 3500;
      });
      await new Promise(r => setTimeout(r, 600));
    }

    // 6. Expand all "See more" / "More" text buttons
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, span'));
      allButtons.forEach(b => {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        if (txt === 'more' || txt === 'see more' || aria.includes('see more')) {
          b.click();
        }
      });
    });
    await new Promise(r => setTimeout(r, 400));

    // 7. Extract structured review objects strictly from review cards
    const structuredReviews = await page.evaluate((compName) => {
      const results = [];
      const seen = new Set();
      const cleanCompName = (compName || '').toLowerCase().trim();
      
      // Target specific review cards only — never generic parent containers or place headers
      let reviewCards = Array.from(document.querySelectorAll('div[data-review-id]'));
      if (reviewCards.length === 0) {
        reviewCards = Array.from(document.querySelectorAll('div[role="article"]')).filter(el => 
          el.querySelector('[aria-label*="star" i], [aria-label*="stars" i]') &&
          !el.querySelector('h1') // exclude place title header
        );
      }

      reviewCards.forEach(card => {
        // Star rating
        const starEl = card.querySelector('[aria-label*="star" i], [aria-label*="stars" i]');
        const starAria = starEl ? (starEl.getAttribute('aria-label') || '') : '';
        const starMatch = starAria.match(/(\d+)/);
        const stars = starMatch ? parseInt(starMatch[1], 10) : 1;

        // Author name
        const authorEl = card.querySelector('button[aria-label*="profile" i], [class*="d4r55"], h3, [class*="title"]');
        const author = authorEl ? (authorEl.innerText || authorEl.textContent || '').trim() : 'Customer';

        // Date
        const dateEl = card.querySelector('[class*="rsqaWe"], [class*="dehysf"], [class*="date"], [class*="time"]');
        const date = dateEl ? (dateEl.innerText || dateEl.textContent || '').trim() : 'Recent';

        // Review Text: look for the dedicated review text span or container
        let reviewText = '';
        const textSpan = card.querySelector('span[class*="wiI7m"], span[class*="MyEned"], [class*="review-text"], [data-expandable-section]');
        if (textSpan) {
          reviewText = (textSpan.innerText || textSpan.textContent || '').trim();
        } else {
          // Fallback: extract from card innerText excluding headers, owner responses, and metadata
          let fullText = (card.innerText || card.textContent || '').trim();
          if (fullText.includes('Response from the owner')) {
            fullText = fullText.split('Response from the owner')[0].trim();
          }
          const lines = fullText.split('\n').map(l => l.trim()).filter(l => 
            l.length > 20 && 
            !l.includes('Share') && 
            !l.includes('Like') && 
            !l.includes('Local Guide') && 
            !l.includes('reviews') && 
            !l.includes('photo') && 
            !l.includes('ago') &&
            !l.includes('★') &&
            !l.includes('·') &&
            !l.includes('Verified') &&
            !l.toLowerCase().includes('medical clinic') &&
            !l.toLowerCase().includes('open') &&
            !l.toLowerCase().includes('closed')
          );
          reviewText = lines.join(' ').trim();
        }

        // Clean out any quotes and trim
        reviewText = reviewText.replace(/^["']|["']$/g, '').trim();

        // Validation: must be a real sentence and NOT just the company name or address
        const isAddressOrHeader = reviewText.toLowerCase() === cleanCompName ||
          reviewText.match(/^\d+\s+[a-z0-9\s,.-]+(?:st|ave|blvd|rd|dr|suite|ste|tx|ca|fl|ny|il|78\d{3}|90\d{3})/i) ||
          (reviewText.length < 25 && reviewText.toLowerCase().includes(cleanCompName));

        // Must contain common conversational words
        const hasWords = /\b(the|and|was|were|they|them|i|we|my|our|to|for|at|in|service|doctor|nurse|clinic|appointment|time|staff|called|told|rude|wait|bill|never|bad|good|hours)\b/i.test(reviewText);

        if (reviewText.length >= 25 && !isAddressOrHeader && hasWords) {
          const key = (author + '_' + reviewText.substring(0, 35)).toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              rating: stars,
              reviewer: author,
              date: date,
              text: reviewText
            });
          }
        }
      });

      return results;
    }, companyName);

    console.log(`[Google Maps Review Scraper] Extracted ${structuredReviews.length} verified review comments for ${companyName}`);
    return structuredReviews;
  } catch (err) {
    console.warn(`[Google Maps Review Scraper] Error for ${companyName}:`, err.message);
    return [];
  } finally {
    if (page) try { await page.close(); } catch (_) {}
  }
}

/**
 * Validates whether a text string is a genuine customer review or just a directory meta snippet.
 */
function isValidReviewText(text, companyName) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (clean.length < 25) return false;

  const cleanComp = (companyName || '').toLowerCase().trim();
  if (clean.toLowerCase() === cleanComp) return false;

  // Strict directory meta snippet detector
  const isDirectorySnippet = /\b(?:read\s+\d+\s+(?:customer\s+)?reviews?|read\s+what\s+people|located\s+at\s+\d+|hours,\s+phone\s+number|phone\s+number,\s+directions|one\s+of\s+the\s+best|ratings?,\s+hours|photos,\s+tips|claim\s+this\s+business|unclaimed\s+business|get\s+directions|reviews,\s+ratings)\b/i.test(clean);
  if (isDirectorySnippet) return false;

  // Address line detector
  const isAddress = /^\d+\s+[a-z0-9\s,.-]+(?:st|ave|blvd|rd|dr|suite|ste|tx|ca|fl|ny|il|78\d{3}|90\d{3})/i.test(clean);
  if (isAddress) return false;

  // Must have conversational English sentence structures
  const hasConversationalWords = /\b(i|we|my|our|they|them|was|were|the|to|and|for|doctor|nurse|clinic|staff|wait|waited|hour|rude|never|called|service|bill|charged|told|time)\b/i.test(clean);
  return hasConversationalWords;
}

/**
 * Fast HTTP fallback parser for Yelp and Trustpilot structured JSON-LD reviews
 */
async function scrapeHttpReviewsDataset(companyName, location, website) {
  const reviews = [];

  // Source 1: Yelp JSON-LD
  try {
    const searchUrl = `https://www.yelp.com/search?find_desc=${encodeURIComponent(companyName)}&find_loc=${encodeURIComponent(location || '')}`;
    const searchResp = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
    const $s = cheerio.load(searchResp.data);

    let bizUrl = null;
    $s('a[href*="/biz/"]').each((_, el) => {
      const href = $s(el).attr('href') || '';
      if (/^\/biz\/[a-z0-9-]+$/i.test(href.split('?')[0])) {
        bizUrl = `https://www.yelp.com${href.split('?')[0]}`;
        return false;
      }
    });

    if (bizUrl) {
      const { data } = await axios.get(`${bizUrl}?sort_by=rating_asc`, { headers: HEADERS, timeout: 10000 });
      const $ = cheerio.load(data);
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html());
          const items = Array.isArray(json) ? json : [json];
          items.forEach(obj => {
            (obj.review || []).forEach(r => {
              const text = (r.reviewBody || r.description || '').trim();
              const rating = parseInt(r.reviewRating?.ratingValue || 5);
              if (isValidReviewText(text, companyName)) {
                reviews.push({ 
                  rating, 
                  text, 
                  reviewer: r.author?.name || 'Customer', 
                  date: r.datePublished || 'Recent' 
                });
              }
            });
          });
        } catch (_) {}
      });
    }
  } catch (_) {}

  return reviews.filter(r => r.rating <= 3);
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────────

/**
 * Runs all research sources in parallel. Returns a comprehensive `deep_intel` object.
 *
 * @param {string} companyName
 * @param {string} location
 * @param {string} website
 * @param {object} [browser]
 * @returns {Promise<object>}
 */
async function deepResearch(companyName, location, website, browser) {
  const [yelp, news, hiring, bbb, corp, gmbReviews] = await Promise.allSettled([
    searchYelp(companyName, location),
    searchGoogleNews(companyName),
    searchJobPostings(companyName, website),
    searchBBB(companyName, location),
    searchOpenCorporates(companyName),
    browser 
      ? scrapeGoogleMapsLowestReviews(companyName, location, browser) 
      : scrapeHttpReviewsDataset(companyName, location, website)
  ]);

  const yelpData = yelp.status === 'fulfilled' ? yelp.value : null;
  let structuredGmb = gmbReviews.status === 'fulfilled' ? (gmbReviews.value || []) : [];

  // Filter all reviews to ensure strictly genuine reviews
  structuredGmb = structuredGmb.filter(r => isValidReviewText(r.text, companyName));

  // Convert structured GMB reviews into quoted strings for NLP compatibility
  const gmbFormattedQuotes = structuredGmb.map(r => `[${r.rating}★ - ${r.reviewer}]: "${r.text}"`);

  let mergedSnippets = [...gmbFormattedQuotes];
  if (yelpData && Array.isArray(yelpData.yelp_review_snippets)) {
    const validYelp = yelpData.yelp_review_snippets.filter(s => isValidReviewText(s, companyName));
    mergedSnippets.push(...validYelp);
  }

  const finalYelpData = yelpData || {
    yelp_rating: null,
    yelp_review_count: structuredGmb.length,
    yelp_categories: [],
    yelp_review_snippets: mergedSnippets,
    yelp_url: ''
  };
  finalYelpData.yelp_review_snippets = mergedSnippets;

  return {
    yelp:            finalYelpData,
    news:            news.status        === 'fulfilled' ? news.value        : null,
    hiring:          hiring.status      === 'fulfilled' ? hiring.value      : null,
    bbb:             bbb.status         === 'fulfilled' ? bbb.value         : null,
    corporation:     corp.status        === 'fulfilled' ? corp.value        : null,
    google_reviews:  gmbFormattedQuotes,
    reviews_dataset: structuredGmb,
    researched_at:   new Date().toISOString()
  };
}

module.exports = { deepResearch, scrapeGoogleMapsLowestReviews, scrapeHttpReviewsDataset };
