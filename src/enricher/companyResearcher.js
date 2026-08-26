/**
 * Deep Company Researcher — Gemini + Google Search Grounding
 *
 * Uses Gemini's native googleSearch tool to actually Google the company
 * in real-time: news, funding, leadership, ERP signals, Glassdoor,
 * Crunchbase, BBB, job postings, reviews — the full rabbit hole.
 *
 * Also scrapes job postings from LinkedIn, Indeed, Glassdoor, and
 * company careers pages, extracting ERP/CRM tech keywords from
 * job description bodies (not just titles).
 */

const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache'
};

// ERP / CRM / internal software keywords to detect from job descriptions
const ERP_KEYWORDS = [
  'quickbooks', 'sage', 'netsuite', 'sap', 'oracle', 'dynamics', 'ms dynamics',
  'microsoft dynamics', 'epicor', 'infor', 'acumatica', 'odoo', 'zoho',
  'salesforce', 'hubspot', 'pipedrive', 'monday.com', 'asana', 'jira',
  'servicetitan', 'jobber', 'housecall pro', 'fieldedge', 'successware',
  'brightree', 'advancedmd', 'kareo', 'eclinicalworks', 'athenahealth',
  'shopify', 'magento', 'woocommerce', 'bigcommerce', 'lightspeed',
  'square', 'clover', 'toast', 'revel',
  'workday', 'bamboohr', 'adp', 'paychex', 'gusto',
  'xero', 'freshbooks', 'wave', 'bill.com'
];

const GROWTH_SIGNALS = [
  'hiring', 'expanding', 'new location', 'opening', 'franchise', 'series a',
  'series b', 'funding', 'raised', 'acquisition', 'merger', 'ipo',
  'new office', 'growing team', 'multiple positions'
];

// ─── Job Postings: Multi-Source ────────────────────────────────────────────────

async function scrapeIndeedJobs(companyName) {
  const jobs = [];
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Company page + general search
  const urls = [
    `https://www.indeed.com/cmp/${slug}/jobs`,
    `https://www.indeed.com/jobs?q=${encodeURIComponent(companyName)}&sort=date`
  ];

  for (const url of urls) {
    try {
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 8000 });
      const $ = cheerio.load(data);

      $('[class*="job_seen"], .job_seen_beacon, [data-testid="slider_container"], .jobsearch-SerpJobCard').each((_, card) => {
        const title = $(card).find('[class*="jobTitle"], h2 a, .title').first().text().trim();
        const snippet = $(card).find('[class*="job-snippet"], .summary, [class*="description"]').first().text().trim();
        const location = $(card).find('[data-testid="text-location"], .location, [class*="location"]').first().text().trim();
        const isRemote = /remote|work from home|wfh/i.test(location + snippet);

        if (title) {
          jobs.push({
            title,
            location: location || 'Unknown',
            remote: isRemote,
            description_snippet: snippet.substring(0, 300),
            erp_keywords: extractErpKeywords(title + ' ' + snippet),
            source: 'indeed'
          });
        }
      });

      if (jobs.length >= 10) break;
    } catch (_) {}
  }

  return jobs;
}

async function scrapeLinkedInJobs(companyName) {
  const jobs = [];
  try {
    const query = encodeURIComponent(companyName);
    const url = `https://www.linkedin.com/jobs/search/?keywords=${query}&f_TPR=r604800`;
    const { data } = await axios.get(url, { headers: { ...HEADERS, 'Accept': 'text/html' }, timeout: 10000 });
    const $ = cheerio.load(data);

    $('li.jobs-search-results__list-item, .job-search-card, [class*="base-card"]').slice(0, 10).each((_, card) => {
      const title = $(card).find('.base-search-card__title, h3, [class*="job-title"]').first().text().trim();
      const company = $(card).find('.base-search-card__subtitle, h4, [class*="company"]').first().text().trim();
      const location = $(card).find('.job-search-card__location, [class*="location"]').first().text().trim();
      const isRemote = /remote/i.test(location + title);

      if (title && (company.toLowerCase().includes(companyName.toLowerCase().split(' ')[0]) || !company)) {
        jobs.push({
          title,
          location: location || 'Unknown',
          remote: isRemote,
          description_snippet: '',
          erp_keywords: extractErpKeywords(title),
          source: 'linkedin'
        });
      }
    });
  } catch (_) {}
  return jobs;
}

