/**
 * Automated Clay Integration Module
 * Handles automated outbound push to Clay webhooks and inbound processing of waterfall enrichment.
 */

const axios = require('axios');

/**
 * Pushes a lead to Clay webhook for waterfall enrichment
 * @param {object} lead - Lead object
 * @param {string} webhookUrl - Clay Inbound Webhook URL
 * @returns {Promise<object>} Result
 */
async function pushLeadToClay(lead, webhookUrl) {
  if (!webhookUrl) {
    throw new Error('Clay Webhook URL is not configured. Please provide your Clay webhook endpoint.');
  }

  const primaryDM = (lead.decision_makers && lead.decision_makers[0]) || {};

  const payload = {
    lead_id: lead.id,
    company_name: lead.name,
    website: lead.website || '',
    industry: lead.industry || '',
    location: lead.location || lead.address || '',
    phone: lead.phone || '',
    existing_email: lead.email || '',
    decision_maker_name: primaryDM.name || '',
    decision_maker_title: primaryDM.title || 'CEO / Owner',
    linkedin_url: primaryDM.linkedin_url || '',
    success_chance_pct: lead.success_chance_pct || 75,
    category: lead.category || 'BPO_RESCUE',
    callback_url: `${process.env.APP_URL || 'http://localhost:3000'}/api/webhooks/clay`
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });
    return { success: true, status: response.status, lead_id: lead.id };
  } catch (err) {
    throw new Error(`Failed to push to Clay: ${err.message}`);
  }
}

/**
 * Processes incoming enriched payload from Clay webhook
 * @param {object} body - Clay webhook POST payload
 * @returns {object} Normalized patch object for database
 */
function processClayEnrichmentPayload(body) {
  const patch = {};
  const first = (...vals) => vals.find(v => v != null && String(v).trim() !== '');
  const str = (v) => (v == null ? '' : String(v).trim());

  // ── Company-level phone / email (accepts common provider field names) ──────
  const phone = first(body.company_phone, body.mobile_phone, body.direct_phone, body.cell_phone,
    body.phone_number, body.phone, body.mobile);
  if (phone) patch.phone = str(phone);

  const email = first(body.company_email, body.verified_email, body.work_email, body.email, body.personal_email);
  if (email && !/^(operations@|contact@)/i.test(str(email))) patch.email = str(email);

  // ── Company profile fields (People Data Labs / RocketReach company enrich) ──
  const website = first(body.website, body.company_website, body.domain);
  if (website) patch.website = /^https?:\/\//i.test(str(website)) ? str(website) : 'https://' + str(website);

  const address = first(body.address, body.location, body.company_location, body.hq_location);
  if (address) patch.address = str(address);

  if (first(body.industry, body.company_industry)) patch.industry = str(first(body.industry, body.company_industry));

  const size = first(body.employee_size, body.employee_count, body.employees, body.headcount, body.num_employees, body.size);
  if (size) patch.employee_size = str(size);

  const revenue = first(body.annual_revenue, body.revenue, body.company_revenue);
  if (revenue) patch.annual_revenue = str(revenue);

  const linkedinCompany = first(body.company_linkedin_url, body.company_linkedin);
  if (linkedinCompany) patch.linkedin = str(linkedinCompany);

  const tech = body.tech_stack || body.technologies;
  if (Array.isArray(tech) && tech.length) patch.tech_stack = tech;
  else if (typeof tech === 'string' && tech.trim()) patch.tech_stack = tech.split(',').map(t => t.trim()).filter(Boolean);

  // ── Decision maker (person enrichment: PDL primary / RocketReach fallback) ──
  const fullName = first(body.decision_maker_name, body.full_name, body.person_name, body.ceo_name, body.name);
  const composedName = (body.first_name || body.last_name)
    ? [str(body.first_name), str(body.last_name)].filter(Boolean).join(' ') : '';
  const dmName = fullName || composedName;
  const dmEmail = first(body.person_email, body.verified_email, body.work_email, body.decision_maker_email, body.email, body.personal_email);
  const dmPhone = first(body.mobile_phone, body.direct_phone, body.cell_phone, body.person_phone);
  const dmLinkedIn = first(body.linkedin_url, body.person_linkedin_url, body.linkedin);

  if (dmName) {
    patch._new_decision_maker = {
      name: str(dmName),
      title: str(first(body.decision_maker_title, body.job_title, body.title)) || 'Decision Maker',
      email_guess: dmEmail ? str(dmEmail) : null,
      direct_phone: dmPhone ? str(dmPhone) : null,
      linkedin_url: dmLinkedIn ? str(dmLinkedIn) : null,
      source: 'clay_enrichment',
      verified: true
    };
  }

  if (body.ai_icebreaker || body.clay_pitch) {
    patch._ai_icebreaker = body.ai_icebreaker || body.clay_pitch;
  }

  return patch;
}

module.exports = {
  pushLeadToClay,
  processClayEnrichmentPayload
};
