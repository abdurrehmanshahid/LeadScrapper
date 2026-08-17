/**
 * Feature Extractor for PRISM Lead Propensity Engine
 * Converts raw lead audit data into a normalized feature vector.
 */

function extractFeatures(leadData) {
  const currentYear = new Date().getFullYear();
  const industry = (leadData.industry || '').toLowerCase();
  const copyrightYear = parseInt(leadData.copyright_year, 10) || currentYear;
  const copyrightAge = Math.max(0, currentYear - copyrightYear);
  const reviewsCount = parseInt(leadData.reviews_count, 10) || 0;
  const rating = parseFloat(leadData.rating) || 0;
  const techStack = (leadData.tech_stack || []).map(t => t.toLowerCase());

  // Determine size bucket
  let sizeBucket = '11-50';
  if (leadData.employee_size) {
    sizeBucket = leadData.employee_size;
  } else if (reviewsCount > 150) {
    sizeBucket = '51-200';
  } else if (reviewsCount > 30) {
    sizeBucket = '11-50';
  } else {
    sizeBucket = '1-10';
  }

  // Check technographic flags
  const hasOdoo = techStack.some(t => t.includes('odoo')) || !!leadData.has_odoo;
  const isLegacyOdoo = techStack.some(t => t.includes('odoo v12') || t.includes('odoo v13') || t.includes('odoo v14') || t.includes('odoo v15'));
  const hasWordPress = techStack.some(t => t.includes('wordpress') || t.includes('woocommerce'));
  const hasLegacyCMS = techStack.some(t => t.includes('joomla') || t.includes('drupal') || t.includes('php'));
  const noPortal = !techStack.some(t => t.includes('portal') || t.includes('client area') || t.includes('erp'));

  return {
    industry,
    sizeBucket,
    copyrightAge,
    reviewsCount,
    rating,
    hasOdoo,
    isLegacyOdoo,
    hasWordPress,
    hasLegacyCMS,
    noPortal,
    noSSL: !leadData.has_ssl,
    loadTimeSec: parseFloat(leadData.load_time_sec) || 2.0
  };
}

module.exports = { extractFeatures };
