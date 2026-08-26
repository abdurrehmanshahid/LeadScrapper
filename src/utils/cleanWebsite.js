/**
 * cleanWebsite — normalise a scraped website URL.
 *
 * Google Maps/ads frequently hand back tracking redirects instead of the real
 * company domain, e.g.:
 *   /aclk?sa=L&ai=...&adurl=https%3A%2F%2Fwww.example.com%2F...
 *   https://www.google.com/url?q=https://example.com&sa=...
 *   https://www.google.com/aclk?...&adurl=...
 *
 * This unwraps those redirects and returns the real destination, or '' if the
 * URL is just a Google/Maps property with no recoverable destination.
 */
function cleanWebsite(url) {
  if (!url || typeof url !== 'string') return '';
  let out = url.trim();

  // Unwrap only genuine Google redirect paths (/aclk?…, /url?…). The real
  // destination lives in the adurl= (ads) or q= (search) parameter. Note a
  // maps.google.com/?q=<name> fallback link is NOT a redirect and is kept.
  const isRedirectPath = out.includes('/aclk') || /\/url\?/.test(out);
  if (isRedirectPath) {
    const match = out.match(/[?&](?:adurl|q)=([^&]+)/);
    if (match && match[1]) {
      try { out = decodeURIComponent(match[1]); } catch (_) { out = match[1]; }
    } else {
      return '';
    }
  }

  // A bare "/aclk?..." with no recoverable destination is useless.
  if (out.startsWith('/')) return '';

  // Any Google / Maps property is not the company's real website — drop it.
  // Covers maps.google.*, google.*/maps, /aclk, /url, /search, and goo.gl/
  // maps.app.goo.gl share links.
  const host = out.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  if (/(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)goo\.gl$/.test(host) ||
      /google\.[a-z.]+\/(aclk|url|search|maps)/i.test(out)) {
    return '';
  }

  // Strip marketing/tracking query params but KEEP the meaningful path + real
  // params. e.g. heb.com/heb-store/...?utm_source=google → heb.com/heb-store/...
  out = stripTrackingParams(out);

  // Ensure a protocol so it renders as a real link.
  if (!/^https?:\/\//i.test(out)) out = 'https://' + out;

  return out;
}

const TRACKING_PARAM = /^(utm_|gclid|gclsrc|dclid|fbclid|msclkid|yclid|mc_cid|mc_eid|_ga|_gl|ref|referrer|source|medium|campaign|gmb)/i;

function stripTrackingParams(url) {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const base = url.slice(0, q);
  const kept = url.slice(q + 1).split('&').filter(pair => {
    const key = pair.split('=')[0];
    return key && !TRACKING_PARAM.test(key);
  });
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

module.exports = { cleanWebsite };
