const axios = require('axios');
const cheerio = require('cheerio');
const { detectTechStack, detectLegacySignals } = require('./techDetector');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Technical Due-Diligence / Digital Maturity Audit.
 * Phase 1 (always): fast axios HTTP check — status, headers, HTML analysis.
 * Phase 2 (when browser provided): deep Puppeteer scan — JS errors, performance
 *   timing, failed requests, broken images, mobile overflow.
 *
 * Output is backward-compatible with all existing callers (has_ssl, load_time_sec,
 * copyright_year, tech_stack, etc.) PLUS a new `tech_audit` object with the
 * full 8-dimension maturity score and issues/opportunities lists.
 */
async function auditWebsite(rawUrl, browser) {
  if (!rawUrl) return buildEmpty('No URL provided');

  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const ax = await fastHttpAudit(url);

  let pp = {};
  if (browser && ax.reachable) {
    pp = await Promise.race([
      deepBrowserAudit(ax.finalUrl || url, browser),
      new Promise(r => setTimeout(() => r({ timed_out: true }), 20000))
    ]).catch(() => ({}));
  }

  return compose(url, ax, pp);
}

// ── Phase 1: Fast Axios ───────────────────────────────────────────────────────

async function fastHttpAudit(url) {
  const t0 = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8' },
      maxRedirects: 5,
      validateStatus: () => true
    });
    const loadMs = Date.now() - t0;
    const html = typeof res.data === 'string' ? res.data : '';
    const headers = res.headers || {};
    const $ = cheerio.load(html);

    // Copyright year
    const yrMatch = html.match(/(?:©|&copy;|copyright)\s*(?:20\d\d\s*[-–]\s*)?(20\d\d)/i);
    const copyrightYear = yrMatch ? parseInt(yrMatch[1], 10) : null;

    // Emails
    const emails = [...new Set(
      (html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
        .map(e => e.toLowerCase())
        .filter(e => !/\.(png|jpg|svg|gif|webp)$/i.test(e) && !/sentry|wixpress|example|schema\.org/.test(e))
    )].slice(0, 3);

    // Tech stack
    const tech = detectTechStack(html, headers, url);
    const legacySignals = detectLegacySignals(html, headers);

    // Security headers
    const sh = {
      hsts:              !!headers['strict-transport-security'],
      csp:               !!headers['content-security-policy'],
      x_content_type:    !!headers['x-content-type-options'],
      x_frame_options:   !!headers['x-frame-options'],
      referrer_policy:   !!headers['referrer-policy'],
      permissions_policy:!!headers['permissions-policy']
    };

    // Mixed content: HTTP resources embedded on an HTTPS page
    const mixedContent = url.startsWith('https')
      ? (html.match(/(?:src|href|action)\s*=\s*["']http:\/\/[^"']+/gi) || []).length
      : 0;

    // DOM signals
    const metaTitle = $('title').text().trim().substring(0, 100);
    const metaDesc = ($('meta[name="description"]').attr('content') ||
                      $('meta[property="og:description"]').attr('content') || '').trim().substring(0, 300);
    const hasViewport = !!$('meta[name="viewport"]').attr('content');
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    const formCount = $('form').length;
    const hasBooking = /book(?:ing)?|appointment|schedule|reserv|calendar/i.test(html);
    const hasLogin   = /(?:sign[- ]in|login|log[- ]in|client[- ]portal|customer[- ]portal|account)/i.test(html);

    const introText = [$('h1').first().text(), $('h2').first().text(), $('p').first().text()]
      .filter(Boolean).join('. ').substring(0, 300);

    return {
      reachable: true,
      http_status: res.status,
      https: url.startsWith('https://'),
      finalUrl: res.request?.res?.responseUrl || url,
      loadMs,
      copyrightYear,
      emails,
      tech,
      legacySignals,
      sh,
      secHeaderCount: Object.values(sh).filter(Boolean).length,
      mixedContent,
      metaTitle,
      metaDesc,
      hasViewport,
      h1Count,
      h2Count,
      formCount,
      hasBooking,
      hasLogin,
      introText,
      server: headers['server'] || headers['x-powered-by'] || null
    };
  } catch (err) {
    return { reachable: false, error: err.message, https: url.startsWith('https://') };
  }
}

// ── Phase 2: Deep Puppeteer ───────────────────────────────────────────────────

async function deepBrowserAudit(url, browser) {
  let page = null;
  const jsErrors      = [];
  const failedRequests = [];
  const consoleErrors = [];

  try {
    page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 768 });

    page.on('pageerror',     err => { if (jsErrors.length < 10)      jsErrors.push(err.message.substring(0, 150)); });
    page.on('requestfailed', req => { if (failedRequests.length < 25) failedRequests.push({ url: req.url().substring(0, 120), reason: req.failure()?.errorText }); });
    page.on('console',       msg => { if (msg.type() === 'error' && consoleErrors.length < 5) consoleErrors.push(msg.text().substring(0, 120)); });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));

    // Performance via Navigation Timing + PerformanceObserver entries
    const perf = await page.evaluate(() => {
      const nav   = performance?.getEntriesByType?.('navigation')?.[0];
      const paint = performance?.getEntriesByType?.('paint') || [];
      const fcp   = paint.find(p => p.name === 'first-contentful-paint')?.startTime ?? null;
      let lcp = null;
      try {
        const lcpList = performance?.getEntriesByType?.('largest-contentful-paint') || [];
        if (lcpList.length) lcp = lcpList[lcpList.length - 1].startTime;
      } catch (_) {}

      const ttfb      = nav ? Math.round(nav.responseStart - nav.requestStart) : null;
      const domLoadMs = nav ? Math.round(nav.domContentLoadedEventEnd) : null;

      const resources = performance?.getEntriesByType?.('resource') || [];
      const sum = type => resources.filter(r => r.initiatorType === type).reduce((s, r) => s + (r.transferSize || 0), 0);
      const jsKb  = Math.round(sum('script') / 1024);
      const imgKb = Math.round(sum('img')    / 1024);
      const cssKb = Math.round((sum('link') + sum('css')) / 1024);

      return {
        ttfb_ms:      ttfb,
        fcp_ms:       fcp ? Math.round(fcp) : null,
        lcp_ms:       lcp ? Math.round(lcp) : null,
        dom_load_ms:  domLoadMs,
        request_count: resources.length,
        js_size_kb:   jsKb,
        img_size_kb:  imgKb,
        css_size_kb:  cssKb,
        total_size_kb: jsKb + imgKb + cssKb
      };
    });

    // Broken images
    const brokenImages = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .filter(i => !i.complete || i.naturalWidth === 0).length
    );

    // Mobile: horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 5
    );

    return { jsErrors, failedRequests, consoleErrors, brokenImages, hasHorizontalOverflow, ...perf };
  } catch (err) {
    return { puppeteer_error: err.message, jsErrors, failedRequests, consoleErrors };
  } finally {
    if (page) try { await page.close(); } catch (_) {}
  }
}

