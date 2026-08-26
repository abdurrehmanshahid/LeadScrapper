// SDR Caller Client Logic for Big Binary Tech - High-Velocity Workspace

let callerLeads = [];
let currentIndex = 0;
let activePersona = 'CTO';
let activeScriptTab = 'talking_points';
let callTimerInterval = null;
let callSeconds = 165; // default 02:45
let _tallySaveTimer = null;

// ── Contact helpers ──────────────────────────────────────────────────────────
// Unwrap Google ad/search redirects (/aclk, /url) to the real destination.
function cleanWebsite(url) {
  if (!url || typeof url !== 'string') return '';
  let out = url.trim();
  if (out.includes('/aclk') || /\/url\?/.test(out)) {
    const m = out.match(/[?&](?:adurl|q)=([^&]+)/);
    if (m && m[1]) { try { out = decodeURIComponent(m[1]); } catch (_) { out = m[1]; } }
    else return '';
  }
  if (out.startsWith('/')) return '';
  const host = out.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  if (/(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)goo\.gl$/.test(host) ||
      /google\.[a-z.]+\/(aclk|url|search|maps)/i.test(out)) return '';
  out = stripTrackingParams(out);
  if (!/^https?:\/\//i.test(out)) out = 'https://' + out;
  return out;
}

const TRACKING_PARAM = /^(utm_|gclid|gclsrc|dclid|fbclid|msclkid|yclid|mc_cid|mc_eid|_ga|_gl|ref|referrer|source|medium|campaign|gmb)/i;
function stripTrackingParams(url) {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const base = url.slice(0, q);
  const kept = url.slice(q + 1).split('&').filter(p => { const k = p.split('=')[0]; return k && !TRACKING_PARAM.test(k); });
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shortHost = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

// Business phone numbers as [{label, number}] — back-compatible with the old single lead.phone.
function getLeadPhones(lead) {
  if (Array.isArray(lead.phones) && lead.phones.length) {
    return lead.phones
      .map(p => typeof p === 'string' ? { label: 'Main', number: p } : { label: (p && p.label) || 'Main', number: (p && p.number) || '' })
      .filter(p => p.number);
  }
  return lead.phone ? [{ label: 'Main', number: lead.phone }] : [];
}
function primaryPhone(lead) {
  const p = getLeadPhones(lead);
  return p.length ? p[0].number : '';
}

function contactLine(label, valueHtml) {
  return `<div class="contact-line"><span class="contact-key">${label}</span>` +
         `<span class="contact-val">${valueHtml || '—'}</span></div>`;
}

function linkHtml(url, text) {
  if (!url) return '';
  const safe = esc(url);
  return `<a href="${safe}" target="_blank" rel="noopener">${esc(text || url)}</a>`;
}

// Small monochrome pencil for "edit" affordances.
const PENCIL_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const editPencil = (label = 'Edit') => `<button class="edit-pencil" onclick="openEditModal()" title="Edit all lead details">${PENCIL_SVG} ${label}</button>`;

// Surface website / LinkedIn / phone / email + top-3 decision makers on top.
function renderContactBlock(lead) {
  const box = document.getElementById('contactStrip');
  if (!box) return;

  const web = cleanWebsite(lead.website);
  const dms = (lead.decision_makers || []);

  const dmCards = dms.length ? dms.map(dm => `
    <div class="dm-chip">
      <div class="dm-chip-head">
        <span class="dm-chip-name">${esc(dm.name || 'Decision Maker')}</span>
        <span class="dm-chip-title">${esc(dm.title || dm.persona_label || '')}</span>
      </div>
      <div class="dm-chip-lines">
        ${contactLine('Cell', dm.cell ? linkHtml('tel:' + dm.cell, dm.cell) : '')}
        ${contactLine('Email', dm.email_guess ? linkHtml('mailto:' + dm.email_guess, dm.email_guess) : '')}
        ${contactLine('LinkedIn', dm.linkedin_url ? linkHtml(dm.linkedin_url, 'View profile') : '')}
      </div>
    </div>`).join('') : '<div class="contact-empty">No decision makers captured yet — click Add Person.</div>';

  const phones = getLeadPhones(lead);
  const phoneLines = phones.length
    ? phones.map(p => contactLine(esc(p.label || 'Phone'), linkHtml('tel:' + p.number, esc(p.number)))).join('')
    : contactLine('Phone', '');

  box.innerHTML = `
    <div class="contact-grid">
      <div class="contact-company">
        <div class="contact-block-title contact-title-row"><span>Company Contact</span>${editPencil()}</div>
        ${contactLine('Website', web ? linkHtml(web, shortHost(web)) : '')}
        ${contactLine('LinkedIn', lead.linkedin ? linkHtml(lead.linkedin, 'Company page') : '')}
        ${phoneLines}
        ${contactLine('Email', lead.email ? linkHtml('mailto:' + lead.email, lead.email) : '')}
      </div>
      <div class="contact-dms">
        <div class="contact-block-title contact-title-row">
          <span>Decision Makers${dms.length ? ` (${dms.length})` : ''}</span>
          <span class="contact-title-actions">
            <button class="edit-pencil" onclick="openAddPersonModal()" title="Add a new person">+ Add Person</button>
            ${editPencil('Edit')}
          </span>
        </div>
        <div class="dm-chip-grid">${dmCards}</div>
      </div>
    </div>`;
}

// 8 Buyer Persona Knowledge Base & Diagnostic Playbooks
const PERSONA_PLAYBOOKS = {
  CTO: {
    title: 'CTO / VP Engineering',
    focus: 'Tech Debt, Version Upgrades & Partner SLAs',
    leakEst: '$120,000 - $240,000',
    talking_points: [
      'Identified legacy software tech debt and unpatched dependencies creating performance bottlenecks.',
      'Average agency partner bill rates of $180+/hr for routine bug fixes vs. Big Binary 24/7 dedicated SLA at 60% lower cost.',
      'API resilience & real-time webhook bridging for zero-downtime operations.'
    ],
    questions: [
      'How are you currently handling ERP custom module maintenance and security patches?',
      'What is your team’s biggest friction point when integrating third-party APIs or webhooks?',
      'Are slow external developer response times delaying your sprint velocity?'
    ],
    value_propos: [
      '24/7 SLA infrastructure support with sub-1-hour critical response guarantee.',
      'Full CI/CD pipeline automation and zero-downtime v18 migrations.'
    ],
    prescription: [
      'Step 1: Automated Technographic & Code Security Audit (0 cost).',
      'Step 2: Staging sandbox verification & database migration plan.',
      'Step 3: 24/7 SLA support activation.'
    ]
  },
  CFO: {
    title: 'CFO / Head of Finance',
    focus: 'E-Invoicing Compliance, AP/AR & License Savings',
    leakEst: '$95,000 - $180,000',
    talking_points: [
      'Replacing 4 disconnected SaaS subscriptions with unified operations cuts monthly software spend by 40%.',
      'Automated AP/AR reconciliation eliminates month-end closing delays from 5 days to under 4 hours.',
      'Full ZATCA (GCC) and Making Tax Digital (UK) compliant e-invoicing workflows.'
    ],
    questions: [
      'How many days does your finance team spend on manual invoice reconciliation each month-end?',
      'Are you paying redundant licenses across multiple point solutions like QuickBooks, Salesforce, and inventory tools?'
    ],
    value_propos: [
      'Unified financial ledger with real-time gross margin reporting.',
      'Direct ERP bank feed integration & automated VAT/tax compliance.'
    ],
    prescription: [
      'Step 1: 30-minute financial workflow & SaaS cost audit.',
      'Step 2: Automated billing bridge deployment.',
      'Step 3: Full month-end close automation.'
    ]
  },
  COO: {
    title: 'COO / VP of Operations',
    focus: 'Inventory Variance, Field Job Dispatch & Hand-off Delays',
    leakEst: '$140,000 - $260,000',
    talking_points: [
      'Eliminating manual spreadsheet coordination between sales and field operations.',
      'Real-time multi-warehouse inventory synchronization prevents stockouts and missed delivery SLAs.',
      'Unified customer intake to automated job dispatch in under 60 seconds.'
    ],
    questions: [
      'Where is the biggest operational hand-off delay occurring between receiving an order and fulfilling it?',
      'How do you currently track live job progress and technician dispatch?'
    ],
    value_propos: [
      'End-to-end operational visibility from lead capture to final delivery.',
      'Automated mobile field service dispatch with client live tracking.'
    ],
    prescription: [
      'Step 1: Process map & operational bottleneck identification.',
      'Step 2: Custom field dispatch & stock sync rollout in 14 days.',
      'Step 3: Staff training and go-live.'
    ]
  },
  RevOps: {
    title: 'Head of RevOps / CRM Lead',
    focus: 'HubSpot/Salesforce Disconnect & Lead Leakage',
    leakEst: '$85,000 - $160,000',
    talking_points: [
      'Preventing sales reps from wasting 3 hours daily on manual double-entry between CRM and ERP billing.',
      'Automated WhatsApp and web inquiry routing directly into active sales pipelines.',
      'Accurate pipeline-to-revenue attribution and commission reporting.'
    ],
    questions: [
      'Are your sales reps manually re-entering closed deals into invoicing tools?',
      'How quickly are inbound web leads routed to an active sales rep?'
    ],
    value_propos: [
      'Bi-directional HubSpot/Salesforce to Odoo synchronization.',
      'Automated instant lead enrichment and consultative battlecard prompts.'
    ],
    prescription: [
      'Step 1: Pipeline data flow & lead leakage review.',
      'Step 2: Webhook bridge setup.',
      'Step 3: Automated commission & revenue dashboards.'
    ]
  },
  Founder: {
    title: 'Founder / CEO / Managing Director',
    focus: 'Overhead Drag, Scaling Velocity & Agile Tech Arm',
    leakEst: '$150,000 - $300,000',
    talking_points: [
      'Acting as your agile outsourced CTO & operations tech arm at a fraction of full-time hiring cost.',
      'Modernizing company infrastructure so you can double transaction volume without doubling administrative headcount.',
      'Turnkey 30-day rollouts with zero business downtime guaranteed.'
    ],
    questions: [
      'Is administrative complexity holding back your ability to scale into new markets?',
      'If you could automate your top 3 back-office bottlenecks this month, what would that unlock for growth?'
    ],
    value_propos: [
      'Turnkey operational modernization executed in 30 days.',
      '60% reduction in back-office administrative overhead.'
    ],
    prescription: [
      'Step 1: Executive strategic diagnostic call.',
      'Step 2: Phased agile implementation blueprint.',
      'Step 3: Full execution with guaranteed ROI.'
    ]
  },
  VP_Eng: {
    title: 'VP of Engineering',
    focus: 'Legacy Refactoring & CI/CD Pipelines',
    leakEst: '$110,000 - $220,000',
    talking_points: [
      'Automated testing suites and containerized deployment for custom business applications.',
      'Migrating brittle monolith legacy systems to clean microservices and modern APIs.'
    ],
    questions: [
      'What percentage of your engineering capacity is drained by legacy system maintenance?'
    ],
    value_propos: [
      'High-velocity refactoring sprint delivery with 99.9% uptime SLA.'
    ],
    prescription: [
      'Step 1: Architecture review.',
      'Step 2: Refactoring sprint.',
      'Step 3: Deployment automation.'
    ]
  },
  IT_Director: {
    title: 'IT Director / Infrastructure Lead',
    focus: 'Security, Backups & Hardware Integrations',
    leakEst: '$75,000 - $150,000',
    talking_points: [
      'Automated daily cloud backups, SSL management, and ISO-standard access controls.',
      'Hardware POS integration and IoT device telemetry.'
    ],
    questions: [
      'What is your current disaster recovery RTO/RPO for core business databases?'
    ],
    value_propos: [
      'Enterprise-grade security hardening and cloud database resilience.'
    ],
    prescription: [
      'Step 1: Vulnerability & backup audit.',
      'Step 2: Hardening roadmap.',
      'Step 3: 24/7 monitoring.'
    ]
  },
  Product_Lead: {
    title: 'Product & Automation Lead',
    focus: 'Workflow Automation & Customer Portals',
    leakEst: '$60,000 - $130,000',
    talking_points: [
      'Self-service customer portals for job tracking, invoice download, and instant appointment booking.',
      'No-code n8n workflow bridges connecting all disparate business webhooks.'
    ],
    questions: [
      'Do your customers have a self-service portal, or must they email your staff for basic updates?'
    ],
    value_propos: [
      'Branded client self-service portal delivered in 14 days.'
    ],
    prescription: [
      'Step 1: UX & workflow audit.',
      'Step 2: Portal customization.',
      'Step 3: Customer rollout.'
    ]
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');

  initCallControlIcons();
  await loadCallerLeads(targetId);
  startCallTimer();

  // Header navigation buttons (previously keyboard-only)
  document.getElementById('prevLeadBtn')?.addEventListener('click', () => navigateLead(-1));
  document.getElementById('nextLeadBtn')?.addEventListener('click', () => navigateLead(1));

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); navigateLead(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigateLead(1); }
    if (e.key === ' ') { e.preventDefault(); openOutcomeModal(); }
    if (e.key === 'Enter') { e.preventDefault(); dialActiveLead(); }
    if (e.key === '1') logOutcome('Interested');
    if (e.key === '2') logOutcome('Callback Requested');
    if (e.key === '3') logOutcome('No Answer / Voicemail');
    if (e.key === '4') logOutcome('Not a Fit');
    if (e.key === '5') logOutcome('Do Not Call');
  });

  // Render Initial Objections
  renderObjections();
});

