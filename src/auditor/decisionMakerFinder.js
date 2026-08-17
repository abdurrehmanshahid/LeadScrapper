/**
 * Multi-Source Decision Maker & Executive Unmasking Engine
 * 100% Free, zero-API cost:
 *   1. Website team, about, and dedicated founder bio pages (/simon-mulla, /about, /team, /leadership)
 *   2. Corporate entity leadership search & public index unmasking (Bing / Google)
 *   3. Search engine LinkedIn snippet parser (unmasks "LinkedIn Member" using public index titles)
 *   4. B2B corporate email pattern synthesis (first.last@domain, first@domain)
 */

const EXEC_TITLES = [
  'CEO', 'COO', 'CTO', 'CFO', 'CIO', 'CMO',
  'President', 'Owner', 'Founder', 'Co-Founder',
  'Managing Director', 'Managing Partner',
  'VP Operations', 'VP Sales', 'VP Technology',
  'Director of Operations', 'Director of Sales', 'Director of IT',
  'Head of Operations', 'Head of Sales',
  'General Manager', 'Operations Manager', 'IT Manager',
  'General Contractor', 'Principal', 'Sales Director'
];

const TEAM_PATHS = ['/about', '/about-us', '/team', '/leadership'];

async function findDecisionMakers(companyName, website, emailDomain, browser) {
  // Wrap entire function in a strict 6-second timeout to prevent any scraping stall
  return Promise.race([
    runDiscovery(companyName, website, emailDomain, browser),
    new Promise(resolve => setTimeout(() => resolve([]), 6000))
  ]);
}

const { extractCompanyAndPersonFromTitle } = require('../utils/entityParser');

