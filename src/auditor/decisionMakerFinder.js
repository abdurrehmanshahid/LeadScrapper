/**
 * Multi-Source Decision Maker & Executive Unmasking Engine
 * Enhanced with 8 Specialized Buyer Personas (Odoo, BPO, POS, GCC/UK Tax, HR/WPS, RevOps).
 */

const BUYER_PERSONAS = {
  OPERATIONS_COO: {
    key: 'OPERATIONS_COO',
    label: 'COO / Operations / General Manager',
    titles: [
      'COO', 'Chief Operating Officer', 'Director of Operations', 'Head of Operations',
      'Operations Director', 'General Manager', 'VP Operations', 'Operations Manager'
    ],
    pitchHook: 'We help COOs eliminate stock variances, accelerate branch coordination, and cut manual workarounds with unified Odoo ERP and POS sync.'
  },
  FINANCE_CFO: {
    key: 'FINANCE_CFO',
    label: 'CFO / Finance Director / Head of Accounting',
    titles: [
      'CFO', 'Chief Financial Officer', 'Finance Director', 'Head of Finance',
      'Financial Controller', 'Head of Accounting', 'Finance Manager', 'VP Finance'
    ],
    pitchHook: 'We help CFOs automate AP/AR reconciliation, eliminate late closes, and comply with ZATCA/VAT e-invoicing and Making Tax Digital requirements.'
  },
  REVOPS_CRM: {
    key: 'REVOPS_CRM',
    label: 'Head of Revenue Operations / CRM Director',
    titles: [
      'Head of Revenue Operations', 'Director of Revenue Operations', 'VP RevOps',
      'Head of Sales Operations', 'Sales Operations Director', 'CRM Director', 'Head of CRM', 'VP Sales'
    ],
    pitchHook: 'We bridge real-time CRM synchronization (HubSpot/Salesforce/Odoo), automated WhatsApp lead routing, and sales-to-finance alignment.'
  },
  HR_PEOPLE: {
    key: 'HR_PEOPLE',
    label: 'HR Director / People Operations Lead',
    titles: [
      'HR Director', 'Head of HR', 'Chief Human Resources Officer', 'CHRO',
      'VP People', 'Head of People', 'People Operations Lead', 'HR Manager'
    ],
    pitchHook: 'We automate employee onboarding and WPS/GOSI compliance reporting across UAE/KSA, reducing a 3-day process to under 2 hours.'
  },
  TECH_CIO_CTO: {
    key: 'TECH_CIO_CTO',
    label: 'CIO / CTO / Digital Transformation Manager',
    titles: [
      'CIO', 'CTO', 'Chief Technology Officer', 'Chief Information Officer',
      'Head of IT', 'IT Director', 'Digital Transformation Manager', 'Head of Digital', 'VP Technology'
    ],
    pitchHook: 'We serve as your specialized 24/7 ERP infrastructure and integration partner, delivering resilient API bridges, role-based security, and strict SLAs at half the cost.'
  },
  RETAIL_RESTAURANT_POS: {
    key: 'RETAIL_RESTAURANT_POS',
    label: 'Retail / Restaurant Operations Director',
    titles: [
      'Retail Operations Director', 'Retail Technology Manager', 'Restaurant Operations Director',
      'POS Manager', 'Store Operations Manager', 'Retail Director'
    ],
    pitchHook: 'We deploy zero-downtime multi-branch POS, KDS, hardware integration, and real-time inventory tracking for high-velocity retail and dining.'
  },
  FOUNDER_CEO: {
    key: 'FOUNDER_CEO',
    label: 'Founder / CEO / Managing Director',
    titles: [
      'Founder', 'Co-Founder', 'CEO', 'Chief Executive Officer', 'Managing Director',
      'President', 'Owner', 'Managing Partner', 'Principal'
    ],
    pitchHook: 'We act as your agile, outsourced product and technology team to modernize operations, eliminate headcount drag, and scale revenue.'
  },
  MARKETING_GROWTH: {
    key: 'MARKETING_GROWTH',
    label: 'VP Marketing / Head of Growth',
    titles: [
      'VP Marketing', 'Head of Growth', 'Chief Marketing Officer', 'CMO',
      'Marketing Director', 'Demand Generation Manager', 'Head of Demand Gen'
    ],
    pitchHook: 'We build high-converting inbound funnels, Arabic localized content, and automated lead capture pipelines with full ROAS attribution.'
  }
};

// Flattened list for regex matching
const ALL_TITLES = Object.values(BUYER_PERSONAS).flatMap(p => p.titles);
const TEAM_PATHS = ['/about', '/about-us', '/team', '/leadership'];

const { extractCompanyAndPersonFromTitle } = require('../utils/entityParser');