async function scrapeGlassdoorJobs(companyName) {
  const jobs = [];
  try {
    const query = encodeURIComponent(companyName);
    const url = `https://www.glassdoor.com/Jobs/${query}-jobs-SRCH_KE0,${companyName.length}.htm`;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(data);

    $('[data-test="job-link"], .job-search-key-l93s0l5, [class*="JobCard"]').slice(0, 8).each((_, card) => {
      const title = $(card).find('[data-test="job-title"], h2, [class*="title"]').first().text().trim();
      const location = $(card).find('[data-test="location"], [class*="location"]').first().text().trim();
      const isRemote = /remote/i.test(location + title);

      if (title) {
        jobs.push({
          title,
          location: location || 'Unknown',
          remote: isRemote,
          description_snippet: '',
          erp_keywords: extractErpKeywords(title),
          source: 'glassdoor'
        });
      }
    });
  } catch (_) {}
  return jobs;
}

async function scrapeCareerPage(website) {
  const jobs = [];
  if (!website || !website.startsWith('http')) return jobs;

  const base = website.replace(/\/+$/, '');
  const paths = ['/careers', '/jobs', '/join-us', '/work-with-us', '/join-our-team', '/about/careers', '/hiring'];

  const fetches = await Promise.allSettled(
    paths.map(p => axios.get(`${base}${p}`, { headers: HEADERS, timeout: 5000 }).then(r => r.data))
  );

  for (const result of fetches) {
    if (result.status !== 'fulfilled') continue;
    const $ = cheerio.load(result.value);

    $('h2, h3, h4, li, [class*="job"], [class*="position"], [class*="opening"], [class*="role"]').each((_, el) => {
      const text = $(el).text().trim();
      const desc = $(el).parent().text().trim();
      if (text.length > 4 && text.length < 150) {
        const erp = extractErpKeywords(text + ' ' + desc);
        jobs.push({
          title: text,
          location: /remote/i.test(desc) ? 'Remote' : 'On-site',
          remote: /remote/i.test(desc),
          description_snippet: desc.substring(0, 200),
          erp_keywords: erp,
          source: 'careers_page'
        });
      }
    });

    if (jobs.length > 0) break;
  }

  return jobs.slice(0, 10);
}

function extractErpKeywords(text) {
  const lower = text.toLowerCase();
  return ERP_KEYWORDS.filter(kw => lower.includes(kw));
}

function classifyJobSignals(allJobs) {
  const signals = [];
  const titles = allJobs.map(j => j.title.toLowerCase()).join(' ');
  const allText = allJobs.map(j => j.title + ' ' + (j.description_snippet || '')).join(' ').toLowerCase();

  const erpFound = [...new Set(allJobs.flatMap(j => j.erp_keywords || []))];
  if (erpFound.length > 0) {
    signals.push(`Currently using: ${erpFound.join(', ').toUpperCase()} — potential migration target`);
  }

  const remoteCount = allJobs.filter(j => j.remote).length;
  if (remoteCount > 0) signals.push(`${remoteCount} remote role(s) open — distributed team, needs cloud ERP`);

  if (/dispatch|field tech|service tech|installer|foreman|crew/.test(titles))
    signals.push('Expanding field ops — dispatch & scheduling pain likely');
  if (/accountant|bookkeeper|billing|invoice|finance|controller/.test(titles))
    signals.push('Finance/billing overload — manual invoicing bottleneck');
  if (/project manager|coordinator|operations manager/.test(titles))
    signals.push('Scaling operations — coordination overhead growing');
  if (/sales|business dev|account exec|sdr|estimator/.test(titles))
    signals.push('Growing revenue pipeline — CRM & lead tracking needed');
  if (/developer|engineer|it support|data/.test(titles))
    signals.push('Investing in internal tech — open to modern ERP');

  return signals;
}

// ─── Gemini Google Search Deep Research ───────────────────────────────────────

