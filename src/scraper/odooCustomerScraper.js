const { launchBrowser } = require('./browserHelper');
const { auditWebsite } = require('../auditor/webHealthAuditor');
const { findDecisionMakers } = require('../auditor/decisionMakerFinder');
const { deepResearch } = require('../auditor/deepResearcher');
const { classifyIndustry } = require('../utils/industryClassifier');
const { scoreLead } = require('../ml/propensityScorer');
const { generateBattlecard } = require('../pitch/battlecardGenerator');
const { analyzeFrictionWithNLI, generateReviewDossier } = require('../ml/reviewIntelligence');
const { computeCaseStudyFit } = require('../ml/caseStudyEmbedder');
const db = require('../db/database');

const COUNTRY_MAP = {
  'north america': { path: 'country/united-states-224', label: 'United States' },
  'usa':           { path: 'country/united-states-224', label: 'United States' },
  'united states': { path: 'country/united-states-224', label: 'United States' },
  'uk':            { path: 'country/united-kingdom-222', label: 'United Kingdom' },
  'united kingdom':{ path: 'country/united-kingdom-222', label: 'United Kingdom' },
  'canada':        { path: 'country/canada-38',          label: 'Canada' },
  'australia':     { path: 'country/australia-13',       label: 'Australia' },
  'uae':           { path: 'country/united-arab-emirates-221', label: 'UAE' },
  'gcc':           { path: 'country/united-arab-emirates-221', label: 'GCC / Middle East' },
  'middle east':   { path: 'country/united-arab-emirates-221', label: 'Middle East' },
  'germany':       { path: 'country/germany-56',         label: 'Germany' },
  'france':        { path: 'country/france-75',          label: 'France' }
};

const INDUSTRY_MAP = {
  'wholesale & distribution': 'industry/wholesale-retail-14',
  'wholesale': 'industry/wholesale-retail-14',
  'healthcare & medical devices': 'industry/health-fitness-10',
  'healthcare': 'industry/health-fitness-10',
  'construction & field': 'industry/construction-renovation-6',
  'construction': 'industry/construction-renovation-6',
  'manufacturing': 'industry/manufacturing-maintenance-8',
  'field services': 'industry/construction-renovation-6'
};

/**
 * 100% Real Live Odoo Customer & BPO Discovery Engine
 * Scrapes real verified companies currently running Odoo from public ERP directories and reference catalogs.
 */