function matchPersona(titleStr) {
  if (!titleStr) return BUYER_PERSONAS.FOUNDER_CEO;
  const upper = titleStr.toUpperCase();
  for (const persona of Object.values(BUYER_PERSONAS)) {
    if (persona.titles.some(t => upper.includes(t.toUpperCase()))) {
      return persona;
    }
  }
  return BUYER_PERSONAS.FOUNDER_CEO;
}

async function findDecisionMakers(companyName, website, emailDomain, browser) {
  return Promise.race([
    runDiscovery(companyName, website, emailDomain, browser),
    new Promise(resolve => setTimeout(() => resolve([]), 6000))
  ]);
}

async function runDiscovery(companyName, website, emailDomain, browser) {
  const results = [];
  const seenNames = new Set();

  const { companyName: pureComp, personName: execName } = extractCompanyAndPersonFromTitle(companyName);
  const cleanCompBase = (pureComp || companyName || '').replace(/(\b(inc|llc|ltd|corp|corporation|co|group|services|company|s\.?a\.?|de c\.?v\.?|l\.?l\.?c\.?)\b\.?)/gi, '').trim();
  let targetSearchName = cleanCompBase || pureComp || companyName;

  if (execName) {
    if (!seenNames.has(execName.toLowerCase()) && !execName.toLowerCase().includes('company') && !execName.toLowerCase().includes('consulting')) {
      seenNames.add(execName.toLowerCase());
      const p = matchPersona('Founder / CEO');
      results.push({
        name: execName,
        title: 'Founder / CEO',
        persona_key: p.key,
        persona_label: p.label,
        persona_pitch: p.pitchHook,
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
      
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resource = req.resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(resource)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      try {
        const searchDMs = await searchPublicLeadership(targetSearchName, page);
        for (const dm of searchDMs) {
          if (!seenNames.has(dm.name.toLowerCase())) {
            seenNames.add(dm.name.toLowerCase());
            results.push(dm);
          }
        }
      } catch (_) {}

      if (results.length < 3 && website && website.startsWith('http')) {
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
    // Best effort
  } finally {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
  }

  const domain = emailDomain || (website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null);
  const finalDMs = results.slice(0, 5).map(dm => {
    const p = matchPersona(dm.title);
    return {
      ...dm,
      persona_key: dm.persona_key || p.key,
      persona_label: dm.persona_label || p.label,
      persona_pitch: dm.persona_pitch || p.pitchHook,
      email_guess: domain ? guessEmail(dm.name, domain) : null
    };
  });

  return finalDMs;
}

async function searchPublicLeadership(companyName, page) {
  const cleanComp = (companyName || '')
    .replace(/(\b(inc|llc|ltd|corp|corporation|co|group|services|company|s\.?a\.?|de c\.?v\.?|l\.?l\.?c\.?)\b\.?)/gi, '')
    .trim();
  const searchName = cleanComp || companyName;

  const queries = [
    `"${searchName}" (COO OR CFO OR CEO OR "Operations Director" OR "Finance Director" OR "Head of IT" OR CTO OR Founder)`,
    `site:linkedin.com/in "${searchName}"`
  ];

  const results = [];
  const seen = new Set();

  for (const query of queries) {
    if (results.length >= 3) break;
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

          const liMatch = titleText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*[-–—|:]\s*(.+)/);
          if (liMatch) {
            const potentialName = liMatch[1].trim();
            let role = liMatch[2].replace(/\s*[-–—|]\s*LinkedIn.*$/i, '').split(/[-–—|]/)[0].trim();
            if (role.toLowerCase().startsWith('at ')) role = role.substring(3).trim();

            const isRelevant = snippetText.toLowerCase().includes(compLower) || 
                              titleText.toLowerCase().includes(compLower) ||
                              href.includes('linkedin.com/in');

            if (isRelevant && !potentialName.toLowerCase().includes('linkedin') && !potentialName.toLowerCase().includes('company')) {
              res.push({
                name: potentialName,
                title: role.length < 60 && role.length > 2 ? role : 'Executive',
                linkedin_url: href.includes('linkedin.com/in') ? href : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(potentialName + ' ' + comp)}`,
                source: href.includes('linkedin.com') ? 'linkedin_index' : 'public_index'
              });
            }
          }

          const snippetLeaderMatch = snippetText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+is\s+(?:the\s+)?([A-Za-z\s/]{3,35})\s+(?:of|at)\s+/i);
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
      }, ALL_TITLES);

      if (people.length > 0) return people;
    } catch (_) {}
  }

  return [];
}

function guessEmail(fullName, domain) {
  if (!fullName || !domain) return null;
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const first = parts[0].replace(/[^a-z]/g, '');
  const last = parts[parts.length - 1].replace(/[^a-z]/g, '');
  if (!first || !last) return null;
  return `${first}.${last}@${domain}`;
}

module.exports = {
  findDecisionMakers,
  BUYER_PERSONAS,
  matchPersona
};