// ── Compose final audit result ────────────────────────────────────────────────

function compose(originalUrl, ax, pp) {
  const currentYear   = new Date().getFullYear();
  const copyrightAge  = ax.copyrightYear ? Math.max(0, currentYear - ax.copyrightYear) : 3;
  const isHttps       = ax.https || false;
  const loadSec       = ax.loadMs ? ax.loadMs / 1000 : 4.5;
  const jsErrCount    = (pp.jsErrors      || []).length;
  const failedCount   = (pp.failedRequests|| []).length;
  const brokenImgCount = pp.brokenImages  || 0;

  // ── 7-dimension scoring ───────────────────────────────────────────────────

  // 1. Availability (max 15)
  let availScore = 0;
  if (ax.reachable) {
    availScore += 10;
    if (isHttps) availScore += 3;
    if (ax.http_status === 200) availScore += 2;
  }

  // 2. Performance (max 20)
  let perfScore = 0;
  if (ax.reachable) {
    const ttfb = pp.ttfb_ms ?? (ax.loadMs ? ax.loadMs * 0.3 : 2000);
    if      (ttfb < 600)  perfScore += 8;
    else if (ttfb < 1500) perfScore += 5;
    else if (ttfb < 3000) perfScore += 2;

    const lcp = pp.lcp_ms ?? ax.loadMs * 1.5;
    if      (lcp < 2500)  perfScore += 8;
    else if (lcp < 4000)  perfScore += 4;
    else if (lcp < 6000)  perfScore += 1;

    if ((pp.request_count || 0) <  40) perfScore += 2;
    else if ((pp.request_count || 0) < 80) perfScore += 1;

    if ((pp.total_size_kb || 0) > 0 && pp.total_size_kb < 1000) perfScore += 2;
  }

  // 3. Security (max 20)
  let secScore = 0;
  if (isHttps)                     secScore += 6;
  if (ax.sh?.hsts)                 secScore += 5;
  if (ax.sh?.csp)                  secScore += 4;
  if (ax.sh?.x_content_type)       secScore += 2;
  if (ax.sh?.x_frame_options)      secScore += 2;
  if (!(ax.mixedContent > 0))      secScore += 1;

  // 4. Modernity (max 15)
  const legacyCount = (ax.legacySignals || []).length;
  let modScore = 0;
  const modernStack = (ax.tech?.tech_stack || []).some(t =>
    /Webflow|Next\.js|React|Nuxt|Shopify|Squarespace|Webflow/.test(t));
  if (modernStack)       modScore += 5;
  if (legacyCount === 0) modScore += 8;
  else if (legacyCount <= 2) modScore += 4;
  else if (legacyCount <= 4) modScore += 2;
  if (ax.copyrightYear && ax.copyrightYear >= currentYear - 1) modScore += 2;

  // 5. Reliability (max 15)
  let relScore = 15;
  relScore -= Math.min(8, jsErrCount   * 2);
  relScore -= Math.min(5, Math.floor(failedCount / 3));
  relScore -= Math.min(2, brokenImgCount);
  relScore  = Math.max(0, relScore);

  // 6. Mobile (max 10)
  let mobileScore = 0;
  if (ax.hasViewport)                   mobileScore += 6;
  if (!pp.hasHorizontalOverflow)        mobileScore += 4;

  // 7. SEO (max 5)
  let seoScore = 0;
  if (ax.metaTitle)    seoScore += 2;
  if (ax.metaDesc)     seoScore += 2;
  if (ax.h1Count === 1) seoScore += 1;

  const totalScore = availScore + perfScore + secScore + modScore + relScore + mobileScore + seoScore;
  const grade = totalScore >= 90 ? 'Excellent'
    : totalScore >= 75 ? 'Modern'
    : totalScore >= 60 ? 'Functional'
    : totalScore >= 40 ? 'Aging'
    : totalScore >= 20 ? 'Poor'
    : 'Critical';

  // ── Issues list ───────────────────────────────────────────────────────────
  const SEV = { critical: 0, high: 1, medium: 2, low: 3 };
  const issues = [];

  const addIssue = (category, issue, severity, evidence) =>
    issues.push({ category, issue, severity, ...(evidence ? { evidence } : {}) });

  if (!ax.reachable)
    addIssue('availability', 'Website unreachable or DNS failure', 'critical', ax.error);
  if (ax.http_status && ax.http_status >= 500)
    addIssue('availability', `Server error ${ax.http_status}`, 'high', `HTTP ${ax.http_status}`);

  if (!isHttps)
    addIssue('security', 'No HTTPS — data transmitted unencrypted', 'high', 'Plain HTTP site');
  if (ax.mixedContent > 0)
    addIssue('security', `Mixed content: ${ax.mixedContent} HTTP resources on HTTPS page`, 'medium', `${ax.mixedContent} unencrypted embeds`);
  if (!ax.sh?.hsts)
    addIssue('security', 'Missing HSTS header (Strict-Transport-Security)', 'medium', 'Browser can be downgraded to HTTP');
  if (!ax.sh?.csp)
    addIssue('security', 'No Content Security Policy header', 'medium', 'XSS protection gap');
  if (!ax.sh?.x_content_type)
    addIssue('security', 'Missing X-Content-Type-Options header', 'low');

  if (pp.lcp_ms && pp.lcp_ms > 4000)
    addIssue('performance', 'Poor Largest Contentful Paint (LCP)', 'high', `LCP ${(pp.lcp_ms / 1000).toFixed(1)}s — Google threshold is 2.5s`);
  else if (pp.lcp_ms && pp.lcp_ms > 2500)
    addIssue('performance', 'LCP needs improvement', 'medium', `LCP ${(pp.lcp_ms / 1000).toFixed(1)}s`);

  if (loadSec > 4)
    addIssue('performance', 'Very slow page load', 'high', `${loadSec.toFixed(1)}s total load time`);
  else if (loadSec > 2.5)
    addIssue('performance', 'Slow page load', 'medium', `${loadSec.toFixed(1)}s`);

  if ((pp.request_count || 0) > 100)
    addIssue('performance', `Excessive HTTP requests (${pp.request_count})`, 'medium', 'Bloated page — poor caching/bundling');
  if ((pp.js_size_kb || 0) > 600)
    addIssue('performance', `Heavy JavaScript payload (${pp.js_size_kb}KB)`, 'medium', 'Unused code or poor code-splitting');

  for (const sig of (ax.legacySignals || []))
    addIssue('modernity', sig, 'medium');
  if (copyrightAge >= 4)
    addIssue('maintenance', `Site not updated since ${ax.copyrightYear} (${copyrightAge} years)`, copyrightAge >= 6 ? 'high' : 'medium', `Copyright year ${ax.copyrightYear}`);

  if (jsErrCount > 0)
    addIssue('reliability', `${jsErrCount} JavaScript error${jsErrCount > 1 ? 's' : ''}`, jsErrCount >= 3 ? 'high' : 'medium',
      (pp.jsErrors || []).slice(0, 2).join('; ').substring(0, 150));
  if (failedCount >= 5)
    addIssue('reliability', `${failedCount} failed resource requests`, failedCount >= 10 ? 'high' : 'medium', 'Broken assets or dead endpoints');
  if (brokenImgCount > 0)
    addIssue('reliability', `${brokenImgCount} broken image${brokenImgCount > 1 ? 's' : ''}`, 'medium');

  if (!ax.hasViewport)
    addIssue('mobile', 'Missing viewport meta tag — site likely not mobile-responsive', 'high');
  if (pp.hasHorizontalOverflow)
    addIssue('mobile', 'Horizontal overflow detected — mobile layout broken', 'medium', 'Content wider than viewport');

  if (!ax.metaTitle)  addIssue('seo', 'Missing page title', 'medium');
  if (!ax.metaDesc)   addIssue('seo', 'Missing meta description', 'low');
  if (ax.h1Count > 1) addIssue('seo', `Multiple H1 tags (${ax.h1Count})`, 'low', 'Only one H1 per page is correct');

  issues.sort((a, b) => (SEV[a.severity] ?? 3) - (SEV[b.severity] ?? 3));

  // ── Opportunities ─────────────────────────────────────────────────────────
  const cats = new Set(issues.map(i => i.category));
  const opportunities = [];
  if (!ax.reachable || ax.http_status >= 500) opportunities.push('Full website rebuild (current site unreachable/broken)');
  if (cats.has('performance'))   opportunities.push('Performance optimization & Core Web Vitals (LCP, TTFB)');
  if (cats.has('security'))      opportunities.push('Security hardening (HTTPS, HSTS, CSP headers)');
  if (cats.has('modernity'))     opportunities.push('Website modernization & tech stack upgrade');
  if (cats.has('mobile'))        opportunities.push('Mobile responsiveness rebuild');
  if (cats.has('reliability'))   opportunities.push('Code quality & broken-asset remediation');
  if (cats.has('seo'))           opportunities.push('Technical SEO improvements');
  if (!ax.hasBooking && !ax.hasLogin) opportunities.push('Customer portal / online booking integration');
  if (ax.tech?.has_odoo)         opportunities.push('Odoo upgrade & customization');

  // Opportunity score (0-100)
  const highSev  = issues.filter(i => i.severity === 'high'   || i.severity === 'critical').length;
  const medSev   = issues.filter(i => i.severity === 'medium').length;
  const opScore  = Math.min(100, highSev * 18 + medSev * 7 + (!isHttps ? 15 : 0) + (copyrightAge >= 4 ? 8 : 0));

  const salesPriority = opScore >= 75 ? 'VERY HIGH'
    : opScore >= 50 ? 'HIGH'
    : opScore >= 25 ? 'MEDIUM'
    : 'LOW';

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    // ── Backward-compatible fields ──
    url: originalUrl,
    has_ssl:        isHttps,
    load_time_sec:  parseFloat(loadSec.toFixed(2)),
    copyright_year: ax.copyrightYear || currentYear - 2,
    tech_stack:     ax.tech?.tech_stack || ['Unknown'],
    has_odoo:       ax.tech?.has_odoo  || false,
    odoo_version:   ax.tech?.odoo_version || null,
    has_portal:     ax.hasLogin || false,
    health_score:   Math.round(totalScore),
    emails_found:   ax.emails  || [],
    meta_title:     ax.metaTitle || '',
    meta_description: ax.metaDesc || '',
    page_intro_text:  ax.introText || '',
    error:          ax.reachable ? null : ax.error,

    // ── Rich audit object ──
    tech_audit: {
      maturity_score: totalScore,
      grade,
      dimension_scores: { availability: availScore, performance: perfScore, security: secScore, modernity: modScore, reliability: relScore, mobile: mobileScore, seo: seoScore },

      availability: {
        reachable:   ax.reachable || false,
        http_status: ax.http_status || null,
        https:       isHttps,
        load_ms:     ax.loadMs || null
      },
      performance: {
        load_time_sec:  parseFloat(loadSec.toFixed(2)),
        ttfb_ms:        pp.ttfb_ms        ?? null,
        fcp_ms:         pp.fcp_ms         ?? null,
        lcp_ms:         pp.lcp_ms         ?? null,
        request_count:  pp.request_count  ?? null,
        js_size_kb:     pp.js_size_kb     ?? null,
        img_size_kb:    pp.img_size_kb    ?? null,
        total_size_kb:  pp.total_size_kb  ?? null
      },
      security: {
        https:                isHttps,
        hsts:                 ax.sh?.hsts              || false,
        csp:                  ax.sh?.csp               || false,
        x_content_type:       ax.sh?.x_content_type    || false,
        x_frame_options:      ax.sh?.x_frame_options   || false,
        referrer_policy:      ax.sh?.referrer_policy   || false,
        mixed_content_count:  ax.mixedContent          || 0,
        security_header_count:ax.secHeaderCount        || 0,
        server_info:          ax.server                || null
      },
      tech_stack_detail: {
        detected:    ax.tech?.tech_stack   || [],
        has_odoo:    ax.tech?.has_odoo     || false,
        odoo_version:ax.tech?.odoo_version || null
      },
      legacy_signals: ax.legacySignals || [],
      reliability: {
        js_errors:         jsErrCount,
        failed_requests:   failedCount,
        broken_images:     brokenImgCount,
        js_error_samples:  (pp.jsErrors || []).slice(0, 3)
      },
      mobile: {
        has_viewport_meta:      ax.hasViewport           || false,
        has_horizontal_overflow:pp.hasHorizontalOverflow || false
      },
      seo: {
        has_title:            !!ax.metaTitle,
        title:                ax.metaTitle  || null,
        has_meta_description: !!ax.metaDesc,
        h1_count:             ax.h1Count   || 0,
        h2_count:             ax.h2Count   || 0
      },
      content: {
        forms_count:  ax.formCount  || 0,
        has_booking:  ax.hasBooking || false,
        has_login:    ax.hasLogin   || false,
        copyright_year: ax.copyrightYear || null
      },
      issues,
      opportunities,
      opportunity_score: opScore,
      sales_priority:    salesPriority
    }
  };
}

function buildEmpty(reason) {
  return {
    has_ssl: false, load_time_sec: 0, copyright_year: null,
    tech_stack: ['Unknown / No Website'], has_odoo: false,
    health_score: 0, emails_found: [], error: reason, tech_audit: null
  };
}

module.exports = { auditWebsite };