async function geminiDeepResearch(lead) {
  require('dotenv').config();
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const key = process.env.gemini_key;
  if (!key) throw new Error('gemini_key not in .env');

  const genAI = new GoogleGenerativeAI(key);

  // Pinned model ids get retired ("no longer available to new users"), so use the
  // `gemini-flash-latest` alias which tracks the current GA flash model. It uses
  // the `googleSearch` grounding tool. NOTE: with grounding enabled the API rejects
  // responseMimeType:"application/json", so we prompt for JSON and extract it below.
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.1 }
  });

  const companyName = lead.name;
  const domain = lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '';
  const location = lead.location || '';

  const prompt = `Research "${companyName}" (${location}, website: ${domain || 'unknown'}) thoroughly as if you are a B2B sales analyst at an Odoo ERP partner.

Search Google for and summarize ONLY real, verifiable findings (cite sources):

1. LEADERSHIP: Who is the real CEO/Founder/Owner/MD? Full name and title. Check LinkedIn, company website about page, news, press releases.

2. TECH STACK: What software do they currently use? Look for job postings mentioning software requirements, StackShare, any tech mentions on their site, app integrations listed.

3. CURRENT ERP/CRM: Do any job postings or reviews mention QuickBooks, NetSuite, SAP, Salesforce, HubSpot, Zoho, or other business software? What are they running?

4. RECENT NEWS: Any funding, acquisitions, expansions, new locations, leadership changes, or notable events in the last 12 months?

5. GROWTH SIGNALS: Are they hiring aggressively? Opening new locations? Any growth indicators?

6. CUSTOMER COMPLAINTS: Any Google reviews, BBB complaints, Trustpilot, Yelp, or social media complaints about slow service, billing errors, scheduling issues, or disorganization?

7. GLASSDOOR: Any employee reviews mentioning chaotic operations, no systems, poor management, manual processes?

8. COMPETITIVE POSITION: Who are their main competitors? Are those competitors already using Odoo or modern ERP?

Return a JSON object:
{
  "ceo_name": "Real verified name or null",
  "ceo_title": "Exact title",
  "ceo_source": "URL where this was found",
  "current_erp": ["list of software found in use"],
  "current_erp_signal": "e.g. Job posting requires 'QuickBooks experience' → actively using QB",
  "recent_news": ["headline 1", "headline 2"],
  "growth_signals": ["signal 1", "signal 2"],
  "customer_complaints_summary": "2-3 sentence summary of real complaint patterns found online",
  "glassdoor_signals": "What employees say about internal operations",
  "competitors": ["Competitor A", "Competitor B"],
  "rabbit_hole_summary": "3-4 sentence intel briefing — what a sales rep needs to know before dialing",
  "sources_checked": ["url1", "url2"]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else parsed = { rabbit_hole_summary: text.substring(0, 500), sources_checked: [] };
    }
    return parsed;
  } catch (err) {
    console.warn(`[Company Researcher] Gemini Google Search failed: ${err.message}`);
    return null;
  }
}

// ─── Gemini Sales Briefing (simple, no grounding tool) ────────────────────────
// Plain Gemini call (avoids the quota-limited Google Search grounding tool).
// Gemini uses its own knowledge to produce: company profile, an analysis of the
// company's lowest-rating reviews + representative bad-review snippets, and a
// mapping of each recurring problem to a real Odoo module we can sell.
async function groundedBriefing(lead, reviews = []) {
  require('dotenv').config();
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const { cleanWebsite } = require('../utils/cleanWebsite');
  const key = process.env.gemini_key;
  if (!key) throw new Error('gemini_key not in .env');

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
  });

  const companyName = lead.name;
  const website = cleanWebsite(lead.website);
  const domain = website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '';
  const location = lead.location || '';
  const industry = lead.industry || '';

  // Real BAD (1–2★) Google reviews we scraped — the authoritative input for the
  // review analysis (Gemini analyses THESE, it does not invent complaints).
  const low = (reviews || []).filter(r => r && r.text && (r.rating == null || r.rating <= 2)).slice(0, 25);
  const reviewBlock = low.length
    ? low.map((r, i) => `[${i + 1}] (${r.rating != null ? r.rating + '★' : '?'}${r.date ? ', ' + r.date : ''}) ${String(r.text).replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')
    : '';

  const prompt = `You are a senior B2B analyst at an Odoo ERP implementation partner preparing a call briefing for "${companyName}"${location ? ` in ${location}` : ''}${industry ? ` (${industry})` : ''}${domain ? ` — website ${domain}` : ''}.

${reviewBlock
  ? `Below are the company's REAL lowest-rating Google reviews (scraped just now). Base the review analysis STRICTLY on these — quote/paraphrase only what actually appears here, do not invent complaints:\n\n${reviewBlock}\n`
  : `No reviews were captured. For the review analysis, describe the typical lowest-rating complaints for this type/size of business in this location, and mark it as inferred.\n`}

