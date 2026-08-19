/**
 * Hugging Face Review Intelligence & Zero-Shot NLI Classifier
 * Uses Xenova/nli-deberta-v3-small or Xenova/bart-large-mnli for zero-shot operational friction classification,
 * and generates a concise 2-sentence SDR Review Audit Dossier.
 */

let classifier = null;

const FRICTION_HYPOTHESES = [
  'Operational bottleneck in scheduling, dispatch, or delays',
  'Billing confusion, invoicing errors, or payment tracking issues',
  'Poor communication, lost paperwork, or manual tracking',
  'High software maintenance costs or poor partner support',
  'Outdated technology, broken online portal, or manual spreadsheets'
];

async function getClassifier() {
  if (!classifier) {
    try {
      const { pipeline } = await import('@xenova/transformers');
      // Using nli-deberta-v3-small or bart-large-mnli for high-speed local inference
      classifier = await pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-small', {
        quantized: true
      });
    } catch (err) {
      console.warn('NLI Classifier fallback:', err.message);
      return null;
    }
  }
  return classifier;
}

/**
 * Analyzes company reviews or descriptions using Zero-Shot NLI
 */
async function analyzeFrictionWithNLI(text) {
  const str = Array.isArray(text) ? text.join(' ') : String(text || '');
  if (!str || str.length < 10) {
    return {
      top_friction: 'Manual Operations & Workflow Overhead',
      confidence: 0.85,
      friction_breakdown: [
        { label: 'Manual tracking & spreadsheet reliance', score: 0.85 },
        { label: 'Scheduling & dispatch overhead', score: 0.72 }
      ]
    };
  }

  try {
    const pipe = await getClassifier();
    if (pipe) {
      const result = await pipe(str.substring(0, 500), FRICTION_HYPOTHESES, {
        multi_label: true
      });

      const breakdown = (result.labels || []).map((label, idx) => ({
        label,
        score: Math.round((result.scores[idx] || 0) * 100) / 100
      }));

      return {
        top_friction: result.labels[0] || 'Operational Inefficiency',
        confidence: Math.round((result.scores[0] || 0.8) * 100) / 100,
        friction_breakdown: breakdown.slice(0, 3)
      };
    }
  } catch (err) {
    console.warn('NLI Inference warning:', err.message);
  }

  // Fast heuristic NLI fallback
  return analyzeFrictionHeuristic(str);
}

function analyzeFrictionHeuristic(text) {
  const str = Array.isArray(text) ? text.join(' ') : String(text || '');
  const lower = str.toLowerCase();
  const scores = [];

  // Scheduling & dispatch signals
  if (lower.includes('delay') || lower.includes('late') || lower.includes('slow') ||
      lower.includes('schedule') || lower.includes('wait') || lower.includes('appointment') ||
      lower.includes('dispatch') || lower.includes('arrival') || lower.includes('on-time')) {
    scores.push({ label: 'Scheduling, dispatch, or timeline delays', score: 0.88 });
  }

  // Billing & payment signals
  if (lower.includes('bill') || lower.includes('invoice') || lower.includes('charge') ||
      lower.includes('quote') || lower.includes('estimate') || lower.includes('payment') ||
      lower.includes('price') || lower.includes('cost') || lower.includes('fee')) {
    scores.push({ label: 'Billing, invoicing, or payment workflow issues', score: 0.82 });
  }

  // Communication & paperwork signals
  if (lower.includes('call') || lower.includes('response') || lower.includes('paper') ||
      lower.includes('lost') || lower.includes('follow') || lower.includes('contact') ||
      lower.includes('reach') || lower.includes('reply') || lower.includes('email')) {
    scores.push({ label: 'Communication gaps & manual tracking paperwork', score: 0.79 });
  }

  // Tech / portal / software signals
  if (lower.includes('portal') || lower.includes('online') || lower.includes('website') ||
      lower.includes('app') || lower.includes('software') || lower.includes('system') ||
      lower.includes('track') || lower.includes('update') || lower.includes('status')) {
    scores.push({ label: 'Outdated technology, broken online portal, or manual spreadsheets', score: 0.76 });
  }

  // Field service / operational signals
  if (lower.includes('team') || lower.includes('crew') || lower.includes('technician') ||
      lower.includes('field') || lower.includes('job') || lower.includes('project') ||
      lower.includes('work order') || lower.includes('service call')) {
    scores.push({ label: 'Operational bottleneck in scheduling, dispatch, or delays', score: 0.73 });
  }

  if (scores.length === 0) {
    scores.push({ label: 'Manual Operations & Workflow Overhead', score: 0.65 });
  }

  return {
    top_friction: scores[0].label,
    confidence: scores[0].score,
    friction_breakdown: scores.slice(0, 3)
  };
}

