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

module.exports = { detectTechStack };