async function loadCallerLeads(targetId = null) {
  try {
    const res = await fetch('/api/leads');
    const data = await res.json();
    callerLeads = data.leads || [];

    if (callerLeads.length === 0) {
      document.getElementById('callCompanyName').textContent = 'No leads available';
      document.getElementById('leadCounter').textContent = 'Lead 0 of 0';
      return;
    }

    if (targetId) {
      const idx = callerLeads.findIndex(l => (l.id === targetId || l._id === targetId));
      currentIndex = idx >= 0 ? idx : 0;
    } else {
      currentIndex = 0;
    }

    renderActiveLead();
  } catch (err) {
    console.error('Failed to load leads:', err);
  }
}

function renderActiveLead() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  document.getElementById('leadCounter').textContent = `Lead ${currentIndex + 1} of ${callerLeads.length}`;
  document.getElementById('callCompanyName').textContent = lead.name || 'Enterprise Prospect';
  document.getElementById('callPhoneNumber').textContent = primaryPhone(lead) || '(555) 382-9912';

  const isRescue = lead.category === 'BPO_RESCUE';
  const catBadge = document.getElementById('callCategoryBadge');
  catBadge.textContent = isRescue ? 'ODOO BPO / RESCUE' : 'NEW IMPLEMENTATION';
  catBadge.className = isRescue ? 'badge badge-rescue' : 'badge badge-new';

  const score = lead.success_chance_pct || 85;
  document.getElementById('callScorePill').textContent = `${score}% Propensity Fit`;

  // Update Radial Gauge Meter (Slide 3)
  const vulnerabilityScore = Math.min(95, Math.max(45, score + 5));
  document.getElementById('gaugePercentText').textContent = `${vulnerabilityScore}%`;
  const dashOffset = Math.round(471 - (471 * vulnerabilityScore) / 100);
  document.getElementById('gaugeProgressCircle').style.strokeDashoffset = dashOffset;
  
  const riskLabel = document.getElementById('gaugeRiskLabel');
  if (vulnerabilityScore >= 80) {
    riskLabel.textContent = 'High Risk';
    riskLabel.style.color = '#fb7185';
  } else {
    riskLabel.textContent = 'Moderate Risk';
    riskLabel.style.color = '#fbbf24';
  }

  // Surface essential contact info + top-3 decision makers on top
  renderContactBlock(lead);

  // Grounded intelligence: reviews → Odoo mapping + verified contacts
  renderGroundedAnalysis(lead);

  // Render Battlecard Script Content + company-aware objections
  renderScriptContent();
  renderObjections();
}