async function runDiscovery(companyName, website, emailDomain, browser) {
  const results = [];
  const seenNames = new Set();

  // ── Strategy 0: Inline Executive Parsing in Listing Title ────────────────
  // e.g. "Arrow, Damian De La Rosa" -> Company: "Arrow", Person: "Damian De La Rosa"
  const { companyName: pureComp, personName: execName } = extractCompanyAndPersonFromTitle(companyName);
  const cleanCompBase = (pureComp || companyName || '').replace(/(\b(inc|llc|ltd|corp|corporation|co|group|services|company|s\.?a\.?|de c\.?v\.?|l\.?l\.?c\.?)\b\.?)/gi, '').trim();
  let targetSearchName = cleanCompBase || pureComp || companyName;

  if (execName) {
    if (!seenNames.has(execName.toLowerCase()) && !execName.toLowerCase().includes('company') && !execName.toLowerCase().includes('consulting')) {
      seenNames.add(execName.toLowerCase());
      results.push({
        name: execName,
        title: 'Founder / CEO',
        linkedin_url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(execName + ' ' + pureComp)}`,
        source: 'listing_title'
      });
    }
  }

  let page = null;
  try {
    if (browser) {
      page = await browser.newPage();
      await page.setViewport({ width: 1000, height: 700 });
      
      // Block images, fonts, and media for 5x faster loading and zero hangs
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resource = req.resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(resource)) {
          req.abort();
        } else {
          req.continue();
        }
      });

    // ── Strategy 1: Public Search Engine Leadership & Corporate Unmasking ────
    try {
      const searchDMs = await searchPublicLeadership(targetSearchName, page);
      for (const dm of searchDMs) {
        if (!seenNames.has(dm.name.toLowerCase())) {
          seenNames.add(dm.name.toLowerCase());
          results.push(dm);
        }
      }
    } catch (_) {}

    // ── Strategy 2: Company website team/about/leadership page ─────────────────
    if (results.length < 2 && website && website.startsWith('http')) {
      try {
        const websiteDMs = await scrapeTeamPage(website, page);
        for (const dm of websiteDMs) {
          if (!seenNames.has(dm.name.toLowerCase())) {
            seenNames.add(dm.name.toLowerCase());
            results.push(dm);
          }
        }
      } catch (_) {}
    }
    }
  } catch (err) {
    // Best-effort — never fail parent scraping pipeline
  } finally {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
  }

  // Derive domain and attach smart email guesses
  const domain = emailDomain || (website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null);
  const finalDMs = results.slice(0, 4).map(dm => ({
    ...dm,
    email_guess: domain ? guessEmail(dm.name, domain) : null
  }));

  return finalDMs;
}


// ─── Strategy 1: Public Search Leadership & LinkedIn Dork ───────────────────

async function searchPublicLeadership(companyName, page) {
  const cleanComp = (companyName || '')
    .replace(/(\b(inc|llc|ltd|corp|corporation|co|group|services|company|s\.?a\.?|de c\.?v\.?|l\.?l\.?c\.?)\b\.?)/gi, '')
    .trim();
  const searchName = cleanComp || companyName;

  const queries = [
    `"${searchName}" (CEO OR Owner OR Founder OR President OR Director OR Manager)`,
    `site:linkedin.com/in "${searchName}"`
  ];

  const results = [];
  const seen = new Set();

  for (const query of queries) {
    if (results.length >= 2) break;
    try {
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await new Promise(r => setTimeout(r, 600));

      const items = await page.evaluate((comp) => {
        const res = [];
        const compLower = comp.toLowerCase();

        document.querySelectorAll('li.b_algo, div.g, div.MjjYud').forEach(block => {
          const h2 = block.querySelector('h2 a, h3');
          const snippet = block.querySelector('.b_caption p, .b_snippet, .VwiC3b, p');
          if (!h2) return;

          const titleText = (h2.innerText || '').trim();
          const snippetText = (snippet ? snippet.innerText : '').trim();
          const href = h2.getAttribute('href') || '';

          // Pattern A: LinkedIn profile title: "Zane Pucylowski - President / Principal Engineer at ..."
          // or "John Smith - Founder & CEO - Company | LinkedIn"
          const liMatch = titleText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*[-–—|:]\s*(.+)/);
          if (liMatch) {
            const potentialName = liMatch[1].trim();
            let role = liMatch[2].replace(/\s*[-–—|]\s*LinkedIn.*$/i, '').split(/[-–—|]/)[0].trim();
            if (role.toLowerCase().startsWith('at ')) role = role.substring(3).trim();

            const isRelevant = snippetText.toLowerCase().includes(compLower) || 
                              titleText.toLowerCase().includes(compLower) ||
                              href.includes('linkedin.com/in') ||
                              snippetText.toLowerCase().includes('president') || 
                              snippetText.toLowerCase().includes('founder') || 
                              snippetText.toLowerCase().includes('ceo') || 
                              snippetText.toLowerCase().includes('owner');

            if (isRelevant && !potentialName.toLowerCase().includes('linkedin') && !potentialName.toLowerCase().includes('company')) {
              res.push({
                name: potentialName,
                title: role.length < 60 && role.length > 2 ? role : 'Executive / Owner',
                linkedin_url: href.includes('linkedin.com/in') ? href : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(potentialName + ' ' + comp)}`,
                source: href.includes('linkedin.com') ? 'linkedin_index' : 'public_index'
              });
            }
          }

          // Pattern B: Snippet explicitly states "Name is the CEO/President of Company"
          const snippetLeaderMatch = snippetText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+is\s+(?:the\s+)?(President|Founder|CEO|Owner|Principal|Managing Director|General Manager|Co-Founder)\s+(?:and\s+[A-Za-z]+\s+)?(?:of|at)\s+/i);
          if (snippetLeaderMatch) {
            res.push({
              name: snippetLeaderMatch[1].trim(),
              title: snippetLeaderMatch[2].trim(),
              linkedin_url: href.includes('linkedin.com/in') ? href : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(snippetLeaderMatch[1].trim() + ' ' + comp)}`,
              source: 'corporate_snippet'
            });
          }
        });

        return res;
      }, searchName);

      const businessNoise = ['inc', 'llc', 'ltd', 'corp', 'company', 'services', 'group', 'solutions', 'browser', 'google', 'play', 'apps'];
      for (const item of items) {
        if (!item.name) continue;
        const words = item.name.split(/\s+/);
        if (words.length < 2 || words.length > 4) continue;
        const lower = item.name.toLowerCase();
        if (businessNoise.some(n => lower.includes(n))) continue;
        if (!seen.has(lower)) {
          seen.add(lower);
          results.push(item);
        }
      }
    } catch (_) {}
  }

  return results;
}


// ─── Strategy 2: Website Team/About/Leadership Page Scraper ───────────────────

async function scrapeTeamPage(baseUrl, page) {
  for (const path of TEAM_PATHS) {
    try {
      const url = new URL(path, baseUrl).href;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await new Promise(r => setTimeout(r, 600));

      const people = await page.evaluate((execTitles) => {
        const found = [];
        const seen = new Set();

        const cardSelectors = [
          '.team-member', '.team-card', '.person-card', '.staff-card',
          '.member-card', '.bio-card', '[class*="team-item"]',
          '[class*="team_member"]', '[class*="staff-item"]',
          '[class*="person"]', 'article.team', 'li.team-member', 'div.member'
        ];

        for (const sel of cardSelectors) {
          document.querySelectorAll(sel).forEach(card => {
            const nameEl = card.querySelector('h2, h3, h4, h5, .name, [class*="name"], strong');
            const roleEl = card.querySelector('p, span, .title, .role, .position, [class*="title"], [class*="role"], [class*="position"]');
            if (!nameEl || !roleEl) return;

            const name = nameEl.innerText.trim().replace(/\n/g, ' ');
            const role = roleEl.innerText.trim().replace(/\n/g, ' ');

            const hasExecRole = execTitles.some(t => role.toUpperCase().includes(t.toUpperCase()));
            const looksLikeName = name.split(' ').length >= 2 && name.split(' ').length <= 4 && name.length < 50;

            if (hasExecRole && looksLikeName && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              found.push({ name, title: role, source: 'company_website' });
            }
          });
          if (found.length >= 4) break;
        }

        return found;
      }, EXEC_TITLES);

      if (people.length > 0) return people;
    } catch (_) {}
  }

  return [];
}


// ─── Smart B2B Email Guessing ─────────────────────────────────────────────────

function guessEmail(fullName, domain) {
  if (!fullName || !domain) return null;
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const first = parts[0].replace(/[^a-z]/g, '');
  const last = parts[parts.length - 1].replace(/[^a-z]/g, '');
  if (!first || !last) return null;
  return `${first}.${last}@${domain}`;
}

module.exports = { findDecisionMakers };
