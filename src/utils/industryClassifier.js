/**
 * Intelligent Multi-Signal & Multi-Lingual Industry Classifier
 * Infers accurate business sector from company name, description, website snippet, and breadcrumbs.
 */

const INDUSTRY_TAXONOMY = [
  {
    industry: 'Automotive & Transportation',
    keywords: [
      'car rental', 'rental', 'automotive', 'auto parts', 'transport', 'transporte', 'logistics', 
      'logistica', 'fleet', 'trucking', 'freight', 'freighter', 'shipping', 'vehicle', 'motors', 
      'courier', 'towing', 'travel car', 'limo', 'envios', 'cargo', 'port logistics'
    ]
  },
  {
    industry: 'Construction, Trades & Field Services',
    keywords: [
      'construction', 'contractor', 'contracting', 'builder', 'batiment', 'peinture', 'painting',
      'roofing', 'hvac', 'plumbing', 'electrical', 'electrician', 'remodel', 'drywall', 'flooring', 
      'renovation', 'paving', 'landscaping', 'glass', 'pool', 'spa', 'decoration', 'architecture'
    ]
  },
  {
    industry: 'Engineering & Industrial',
    keywords: [
      'engineering', 'ingenieria', 'engineer', 'surveying', 'mechanical', 'structural', 'civil', 
      'consulting engineer', 'industrial', 'automation', 'instrumentation', 'machinery', 
      'hydraulics', 'robotics', 'cryogenic', 'compressor'
    ]
  },
  {
    industry: 'Security & Defense Services',
    keywords: [
      'security consulting', 'security', 'surveillance', 'guard', 'patrol', 'defense', 
      'cybersecurity', 'alarm', 'protection', 'cctv', 'investigation', 'safe hq'
    ]
  },
  {
    industry: 'Manufacturing & Wholesale Trade',
    keywords: [
      'manufacturing', 'manufacturer', 'lubricantes', 'lubricant', 'fabrication', 'plastics', 
      'chemicals', 'textile', 'packaging', 'distributor', 'distribuidora', 'wholesale', 
      'warehouse', 'almacenaje', 'supplies', 'metals', 'import', 'trading', 'gloves', 'gear'
    ]
  },
  {
    industry: 'Food, Beverage & Hospitality',
    keywords: [
      'spirits', 'distillery', 'brewery', 'restaurant', 'cafe', 'catering', 'bakery', 'hotel', 
      'hospitality', 'resort', 'beverage', 'wine', 'bar', 'liquor', 'food', 'foods', 'gourmet'
    ]
  },
  {
    industry: 'IT, Software & Cloud Services',
    keywords: [
      'software', 'saas', 'tech', 'technologies', 'technology', 'cloud', 'digital', 'systems', 
      'cyber', 'hosting', 'telecom', 'telecommunications', 'data', 'it services', 'network', 
      'networks', '3axisdata', 'technics'
    ]
  },
  {
    industry: 'Finance, Investment & Consulting',
    keywords: [
      'invest', 'investment', 'investments', 'ventures', 'consulting', 'financial', 'insurance', 
      'legal', 'accounting', 'advisory', 'capital', 'audit', 'tax', 'law firm', 'wealth', 
      'management', 'startups'
    ]
  },
  {
    industry: 'Healthcare & Life Sciences',
    keywords: [
      'health', 'medical', 'clinic', 'dental', 'pharma', 'hospital', 'therapy', 'wellness', 
      'biotech', 'care', 'diagnostic', 'doctor'
    ]
  },
  {
    industry: 'Retail & Consumer Goods',
    keywords: [
      'retail', 'store', 'shop', 'ecommerce', 'apparel', 'clothing', 'fashion', 'boutique', 
      'furniture', 'jewelry', 'merchandise', 'bazzard'
    ]
  },
  {
    industry: 'Energy & Environmental Services',
    keywords: [
      'energy', 'solar', 'wind', 'strom', 'water', 'green', 'environmental', 'ambientales', 
      'sostenible', 'recycling', 'power', 'watt'
    ]
  }
];

/**
 * Classifies industry from multiple contextual signals
 * @param {string} companyName 
 * @param {string} snippetOrDescription 
 * @param {string} explicitIndustry 
 * @returns {string} Real specific industry
 */
function classifyIndustry(companyName = '', snippetOrDescription = '', explicitIndustry = '') {
  // 1. If explicit industry is valid and not generic fallback
  if (explicitIndustry && !['All', 'Commercial Operations', 'Other', 'General', 'Commercial & Business Operations'].includes(explicitIndustry.trim())) {
    return explicitIndustry.trim();
  }

  const nameLower = (companyName || '').toLowerCase();
  const descLower = (snippetOrDescription || '').toLowerCase();

  // 2. High-precision check on Company Name
  for (const rule of INDUSTRY_TAXONOMY) {
    for (const kw of rule.keywords) {
      if (nameLower.includes(kw)) {
        return rule.industry;
      }
    }
  }

  // 3. Check combined snippet/description
  for (const rule of INDUSTRY_TAXONOMY) {
    for (const kw of rule.keywords) {
      if (descLower.includes(kw)) {
        return rule.industry;
      }
    }
  }

  return 'Commercial & Business Services';
}

module.exports = {
  classifyIndustry,
  INDUSTRY_TAXONOMY
};