// Render the persisted Gemini grounded analysis (or an idle prompt) for a lead.
function renderGroundedAnalysis(lead) {
  const box = document.getElementById('groundedBox');
  if (!box) return;

  const a = lead.grounded_analysis;
  const btn = document.getElementById('groundedRunBtn');
  if (btn && !btn.disabled) btn.textContent = a ? 'Re-run Analysis' : 'Run Gemini Analysis';
  if (!a) {
    box.innerHTML = `<div class="ga-idle">No analysis yet. Click <strong>Run Gemini Analysis</strong> to generate a company profile, an analysis of the lowest-rating reviews with sample snippets, and the Odoo modules to sell.</div>`;
    return;
  }

  const linkChip = (href, label) => href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener" class="ga-chip">${label}</a>` : '';

  const person = (p, roleFallback) => p && p.name ? `
    <div class="ga-person">
      <div class="ga-person-name">${esc(p.name)} <span class="ga-person-title">${esc(p.title || roleFallback || '')}</span></div>
      <div class="ga-person-links">
        ${p.email ? linkChip('mailto:' + p.email, esc(p.email)) : ''}
        ${p.linkedin ? linkChip(p.linkedin, p.linkedin_is_search ? 'Find on LinkedIn' : 'LinkedIn') : ''}
      </div>
    </div>` : '';

  const ra = a.review_analysis || {};
  const problems = (ra.recurring_problems || []);
  const snippets = (ra.snippets || []);
  const mapping = (a.odoo_mapping || []);
  const matrix = a.problem_matrix || null;
  const hasContacts = (a.ceo && a.ceo.name) || (a.decision_makers || []).some(d => d && d.name);

  const matrixRows = (matrix && matrix.rows || []).filter(r => r.count > 0);
  const matrixHtml = matrixRows.length ? `
    <div class="ga-section-label">Problem × Odoo Matrix · ${matrix.total_bad_reviews} bad reviews</div>
    <table class="ga-matrix">
      <thead><tr><th>Problem</th><th>Reviews</th><th>Share</th><th>Odoo module</th></tr></thead>
      <tbody>
        ${matrixRows.map((r, i) => `
          <tr class="${i === 0 ? 'ga-matrix-top' : ''}">
            <td>${esc(r.problem)}</td>
            <td class="ga-matrix-num">${r.count}</td>
            <td class="ga-matrix-num">${r.share_pct}%</td>
            <td class="ga-matrix-mod">${esc(r.odoo_module || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${matrixRows[0] && matrixRows[0].odoo_module ? `<div class="ga-lead-pitch">Lead with <strong>${esc(matrixRows[0].odoo_module)}</strong> — it fixes the #1 complaint (${matrixRows[0].share_pct}% of bad reviews).</div>` : ''}
  ` : '';

  box.innerHTML = `
    ${a.company_profile ? `
      <div class="ga-section-label">Company Profile</div>
      <div class="ga-text">${esc(a.company_profile)}</div>` : ''}

    ${hasContacts ? `
      <div class="ga-section-label">Leadership (AI — verify)</div>
      ${person(a.ceo, 'CEO')}
      ${(a.decision_makers || []).map(dm => person(dm)).join('')}` : ''}

    ${matrixHtml}

    <div class="ga-section-label">Lowest-Rating Review Analysis${ra.reviews_analysed ? ` · ${ra.reviews_analysed} real reviews` : ''}</div>
    ${ra.overall ? `<div class="ga-text">${esc(ra.overall)}</div>` : ''}
    ${problems.length ? problems.map(p => `
      <div class="ga-problem">
        <div class="ga-problem-head">${esc(p.problem)}</div>
        ${p.evidence ? `<div class="ga-evidence">${esc(p.evidence)}</div>` : ''}
      </div>`).join('') : '<div class="ga-empty">No recurring complaints identified.</div>'}

    ${snippets.length ? `
      <div class="ga-section-label">Sample Bad-Review Snippets</div>
      ${snippets.map(s => `
        <div class="ga-snippet">
          <span class="ga-snippet-star">${s.stars ? esc(s.stars) + '★' : ''}</span>
          <span class="ga-snippet-text">“${esc((s.text || '').slice(0, 240))}”</span>
        </div>`).join('')}` : ''}

    <div class="ga-section-label">Odoo Modules to Sell</div>
    ${mapping.length ? mapping.map(m => `
      <div class="ga-map">
        <div class="ga-map-top"><span class="ga-map-problem">${esc(m.problem)}</span><span class="ga-map-arrow">→</span><span class="ga-map-module">${esc(m.odoo_module)}</span></div>
        ${m.pitch ? `<div class="ga-map-pitch">${esc(m.pitch)}</div>` : ''}
      </div>`).join('') : '<div class="ga-empty">No Odoo mapping produced.</div>'}

    <div class="ga-generated">AI briefing via Gemini · ${a.generated_at ? new Date(a.generated_at).toLocaleString() : ''}</div>
  `;
}

// Trigger a Gemini analysis for the active lead.
async function runGroundedAnalysis() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const btn = document.getElementById('groundedRunBtn');
  const box = document.getElementById('groundedBox');
  btn.disabled = true;
  btn.textContent = 'Working…';
  if (box) box.innerHTML = '<div class="ga-loading"><span class="ga-spinner"></span> Scraping the lowest-rating Google reviews, then Gemini analyses them &amp; maps to Odoo modules… (this can take ~30s)</div>';

  try {
    const res = await fetch(`/api/leads/${lead.id || lead._id}/grounded-analysis`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');
    if (data.gemini_failed) {
      // Gemini unavailable, but we scraped the reviews — show them, don't dead-end.
      if (box) box.innerHTML = reviewsFallbackHtml(data.reviews || [], data.error, data.reviews_count);
      return;
    }
    Object.assign(lead, data.lead || {});
    lead.grounded_analysis = data.analysis;
    renderGroundedAnalysis(lead);
    renderScriptContent(); // talking points now reflect the analysed company data
    renderObjections();    // objections now reflect current ERP + top complaint
  } catch (err) {
    if (box) box.innerHTML = `<div class="ga-error">Analysis failed: ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = lead.grounded_analysis ? 'Re-run Analysis' : 'Run Gemini Analysis';
  }
}

// When Gemini is unavailable, show the scraped bad reviews + the reason (no dead-end).
function reviewsFallbackHtml(reviews, errorMsg, count) {
  const isQuota = /429|quota/i.test(errorMsg || '');
  const rows = (reviews || []).slice(0, 12).map(r => `
    <div class="ga-snippet">
      <span class="ga-snippet-star">${r.rating ? esc(r.rating) + '★' : ''}</span>
      <span class="ga-snippet-text">“${esc((r.text || '').slice(0, 200))}”</span>
    </div>`).join('');
  return `
    <div class="ga-error" style="margin-bottom:0.5rem;">
      ${isQuota ? 'Gemini quota reached' : 'Gemini analysis unavailable'} — ${esc(errorMsg || 'unknown error')}
    </div>
    <div class="ga-section-label">Scraped ${count != null ? count : reviews.length} bad (1–2★) reviews (saved)</div>
    <div class="ga-text" style="margin-bottom:0.5rem;">The reviews were captured and stored. Click <strong>Re-run</strong> once quota resets — the scrape won't repeat.</div>
    ${rows || '<div class="ga-empty">No reviews captured for this business.</div>'}
  `;
}

function selectPersona(personaKey) {
  activePersona = personaKey;
  
  // Update Tab Styling
  document.querySelectorAll('.persona-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.persona === personaKey);
  });

  document.getElementById('activePersonaBadge').textContent = `Target: ${personaKey}`;
  
  renderScriptContent();
}

