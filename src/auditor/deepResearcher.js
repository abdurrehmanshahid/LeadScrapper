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

// ─── Main Orchestrator ─────────────────────────────────────────────────────────

/**
 * Runs all research sources in parallel. Returns a `deep_intel` object.
 * Any individual source failure is silently skipped (returns null for that key).
 *
 * @param {string} companyName
 * @param {string} location
 * @param {string} website  — company website URL (used for job posting search)
 * @returns {Promise<object>}
 */
async function deepResearch(companyName, location, website) {
  const [yelp, news, hiring, bbb, corp] = await Promise.allSettled([
    searchYelp(companyName, location),
    searchGoogleNews(companyName),
    searchJobPostings(companyName, website),
    searchBBB(companyName, location),
    searchOpenCorporates(companyName)
  ]);

  return {
    yelp:        yelp.status        === 'fulfilled' ? yelp.value        : null,
    news:        news.status        === 'fulfilled' ? news.value        : null,
    hiring:      hiring.status      === 'fulfilled' ? hiring.value      : null,
    bbb:         bbb.status         === 'fulfilled' ? bbb.value         : null,
    corporation: corp.status        === 'fulfilled' ? corp.value        : null,
    researched_at: new Date().toISOString()
  };
}

module.exports = { deepResearch };
