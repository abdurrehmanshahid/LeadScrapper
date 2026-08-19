/**
 * Technographic Fingerprinter
 * Detects Odoo, CMS platforms, ERP endpoints, and modern web tools.
 */

function detectTechStack(html, headers = {}, url = '') {
  const htmlLower = (html || '').toLowerCase();
  const techStack = [];
  let hasOdoo = false;
  let odooVersion = null;

  // 1. Odoo Detection
  const isOdooHeader = Object.keys(headers).some(k => k.toLowerCase().includes('odoo'));
  const isOdooHTML = 
    htmlLower.includes('oe_structure') || 
    htmlLower.includes('web_editor') || 
    htmlLower.includes('/web/content/') || 
    htmlLower.includes('web.assets_common') || 
    htmlLower.includes('odoo');

  if (isOdooHeader || isOdooHTML) {
    hasOdoo = true;
    
    // Estimate Odoo Version from assets, bundle hashes, and HTML markers
    if (htmlLower.includes('18.0') || htmlLower.includes('saas~18') || htmlLower.includes('odoo-18')) {
      odooVersion = 'v18 (Latest)';
    } else if (htmlLower.includes('17.0') || htmlLower.includes('saas~17') || htmlLower.includes('odoo-17')) {
      odooVersion = 'v17';
    } else if (htmlLower.includes('16.0') || htmlLower.includes('saas~16') || htmlLower.includes('odoo-16')) {
      odooVersion = 'v16';
    } else if (htmlLower.includes('15.0') || htmlLower.includes('saas~15')) {
      odooVersion = 'v15 (Legacy)';
    } else if (htmlLower.includes('14.0') || htmlLower.includes('13.0') || htmlLower.includes('12.0')) {
      odooVersion = 'v12-v14 (Legacy)';
    } else if (url.includes('odoo.sh') || htmlLower.includes('odoo.sh')) {
      odooVersion = 'Enterprise (odoo.sh)';
    } else {
      odooVersion = 'Enterprise / Self-Hosted';
    }

    techStack.push(`Odoo ${odooVersion}`);
  }

  // 2. CMS & E-Commerce Detection
  if (htmlLower.includes('wp-content') || htmlLower.includes('wp-includes')) {
    techStack.push('WordPress');
    if (htmlLower.includes('woocommerce')) techStack.push('WooCommerce');
  }
  if (htmlLower.includes('shopify.com') || htmlLower.includes('cdn.shopify.com')) techStack.push('Shopify');
  if (htmlLower.includes('wix.com') || htmlLower.includes('wixsite.com')) techStack.push('Wix');
  if (htmlLower.includes('squarespace.com')) techStack.push('Squarespace');
  if (htmlLower.includes('joomla')) techStack.push('Joomla (Legacy)');
  if (htmlLower.includes('drupal')) techStack.push('Drupal');
  if (htmlLower.includes('webflow')) techStack.push('Webflow');

  // 3. Customer Portals / Integrations
  if (htmlLower.includes('/portal') || htmlLower.includes('client-portal') || htmlLower.includes('customer login')) {
    techStack.push('Custom Client Portal');
  }
  if (htmlLower.includes('hubspot')) techStack.push('HubSpot');
  if (htmlLower.includes('salesforce')) techStack.push('Salesforce');
  if (htmlLower.includes('tawk.to')) techStack.push('Tawk.to Live Chat');
  if (htmlLower.includes('intercom')) techStack.push('Intercom');

  if (techStack.length === 0) {
    techStack.push('Custom HTML / Static Stack');
  }

  return {
    tech_stack: techStack,
    has_odoo: hasOdoo,
    odoo_version: odooVersion
  };
}

/**
 * Accumulates observable evidence of technical debt from HTML and HTTP headers.
 * Never infers a version unless it's directly present in the source.
 */
function detectLegacySignals(html = '', headers = {}) {
  const signals = [];

  // Old jQuery — 1.x and 2.x are EOL
  const jqMatch = html.match(/jquery[./-](\d+\.\d+(?:\.\d+)?)/i);
  if (jqMatch) {
    const major = parseInt(jqMatch[1].split('.')[0], 10);
    if (major <= 2) signals.push(`jQuery ${jqMatch[1]} detected — major version obsolete since 2016`);
  }

  // Old Bootstrap — 2.x / 3.x
  const bsMatch = html.match(/bootstrap[./-](\d+\.\d+(?:\.\d+)?)/i);
  if (bsMatch) {
    const major = parseInt(bsMatch[1].split('.')[0], 10);
    if (major <= 3) signals.push(`Bootstrap ${bsMatch[1]} detected — Bootstrap 4+ released 2018`);
  }

  // Flash / Silverlight / ActiveX
  if (/\.swf["'\s]|activexobject|shockwaveflash|silverlight/i.test(html)) {
    signals.push('Adobe Flash / ActiveX / Silverlight references detected — EOL since 2020');
  }

  // Excessive table-based layout (data tables excluded by heuristic)
  const tableCount = (html.match(/<table[\s>]/gi) || []).length;
  if (tableCount > 6 && !/data-table|pricing.table|compare.table/i.test(html)) {
    signals.push(`Table-based layout (${tableCount} tables) — pre-CSS-Grid design pattern`);
  }

  // Excessive inline styles
  const inlineStyleCount = (html.match(/\bstyle\s*=/gi) || []).length;
  if (inlineStyleCount > 35) {
    signals.push(`Excessive inline styles (${inlineStyleCount}) — indicates manually maintained legacy markup`);
  }

  // Old PHP version visible in header
  const xpb = (headers['x-powered-by'] || '').toLowerCase();
  if (/php\/[45]\./.test(xpb)) signals.push(`PHP 4/5 visible in X-Powered-By header — EOL version`);

  // Old ASP.NET
  if (/asp\.net$/.test(xpb)) signals.push('Classic ASP.NET detected in headers');

  // WordPress version from meta generator
  const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1] || '';
  if (gen) {
    const wpVer = gen.match(/wordpress\s*([\d.]+)/i);
    if (wpVer) {
      const major = parseFloat(wpVer[1]);
      if (major < 6) signals.push(`WordPress ${wpVer[1]} — not on current major version (6.x)`);
    }
    if (/joomla/i.test(gen)) signals.push('Joomla CMS detected — high maintenance overhead');
    if (/drupal\s*[5-8]/i.test(gen)) signals.push('Drupal detected — consider migration complexity');
  }

  // No cache-control or expires headers = poor caching setup
  if (!headers['cache-control'] && !headers['expires']) {
    signals.push('No HTTP caching headers — assets served without browser cache instructions');
  }

  return signals;
}

module.exports = { detectTechStack, detectLegacySignals };