function switchScriptTab(tabKey) {
  activeScriptTab = tabKey;
  
  document.querySelectorAll('.script-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (tabKey === 'talking_points') document.getElementById('tabTalkingPoints')?.classList.add('active');
  if (tabKey === 'questions') document.getElementById('tabQuestions')?.classList.add('active');
  if (tabKey === 'value_propos') document.getElementById('tabValuePropos')?.classList.add('active');
  if (tabKey === 'prescription') document.getElementById('tabPrescription')?.classList.add('active');

  renderScriptContent();
}

// Build company-specific script items from the grounded analysis (matrix + Odoo
// mapping + review analysis). Returns [] when no analysis has been run.
function companyScriptItems(lead, tab) {
  const a = lead.grounded_analysis;
  if (!a) return [];
  const rows = ((a.problem_matrix && a.problem_matrix.rows) || []).filter(r => r.count > 0);
  const mapping = a.odoo_mapping || [];
  const ra = a.review_analysis || {};
  const problems = rows.length ? rows : (ra.recurring_problems || []).map(p => ({ problem: p.problem }));
  const out = [];

  if (tab === 'talking_points') {
    if (a.company_profile) out.push(`<span style="color:#93c5fd;">${esc(a.company_profile)}</span>`);
    rows.slice(0, 4).forEach(r =>
      out.push(`<strong style="color:#fca5a5;">${r.share_pct}% of bad reviews</strong> cite <strong>${esc(r.problem)}</strong> → position Odoo <strong style="color:#34d399;">${esc(r.odoo_module || '—')}</strong>.`));
    if (!rows.length && ra.overall) out.push(esc(ra.overall));
  } else if (tab === 'questions') {
    problems.slice(0, 4).forEach(r =>
      out.push(`Your customers repeatedly mention <strong>${esc(r.problem)}</strong> — how are you handling that today?`));
  } else if (tab === 'value_propos') {
    mapping.slice(0, 5).forEach(m =>
      out.push(`<strong style="color:#34d399;">${esc(m.odoo_module)}</strong>: ${esc(m.pitch || '')}`));
  } else if (tab === 'prescription') {
    (rows.length ? rows : mapping).slice(0, 5).forEach((r, i) =>
      out.push(`Step ${i + 1}: Deploy Odoo <strong style="color:#34d399;">${esc(r.odoo_module || '—')}</strong> to fix <strong>${esc(r.problem || '')}</strong>${r.share_pct ? ` (${r.share_pct}% of complaints)` : ''}.`));
  }
  return out;
}

function renderScriptContent() {
  const container = document.getElementById('scriptContentBox');
  if (!container) return;

  const lead = callerLeads[currentIndex] || {};
  const playbook = PERSONA_PLAYBOOKS[activePersona] || PERSONA_PLAYBOOKS.CTO;
  const personaItems = playbook[activeScriptTab] || playbook.talking_points;
  const companyItems = companyScriptItems(lead, activeScriptTab);
  const a = lead.grounded_analysis;

  let headerHtml = `
    <div style="font-weight: 800; color: #3b82f6; margin-bottom: 0.5rem; font-size: 0.85rem;">
      ${playbook.title} — ${playbook.focus}
    </div>
  `;

  if (activeScriptTab === 'talking_points' && lead.battlecard?.elevator_opener) {
    headerHtml += `
      <div style="background: rgba(59, 130, 246, 0.08); border-left: 3px solid #3b82f6; padding: 0.6rem; border-radius: 4px; margin-bottom: 0.75rem; font-style: italic; color: #f1f5f9;">
        "${esc(lead.battlecard.elevator_opener)}"
      </div>
    `;
  }

  const nodes = (items, color) => items.map(item => `
    <div class="script-timeline-item">
      <div class="script-timeline-node"${color ? ` style="background:${color}"` : ''}></div>
      <div>${item}</div>
    </div>
  `).join('');

  let body = '';
  if (companyItems.length) {
    const reviewCount = (a.problem_matrix && a.problem_matrix.total_bad_reviews) || a.reviews_scraped || '';
    body += `<div class="script-section-label" style="color:#34d399;">Tailored to ${esc(lead.name || 'this lead')}${reviewCount ? ` — from ${reviewCount} analyzed reviews` : ''}</div>`;
    body += nodes(companyItems, '#34d399');
    body += `<div class="script-section-label" style="color:#60a5fa; margin-top:0.6rem;">${esc(activePersona)} persona angle</div>`;
    body += nodes(personaItems, '#3b82f6');
  } else {
    body += nodes(personaItems, '#3b82f6');
  }

  container.innerHTML = headerHtml + body;
}

// Company-specific objections derived from the analysis / current tech stack.
function companyObjections(lead) {
  const a = lead.grounded_analysis;
  const out = [];
  const erpList = (a && a.current_erp) || (lead.warm_intel && lead.warm_intel.current_erp) || lead.tech_stack || [];
  const erp = Array.isArray(erpList) ? erpList[0] : erpList;
  if (erp) {
    out.push({
      id: 'erp_current', title: `Using ${erp}`, num: '★', company: true,
      quote: `"We already use ${erp} and it works for us."`,
      rebuttal: `"${erp} is solid for its niche, but it doesn't unify ${esc(lead.industry || 'your operations')} end-to-end. Odoo bridges into ${erp} without ripping it out, killing the double-entry between systems."`
    });
  }
  const top = a && a.problem_matrix && (a.problem_matrix.rows || []).filter(r => r.count > 0)[0];
  if (top) {
    out.push({
      id: 'reviews_downplay', title: 'Reviews Not a Concern', num: '★', company: true,
      quote: `"Our reviews aren't really a problem."`,
      rebuttal: `"${top.share_pct}% of your recent 1–2★ reviews specifically cite ${esc((top.problem || '').toLowerCase())} — Odoo ${esc(top.odoo_module || '')} is built to fix exactly that."`
    });
  }
  return out;
}

const GENERIC_OBJECTIONS = [
  { id: 'budget', title: 'Budget Constraints', num: '1', quote: '"We don\'t have budget for big IT software projects right now."', rebuttal: '"Our solution typically consolidates 3–4 separate tool subscriptions, paying for itself in under 60 days from admin labor savings alone."' },
  { id: 'timing', title: 'Timing & Bandwidth', num: '2', quote: '"We\'re too busy to change software or migrate data right now."', rebuttal: '"That\'s exactly why our turnkey rollout handles 100% of data migration and staging in the background with zero day-to-day downtime."' },
  { id: 'competitor', title: 'In-House / Existing Partner', num: '3', quote: '"We already have an IT guy / agency handling this."', rebuttal: '"We don\'t replace your team — we provide 24/7 SLA infrastructure support and turnkey modules at half of agency hourly rates."' },
  { id: 'current_tool', title: 'QuickBooks / Happy As-Is', num: '4', quote: '"We use QuickBooks & Excel and it works fine for us."', rebuttal: '"QuickBooks is great for accounting, but it creates manual double-entry for live field jobs and dispatch. We bridge directly into QuickBooks seamlessly."' }
];

function renderObjections() {
  const container = document.getElementById('objectionStack');
  if (!container) return;
  const lead = callerLeads[currentIndex] || {};
  const tallies = lead.objection_tallies || {};
  const objections = [...companyObjections(lead), ...GENERIC_OBJECTIONS];

  container.innerHTML = objections.map(obj => `
    <div class="objection-card"${obj.company ? ' style="border-left:2px solid #34d399;"' : ''}>
      <div class="objection-header">
        <div class="objection-title">
          <span>${obj.title}</span>
          <span style="font-size: 0.68rem; color: ${obj.company ? '#34d399' : '#6366f1'};">[${obj.num}]</span>
        </div>
        <div class="objection-tally-pill" onclick="incrementTally('${obj.id}')" title="Click to log occurrence (saved)">
          Tally: <span id="tally_${obj.id}">${tallies[obj.id] || 0}</span>
        </div>
      </div>
      <div class="objection-quote">${obj.quote}</div>
      <div class="objection-rebuttal">${obj.rebuttal}</div>
    </div>
  `).join('');
}

function incrementTally(id) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  lead.objection_tallies = lead.objection_tallies || {};
  lead.objection_tallies[id] = (lead.objection_tallies[id] || 0) + 1;
  const el = document.getElementById(`tally_${id}`);
  if (el) el.textContent = lead.objection_tallies[id];
  // Persist (debounced so rapid clicks batch into one save)
  clearTimeout(_tallySaveTimer);
  _tallySaveTimer = setTimeout(() => {
    fetch(`/api/leads/${lead.id || lead._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objection_tallies: lead.objection_tallies })
    }).catch(err => console.error('Failed to save tally:', err));
  }, 600);
}

function navigateLead(dir) {
  if (callerLeads.length === 0) return;
  currentIndex += dir;
  if (currentIndex < 0) currentIndex = callerLeads.length - 1;
  if (currentIndex >= callerLeads.length) currentIndex = 0;
  renderActiveLead();
}

function dialActiveLead() {
  const lead = callerLeads[currentIndex];
  const number = lead ? primaryPhone(lead) : '';
  if (!number) {
    alert('No direct phone number found for this lead.');
    return;
  }
  window.location.href = `tel:${number.replace(/[^0-9+]/g, '')}`;
}

function openOutcomeModal() {
  document.getElementById('outcomeModal').style.display = 'flex';
}
function closeOutcomeModal() {
  document.getElementById('outcomeModal').style.display = 'none';
}

async function logOutcome(outcome) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const noteEl = document.getElementById('outcomeNote');
  const followEl = document.getElementById('outcomeFollowUp');
  const notes = noteEl ? noteEl.value.trim() : '';
  const follow_up_date = followEl && followEl.value ? followEl.value : null;

  closeOutcomeModal();
  try {
    const res = await fetch(`/api/leads/${lead.id || lead._id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: outcome, notes, follow_up_date })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.lead) {
      lead.call_status = data.lead.call_status;
      lead.notes = data.lead.notes;
      lead.follow_up_date = data.lead.follow_up_date;
    } else {
      lead.call_status = outcome; // optimistic fallback
    }
  } catch (err) {
    console.error('Failed to log status:', err);
    lead.call_status = outcome;
  } finally {
    if (noteEl) noteEl.value = '';
    if (followEl) followEl.value = '';
    navigateLead(1);
  }
}

