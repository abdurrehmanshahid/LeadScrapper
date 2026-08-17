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

  // Extract direct / mobile phone
  const phone = body.mobile_phone || body.direct_phone || body.cell_phone || body.phone;
  if (phone && phone.trim()) {
    patch.phone = phone.trim();
  }

  // Extract verified corporate / personal email
  const email = body.verified_email || body.work_email || body.email;
  if (email && email.trim() && !email.includes('operations@') && !email.includes('contact@')) {
    patch.email = email.trim();
  }

  // Extract website
  if (body.website && body.website.trim()) {
    patch.website = body.website.trim();
  }

  // Extract physical address
  if (body.address && body.address.trim()) {
    patch.address = body.address.trim();
  }

  // Extract or enrich decision makers
  const dmName = body.decision_maker_name || body.full_name || body.ceo_name || body.name;
  const dmTitle = body.decision_maker_title || body.job_title || body.title || 'Founder / CEO';
  const dmEmail = body.verified_email || body.decision_maker_email || body.email;
  const dmPhone = body.mobile_phone || body.direct_phone || body.phone;
  const dmLinkedIn = body.linkedin_url || body.person_linkedin_url;

  if (dmName && dmName.trim()) {
    const newDM = {
      name: dmName.trim(),
      title: dmTitle.trim(),
      email_guess: dmEmail || null,
      direct_phone: dmPhone || null,
      linkedin_url: dmLinkedIn || null,
      source: 'clay_enrichment',
      verified: true
    };
    patch._new_decision_maker = newDM;
  }

  // Extract AI Icebreaker or custom script
  if (body.ai_icebreaker || body.clay_pitch) {
    patch._ai_icebreaker = body.ai_icebreaker || body.clay_pitch;
  }

  return patch;
}

module.exports = {
  pushLeadToClay,
  processClayEnrichmentPayload
};