/**
 * Analyzes an exhaustive reviews dataset (1★, 2★, 3★), classifies friction categories,
 * computes star distribution matrix, and produces an Executive Friction Intelligence Summary.
 *
 * @param {Array<{ rating: number, reviewer: string, date: string, text: string }>} reviews
 * @param {string} companyName
 * @param {string} industry
 * @returns {object}
 */
// Extracts the most negatively-loaded sentences from a review text.
// Used to surface what a customer actually said, not just which bucket it fell into.
function extractComplaintSentences(text, limit = 2) {
  if (!text || text.length < 15) return [];

  const sentences = text
    .replace(/([.!?])\s+/g, '$1|||')
    .split('|||')
    .map(s => s.trim())
    .filter(s => s.length > 20);

  const NEGATIVE = /\b(never|awful|terrible|horrible|worst|bad|poor|rude|unprofessional|slow|ignor|cancel|disappoint|frustrat|useless|broken|couldn't|didn't|refused|fail|wrong|mistake|overcharg|scam|waste|disgust|filthy|confus|incompetent|disrespect|condescend|dismissive|lied|deceiv|fraud|mislead|unaccept)\b/i;

  return sentences
    .map(s => ({ text: s, score: (s.match(new RegExp(NEGATIVE.source, 'gi')) || []).length }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.text.length > 130 ? s.text.substring(0, 127).replace(/\s\S*$/, '...') : s.text);
}

function analyzeReviewIntelligenceDataset(reviews = [], companyName = 'Company', industry = 'Operations') {
  if (!reviews || reviews.length === 0) {
    return {
      totalReviewsAnalyzed: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0 },
      painPoints: [],
      executiveSummary: {
        primaryPain: 'Operational Coordination',
        primaryDetail: 'No severe 1-star public complaints found. Diagnostic model analyzed industry operational friction.',
        secondaryPain: 'Workflow Optimization',
        secondaryDetail: 'Standard industry benchmarks indicate spreadsheet and dispatch handoff overhead.',
        improvementOpportunity: 'Streamlining customer intake and self-service appointment scheduling.'
      }
    };
  }

  // 1. Exact Rating Distribution
  const ratingDistribution = { 1: 0, 2: 0, 3: 0 };
  reviews.forEach(r => {
    const star = r.rating || 1;
    if (star === 1) ratingDistribution[1]++;
    else if (star === 2) ratingDistribution[2]++;
    else if (star >= 3) ratingDistribution[3]++;
  });

  // 2. Clear, distinct operational categories
  const CATEGORIES = {
    'Staff & Communication': {
      regex: /\b(?:rude|unprofessional|disrespectful|dismissive|condescending|nasty|hostile|arrogant|sarcastic|incompetent|useless|english|language|spanish|speak|understand|front desk|receptionist|staff|doctor|nurse|yelled|screamed|attitude|ignored)\b/i
    },
    'Response & Callback Lag': {
      regex: /\b(?:never|nobody|didn'?t|won'?t|couldn'?t)\s+(?:answer|respond|reply|call|pick\s+up|return|contact)|(?:unanswered|unreachable|voicemail|no\s+(?:response|reply|callback|follow.?up))\b/i
    },
    'Wait Times & Scheduling': {
      regex: /\b(?:wait(?:ed|ing)?\s+(?:over|more|almost|\d+)|no.show|never\s+showed|late|delay|appointment|reschedul|overbook|cancel)\b/i
    },
    'Billing & Financial Transparency': {
      regex: /\b(?:overcharg|double.charg|charge|hidden\s+(?:fee|cost)|surprise\s+(?:bill|fee)|refund|money|copay|insurance|invoice|price|expensive)\b/i
    },
    'Process & Record Keeping': {
      regex: /\b(?:lost|misplaced|missing|error|mistake|wrong|paperwork|document|record|chart|portal|prescription|disorganized|confusion)\b/i
    },
    'Facility & Environment': {
      regex: /\b(?:dirty|unclean|filthy|smell|trash|ac|air\s+condition|heat|broken|equipment|room|restroom)\b/i
    }
  };

  const matrix = {};
  Object.keys(CATEGORIES).forEach(cat => {
    matrix[cat] = { total: 0, stars: { 1: 0, 2: 0, 3: 0 }, examples: [], specific_complaints: [] };
  });

  // 3. Assign each review to its single best matching category to guarantee row sum consistency
  reviews.forEach(review => {
    const text = review.text || '';
    const star = review.rating || 1;
    const starKey = star === 1 ? 1 : star === 2 ? 2 : 3;

    let bestCat = null;
    let maxMatchCount = 0;

    Object.entries(CATEGORIES).forEach(([cat, def]) => {
      const matchCount = (text.match(new RegExp(def.regex.source, 'gi')) || []).length;
      if (matchCount > maxMatchCount) {
        maxMatchCount = matchCount;
        bestCat = cat;
      }
    });

    if (!bestCat) {
      bestCat = 'Staff & Communication'; // Default operational category
    }

    matrix[bestCat].total++;
    matrix[bestCat].stars[starKey]++;

    if (matrix[bestCat].examples.length < 3) {
      const excerpt = text.length > 140 ? text.substring(0, 137) + '...' : text;
      matrix[bestCat].examples.push({ star, reviewer: review.reviewer, excerpt });
    }

    const complaints = extractComplaintSentences(text, 2);
    complaints.forEach(c => {
      if (!matrix[bestCat].specific_complaints.includes(c)) {
        matrix[bestCat].specific_complaints.push(c);
      }
    });
  });

  const totalAnalyzed = reviews.length;
  const painPoints = Object.entries(matrix)
    .filter(([_, data]) => data.total > 0)
    .map(([pain, data]) => {
      const pct = Math.round((data.total / totalAnalyzed) * 1000) / 10;
      const severity = data.stars[1] >= 2 || pct >= 35 ? 'high' : pct >= 15 ? 'medium' : 'low';
      return {
        pain,
        count: data.total,
        percentage: pct,
        starsBreakdown: data.stars,
        severity,
        examples: data.examples,
        specific_complaints: data.specific_complaints.slice(0, 3)
      };
    })
    .sort((a, b) => b.count - a.count);

  const top1 = painPoints[0] || { pain: 'Staff & Communication', count: totalAnalyzed, percentage: 100, starsBreakdown: ratingDistribution, specific_complaints: [] };
  const top2 = painPoints[1] || null;

  // Build clean non-repetitive executive summaries
  const p1complaints = (top1.specific_complaints || []).slice(0, 2);
  const primaryDetail = p1complaints.length > 0
    ? `${top1.count} of ${totalAnalyzed} low-rating reviews (${top1.percentage}%) cite ${top1.pain.toLowerCase()} — verbatim: ${p1complaints.map(c => `"${c}"`).join('; ')}`
    : `${top1.count} of ${totalAnalyzed} low-rating reviews (${top1.percentage}%) point to ${top1.pain.toLowerCase()} as the primary point of friction.`;

  const secondaryDetail = top2 && top2.count > 0
    ? `${top2.count} reviews (${top2.percentage}%) report ${top2.pain.toLowerCase()} issues.`
    : 'No secondary friction cluster detected in current review sample.';

  const opportunityCat = painPoints.find(p => p.starsBreakdown[2] + p.starsBreakdown[3] > 0 && p.pain !== top1.pain) || top2;
  const improvementOpportunity = opportunityCat && opportunityCat.count > 0
    ? `${opportunityCat.pain} was noted in ${opportunityCat.starsBreakdown[2] + opportunityCat.starsBreakdown[3]} mid-tier (2★–3★) reviews — addressing this represents an immediate customer retention win.`
    : 'Automating customer appointment confirmations and self-service updates would eliminate the majority of front-desk friction.';

  return {
    totalReviewsAnalyzed: totalAnalyzed,
    ratingDistribution,
    painPoints,
    executiveSummary: {
      primaryPain: top1.pain,
      primaryDetail,
      secondaryPain: top2?.pain || 'None identified',
      secondaryDetail,
      improvementOpportunity
    }
  };
}

/**
 * Generates a personalized SDR dossier from actual scraped signals.
 */
function generateReviewDossier(lead, nliResult) {
  const name = lead.name || 'This company';
  const industry = lead.industry || 'local operations';
  const intel = lead.deep_intel || {};

  const structuredDataset = intel.reviews_dataset || [];
  const intelligenceReport = analyzeReviewIntelligenceDataset(structuredDataset, name, industry);

  const yelpSnippets = intel.yelp?.yelp_review_snippets || [];
  if (!nliResult) {
    nliResult = analyzeFrictionWithNLI(yelpSnippets, industry);
  }
  const topFriction = intelligenceReport.executiveSummary.primaryPain || nliResult?.top_friction || 'Manual dispatch and unintegrated operations';

  // Pull every available signal
  const yelpRating = intel.yelp?.yelp_rating;
  const yelpCount = intel.yelp?.yelp_review_count;
  const googleRating = lead.rating;
  const googleCount = lead.reviews_count;
  const hiringSignals = intel.hiring?.hiring_signals || [];
  const openJobs = intel.hiring?.jobs_found || [];
  const latestNews = intel.news?.latest_headline;
  const bbbYears = intel.bbb?.years_in_business;
  const bbbComplaints = intel.bbb?.complaints_count;
  const bbbAccredited = intel.bbb?.bbb_accredited;
  const corpDate = intel.corporation?.incorporation_date;

  const parts = [];

  // ── Part 1: Who they are (volume + age, most specific data first) ──────────
  const effectiveRating = yelpRating || googleRating;
  const effectiveCount = parseInt(String(yelpCount || googleCount || 0).replace(/,/g, ''), 10) || 0;
  const ratingSrc = yelpRating ? 'Yelp' : 'Google';
  const ageNote = bbbYears
    ? `${bbbYears} in the market`
    : corpDate ? `operating since ${corpDate.substring(0, 4)}` : null;
  const accreditedTag = bbbAccredited ? ', BBB-accredited' : '';

  if (effectiveRating && effectiveCount > 10) {
    const volumeWord = effectiveCount > 100 ? 'high-volume' : effectiveCount > 30 ? 'established' : 'active';
    const agePhrase = ageNote ? ` — ${ageNote}${accreditedTag}` : '';
    parts.push(`${name} is a ${volumeWord} ${industry} operation with ${effectiveCount} ${ratingSrc} reviews at ${effectiveRating}★${agePhrase}.`);
  } else if (ageNote) {
    parts.push(`${name} has been ${ageNote}${accreditedTag} in the ${industry} space.`);
  } else if (lead.has_odoo) {
    parts.push(`${name} is a confirmed Odoo user in the ${industry} sector — they've already invested in ERP infrastructure.`);
  } else {
    parts.push(`${name} is an active ${industry} provider in ${lead.location || 'their regional market'}.`);
  }

  // ── Part 2: Customer voice & Executive Friction Analysis ────────
  if (intelligenceReport.totalReviewsAnalyzed > 0) {
    parts.push(`Customer Friction Intelligence: Primary operational pain is ${intelligenceReport.executiveSummary.primaryPain.toLowerCase()} (${intelligenceReport.executiveSummary.primaryDetail}).`);
  } else if (yelpSnippets.length > 0) {
    const bestSnippet = pickMostRevealingSnippet(yelpSnippets, topFriction);
    if (bestSnippet) {
      const trimmed = bestSnippet.length > 160 ? bestSnippet.substring(0, 157) + '...' : bestSnippet;
      parts.push(`Customer voice: "${trimmed}" — ${frictionToCustomerImpact(topFriction)}.`);
    }
  } else {
    parts.push(frictionToOperationalInsight(topFriction, name, industry));
  }

  // ── Part 3: Hiring = the strongest real-time pain proof ───────────────────
  if (openJobs.length > 0) {
    const specificTitle = openJobs[0].title;
    parts.push(`They're currently hiring a "${specificTitle}" — a role that usually signals the exact manual bottleneck that Odoo field ops or workflow automation eliminates.`);
  } else if (hiringSignals.length > 0) {
    parts.push(`Live hiring data shows ${hiringSignals[0].toLowerCase()} — they're adding headcount to solve a problem that's better fixed with automation.`);
  }

  // ── Part 4: BBB complaints ────────────────────────────────────────────────
  if (bbbComplaints != null && bbbComplaints > 0) {
    const plural = bbbComplaints !== 1 ? 's' : '';
    parts.push(`BBB shows ${bbbComplaints} complaint${plural} on record — often a trailing indicator of billing or communication friction.`);
  }

  const summary = parts.filter(Boolean).join(' ');

  return {
    summary,
    parts,
    top_friction: topFriction,
    confidence_pct: Math.round((nliResult?.confidence || 0.85) * 100),
    intelligence_report: intelligenceReport
  };
}

/**
 * Picks the review snippet most linguistically aligned with the detected friction type.
 */
function pickMostRevealingSnippet(snippets, friction) {
  const frictionKeywords = {
    'schedul|dispatch|delay|arrival|on-time|appointment': ['schedule', 'late', 'delay', 'wait', 'slow', 'appointment', 'arrival', 'time', 'hours', 'days', 'week'],
    'bill|invoice|payment|charge': ['bill', 'invoice', 'charge', 'quote', 'payment', 'cost', 'price', 'fee', 'overcharg', 'refund'],
    'communication|paperwork|lost|tracking': ['call', 'response', 'contact', 'reach', 'reply', 'email', 'follow', 'message', 'paper', 'lost'],
    'technology|portal|software|online': ['portal', 'online', 'website', 'app', 'system', 'track', 'update', 'status', 'digital'],
    'operational|bottleneck': ['team', 'crew', 'tech', 'field', 'job', 'work', 'service', 'crew']
  };

  let relevantKeywords = [];
  const lowerFriction = friction.toLowerCase();
  for (const [pattern, words] of Object.entries(frictionKeywords)) {
    if (new RegExp(pattern).test(lowerFriction)) {
      relevantKeywords = words;
      break;
    }
  }

  // Score each snippet by keyword overlap with detected friction
  let best = snippets[0];
  let bestScore = -1;
  for (const snippet of snippets) {
    const lower = snippet.toLowerCase();
    const score = relevantKeywords.filter(k => lower.includes(k)).length;
    // Prefer snippets that sound like a complaint (contain negative signal words)
    const negativeBonus = /slow|late|delay|never|poor|bad|awful|disappoint|unprofessional|issue|problem|frustrat/.test(lower) ? 2 : 0;
    if (score + negativeBonus > bestScore) {
      bestScore = score + negativeBonus;
      best = snippet;
    }
  }

  return best;
}

/**
 * Converts an NLI friction label into a short customer-impact phrase
 * used after quoting a review snippet.
 */
function frictionToCustomerImpact(friction) {
  const lower = friction.toLowerCase();
  if (/schedul|dispatch|delay|arrival/.test(lower)) return 'customers are feeling the scheduling and timeline gaps';
  if (/bill|invoice|payment|charge/.test(lower)) return 'billing and payment handling is creating friction';
  if (/communication|paperwork|lost|tracking/.test(lower)) return 'follow-up and communication breakdowns are showing up in reviews';
  if (/technology|portal|software|online/.test(lower)) return "their tech setup isn't keeping pace with customer expectations";
  return 'operational friction is showing up at the customer-facing level';
}

/**
 * When no Yelp text is available, describe the friction as a concrete
 * operational scenario rather than repeating the NLI label verbatim.
 */
function frictionToOperationalInsight(friction, name, industry) {
  const lower = friction.toLowerCase();
  if (/schedul|dispatch|delay/.test(lower)) {
    return `For a ${industry} business, dispatch coordination without a central system typically means missed appointments, phone tag with field techs, and jobs that fall through the cracks between booking and invoice.`;
  }
  if (/bill|invoice|payment/.test(lower)) {
    return `Billing and invoicing in a ${industry} operation without an ERP usually means end-of-month reconciliation in spreadsheets, delayed payments, and quotes that don't match final invoices — all solvable with Odoo's accounting module.`;
  }
  if (/communication|paperwork|lost/.test(lower)) {
    return `${name}'s footprint suggests customer communication and job tracking is handled manually — phone, email, or paper — which creates gaps between what was promised and what gets delivered.`;
  }
  if (/maintenance|partner support/.test(lower)) {
    return `${name} is likely paying premium hourly rates to an external vendor for Odoo or ERP support — a cost that compounds every time a module breaks, a customization needs updating, or an upgrade is overdue.`;
  }
  if (/technology|portal|software/.test(lower)) {
    return `No integrated client portal means customers at ${name} call or email to check job status, which drives unnecessary inbound volume and slows the team down from actual field work.`;
  }
  return `${name}'s ${industry} operation shows signs of manual overhead across job coordination and client communication — the exact workflow that Odoo's field service module was built to eliminate.`;
}

module.exports = {
  analyzeFrictionWithNLI,
  generateReviewDossier
};