// Call Stopwatch Timer
function tickCallTimer() {
  callSeconds++;
  const mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
  const secs = (callSeconds % 60).toString().padStart(2, '0');
  const el = document.getElementById('callDurationTimer');
  if (el) el.textContent = `${mins}:${secs}`;
}

// Resume ticking without resetting the elapsed time (used by the Hold button)
function resumeCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = setInterval(tickCallTimer, 1000);
}

// Start a fresh call: clears any Hold state and runs the stopwatch
function startCallTimer() {
  isOnHold = false;
  const hb = document.getElementById('holdBtn');
  if (hb) { hb.classList.remove('active'); hb.innerHTML = ICONS.pause; hb.title = 'Hold Call'; }
  resumeCallTimer();
}

// ── Multiple phone numbers (edit modal) ──────────────────────────────────────
function phoneRowHtml(label, number) {
  return `<div class="edit-phone-row">
      <input type="text" class="form-control" data-phone="label" placeholder="Label (Main, Store, Mobile…)" value="${esc(label || '')}">
      <input type="text" class="form-control" data-phone="number" placeholder="Phone number" value="${esc(number || '')}">
      <button type="button" class="edit-row-del" onclick="this.closest('.edit-phone-row').remove()" title="Remove number">✕</button>
    </div>`;
}
function addPhoneRow(label = '', number = '') {
  const c = document.getElementById('editPhonesContainer');
  if (c) c.insertAdjacentHTML('beforeend', phoneRowHtml(label, number));
}