TASKS:
1. COMPANY PROFILE: 2–3 sentences on what they do, size and footprint (use your knowledge).
2. LEADERSHIP: the CEO/Founder/Owner if you know it (name, title, LinkedIn if known, email if publicly known). If not confident, use null — do NOT fabricate names or emails.
3. REVIEW ANALYSIS: from the reviews above, summarise what the worst reviews reveal, list the recurring OPERATIONAL problems customers actually complain about, and for EACH problem give 4–8 short distinctive keywords/phrases that literally appear in those reviews (lowercase, e.g. "long line", "checkout", "spoiled", "rude") so we can count how many reviews mention it. Also pick 2–4 of the most telling verbatim snippets.
4. ODOO MAPPING: map each recurring problem to the SPECIFIC real Odoo app that fixes it. Choose only from real Odoo apps: CRM, Sales, Inventory, Manufacturing, Purchase, Accounting, Invoicing, Point of Sale, Field Service, Helpdesk, Project, Subscriptions, Website/eCommerce, Marketing Automation, Email Marketing, HR, Appointments, Studio. One sentence on what we sell them.

Return ONLY this JSON (no markdown, no commentary):
{
  "company_profile": "string or null",
  "ceo": { "name": null, "title": null, "linkedin": null, "email": null },
  "decision_makers": [ { "name": "", "title": "", "linkedin": null, "email": null } ],
  "review_analysis": {
    "reviews_analysed": ${low.length},
    "overall": "summary of what the worst reviews reveal, or null",
    "recurring_problems": [ { "problem": "", "keywords": ["lowercase","words that appear in matching reviews"], "evidence": "quote/paraphrase from the reviews above" } ],
    "snippets": [ { "stars": 1, "text": "verbatim snippet from a review above" } ]
  },
  "odoo_mapping": [ { "problem": "", "odoo_module": "", "pitch": "" } ]
}`;

  try {
    // Retry transient 503/high-demand a few times with backoff.
    let result, lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { result = await model.generateContent(prompt); break; }
      catch (e) {
        lastErr = e;
        if (!/\b503\b|high demand|unavailable|overloaded/i.test(e.message) || attempt === 4) throw e;
        await new Promise(r => setTimeout(r, attempt * 1500));
      }
    }
    if (!result) throw lastErr;
    const text = result.response.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!parsed) return null;

    // Gemini won't reliably recall exact LinkedIn profile URLs without live search,
    // so for any named person missing a LinkedIn, build a people-search link
    // (name + company) — same convention as the scraped decision_makers.
    const linkedinSearch = (name) =>
      `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${name} ${companyName}`.trim())}`;
    const fillLinkedin = (p) => {
      if (p && p.name && !p.linkedin) { p.linkedin = linkedinSearch(p.name); p.linkedin_is_search = true; }
      return p;
    };
    if (parsed.ceo) fillLinkedin(parsed.ceo);
    if (Array.isArray(parsed.decision_makers)) parsed.decision_makers.forEach(fillLinkedin);

    parsed.ai_generated = true; // knowledge-based, not live-verified
    parsed.generated_at = new Date().toISOString();
    return parsed;
  } catch (err) {
    console.warn(`[Gemini Briefing] failed: ${err.message}`);
    // Surface real API errors (quota/billing/model) to the caller instead of a generic null.
    const raw = err.message || 'Gemini request failed';
    if (/\b429\b|quota|rate limit/i.test(raw)) {
      throw new Error('Gemini quota exceeded. Wait for the quota to reset or enable billing on the API key. (429)');
    }
    throw new Error(raw.replace(/\[GoogleGenerativeAI Error\]:\s*/i, '').slice(0, 300));
  }
}

// ─── Main Warm Enrichment Orchestrator ────────────────────────────────────────

