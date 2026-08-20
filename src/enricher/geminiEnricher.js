const { GoogleGenerativeAI } = require('@google/generative-ai');

let _client = null;

function getClient() {
  if (!_client) {
    require('dotenv').config();
    const key = process.env.gemini_key;
    if (!key) throw new Error('gemini_key not found in .env');
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

/**
 * Robust, Grounded Gemini AI Enrichment Engine
 * Strictly enforces evidence-backed reasoning, authentic Google Maps review analysis,
 * and eliminates hallucinations for decision makers and customer feedback.
 */
async function enrichLead(lead, negativeReviews = []) {
  const genAI = getClient();
  
  // Preferred fast, accurate model with fallback
  const modelName = 'gemini-3.6-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.15 // Low temperature prevents hallucination & enforces strict factual grounding
    }
  });

  const hasRealReviews = Array.isArray(negativeReviews) && negativeReviews.length > 0;

  // Build authentic review block with explicit grounding directives
  const reviewBlock = hasRealReviews
    ? `\nAUTHENTIC CUSTOMER REVIEWS (Scraped from Google Maps / Public Listings):\n${
        negativeReviews.slice(0, 10).map((r, i) =>
          `[Review ${i + 1}] (${r.rating || 1}★): "${(r.text || '').replace(/"/g, "'").trim()}"`
        ).join('\n')
      }\n\nSTRICT GROUNDING DIRECTIVE:\n- Analyze ONLY the real complaints listed above.\n- Do NOT invent fake negative feedback or imagine incidents not mentioned in the text.\n- In 'review_evidence', quote directly from the actual reviews provided above.`
    : `\nAUTHENTIC CUSTOMER REVIEWS:\n[No negative reviews found in public Google Maps scan]\n\nSTRICT GROUNDING DIRECTIVE:\n- Do NOT invent or fabricate fake customer reviews or imaginary complaints.\n- Base problem analysis strictly on standard operational friction for this industry (${lead.industry || 'general business'}).\n- Explicitly set 'review_evidence' to 'None provided — diagnostic based on industry operational benchmarks'.`;

  const prompt = `You are a Senior B2B Sales Intelligence & Diagnostic Auditor for Big Binary Tech (an Odoo ERP & Workflow Automation Partner).

CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATION:
1. Rely strictly on verified facts provided in the company profile and real scraped reviews below.
2. DO NOT make up fake people, fictitious names, or imaginary customer reviews.
3. If decision maker information is unknown, return an empty array [] or only verifiable executive roles with email set to null.
4. Target ICP: Small-to-Mid enterprises (10–250 employees). Companies with 500+ employees or multinational SAP/Oracle ERP needs must be marked out_of_scope = true.

COMPANY PROFILE:
- Legal / Trade Name: ${lead.name}
- Industry: ${lead.industry || 'Business Services'}
- Archetype: ${lead.business_archetype || lead.industry || 'Commercial Enterprise'}
- Location: ${lead.location || lead.address || 'USA'}
- Website / Domain: ${lead.website || lead.domain || 'Not Provided'}
- Employee Size: ${lead.employee_size || '11-50'}
- Stated Phone: ${lead.phone || 'Not Provided'}
- Detected Tech Stack: ${(lead.tech_stack || []).join(', ') || 'Standard Web Stack'}
- Public Star Rating: ${lead.rating || 'N/A'} (${lead.reviews_count || 0} reviews recorded)
${reviewBlock}