// ── Add Person modal (quick decision-maker capture) ──────────────────────────
function openAddPersonModal() {
  ['addPersonName', 'addPersonTitle', 'addPersonLinkedin', 'addPersonPhone', 'addPersonEmail']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const m = document.getElementById('addPersonModal');
  if (m) m.style.display = 'flex';
}
function closeAddPersonModal() {
  const m = document.getElementById('addPersonModal');
  if (m) m.style.display = 'none';
}
async function saveNewPerson(e) {
  e.preventDefault();
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const name = v('addPersonName');
  if (!name) { alert('Name is required.'); return; }
  const person = {
    name,
    title: v('addPersonTitle') || 'Decision Maker',
    cell: v('addPersonPhone') || null,
    email_guess: v('addPersonEmail') || null,
    linkedin_url: v('addPersonLinkedin') || null,
    source: 'manual', verified: true
  };
  const updated = [...(lead.decision_makers || []), person];
  const btn = document.getElementById('addPersonSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const res = await fetch(`/api/leads/${lead.id || lead._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision_makers: updated })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    // Trust the persisted record; only then reflect it in memory + UI.
    if (data.lead) Object.assign(lead, data.lead); else lead.decision_makers = updated;
    closeAddPersonModal();
    renderActiveLead();
  } catch (err) {
    alert('NOT saved — server error: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Person'; }
  }
}

// ── Human-editable Grounded Analysis ─────────────────────────────────────────
// Pull the latest lead record from the server (Clay sync writes to Mongo → we read it).
function pullFromClay() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const btn = document.getElementById('gaClayPullBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Pulling…'; }
  fetch(`/api/leads/${lead.id || lead._id}`)
    .then(r => r.json())
    .then(data => {
      const fresh = (data && data.lead) || data;
      if (fresh && (fresh.id || fresh._id)) { Object.assign(lead, fresh); renderActiveLead(); }
      if (btn) { btn.textContent = 'Pulled ✓'; setTimeout(() => { btn.textContent = 'Pull from Clay'; btn.disabled = false; }, 1400); }
    })
    .catch(err => {
      alert('Pull failed: ' + err.message);
      if (btn) { btn.textContent = 'Pull from Clay'; btn.disabled = false; }
    });
}

// Dispatch this lead to the Clay waterfall (async; results return via /api/leads/sync).
function runAnalysisClayEnrich() {
  pushCallerLeadToClay();
}

// Turn the analysis panel into an editable form (human data entry, not just AI).
function openAnalysisEditor() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const a = lead.grounded_analysis || {};
  const ra = a.review_analysis || {};
  const probs = ra.recurring_problems || [];
  const maps = a.odoo_mapping || [];
  const snips = ra.snippets || [];
  const box = document.getElementById('groundedBox');
  if (!box) return;

  const probRow = (p = {}) => `
    <div class="ga-edit-row" data-ga="problem">
      <input class="form-control" data-k="problem" placeholder="Problem" value="${esc(p.problem || '')}">
      <input class="form-control" data-k="keywords" placeholder="Keywords for matrix (comma-separated)" value="${esc((p.keywords || []).join(', '))}">
      <textarea class="form-control" data-k="evidence" rows="2" placeholder="Evidence / quote">${esc(p.evidence || '')}</textarea>
      <button type="button" class="ga-row-del" onclick="this.closest('.ga-edit-row').remove()" title="Remove">✕</button>
    </div>`;
  const mapRow = (m = {}) => `
    <div class="ga-edit-row" data-ga="mapping">
      <input class="form-control" data-k="problem" placeholder="Problem" value="${esc(m.problem || '')}">
      <input class="form-control" data-k="odoo_module" placeholder="Odoo module" value="${esc(m.odoo_module || '')}">
      <textarea class="form-control" data-k="pitch" rows="2" placeholder="Pitch">${esc(m.pitch || '')}</textarea>
      <button type="button" class="ga-row-del" onclick="this.closest('.ga-edit-row').remove()" title="Remove">✕</button>
    </div>`;
  const snipRow = (s = {}) => `
    <div class="ga-edit-row ga-edit-row-snippet" data-ga="snippet">
      <input class="form-control ga-star-input" data-k="stars" placeholder="★" value="${esc(s.stars || '')}">
      <textarea class="form-control" data-k="text" rows="2" placeholder="Review snippet">${esc(s.text || '')}</textarea>
      <button type="button" class="ga-row-del" onclick="this.closest('.ga-edit-row').remove()" title="Remove">✕</button>
    </div>`;

  box.innerHTML = `
    <div class="ga-editor">
      <div class="ga-editor-hint">Human data entry — edit or add anything below, then Save. The Problem × Odoo matrix, talking points and objections recompute from what you enter.</div>

      <div class="ga-section-label">Company Profile</div>
      <textarea id="gaCompanyProfile" class="form-control" rows="3" placeholder="What the company does, size, positioning…">${esc(a.company_profile || '')}</textarea>

      <div class="ga-section-label">Overall Review Summary</div>
      <textarea id="gaOverall" class="form-control" rows="3" placeholder="Summary of the lowest-rating reviews…">${esc(ra.overall || '')}</textarea>

      <div class="ga-section-label ga-editor-head"><span>Recurring Problems</span><button type="button" class="btn btn-secondary btn-sm" onclick="gaAddRow('problem')">+ Add</button></div>
      <div id="gaProblems">${(probs.length ? probs.map(probRow).join('') : probRow())}</div>

      <div class="ga-section-label ga-editor-head"><span>Odoo Mapping</span><button type="button" class="btn btn-secondary btn-sm" onclick="gaAddRow('mapping')">+ Add</button></div>
      <div id="gaMappings">${(maps.length ? maps.map(mapRow).join('') : mapRow())}</div>

      <div class="ga-section-label ga-editor-head"><span>Bad-Review Snippets</span><button type="button" class="btn btn-secondary btn-sm" onclick="gaAddRow('snippet')">+ Add</button></div>
      <div id="gaSnippets">${snips.map(snipRow).join('')}</div>

      <div class="ga-editor-actions">
        <button type="button" class="btn btn-secondary btn-sm" onclick="renderGroundedAnalysis(callerLeads[currentIndex])">Cancel</button>
        <button type="button" id="gaSaveBtn" class="btn btn-primary btn-sm" onclick="saveAnalysis()">Save Analysis</button>
      </div>
    </div>`;
  box._gaTemplates = { problem: probRow, mapping: mapRow, snippet: snipRow };
}

function gaAddRow(kind) {
  const box = document.getElementById('groundedBox');
  const contId = { problem: 'gaProblems', mapping: 'gaMappings', snippet: 'gaSnippets' }[kind];
  const cont = document.getElementById(contId);
  if (cont && box && box._gaTemplates) cont.insertAdjacentHTML('beforeend', box._gaTemplates[kind]());
}

