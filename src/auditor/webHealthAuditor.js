const axios = require('axios');
const cheerio = require('cheerio');
const { detectTechStack } = require('./techDetector');

/**
 * Website Health and Technographic Auditor
 */
async function auditWebsite(rawUrl) {
  if (!rawUrl) {
    return {
      has_ssl: false,
      load_time_sec: 0,
      copyright_year: null,
      tech_stack: ['Unknown / No Website'],
      has_odoo: false,
      emails_found: [],
      phones_found: [],
      error: 'No URL provided'
    };
  }

  let formattedUrl = rawUrl.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = 'https://' + formattedUrl;
  }

  const startTime = Date.now();
  try {
    const response = await axios.get(formattedUrl, {
      timeout: 4000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      maxRedirects: 3,
      validateStatus: () => true // Don't throw on 4xx/5xx to capture server headers
    });

    const loadTimeSec = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    const html = typeof response.data === 'string' ? response.data : '';
    const headers = response.headers || {};
    const $ = cheerio.load(html);

    // 1. Copyright Year Extraction
    let copyrightYear = null;
    const copyrightMatches = html.match(/(?:©|&copy;|copyright|all rights reserved)\s*(?:20\d\d\s*[-–—]\s*)?(20\d\d)/i);
    if (copyrightMatches && copyrightMatches[1]) {
      const parsedYear = parseInt(copyrightMatches[1], 10);
      if (parsedYear >= 2000 && parsedYear <= new Date().getFullYear()) {
        copyrightYear = parsedYear;
      }
    }

    // 2. Email & Phone Extraction from Page
    const emailsFound = new Set();
    const emailMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    emailMatches.forEach(email => {
      const lower = email.toLowerCase();
      if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.svg') && !lower.includes('sentry') && !lower.includes('wixpress')) {
        emailsFound.add(lower);
      }
    });

    // 3. Tech Stack Detection
    const tech = detectTechStack(html, headers, formattedUrl);

    // 4. Digital Health Score (0-100)
    let healthScore = 80;
    const currentYear = new Date().getFullYear();
    if (copyrightYear && (currentYear - copyrightYear >= 3)) healthScore -= 25;
    if (loadTimeSec > 3.0) healthScore -= 15;
    if (!formattedUrl.startsWith('https://')) healthScore -= 20;
    if (tech.tech_stack.includes('WordPress')) healthScore -= 10;
    healthScore = Math.max(10, Math.min(100, healthScore));

    // 5. Extract human-readable text for NLI / friction analysis
    const metaDesc = (
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
    ).trim().substring(0, 300);

    const headingText = [
      $('h1').first().text().trim(),
      $('h2').first().text().trim(),
      $('p').first().text().trim()
    ].filter(Boolean).join('. ').substring(0, 300);

    return {
      url: formattedUrl,
      has_ssl: formattedUrl.startsWith('https://'),
      load_time_sec: loadTimeSec,
      copyright_year: copyrightYear || currentYear - 2,
      tech_stack: tech.tech_stack,
      has_odoo: tech.has_odoo,
      odoo_version: tech.odoo_version,
      health_score: healthScore,
      emails_found: Array.from(emailsFound).slice(0, 3),
      meta_title: $('title').text().trim().substring(0, 100) || '',
      meta_description: metaDesc,
      page_intro_text: headingText,
      error: null
    };
  } catch (err) {
    return {
      url: formattedUrl,
      has_ssl: formattedUrl.startsWith('https://'),
      load_time_sec: 4.5,
      copyright_year: new Date().getFullYear() - 4,
      tech_stack: ['Legacy / Unreachable Server'],
      has_odoo: false,
      health_score: 25,
      emails_found: [],
      error: err.message
    };
  }
}

module.exports = { auditWebsite };