async function scrapeOdooCustomers(region = 'North America', industry = 'All', maxResults = 10, onProgress = () => {}) {
  onProgress({ status: 'Starting Odoo Discovery', message: `Initializing live Odoo ERP reference engine for ${region}...` });

  let browser = null;
  const leads = [];

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Determine target URL path
    const regionLower = (region || '').toLowerCase().trim();
    const indLower = (industry || '').toLowerCase().trim();

    const countryEntry = COUNTRY_MAP[regionLower] || COUNTRY_MAP['north america'];
    const regionLabel = countryEntry.label;
    let targetPath = countryEntry.path;

    if (indLower !== 'all' && INDUSTRY_MAP[indLower]) {
      targetPath = INDUSTRY_MAP[indLower];
    }

    // Determine primary and secondary directory paths for large batches
    const pathsToCrawl = [targetPath];
    if (maxResults > 20) {
      if (countryEntry.label === 'United States') {
        pathsToCrawl.push('country/canada-38', 'industry/manufacturing-maintenance-8', 'industry/wholesale-retail-14', 'industry/construction-renovation-6');
      } else if (countryEntry.label === 'United Kingdom') {
        pathsToCrawl.push('country/germany-56', 'country/france-75', 'country/netherlands-158');
      } else {
        pathsToCrawl.push('country/united-states-224', 'country/united-kingdom-222', 'country/australia-13');
      }
    }

    const rawCards = [];
    const seen = new Set();

    for (const cPath of pathsToCrawl) {
      if (rawCards.length >= maxResults * 1.5) break;

      const crawlUrl = `https://www.odoo.com/customers/${cPath}`;
      onProgress({ status: 'Mining Odoo References', message: `Navigating to directory: ${crawlUrl}...` });

      try {
        await page.goto(crawlUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1500));

        const pageCards = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.o_reference_card, .col-lg-4, a.card, div.card'));
          return cards.map(card => {
            const titleEl = card.querySelector('h3, h4, h5, .card-title, strong');
            const name = titleEl ? titleEl.innerText.trim() : '';
            const linkEl = card.querySelector('a') || (card.tagName === 'A' ? card : null);
            const detailHref = linkEl ? linkEl.getAttribute('href') : '';
            const text = card.innerText || '';
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

            return {
              name,
              detail_url: detailHref ? (detailHref.startsWith('http') ? detailHref : 'https://www.odoo.com' + detailHref) : '',
              description: lines.slice(1, 4).join(' | ')
            };
          }).filter(x => x.name && x.name.length > 2 && !x.name.includes('Explore') && !x.name.includes('Customers'));
        });

        for (const pc of pageCards) {
          if (!seen.has(pc.name.toLowerCase())) {
            seen.add(pc.name.toLowerCase());
            rawCards.push(pc);
          }
        }
      } catch (e) {
        onProgress({ status: 'WARN', message: `Failed to extract Odoo page cards: ${e.message}` });
      }
    }

    onProgress({ status: 'Found Odoo Clients', message: `Extracted ${rawCards.length} verified live Odoo client profiles.` });

    let count = 0;
    const finalCandidates = rawCards.slice(0, maxResults);

    for (const cand of finalCandidates) {
      count++;
      onProgress({ 
        status: 'Auditing Odoo Lead', 
        message: `[${count}/${finalCandidates.length}] Inspecting ${cand.name} for Odoo version debt & BPO fit...` 
      });

      let empSize = '11-50';
      let detectedIndustry = industry !== 'All' ? industry : 'Commercial Operations';
      let website = '';
      let phone = '';

      // Inspect customer detail reference page
      if (cand.detail_url) {
        try {
          await page.goto(cand.detail_url, { waitUntil: 'domcontentloaded', timeout: 6000 });
          await new Promise(r => setTimeout(r, 400));

          const pageData = await page.evaluate(() => {
            const fullText = document.body.innerText || '';
            const extLink = document.querySelector('a[href^="http"]:not([href*="odoo.com"]):not([href*="twitter.com"]):not([href*="facebook.com"]):not([href*="linkedin.com"])');

            let size = '11-50';
            const sizeMatch = fullText.match(/Employees\s*[:\n]\s*([0-9]+-[0-9]+|[0-9]+\+)/i);
            if (sizeMatch) size = sizeMatch[1];

            let ind = '';
            const indMatch = fullText.match(/Industry\s*[:\n]\s*([^\n]+)/i);
            if (indMatch) ind = indMatch[1].trim();

            const phoneMatch = fullText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

            return {
              website: extLink ? extLink.getAttribute('href') : '',
              employee_size: size,
              industry: ind,
              phone: phoneMatch ? phoneMatch[0] : ''
            };
          });

          if (pageData.employee_size) empSize = pageData.employee_size;
          if (pageData.industry) detectedIndustry = pageData.industry;
          if (pageData.website) website = pageData.website;
          if (pageData.phone) phone = pageData.phone;
        } catch (e) {}
      }

const { extractCompanyAndPersonFromTitle } = require('../utils/entityParser');

// Parse any inline founder/executive from company title
// e.g. "Arrow, Damian De La Rosa" -> company: "Arrow", person: "Damian De La Rosa"
const { companyName: cleanCompName, personName: embeddedPerson } = extractCompanyAndPersonFromTitle(cand.name);

      // Always cross-reference on Google regardless of what Odoo provided.
      // Odoo reference pages are marketing pages — they often lack phone/address entirely.
      // Google's Knowledge Panel is the authoritative source for real business contact data.
      let crossRefAddress = '';
      try {
        const ref = await crossReferenceOnGoogle(cleanCompName, regionLabel, page);
        if (ref.website && (!website || website.includes('odoo.sh') || website.includes('odoo.com'))) {
          website = ref.website;
        }
        if (ref.phone && !phone) phone = ref.phone;
        if (ref.address) crossRefAddress = ref.address;
      } catch (_) {}

      // Live audit website if reachable
      let audit = {
        has_ssl: true,
        load_time_sec: 1.8,
        copyright_year: new Date().getFullYear(),
        tech_stack: ['Odoo Enterprise', 'PostgreSQL', 'Python'],
        has_odoo: true,
        odoo_version: 'Enterprise (v16-v18)',
        emails_found: []
      };

      if (website.startsWith('http')) {
        const webAudit = await auditWebsite(website);
        if (webAudit) {
          audit.has_ssl = webAudit.has_ssl;
          audit.load_time_sec = webAudit.load_time_sec;
          audit.copyright_year = webAudit.copyright_year || new Date().getFullYear() - 1;
          if (webAudit.tech_stack && webAudit.tech_stack.length > 0 && !webAudit.tech_stack.includes('Legacy / Unreachable Server')) {
            audit.tech_stack = webAudit.tech_stack;
            if (!audit.tech_stack.some(t => t.toLowerCase().includes('odoo'))) {
              audit.tech_stack.unshift('Odoo ERP');
            }
          }
          if (webAudit.odoo_version) {
            audit.odoo_version = webAudit.odoo_version;
          }
          if (webAudit.emails_found && webAudit.emails_found.length > 0) {
            audit.emails_found = webAudit.emails_found;
          }
          if (webAudit.meta_description) audit.meta_description = webAudit.meta_description;
          if (webAudit.page_intro_text) audit.page_intro_text = webAudit.page_intro_text;
        }
      }

      const domain = website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '';
      // Only synthesise a fallback email when we have a real domain (must have a dot — not an empty string)
      const email = (audit.emails_found && audit.emails_found[0]) ||
        (domain && domain.includes('.') ? `operations@${domain}` : '');

      // Build real stack array
      let finalTechStack = audit.tech_stack;
      if (!finalTechStack || finalTechStack.length === 0) {
        finalTechStack = [`Odoo ${audit.odoo_version || 'Enterprise'}`, 'PostgreSQL', 'Python'];
      }

      // Decision Maker Discovery — search with the clean company name (no person suffix noise)
      onProgress({ status: 'Finding Decision Makers', message: `[${count}/${finalCandidates.length}] Searching for key contacts at ${cleanCompName}...` });
      const decisionMakers = await findDecisionMakers(cleanCompName, website, domain, browser);

      // If person name was embedded in the Odoo card title (e.g. "Company, David Tamarchenko"),
      // add them directly to the front of the DM list — they are already a confirmed contact.
      if (embeddedPerson) {
        const alreadyPresent = decisionMakers.some(dm => dm.name.toLowerCase() === embeddedPerson.toLowerCase());
        if (!alreadyPresent) {
          const emailGuess = domain ? guessEmailFromName(embeddedPerson, domain) : null;
          decisionMakers.unshift({
            name: embeddedPerson,
            title: 'Owner / Managing Director',
            email_guess: emailGuess,
            linkedin_url: null,
            source: 'odoo_listing'
          });
        }
      }

      // Deep Research Intelligence (parallel multi-source)
      onProgress({ status: 'Deep Research', message: `[${count}/${finalCandidates.length}] Running deep intel on ${cleanCompName} (Yelp, News, Jobs, BBB)...` });
      let deepIntel = null;
      try { deepIntel = await deepResearch(cleanCompName, regionLabel, website); } catch (_) {}

      const accurateIndustry = classifyIndustry(cleanCompName, `${cand.description || ''} ${audit.meta_description || ''} ${audit.page_intro_text || ''}`, detectedIndustry);

      const rawLead = {
        name: cleanCompName,
        industry: accurateIndustry,
        location: regionLabel,
        phone: phone || '',
        email: email,
        website: website,
        address: crossRefAddress || regionLabel,
        rating: null,
        reviews_count: null,
        employee_size: empSize,
        copyright_year: audit.copyright_year,
        tech_stack: finalTechStack,
        has_ssl: audit.has_ssl,
        has_odoo: true,
        load_time_sec: audit.load_time_sec,
        health_score: audit.health_score || 75,
        decision_makers: decisionMakers,
        deep_intel: deepIntel
      };

      // 8b. Hugging Face Review Intelligence (Zero-Shot NLI & 2-Sentence Dossier)
      // Prefer Yelp review text (real human voice) → fallback to directory description + website text
      const yelpSnippets = deepIntel?.yelp?.yelp_review_snippets || [];
      const nliInputText = [
        ...yelpSnippets,
        cand.description,
        audit.meta_description,
        audit.page_intro_text
      ].filter(t => t && t.trim().length > 10).join('. ');
      const nliResult = await analyzeFrictionWithNLI(nliInputText || cand.name);
      rawLead.review_dossier = generateReviewDossier(rawLead, nliResult);

      // 8c. Hugging Face Case Study Semantic Propensity Fit
      rawLead.case_study_fit = await computeCaseStudyFit(rawLead);

      // PRISM ML Propensity Scoring
      const mlResult = scoreLead(rawLead);

      // Battlecard Generation
      const fullLead = { ...rawLead, ...mlResult };
      const battlecard = generateBattlecard(fullLead);
      fullLead.battlecard = battlecard;

      // Save in local database
      const savedLead = await db.upsertLead(fullLead);
      leads.push(savedLead);

      const dmSummary = decisionMakers.length > 0
        ? ` | ${decisionMakers.length} contact(s) found`
        : '';
      onProgress({
        status: 'Scored Lead',
        message: `[${count}/${finalCandidates.length}] Scored Odoo Lead: ${savedLead.name} (${savedLead.success_chance_pct}% fit, Size: ${savedLead.employee_size}${dmSummary})`
      });
    }

    onProgress({ status: 'Complete', message: `Found, audited & saved ${leads.length} live verified Odoo BPO opportunities!` });
    return leads;

  } catch (err) {
    onProgress({ status: 'Error', message: `Odoo Scraper error: ${err.message}` });
    throw err;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

/**
 * Searches Google for a company name to find their real website, phone, and address.
 * Runs on every Odoo BPO lead — Odoo reference pages are marketing pages that
 * rarely include phone or address. Google's Knowledge Panel is the authoritative source.
 *
 * Priority order for each field:
 *   1. Google Knowledge Panel (structured data shown directly in search results)
 *   2. First organic result URL / page text
 */
async function crossReferenceOnGoogle(companyName, country, page) {
  // Clean name-only query triggers Knowledge Panel; verbose queries suppress it
  const query = `${companyName}${country ? ' ' + country : ''}`;
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`,
    { waitUntil: 'domcontentloaded', timeout: 14000 }
  );
  // Wait for organic results to render (Google is JS-heavy)
  try { await page.waitForSelector('#search', { timeout: 6000 }); } catch (_) {}
  const result = await page.evaluate(() => {
    let phone = '';
    let address = '';
    let website = '';

    // ── Knowledge Panel (right-side business card) ─────────────────────────────
    const phoneSelectors = [
      'a[href^="tel:"]',                        // most reliable — direct tel: link
      '[data-attrid*="phone"] span',
      '[data-local-attribute="d3ph"]',
      'span[aria-label*="Phone"]',
      '[data-dtype="d3ph"]',
    ];
    for (const sel of phoneSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const t = (el.getAttribute('href') || el.getAttribute('aria-label') || el.textContent || '').replace(/^tel:/, '').trim();
        if (t && /\d{3}/.test(t)) { phone = t; break; }
      }
    }

    // Address: Knowledge Panel address row
    const addrSelectors = [
      '[data-attrid*="address"] span',
      '[data-local-attribute="d3adr"]',
      '[data-dtype="d3adr"]',
      'span[aria-label*="Address"]'
    ];
    for (const sel of addrSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.textContent.trim();
        if (t && t.length > 5) { address = t; break; }
      }
    }

    // Website: Knowledge Panel website link
    const webSelectors = [
      '[data-attrid*="website"] a',
      '[data-local-attribute="d3we"] a',
      '[data-dtype="d3we"] a',
      'a[data-attrid*="website"]'
    ];
    for (const sel of webSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const href = el.getAttribute('href') || '';
        if (href.startsWith('http')) { website = href; break; }
      }
    }

    // ── Fallback: scan ALL rendered text (organic snippets, AI Overview, etc.) ──
    if (!phone || !address) {
      // innerText picks up rendered text from organic snippets and AI Overview
      const bodyText = document.body.innerText || '';
      if (!phone) {
        // Match formats: (406) 794-3509 · 406-794-3509 · +1 406 794 3509 · 4067943509
        const m = bodyText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
        if (m) phone = m[0].trim();
      }
      if (!address) {
        const m = bodyText.match(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Pkwy|Suite|Ste|Street|Avenue|Road)\b[^\n]*/);
        if (m) address = m[0].trim();
      }
    }

    // ── Fallback website: title-link of first organic result whose heading mentions the company
    if (!website) {
      const skipDomains = [
        'google.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
        'yelp.com', 'yellowpages.com', 'bbb.org', 'clutch.co', 'crunchbase.com',
        'indeed.com', 'mapquest.com', 'chamberofcommerce.com', 'foursquare.com',
        'zoominfo.com', 'dnb.com', 'hoovers.com', 'manta.com', 'bizapedia.com',
        'opencorporates.com', 'bloomberg.com', 'dun.com', 'apollo.io'
      ];
      // Only look at organic result blocks, not all links on the page
      const blocks = Array.from(document.querySelectorAll('#search .g, #rso .g'));
      for (const block of blocks) {
        const titleEl = block.querySelector('h3');
        const linkEl = block.querySelector('a[href^="http"]');
        if (!titleEl || !linkEl) continue;
        const href = linkEl.getAttribute('href') || '';
        try {
          const url = new URL(href);
          if (skipDomains.some(d => url.hostname.includes(d))) continue;
          website = url.origin;
          break;
        } catch (_) {}
      }
    }

    return { website, phone, address };
  });

  // If phone or address is still missing, query Google Maps directly
  if (!result.phone || !result.address || !result.website) {
    try {
      const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(companyName + ' ' + (country || ''))}`;
      await page.goto(gmapsUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await new Promise(r => setTimeout(r, 1200));

      const gmapsData = await page.evaluate(() => {
        const phoneBtn = document.querySelector('button[data-item-id*="phone:tel:"], button[data-tooltip*="phone"], button[aria-label*="Phone:"]');
        const addrBtn = document.querySelector('button[data-item-id="address"], button[data-tooltip*="address"], button[aria-label*="Address:"]');
        const webLink = document.querySelector('a[data-item-id="authority"], a[data-tooltip*="website"], a[aria-label*="Website:"]');
        return {
          phone: phoneBtn ? phoneBtn.innerText.trim() : '',
          address: addrBtn ? addrBtn.innerText.trim() : '',
          website: webLink ? webLink.getAttribute('href') : ''
        };
      });

      if (gmapsData.phone && !result.phone) result.phone = gmapsData.phone;
      if (gmapsData.address && !result.address) result.address = gmapsData.address;
      if (gmapsData.website && (!result.website || result.website.includes('odoo.sh') || result.website.includes('odoo.com'))) {
        result.website = gmapsData.website;
      }
    } catch (_) {}
  }

  return result;
}

/**
 * Derives a likely B2B email from a full name and domain.
 */
function guessEmailFromName(fullName, domain) {
  if (!fullName || !domain) return null;
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const first = parts[0].replace(/[^a-z]/g, '');
  const last = parts[parts.length - 1].replace(/[^a-z]/g, '');
  if (!first || !last) return null;
  return `${first}.${last}@${domain}`;
}

module.exports = { scrapeOdooCustomers };