async function saveAnalysis() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const gv = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const collect = (contId, keys) => {
    const out = [];
    document.querySelectorAll(`#${contId} .ga-edit-row`).forEach(row => {
      const obj = {};
      keys.forEach(k => { const el = row.querySelector(`[data-k="${k}"]`); obj[k] = el ? el.value.trim() : ''; });
      out.push(obj);
    });
    return out;
  };
  const problems = collect('gaProblems', ['problem', 'keywords', 'evidence'])
    .filter(p => p.problem)
    .map(p => ({ problem: p.problem, keywords: p.keywords ? p.keywords.split(',').map(s => s.trim()).filter(Boolean) : [], evidence: p.evidence }));
  const mapping = collect('gaMappings', ['problem', 'odoo_module', 'pitch']).filter(m => m.problem || m.odoo_module);
  const snippets = collect('gaSnippets', ['stars', 'text']).filter(s => s.text).map(s => ({ stars: s.stars, text: s.text }));

  const base = lead.grounded_analysis || {};
  const analysis = {
    ...base,
    company_profile: gv('gaCompanyProfile'),
    review_analysis: { ...(base.review_analysis || {}), overall: gv('gaOverall'), recurring_problems: problems, snippets },
    odoo_mapping: mapping,
    edited_by_human: true
  };

  const btn = document.getElementById('gaSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const res = await fetch(`/api/leads/${lead.id || lead._id}/analysis`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.lead) Object.assign(lead, data.lead);
    lead.grounded_analysis = data.analysis || analysis;
    renderGroundedAnalysis(lead);
    renderScriptContent(); // talking points reflect the edited analysis
    renderObjections();    // objections reflect the edited top complaint
  } catch (err) {
    alert('NOT saved — server error: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Save Analysis'; }
  }
}

// Edit Lead Modal
function openEditModal() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('editLeadName', lead.name);
  set('editLeadWebsite', cleanWebsite(lead.website));
  set('editLeadEmail', lead.email);
  set('editLeadLinkedin', lead.linkedin);
  set('editLeadOpener', lead.battlecard && lead.battlecard.elevator_opener);
  // Company details — all pre-filled from whatever data exists
  set('editLeadIndustry', lead.industry);
  set('editLeadEmployees', lead.employee_size);
  set('editLeadScore', lead.success_chance_pct);
  set('editLeadAddress', lead.address);
  set('editLeadCategory', lead.category || 'NEW_IMPLEMENTATION');
  set('editLeadCallStatus', lead.call_status || 'Uncalled');
  set('editLeadFollowUp', lead.follow_up_date ? String(lead.follow_up_date).slice(0, 10) : '');
  set('editLeadTech', Array.isArray(lead.tech_stack) ? lead.tech_stack.join(', ') : (lead.tech_stack || ''));
  set('editLeadNotes', lead.notes);

  // Build editable phone rows (one per business number; at least one blank row)
  const phones = getLeadPhones(lead);
  const pc = document.getElementById('editPhonesContainer');
  if (pc) {
    pc.innerHTML = '';
    if (phones.length) phones.forEach(p => addPhoneRow(p.label, p.number));
    else addPhoneRow('Main', '');
  }

  // Build editable rows for ALL decision makers (at least one blank row)
  const dms = lead.decision_makers || [];
  const container = document.getElementById('editDmContainer');
  let rows = '';
  const dmCount = Math.max(dms.length, 1);
  for (let i = 0; i < dmCount; i++) {
    const dm = dms[i] || {};
    rows += `
      <div class="edit-dm-row" data-dm-index="${i}">
        <div class="edit-dm-row-head">Decision Maker ${i + 1}</div>
        <div class="edit-dm-grid">
          <input type="text" class="form-control" data-dm="name" placeholder="Full name" value="${esc(dm.name || '')}">
          <input type="text" class="form-control" data-dm="title" placeholder="Title (e.g. CEO, COO, Founder)" value="${esc(dm.title || '')}">
          <input type="text" class="form-control" data-dm="cell" placeholder="Direct cell / mobile" value="${esc(dm.cell || '')}">
          <input type="text" class="form-control" data-dm="email_guess" placeholder="Email" value="${esc(dm.email_guess || '')}">
          <input type="text" class="form-control" data-dm="linkedin_url" placeholder="LinkedIn URL" value="${esc(dm.linkedin_url || '')}" style="grid-column: 1 / -1;">
        </div>
      </div>`;
  }
  container.innerHTML = rows;

  document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}
async function saveEditedLead(e) {
  e.preventDefault();
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  lead.name = val('editLeadName');
  // Collect all business phone numbers; the first is the primary (kept in lead.phone).
  const phones = [];
  document.querySelectorAll('#editPhonesContainer .edit-phone-row').forEach(row => {
    const number = row.querySelector('[data-phone="number"]').value.trim();
    if (!number) return;
    const label = row.querySelector('[data-phone="label"]').value.trim() || 'Main';
    phones.push({ label, number });
  });
  lead.phones = phones;
  lead.phone = phones.length ? phones[0].number : '';
  lead.website = cleanWebsite(val('editLeadWebsite'));
  lead.email = val('editLeadEmail');
  lead.linkedin = val('editLeadLinkedin');
  lead.industry = val('editLeadIndustry');
  lead.employee_size = val('editLeadEmployees');
  const scoreRaw = val('editLeadScore');
  if (scoreRaw !== '') lead.success_chance_pct = Math.max(0, Math.min(100, parseInt(scoreRaw, 10) || 0));
  lead.address = val('editLeadAddress');
  lead.category = val('editLeadCategory') || lead.category;
  lead.follow_up_date = val('editLeadFollowUp') || null;
  lead.tech_stack = val('editLeadTech') ? val('editLeadTech').split(',').map(s => s.trim()).filter(Boolean) : [];
  lead.notes = document.getElementById('editLeadNotes').value; // full editable notes/history
  if (!lead.battlecard) lead.battlecard = {};
  lead.battlecard.elevator_opener = document.getElementById('editLeadOpener').value;

  // Merge decision-maker edits, preserving any existing extra fields (persona, etc.)
  const existing = lead.decision_makers || [];
  const merged = [];
  document.querySelectorAll('#editDmContainer .edit-dm-row').forEach((row, i) => {
    const get = (k) => row.querySelector(`[data-dm="${k}"]`).value.trim();
    const name = get('name');
    if (!name) return; // skip empty slots
    merged.push({
      ...(existing[i] || {}),
      name,
      title: get('title'),
      cell: get('cell'),
      email_guess: get('email_guess'),
      linkedin_url: get('linkedin_url')
    });
  });
  // Rows now cover every decision maker (dynamic), so the merged list is complete.
  lead.decision_makers = merged;

  const saveBtn = document.getElementById('editSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  try {
    const res = await fetch(`/api/leads/${lead.id || lead._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: lead.name, phone: lead.phone, phones: lead.phones, website: lead.website,
        email: lead.email, linkedin: lead.linkedin,
        industry: lead.industry, employee_size: lead.employee_size,
        success_chance_pct: lead.success_chance_pct, address: lead.address,
        category: lead.category, follow_up_date: lead.follow_up_date,
        tech_stack: lead.tech_stack, notes: lead.notes,
        battlecard: lead.battlecard, decision_makers: lead.decision_makers
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.lead) Object.assign(lead, data.lead); // trust the persisted record
    closeEditModal();
    renderActiveLead();
  } catch (err) {
    console.error('Failed to persist lead edits:', err);
    // Do NOT close the modal or claim success — the edit is not saved.
    alert('NOT saved — server error: ' + err.message + '\nYour edits are still in the form; try again.');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
  }
}

async function saveQuickNote() {
  const input = document.getElementById('callerQuickNoteInput');
  const lead = callerLeads[currentIndex];
  if (!input || !input.value.trim() || !lead) return;
  const text = input.value.trim();
  const btn = document.querySelector('[onclick="saveQuickNote()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const res = await fetch(`/api/leads/${lead.id || lead._id}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    lead.notes = (data.lead && data.lead.notes) || lead.notes; // keep memory in sync
    input.value = '';
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => { btn.textContent = 'Send'; btn.disabled = false; }, 1200); }
  } catch (err) {
    if (btn) { btn.textContent = 'Send'; btn.disabled = false; }
    alert('Failed to save note: ' + err.message);
  }
}

