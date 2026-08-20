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

async function enrichLead(lead, negativeReviews = []) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
  });

  // Build real review block for the prompt
  const reviewBlock = negativeReviews.length > 0
    ? `\nReal Customer Complaints (scraped from Google Maps — lowest rated reviews):\n${
        negativeReviews.slice(0, 12).map((r, i) =>
          `${i + 1}. [${r.rating}★] "${r.text}"`
        ).join('\n')
      }\n\nIMPORTANT: Use these REAL complaints verbatim to identify the company's actual operational problems. Quote or paraphrase specific complaints in the pain points and friction gaps section.`
    : '\n(No review data available — infer pain points from industry and company profile.)';

  const prompt = `You are a B2B sales intelligence analyst for Big Binary Tech, an Odoo ERP implementation partner.

Analyze the following company and return a JSON enrichment object grounded in real evidence. Be specific and use the actual customer complaints below when describing pain points and operational friction.

Company:
- Name: ${lead.name}
- Industry: ${lead.industry || 'Unknown'}
- Location: ${lead.location || 'USA'}
- Website: ${lead.website || 'Unknown'}
- Employee Size: ${lead.employee_size || '11-50'}
- Phone: ${lead.phone || 'Unknown'}
- Current Tech Stack: ${(lead.tech_stack || []).join(', ') || 'Unknown'}
- Rating: ${lead.rating || 'Unknown'} (${lead.reviews_count || 0} reviews)
${reviewBlock}

BigBinary Tech is a small Odoo ERP implementation partner with a team of ~30. We target companies between 10–250 employees. Companies with 500+ employees, complex multi-entity setups, or enterprise-grade ERP requirements are OUT OF SCOPE for us.

Return ONLY this JSON structure (no markdown, no explanation):
{
  "out_of_scope": false,
  "out_of_scope_reason": "Only populate if out_of_scope is true — e.g. '1,200 employees, requires SAP/Oracle-level ERP'",
  "opportunity": {
    "category": "NEW_IMPLEMENTATION or BPO_RESCUE",
    "deal_type": "short deal description",
    "fit_tier": "e.g. Solid Opportunity (Tier 2)",
    "success_chance_percentage": 60,
    "estimated_deal_tier": "e.g. $25,000 - $75,000 (Full Implementation)",
    "priority_score": 65
  },
  "decision_maker_contacts": [
    { "name": "Full Name", "title": "Exact Job Title", "email": "guessed@domain.com" },
    { "name": "Full Name", "title": "Exact Job Title", "email": "guessed@domain.com" }
  ],
  "problem_and_sentiment_analysis": {
    "risk_level": "Low | Medium | High",
    "identified_problems": [
      {
        "problem": "Concise description of the operational problem (quote or paraphrase actual review language)",
        "review_count": 4,
        "review_evidence": "Short verbatim quote or paraphrase from the worst review",
        "odoo_fix": "Specific Odoo module or feature that directly solves this — e.g. 'Odoo Helpdesk: auto-ticket creation on missed call + SLA enforcement'"
      }
    ]
  },
  "odoo_sales_playbook": {
    "recommended_odoo_modules": [
      "Odoo Module 1", "Odoo Module 2", "Odoo Module 3",
      "Odoo Module 4", "Odoo Module 5", "Odoo Module 6"
    ],
    "custom_pitch_hook": "One compelling sentence tailored to this company's specific pain.",
    "action_plan_roadmap": [
      "Phase 1: Business Process Mapping & Gap Analysis",
      "Phase 2: Odoo Enterprise Instance Setup & Chart of Accounts Configuration",
      "Phase 3: Legacy Data Cleansing & Migration (Customers, Vendors, Products, Open Balances)",
      "Phase 4: Custom Workflow Automation & 3rd-party App Integrations",
      "Phase 5: End-to-End User Acceptance Testing (UAT) & Staff Training",
      "Phase 6: Go-Live Support & Ongoing Optimization"
    ]
  }
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini returned invalid JSON');
    parsed = JSON.parse(match[0]);
  }

  const opp  = parsed.opportunity || {};
  const prob = parsed.problem_and_sentiment_analysis || {};
  const play = parsed.odoo_sales_playbook || {};
  const dms  = (parsed.decision_maker_contacts || []).map(dm => ({
    name: dm.name,
    title: dm.title,
    email_guess: dm.email || '',
    source: 'gemini_ai_enrichment',
    verified: false
  }));

  return {
    out_of_scope:           parsed.out_of_scope === true,
    out_of_scope_reason:    parsed.out_of_scope_reason || '',

    opportunity:            opp,
    category:               opp.category || 'NEW_IMPLEMENTATION',
    deal_type:              opp.deal_type || '',
    fit_tier:               opp.fit_tier || 'Solid Opportunity (Tier 2)',
    success_chance:         opp.success_chance_percentage || 65,
    success_chance_pct:     opp.success_chance_percentage || 65,
    estimated_deal_tier:    opp.estimated_deal_tier || '$25,000 - $75,000 (Full Implementation)',
    priority_score:         opp.priority_score || 60,

    decision_makers:        dms,

    problem_analysis:       prob,
    identified_problems:    prob.identified_problems || [],
    // Legacy flat arrays for backwards compat with battlecard renderer
    customer_pain_points:   (prob.identified_problems || []).map(p => p.problem).filter(Boolean),
    operational_bottlenecks: (prob.identified_problems || []).map(p => `${p.problem} → ${p.odoo_fix}`).filter(Boolean),
    risk_level:             prob.risk_level || 'Medium',

    odoo_playbook:          play,
    recommended_modules:    play.recommended_odoo_modules || [],
    pitch_hook:             play.custom_pitch_hook || '',
    action_plan_roadmap:    play.action_plan_roadmap || []
  };
}

module.exports = { enrichLead };