async function warmEnrichLead(lead) {
  console.log(`[Warm Enrich] Starting deep research for "${lead.name}"...`);

  const [indeedJobs, linkedinJobs, glassdoorJobs, careerJobs, geminiResearch] = await Promise.allSettled([
    scrapeIndeedJobs(lead.name),
    scrapeLinkedInJobs(lead.name),
    scrapeGlassdoorJobs(lead.name),
    scrapeCareerPage(lead.website),
    geminiDeepResearch(lead)
  ]);

  // Merge all jobs, dedupe by title
  const allJobs = [
    ...(indeedJobs.value || []),
    ...(linkedinJobs.value || []),
    ...(glassdoorJobs.value || []),
    ...(careerJobs.value || [])
  ].filter((job, idx, arr) =>
    idx === arr.findIndex(j => j.title.toLowerCase() === job.title.toLowerCase())
  );

  const allErpKeywords = [...new Set(allJobs.flatMap(j => j.erp_keywords || []))];
  const jobSignals = classifyJobSignals(allJobs);
  const remoteJobs = allJobs.filter(j => j.remote);
  const research = geminiResearch.status === 'fulfilled' ? geminiResearch.value : null;

  // Merge ERP signals from jobs + Gemini research
  const currentErp = [...new Set([
    ...allErpKeywords,
    ...(research?.current_erp || [])
  ])];

  // Real CEO from Gemini research — if found and not already in decision makers
  const verifiedLeader = research?.ceo_name && !['null', 'unknown', 'not found'].includes((research.ceo_name || '').toLowerCase())
    ? {
        name: research.ceo_name,
        title: research.ceo_title || 'CEO',
        source: 'gemini_google_search',
        source_url: research.ceo_source || null,
        verified: true,
        email_guess: null
      }
    : null;

  return {
    warm_enriched_at: new Date().toISOString(),
    job_postings: allJobs.slice(0, 20),
    job_count: allJobs.length,
    remote_job_count: remoteJobs.length,
    job_signals: jobSignals,
    current_erp: currentErp,
    current_erp_signal: research?.current_erp_signal || (currentErp.length > 0 ? `Detected in job postings: ${currentErp.join(', ')}` : null),
    recent_news: research?.recent_news || [],
    growth_signals: [...(research?.growth_signals || []), ...jobSignals],
    customer_complaints_summary: research?.customer_complaints_summary || null,
    glassdoor_signals: research?.glassdoor_signals || null,
    rabbit_hole_summary: research?.rabbit_hole_summary || null,
    competitors: research?.competitors || [],
    research_sources: research?.sources_checked || [],
    verified_leader: verifiedLeader
  };
}

// Build a verifiable problem-frequency matrix by counting how many of the real
// scraped bad reviews match each problem's keywords. Deterministic — no LLM spend.
// Returns rows ranked by complaint volume, each tagged with its Odoo module and
// the exact review indices behind the count (so a rep can drill in).
function buildProblemMatrix(reviews, analysis) {
  const bad = (reviews || []).filter(r => r && r.text && (r.rating == null || r.rating <= 2));
  const total = bad.length;
  const texts = bad.map(r => (r.text || '').toLowerCase());
  const problems = (analysis.review_analysis && analysis.review_analysis.recurring_problems) || [];

  const moduleFor = {};
  (analysis.odoo_mapping || []).forEach(m => {
    if (m && m.problem) moduleFor[m.problem.toLowerCase().trim()] = m.odoo_module || '';
  });

  const rows = problems.map(p => {
    let terms = (p.keywords || []).map(k => String(k).toLowerCase().trim()).filter(k => k.length > 2);
    // Fallback: derive terms from the problem label if Gemini gave no keywords.
    if (!terms.length) {
      terms = String(p.problem || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
    }
    const matchIdx = [];
    texts.forEach((t, i) => { if (terms.some(k => t.includes(k))) matchIdx.push(i); });
    return {
      problem: p.problem,
      count: matchIdx.length,
      share_pct: total ? Math.round((matchIdx.length / total) * 100) : 0,
      odoo_module: moduleFor[String(p.problem || '').toLowerCase().trim()] || '',
      keywords: terms,
      review_indices: matchIdx
    };
  }).filter(r => r.problem).sort((a, b) => b.count - a.count);

  return { total_bad_reviews: total, rows };
}

module.exports = { warmEnrichLead, groundedBriefing, buildProblemMatrix };