let isMuted = false;
let isOnHold = false;

// Monochrome inline SVG icons for the call-control buttons (corporate, no emoji)
const ICONS = {
  mic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
  micMuted: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>'
};

function initCallControlIcons() {
  const mute = document.getElementById('muteBtn');
  const hold = document.getElementById('holdBtn');
  if (mute) mute.innerHTML = isMuted ? ICONS.micMuted : ICONS.mic;
  if (hold) hold.innerHTML = isOnHold ? ICONS.play : ICONS.pause;
}

function toggleMute() {
  const btn = document.getElementById('muteBtn');
  if (!btn) return;
  isMuted = !isMuted;
  btn.classList.toggle('active', isMuted);
  btn.innerHTML = isMuted ? ICONS.micMuted : ICONS.mic;
  btn.title = isMuted ? 'Unmute Audio' : 'Mute Audio';
}

function toggleHold() {
  const btn = document.getElementById('holdBtn');
  if (!btn) return;
  isOnHold = !isOnHold;
  btn.classList.toggle('active', isOnHold);

  if (isOnHold) {
    // Pause the call: stop the running stopwatch
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    btn.innerHTML = ICONS.play;
    btn.title = 'Resume Call';
  } else {
    resumeCallTimer();
    btn.innerHTML = ICONS.pause;
    btn.title = 'Hold Call';
  }
}
function openTransferModal() {
  alert('Transfer feature: select SDR or Account Executive queue.');
}

// Shared helper: hit a per-lead POST endpoint, merge the persisted lead back, re-render.
async function callLeadAction(endpoint, btnId, labels, onDone, body) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const btn = document.getElementById(btnId);
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = labels.busy; }
  try {
    const opts = { method: 'POST' };
    if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
    const res = await fetch(`/api/leads/${lead.id || lead._id}/${endpoint}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.lead) { Object.assign(lead, data.lead); renderActiveLead(); }
    if (onDone) onDone(data);
    if (btn) { btn.textContent = labels.done; setTimeout(() => { btn.textContent = original || labels.idle; }, 1400); }
  } catch (err) {
    alert(`${labels.name} failed: ${err.message}`);
    if (btn) btn.textContent = original || labels.idle;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Render a dismissible results panel below the contact strip.
function showActionResult(title, bodyHtml) {
  const box = document.getElementById('actionResult');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = `
    <div class="action-result">
      <div class="action-result-head">
        <span>${esc(title)}</span>
        <button class="action-result-close" onclick="document.getElementById('actionResult').style.display='none'">✕</button>
      </div>
      <div class="action-result-body">${bodyHtml}</div>
    </div>`;
}

async function runCallerLiveAudit() {
  await callLeadAction('live-audit', 'callerLiveAuditBtn',
    { name: 'Live audit', busy: 'Auditing…', done: 'Audited ✓', idle: 'Live Audit' },
    (data) => {
      const findings = data.new_findings || [];
      const sevColor = { critical: '#fb7185', high: '#fbbf24', medium: '#60a5fa', low: '#94a3b8', info: '#34d399' };
      const rows = findings.length
        ? findings.map(f => `<div class="ar-line"><span class="ar-dot" style="background:${sevColor[f.severity] || '#94a3b8'}"></span><span class="ar-cat">${esc(f.category)}</span><span class="ar-label">${esc(f.label)}</span></div>`).join('')
        : '<div class="ar-empty">No new signals vs. the stored profile — site data already up to date.</div>';
      showActionResult('Live Web Audit', `<div class="ar-note">${esc(data.message || '')}</div>${rows}`);
    });
}

async function runWarmEnrich() {
  await callLeadAction('warm-enrich', 'callerWarmEnrichBtn',
    { name: 'Deep research', busy: 'Researching…', done: 'Done ✓', idle: 'Research' },
    (data) => {
      const x = data.intel || {};
      const bits = [];
      if (x.verified_leader && x.verified_leader.name) bits.push(`<div class="ar-line"><span class="ar-cat">Leader</span><span class="ar-label">${esc(x.verified_leader.name)} — ${esc(x.verified_leader.title || '')}</span></div>`);
      if ((x.current_erp || []).length) bits.push(`<div class="ar-line"><span class="ar-cat">Current ERP</span><span class="ar-label">${esc(x.current_erp.join(', '))}</span></div>`);
      if (x.job_count) bits.push(`<div class="ar-line"><span class="ar-cat">Hiring</span><span class="ar-label">${x.job_count} open role(s)${x.remote_job_count ? `, ${x.remote_job_count} remote` : ''}</span></div>`);
      (x.growth_signals || []).slice(0, 4).forEach(s => bits.push(`<div class="ar-line"><span class="ar-cat">Signal</span><span class="ar-label">${esc(s)}</span></div>`));
      if (x.rabbit_hole_summary) bits.push(`<div class="ar-note" style="margin-top:0.4rem;">${esc(x.rabbit_hole_summary)}</div>`);
      showActionResult('Deep Research', bits.length ? bits.join('') : '<div class="ar-empty">No additional intel found (job boards / research returned nothing new).</div>');
    });
}

async function pushCallerLeadToClay() {
  const webhook_url = localStorage.getItem('clay_webhook_url') || '';
  if (!webhook_url) { alert('Set your Clay webhook first (⚙️ Clay on the dashboard).'); return; }
  await callLeadAction('clay-push', 'callerClayBtn',
    { name: 'Clay push', busy: 'Pushing…', done: 'Pushed ✓', idle: 'Clay' },
    (data) => showActionResult('Clay Waterfall', `<div class="ar-note">${esc((data && data.message) || 'Lead dispatched to Clay for waterfall enrichment (verified emails, cell phones). Results return via the Sync CSV / webhook.')}</div>`),
    { webhook_url });
}