Return ONLY a valid JSON object with the following schema:
{
  "out_of_scope": false,
  "out_of_scope_reason": "Provide reason ONLY if out_of_scope is true, else leave empty",
  "opportunity": {
    "category": "NEW_IMPLEMENTATION or BPO_RESCUE",
    "deal_type": "Specific deal description (e.g. Turnkey Odoo ERP Implementation, 24/7 BPO Maintenance SLA)",
    "fit_tier": "High Conversion (Tier 1) | Solid Opportunity (Tier 2) | Low Fit / Cold (Tier 3)",
    "success_chance_percentage": 75,
    "estimated_deal_tier": "$25,000 - $75,000 (Full Implementation) | $45,000 - $120,000 (Enterprise) | $15,000 - $35,000 (BPO SLA)",
    "priority_score": 70
  },
  "decision_maker_contacts": [
    {
      "name": "Real Executive Name if known, or omit",
      "title": "Exact Title (e.g. Founder, CEO, COO, CFO, VP Operations)",
      "email": null
    }
  ],
  "problem_and_sentiment_analysis": {
    "risk_level": "Low | Medium | High",
    "identified_problems": [
      {
        "problem": "Clear statement of the operational bottleneck or friction point",
        "review_count": ${hasRealReviews ? negativeReviews.length : 0},
        "review_evidence": "Verbatim quote from authentic review or 'Diagnostic based on industry operational benchmarks'",
        "odoo_fix": "Specific Odoo module & workflow automation that eliminates this bottleneck"
      }
    ],
    "customer_patient_pain_points": [
      "Specific customer-facing friction point grounded in data"
    ],
    "internal_operational_bottlenecks": [
      "Specific internal back-office friction point grounded in data"
    ]
  },
  "odoo_sales_playbook": {
    "recommended_odoo_modules": [
      "Odoo CRM", "Odoo Invoicing", "Odoo Documents"
    ],
    "custom_pitch_hook": "One crisp, authoritative, zero-fluff consultative pitch opener tailored to this exact business.",
    "action_plan_roadmap": [
      "Phase 1: Diagnostic Business Process Mapping & Scope Definition",
      "Phase 2: Odoo Instance Setup & Chart of Accounts Configuration",
      "Phase 3: Clean Data Migration (Customers, Vendors, Open AR/AP)",
      "Phase 4: Automated n8n Workflow Bridges & 3rd-Party Integrations",
      "Phase 5: User Acceptance Testing (UAT) & Departmental Staff Training",
      "Phase 6: Go-Live Support & 24/7 Ongoing SLA Optimization"
    ]
  }
}`;

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    console.warn(`[Gemini Enricher] Primary model request error (${err.message}). Retrying with fallback configuration...`);
    // Safe retry
    const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
    result = await fallbackModel.generateContent(prompt);
  }

  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini response did not contain valid JSON');
    parsed = JSON.parse(match[0]);
  }

  const opp  = parsed.opportunity || {};
  const prob = parsed.problem_and_sentiment_analysis || {};
  const play = parsed.odoo_sales_playbook || {};
  
  // Filter out any hallucinated placeholder names (like 'John Doe', 'Real Executive Name', etc.)
  const placeholderNames = ['full name', 'real executive name', 'john doe', 'jane doe', 'unnamed', 'unknown'];
  const dms = (parsed.decision_maker_contacts || [])
    .filter(dm => dm && dm.name && !placeholderNames.includes(dm.name.toLowerCase().trim()))
    .map(dm => ({
      name: dm.name.trim(),
      title: dm.title || 'Executive',
      email_guess: dm.email || null,
      source: 'gemini_ai_enrichment',
      verified: false
    }));

  const identifiedProblems = prob.identified_problems || [];
  const customerPains = prob.customer_patient_pain_points && prob.customer_patient_pain_points.length > 0
    ? prob.customer_patient_pain_points
    : identifiedProblems.map(p => p.problem).filter(Boolean);

  const operationalBottlenecks = prob.internal_operational_bottlenecks && prob.internal_operational_bottlenecks.length > 0
    ? prob.internal_operational_bottlenecks
    : identifiedProblems.map(p => p.odoo_fix ? `${p.problem} → ${p.odoo_fix}` : p.problem).filter(Boolean);

  return {
    out_of_scope:           parsed.out_of_scope === true,
    out_of_scope_reason:    parsed.out_of_scope_reason || '',

    opportunity:            opp,
    category:               opp.category || 'NEW_IMPLEMENTATION',
    deal_type:              opp.deal_type || 'Turnkey Odoo ERP Implementation',
    fit_tier:               opp.fit_tier || 'Solid Opportunity (Tier 2)',
    success_chance:         opp.success_chance_percentage || 70,
    success_chance_pct:     opp.success_chance_percentage || 70,
    estimated_deal_tier:    opp.estimated_deal_tier || '$25,000 - $75,000 (Full Implementation)',
    priority_score:         opp.priority_score || 65,

    decision_makers:        dms,

    problem_analysis:       prob,
    identified_problems:    identifiedProblems,
    customer_pain_points:   customerPains,
    operational_bottlenecks: operationalBottlenecks,
    risk_level:             prob.risk_level || 'Medium',

    odoo_playbook:          play,
    recommended_modules:    play.recommended_odoo_modules || ['Odoo CRM', 'Odoo Invoicing'],
    pitch_hook:             play.custom_pitch_hook || '',
    action_plan_roadmap:    play.action_plan_roadmap || []
  };
}

module.exports = { enrichLead };
