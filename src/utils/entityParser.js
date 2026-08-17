/**
 * Robust Entity & Name Parser
 * Detects and extracts person names from company listings (including multi-part & international names like "Damian De La Rosa")
 */

const CORP_KEYWORDS = new Set([
  'inc', 'inc.', 'llc', 'llc.', 'ltd', 'ltd.', 'corp', 'corp.', 'corporation', 'gmbh', 'sarl', 
  'srl', 's.a.', 'sa', 's.a. de c.v.', 'sl', 'group', 'services', 'solutions', 'technologies', 
  'technology', 'co', 'co.', 'company', 'consulting', 'international', 'holdings', 'enterprises', 
  'industries', 'partners', 'associates', 'pllc', 'llp', 'lp', 'plc'
]);

/**
 * Splits "Company Name, Person Name" into distinct company and executive entities
 * @param {string} rawTitle 
 * @returns {{ companyName: string, personName: string|null }}
 */
function extractCompanyAndPersonFromTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return { companyName: rawTitle || '', personName: null };
  }

  const trimmed = rawTitle.trim();

  // Check comma first: "Arrow, Damian De La Rosa"
  const commaIndex = trimmed.lastIndexOf(',');
  if (commaIndex > 0) {
    const c = trimmed.substring(0, commaIndex).trim();
    const p = trimmed.substring(commaIndex + 1).trim();

    const pClean = p.replace(/[.,]/g, '').toLowerCase();
    const pWords = p.split(/\s+/).filter(Boolean);

    // If part after comma is a single word and is a corporate suffix (e.g. "LLC" or "Inc") -> NOT a person
    if (pWords.length === 1 && CORP_KEYWORDS.has(pClean)) {
      return { companyName: trimmed, personName: null };
    }

    // Check if entire phrase is corporate noise
    const isCorp = CORP_KEYWORDS.has(pClean) || pWords.some(w => CORP_KEYWORDS.has(w.toLowerCase()));

    // Valid person names are 1 to 5 words (e.g. "Justin", "John Cowan", "Damian De La Rosa") and not corporate words
    if (!isCorp && pWords.length >= 1 && pWords.length <= 5 && p.length >= 2 && c.length >= 2) {
      return { companyName: c, personName: p };
    }
  }

  return { companyName: trimmed, personName: null };
}

module.exports = {
  extractCompanyAndPersonFromTitle
};
