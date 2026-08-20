// SDR Caller Client Logic for Big Binary Tech

let callerLeads = [];
let currentIndex = 0;

function getSizeTier(lead) {
  if (lead.out_of_scope) return 'out_of_scope';
  const s = (lead.employee_size || lead.firmographics?.employee_size || '').toLowerCase().replace(/\s/g, '');
  if (/^(1-10|1–10|11-50|11–50|1-50)/.test(s)) return 'small';
  if (/^(51-200|51–200|51-250|51–250|201-250)/.test(s)) return 'medium';
  if (/^(201-500|251-500|501|251-1|500\+|1000\+|5000\+|10000\+)/.test(s) || parseInt(s) > 250) return 'large';
  return 'small'; // default unknown to small so they stay visible
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');

  await loadCallerLeads(targetId);

  document.getElementById('prevLeadBtn').addEventListener('click', () => navigateLead(-1));
  document.getElementById('nextLeadBtn').addEventListener('click', () => navigateLead(1));
  document.getElementById('callerCategoryFilter').addEventListener('change', () => loadCallerLeads());
  document.getElementById('callerSizeFilter')?.addEventListener('change', () => loadCallerLeads());

  // Keyboard shortcuts — only when not typing in the notes input
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateLead(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigateLead(1); }
    if (e.key === '1') logOutcome('Interested');
    if (e.key === '2') logOutcome('Callback Requested');
    if (e.key === '3') logOutcome('No Answer / Voicemail');
    if (e.key === '4') logOutcome('Not a Fit');
  });
});

async function loadCallerLeads(targetId = null) {
  const category = document.getElementById('callerCategoryFilter').value;
  const sizeFilter = document.getElementById('callerSizeFilter')?.value || 'ALL';
  const params = new URLSearchParams();
  if (category !== 'ALL') params.append('category', category);

  try {
    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();
    let leads = data.leads || [];

    // Size filter — applied client-side using getSizeTier()
    if (sizeFilter !== 'ALL') {
      leads = leads.filter(l => getSizeTier(l) === sizeFilter);
    } else {
      // Default: hide out_of_scope unless explicitly selected
      leads = leads.filter(l => getSizeTier(l) !== 'out_of_scope');
    }

    callerLeads = leads;

    if (callerLeads.length === 0) {
      document.getElementById('noLeadsMessage').style.display = 'block';
      document.getElementById('leadContentWrapper').style.display = 'none';
      document.getElementById('leadCounter').textContent = 'Lead 0 of 0';
      return;
    }

    document.getElementById('noLeadsMessage').style.display = 'none';
    document.getElementById('leadContentWrapper').style.display = 'block';

    if (targetId) {
      const idx = callerLeads.findIndex(l => l.id === targetId);
      currentIndex = idx >= 0 ? idx : 0;
    } else {
      currentIndex = 0;
    }

    renderActiveLead();
  } catch (err) {
    console.error('Failed to load caller leads:', err);
  }
}

function navigateLead(direction) {
  if (callerLeads.length === 0) return;
  currentIndex += direction;
  if (currentIndex < 0) currentIndex = callerLeads.length - 1;
  if (currentIndex >= callerLeads.length) currentIndex = 0;
  renderActiveLead();
}

function renderActiveLead() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  document.getElementById('leadCounter').textContent = `Lead ${currentIndex + 1} of ${callerLeads.length}`;

  const isRescue = lead.category === 'BPO_RESCUE';
  const catBadge = document.getElementById('callCategoryBadge');
  catBadge.textContent = isRescue ? '🛡️ ODOO BPO / RESCUE' : '📍 NEW IMPLEMENTATION';
  catBadge.className = isRescue ? 'badge badge-rescue' : 'badge badge-new';

  const scorePill = document.getElementById('callScorePill');
  const successChance = lead.success_chance_pct || lead.success_chance || lead.opportunity?.success_chance_percentage || 70;
  scorePill.textContent = `🎯 ${successChance}% Success Chance (${lead.fit_tier || lead.opportunity?.fit_tier || 'Solid Opportunity'})`;

  // Size badge
  const sizeTier = getSizeTier(lead);
  const sizeBadgeEl = document.getElementById('callSizeBadge');
  if (sizeBadgeEl) {
    const sizeLabels = { small: '🟢 Small', medium: '🟡 Medium', large: '🔴 Large', out_of_scope: '⛔ Too Large' };
    const sizeColors = { small: '#22c55e', medium: '#f59e0b', large: '#ef4444', out_of_scope: '#7c3aed' };
    sizeBadgeEl.textContent = sizeLabels[sizeTier] || sizeTier;
    sizeBadgeEl.style.color = sizeColors[sizeTier] || '#94a3b8';
    sizeBadgeEl.style.display = 'inline';
    if (lead.out_of_scope_reason) sizeBadgeEl.title = lead.out_of_scope_reason;
  }

  document.getElementById('callCompanyName').textContent = lead.name;
  const callerMetaParts = [
    lead.industry || 'Industry',
    lead.location || 'Metro',
    `Team: ${lead.employee_size || '11-50'}`,
    lead.rating ? (lead.reviews_count && lead.reviews_count > 0 ? `⭐ ${lead.rating} (${lead.reviews_count} reviews)` : `⭐ ${lead.rating} (Star Rating)`) : null,
    lead.email ? `✉ ${lead.email}` : null
  ].filter(Boolean);
  document.getElementById('callCompanyMeta').textContent = callerMetaParts.join(' • ');

  const phone = lead.phone || '';
  const isMissingPhone = !phone || phone === '(555) 000-0000';
  document.getElementById('callPhoneNumber').innerHTML = isMissingPhone
    ? `<span style="color: #64748b; font-size: 0.9rem;">No phone found</span>
       <button onclick="editCurrentPhone()"
         style="background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.4); color: #fbbf24; border-radius: 6px; padding: 0.18rem 0.55rem; font-size: 0.72rem; cursor: pointer; font-weight: 700; margin-left: 8px;">
         ✏️ Add Phone
       </button>`
    : `<a href="tel:${escapeHtml(phone.replace(/[^0-9+]/g, ''))}" style="color: #818cf8; text-decoration: none;" title="Click to Dial">${escapeHtml(phone)}</a>
       <button onclick="copyCurrentPhone()" style="background: none; border: none; cursor: pointer; font-size: 0.9rem; color: var(--text-muted); margin-left: 6px;" title="Copy">📋</button>
       <button onclick="editCurrentPhone()" style="background: none; border: none; cursor: pointer; font-size: 0.8rem; color: var(--text-muted); margin-left: 2px;" title="Edit phone">✏️</button>`;

  // Reset edit phone row
  const editPhoneRow = document.getElementById('callEditPhoneRow');
  if (editPhoneRow) editPhoneRow.style.display = 'none';
  const editPhoneInput = document.getElementById('editPhoneInput');
  if (editPhoneInput) editPhoneInput.value = '';

  const webLink = document.getElementById('callWebsiteLink');
  if (webLink) {
    webLink.innerHTML = lead.website 
      ? `<a href="${lead.website}" target="_blank" style="color: #38bdf8; text-decoration: none;">${lead.website.replace(/^https?:\/\//, '').split('/')[0]} ↗</a>` 
      : '';
  }

  // Decision Makers — reads flat field or raw JSON field name
  const dms = (lead.decision_makers?.length && lead.decision_makers)
    || (lead.decision_maker_contacts?.length && lead.decision_maker_contacts.map(dm => ({
        name: dm.name, title: dm.title, email_guess: dm.email || dm.email_guess
      })))
    || [];
  const dmSection = document.getElementById('callDecisionMakersSection');
  if (dmSection) dmSection.style.display = 'block';
  const dmContainer = document.getElementById('callDecisionMakers');
  if (dmContainer) {
    if (dms.length > 0) {
      dmContainer.innerHTML = dms.map((dm, idx) => {
        const safeName = (dm.name || 'Executive').replace(/'/g, "\\'");
        const isAiGuess = dm.source === 'gemini_ai_enrichment' || dm.verified === false;
        const linkedinBtn = dm.linkedin_url
          ? `<a href="${escapeHtml(dm.linkedin_url)}" target="_blank" style="font-size: 0.7rem; color: #818cf8; text-decoration: none; margin-left: 6px;">🔗 LinkedIn ↗</a>`
          : '';
        const guessBadge = isAiGuess
          ? `<span style="background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);padding:1px 5px;border-radius:4px;font-size:0.62rem;font-weight:800;margin-left:5px;" title="AI guessed — not verified">AI GUESS</span>`
          : '';
        const emailHint = dm.email_guess
          ? `<div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">✉ ${escapeHtml(dm.email_guess)}${isAiGuess ? ' <span style="color:#fbbf24;font-size:0.6rem;">(unverified)</span>' : ''}</div>`
          : '';
        return `
          <div style="background: rgba(167,139,250,0.1); border: 1px solid ${isAiGuess ? 'rgba(251,191,36,0.25)' : 'rgba(167,139,250,0.3)'}; border-radius: 8px; padding: 0.6rem 0.9rem; position: relative;">
            <button onclick="removeDecisionMaker(${idx})" title="Remove this contact" style="position:absolute;top:5px;right:6px;background:none;border:none;color:#475569;cursor:pointer;font-size:0.75rem;line-height:1;padding:2px 4px;" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#475569'">✕</button>
            <div style="font-weight: 700; color: #f1f5f9; font-size: 0.875rem; cursor:pointer;" onclick="navigator.clipboard.writeText('${safeName}'); showToast('📋 ${safeName} copied!');" title="Click to copy">${escapeHtml(dm.name)}${guessBadge}${linkedinBtn}</div>
            <div style="font-size: 0.775rem; color: #a78bfa;">${escapeHtml(dm.title || 'Decision Maker')}</div>
            ${emailHint}
          </div>`;
      }).join('');
    } else {
      const cleanComp = lead.name.replace(/(\b(inc|llc|ltd|corp|corporation|co|group|services|company|l\.l\.c)\b\.?)/gi, '').trim() || lead.name;
      const liSearch = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(cleanComp + ' CEO OR Owner OR Founder OR Manager OR President')}`;
      const gSearch = `https://www.google.com/search?q=${encodeURIComponent(cleanComp + ' CEO OR Owner OR Founder OR Director site:linkedin.com/in')}`;
      dmContainer.innerHTML = `
        <div style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.2rem 0;">
          <span>No contacts found — search manually:</span>
          <a href="${liSearch}" target="_blank" style="color: #818cf8; text-decoration: none; font-weight: 600;">🔗 LinkedIn ↗</a>
          <a href="${gSearch}" target="_blank" style="color: #38bdf8; text-decoration: none; font-weight: 600;">🔍 Google ↗</a>
        </div>`;
    }
  }

  // Pre-Call Intelligence Dossier (deep_intel)
  renderIntelDossier(lead);

  // AI Review Audit Dossier & Semantic Fit
  const dossierSection = document.getElementById('callDossierSection');
  const dossierText = document.getElementById('callDossierText');
  const semanticFitBadge = document.getElementById('callSemanticFitBadge');
  const dossier = lead.review_dossier || (lead.battlecard && lead.battlecard.review_dossier);
  const csFit = lead.case_study_fit || (lead.battlecard && lead.battlecard.case_study_fit);

  if (dossier && dossier.summary && dossierSection && dossierText) {
    dossierSection.style.display = 'block';
    const dossierParts = dossier.parts && dossier.parts.length > 0 ? dossier.parts : [dossier.summary];
    dossierText.innerHTML = dossierParts.map((p, i) => {
      const icons = ['🏢', '💬', '💼', '📝', '📰'];
      return `<span style="display:block; margin-bottom: ${i < dossierParts.length - 1 ? '0.5rem' : '0'}; line-height: 1.5;">${icons[i] || '•'} ${escapeHtml(p)}</span>`;
    }).join('');
    if (semanticFitBadge) {
      if (csFit && csFit.semantic_fit_pct) {
        semanticFitBadge.textContent = `🎯 ${csFit.semantic_fit_pct}% Case Study Fit (${csFit.matched_case_study})`;
      } else {
        semanticFitBadge.textContent = `🚨 ${dossier.top_friction || 'High Priority'}`;
      }
    }
  } else if (dossierSection) {
    dossierSection.style.display = 'none';
  }

  // Opportunity Bar & Fit Tier
  const fitTierEl = document.getElementById('callFitTierBadge');
  if (fitTierEl) {
    fitTierEl.textContent = `🌟 ${lead.fit_tier || lead.opportunity?.fit_tier || 'Solid Opportunity (Tier 2)'}`;
  }
  const dealTierEl = document.getElementById('callDealTierBadge');
  if (dealTierEl) {
    dealTierEl.textContent = `💰 ${lead.estimated_deal_tier || lead.opportunity?.estimated_deal_tier || lead.deal_type || '$25,000 - $75,000'}`;
  }
  const archetypeEl = document.getElementById('callArchetypeBadge');
  if (archetypeEl) {
    archetypeEl.textContent = `🏢 ${lead.business_archetype || lead.firmographics?.business_archetype || lead.industry || 'Healthcare & Commercial'}`;
  }

  // Recommended Odoo Modules — reads flat field, nested odoo_playbook, or nested odoo_sales_playbook
  const modulesContainer = document.getElementById('callRecommendedModules');
  if (modulesContainer) {
    const modules = (lead.recommended_modules?.length && lead.recommended_modules)
      || (lead.odoo_playbook?.recommended_odoo_modules?.length && lead.odoo_playbook.recommended_odoo_modules)
      || (lead.odoo_sales_playbook?.recommended_odoo_modules?.length && lead.odoo_sales_playbook.recommended_odoo_modules)
      || ['Odoo CRM', 'Odoo Invoicing & Accounting', 'Odoo Documents', 'Odoo Helpdesk', 'Odoo Appointments'];
    modulesContainer.innerHTML = modules.map(m => `
      <span style="background: rgba(99,102,241,0.2); color: #c7d2fe; border: 1px solid rgba(99,102,241,0.4); padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.775rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
        📦 ${escapeHtml(m)}
      </span>
    `).join('');
  }

  // 6-Phase Roadmap — reads flat field, nested odoo_playbook, or nested odoo_sales_playbook
  const roadmapContainer = document.getElementById('callRoadmapList');
  if (roadmapContainer) {
    const roadmap = (lead.action_plan_roadmap?.length && lead.action_plan_roadmap)
      || (lead.odoo_playbook?.action_plan_roadmap?.length && lead.odoo_playbook.action_plan_roadmap)
      || (lead.odoo_sales_playbook?.action_plan_roadmap?.length && lead.odoo_sales_playbook.action_plan_roadmap)
      || [
          'Phase 1: Business Process Mapping & Gap Analysis',
          'Phase 2: Odoo Enterprise Instance Setup & Chart of Accounts Configuration',
          'Phase 3: Legacy Data Cleansing & Migration',
          'Phase 4: Custom Workflow Automation & 3rd-party App Integrations',
          'Phase 5: User Acceptance Testing (UAT) & Staff Training',
          'Phase 6: Go-Live Support & Ongoing Optimization'
        ];
    roadmapContainer.innerHTML = roadmap.map(r => `
      <div style="display: flex; align-items: baseline; gap: 6px; line-height: 1.4;">
        <span style="color: #38bdf8; font-weight: 800;">•</span>
        <span>${escapeHtml(r)}</span>
      </div>
    `).join('');
  }

  // Problem Analysis — structured problems with review counts and Odoo fixes
  const problemList = document.getElementById('callProblemList');
  if (problemList) {
    const riskLevel = lead.risk_level || lead.problem_analysis?.risk_level || lead.problem_and_sentiment_analysis?.risk_level || '';

    // Try structured identified_problems first
    const structured = lead.identified_problems
      || lead.problem_analysis?.identified_problems
      || lead.problem_and_sentiment_analysis?.identified_problems
      || [];

    if (structured.length > 0) {
      const riskBadge = riskLevel
        ? `<div style="margin-bottom:8px;"><span style="background:rgba(244,63,94,0.15);color:#f87171;border:1px solid rgba(244,63,94,0.35);padding:1px 7px;border-radius:4px;font-size:0.7rem;font-weight:800;text-transform:uppercase;">Risk: ${escapeHtml(riskLevel)}</span></div>`
        : '';
      problemList.innerHTML = riskBadge + structured.map(p => `
        <div style="margin-bottom:12px; padding:10px 12px; background:rgba(0,0,0,0.2); border-left:3px solid rgba(248,113,113,0.5); border-radius:0 6px 6px 0;">
          <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:5px;">
            <span style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:1px 6px;border-radius:10px;font-size:0.68rem;font-weight:800;white-space:nowrap;flex-shrink:0;">${p.review_count || '?'} reviews</span>
            <span style="font-size:0.82rem;color:#e2e8f0;font-weight:600;">${escapeHtml(p.problem || '')}</span>
          </div>
          ${p.review_evidence ? `<div style="font-size:0.75rem;color:#94a3b8;font-style:italic;margin-bottom:5px;padding-left:2px;">"${escapeHtml(p.review_evidence)}"</div>` : ''}
          <div style="display:flex;align-items:flex-start;gap:5px;">
            <span style="color:#818cf8;font-size:0.7rem;font-weight:800;flex-shrink:0;margin-top:1px;">→ ODOO FIX:</span>
            <span style="font-size:0.75rem;color:#a5b4fc;">${escapeHtml(p.odoo_fix || '')}</span>
          </div>
        </div>
      `).join('');
    } else {
      // Fallback: flat arrays (legacy enriched leads)
      const painPoints = lead.customer_pain_points
        || lead.problem_analysis?.customer_patient_pain_points
        || lead.problem_and_sentiment_analysis?.customer_patient_pain_points
        || [];
      const bottlenecks = lead.operational_bottlenecks
        || lead.problem_analysis?.internal_operational_bottlenecks
        || lead.problem_and_sentiment_analysis?.internal_operational_bottlenecks
        || [];
      const bc = lead.battlecard || {};
      const problems = painPoints.length > 0
        ? [...painPoints, ...bottlenecks]
        : (bc.problem_analysis?.length > 0 ? bc.problem_analysis
            : [`Site last updated around ${lead.copyright_year || '2019'} with no client portal.`,
               `Operating on manual spreadsheets/disconnected accounting.`]);

      const riskBadge = riskLevel
        ? `<div style="margin-bottom:8px;"><span style="background:rgba(244,63,94,0.15);color:#f87171;border:1px solid rgba(244,63,94,0.35);padding:1px 7px;border-radius:4px;font-size:0.7rem;font-weight:800;text-transform:uppercase;">Risk: ${escapeHtml(riskLevel)}</span></div>`
        : '';
      problemList.innerHTML = riskBadge + `<ul style="margin:0;padding-left:1.2rem;">` + problems.map(p => `<li style="margin-bottom:5px;font-size:0.82rem;">${escapeHtml(p)}</li>`).join('') + `</ul>`;
    }
  }

  // Set Persona Script
  setCallerPersona('FOUNDER_CEO');

  // Objection Handlers
  const objList = document.getElementById('callObjectionsList');
  if (objList) {
    const bc = lead.battlecard || {};
    const objections = bc.objection_handlers && bc.objection_handlers.length > 0
      ? bc.objection_handlers
      : [
          { objection: '"We already use QuickBooks / spreadsheets and it works fine."', counter: '"QuickBooks is great for taxes, but Odoo connects your field jobs, inventory, client portal, and automated billing with zero double-entry."' },
          { objection: '"We don\'t have budget for a big IT project right now."', counter: '"Odoo typically replaces 3 to 4 separate software subscriptions you are already paying for. Most clients see the system pay for itself in the first 60 days from labor savings alone."' }
        ];

    objList.innerHTML = objections.map(o => `
      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.65rem 0.85rem; font-size: 0.825rem;">
        <div style="font-weight: 700; color: #fbbf24; margin-bottom: 0.2rem;">${escapeHtml(o.objection)}</div>
        <div style="color: #cbd5e1;">↳ ${escapeHtml(o.counter)}</div>
      </div>
    `).join('');
  }

  const notesEl = document.getElementById('callNotesInput');
  if (notesEl) notesEl.value = lead.notes || '';

  const followUpBadge = document.getElementById('callScheduledFollowUpBadge');
  if (followUpBadge) {
    if (lead.follow_up_date) {
      followUpBadge.textContent = `⏰ Follow-up: ${new Date(lead.follow_up_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      followUpBadge.style.display = 'inline-block';
      followUpBadge.style.color = '#fbbf24';
      followUpBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      followUpBadge.style.borderColor = 'rgba(245, 158, 11, 0.35)';
    } else if (lead.call_status && lead.call_status !== 'Uncalled') {
      const isInterested = lead.call_status === 'Interested';
      const isNotFit = lead.call_status === 'Not a Fit';
      followUpBadge.textContent = `${isInterested ? '✅' : isNotFit ? '❌' : '●'} Status: ${lead.call_status}`;
      followUpBadge.style.display = 'inline-block';
      followUpBadge.style.color = isInterested ? '#34d399' : isNotFit ? '#fb7185' : '#94a3b8';
      followUpBadge.style.background = isInterested ? 'rgba(16, 185, 129, 0.15)' : isNotFit ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)';
      followUpBadge.style.borderColor = isInterested ? 'rgba(16, 185, 129, 0.35)' : isNotFit ? 'rgba(244, 63, 94, 0.35)' : 'rgba(255, 255, 255, 0.1)';
    } else {
      followUpBadge.style.display = 'none';
    }
  }
}


window.setCallerPersona = function(personaKey) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  document.querySelectorAll('.persona-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-persona') === personaKey);
  });

  const badge = document.getElementById('activePersonaBadge');
  const labels = {
    'FOUNDER_CEO': 'Founder / CEO',
    'OPERATIONS_COO': 'COO / Ops (ERP/POS)',
    'FINANCE_CFO': 'CFO (e-Invoice & Accounting)',
    'REVOPS_CRM': 'RevOps (CRM/WhatsApp)',
    'HR_PEOPLE': 'HR & People Ops',
    'TECH_CIO_CTO': 'CIO/CTO (SLA & Cloud)',
    'RETAIL_RESTAURANT_POS': 'Retail/Restaurant POS',
    'MARKETING_GROWTH': 'VP Growth'
  };
  if (badge) badge.textContent = labels[personaKey] || 'Decision Maker';

  const scriptBox = document.getElementById('callScriptBox');
  if (!scriptBox) return;

  const hook = lead.pitch_hook
    || lead.odoo_playbook?.custom_pitch_hook
    || lead.odoo_sales_playbook?.custom_pitch_hook
    || '';
  const archetype = lead.business_archetype || lead.industry || 'operations';
  const name = lead.name || 'your company';

  const scripts = {
    'FOUNDER_CEO': hook 
      ? `Hi, Big Binary Tech here. We help ${archetype} leadership modernize operations with unified Odoo workflows. ${hook} Does your team currently experience friction in manual intake, scheduling, or multi-system bookkeeping?`
      : `Hi, Big Binary Tech here. We build custom Odoo operations platforms for ${name} that unify customer intake, job tracking, and automated billing into a single dashboard. Are disconnected software tools currently creating administrative overhead?`,
    'OPERATIONS_COO': `Hi, Big Binary Tech here. We help ${archetype} operations teams eliminate spreadsheet disconnects and manual handoffs with custom Odoo job-dispatch, client portal, and inventory workflows. Are manual coordination bottlenecks slowing down fulfillment for ${name}?`,
    'FINANCE_CFO': `Hi, Big Binary Tech here. We help finance leaders automate invoicing, multi-system reconciliation, and payment collections directly inside Odoo ERP. Would eliminating manual double-entry between intake and accounting save your team significant overhead each month?`,
    'REVOPS_CRM': `Hi, Big Binary Tech here. We help ${archetype} teams bridge customer inquiries, CRM pipelines, and automated WhatsApp/SMS notifications directly into Odoo. Is lead drop-off or delayed follow-up currently costing ${name} sales opportunities?`,
    'HR_PEOPLE': `Hi, Big Binary Tech here. We streamline employee onboarding, time-tracking, and payroll workflows into unified Odoo HR modules with zero double-entry. Are disparate HR and timesheet tools creating administrative drag?`,
    'TECH_CIO_CTO': `Hi, Big Binary Tech here. We deliver turnkey Odoo ERP deployments and enterprise n8n workflow bridges with guaranteed uptime, direct API connectors, and zero vendor lock-in. Are legacy software silos or custom script maintenance consuming IT resources?`,
    'RETAIL_RESTAURANT_POS': `Hi, Big Binary Tech here. We help retail and clinic locations sync multi-counter POS transactions, inventory, and accounting into a single real-time Odoo terminal. Would real-time stock sync and automated daily closing save your team hours?`,
    'MARKETING_GROWTH': `Hi, Big Binary Tech here. We connect customer acquisition campaigns directly into Odoo CRM with automated lead routing and appointment booking. Would automated conversion workflows help ${name} scale faster?`
  };

  scriptBox.textContent = scripts[personaKey] || scripts['FOUNDER_CEO'];
};

window.copyCurrentPhone = function() {
  const lead = callerLeads[currentIndex];
  if (lead && lead.phone) {
    navigator.clipboard.writeText(lead.phone);
    showToast('📋 Phone copied!');
  }
};

window.editCurrentPhone = function() {
  const lead = callerLeads[currentIndex];
  const editPhoneRow = document.getElementById('callEditPhoneRow');
  if (editPhoneRow) {
    editPhoneRow.style.display = 'block';
    const input = document.getElementById('editPhoneInput');
    if (input) {
      input.value = (lead && lead.phone && lead.phone !== '(555) 000-0000') ? lead.phone : '';
      input.focus();
    }
  }
};

function showToast(message, isSuccess = true) {
  let toast = document.getElementById('callerToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'callerToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '0.875rem';
    toast.style.fontWeight = '600';
    toast.style.color = '#ffffff';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    toast.style.zIndex = '9999';
    toast.style.transition = 'all 0.3s ease';
    document.body.appendChild(toast);
  }
  toast.style.background = isSuccess ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f43f5e, #e11d48)';
  toast.textContent = message;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 2500);
}

let pendingOutcomeStatus = null;

window.logOutcome = async function(status) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const notes = document.getElementById('callNotesInput').value.trim();

  if (status === 'Interested' || status === 'Callback Requested') {
    pendingOutcomeStatus = status;
    openFollowUpModal(status, notes);
    return;
  }

  // Not a Fit or No Answer / Voicemail
  try {
    const res = await fetch(`/api/leads/${lead.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes, follow_up_date: null })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save');

    lead.call_status = status;
    lead.notes = notes;
    lead.follow_up_date = null;

    if (status === 'Not a Fit') {
      showToast(`❌ Marked "${lead.name}" as Not a Fit`);
    } else {
      showToast(`📵 Logged No Answer for "${lead.name}"`);
    }

    setTimeout(() => {
      navigateLead(1);
    }, 350);
  } catch (err) {
    console.error('Failed to log outcome:', err);
    showToast('Failed to save status', false);
  }
};

window.openFollowUpModal = function(status, existingNotes = '') {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const modalTitle = document.getElementById('followUpModalTitle');
  if (modalTitle) {
    modalTitle.textContent = status === 'Interested' 
      ? '✅ Interested — Schedule Follow-Up Meeting' 
      : '📅 Schedule Callback Requested';
  }
  const modalComp = document.getElementById('followUpModalCompany');
  if (modalComp) {
    modalComp.textContent = `${lead.name} (${lead.phone || 'No direct phone'})`;
  }

  // Default datetime to Tomorrow 10:00 AM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const dateInput = document.getElementById('followUpDateTimeInput');
  if (dateInput) dateInput.value = localIso;

  const notesInput = document.getElementById('followUpNotesInput');
  if (notesInput) notesInput.value = existingNotes || lead.notes || '';

  const modal = document.getElementById('followUpModal');
  if (modal) modal.style.display = 'flex';
};

window.closeFollowUpModal = function() {
  const modal = document.getElementById('followUpModal');
  if (modal) modal.style.display = 'none';
  pendingOutcomeStatus = null;
};

window.setFollowUpPreset = function(daysAhead, hour) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const dateInput = document.getElementById('followUpDateTimeInput');
  if (dateInput) dateInput.value = localIso;
};

window.confirmFollowUpSchedule = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const status = pendingOutcomeStatus || 'Interested';
  const followUpIso = document.getElementById('followUpDateTimeInput')?.value;
  const notes = (document.getElementById('followUpNotesInput')?.value || '').trim();

  const followUpDate = followUpIso ? new Date(followUpIso).toISOString() : null;

  try {
    const res = await fetch(`/api/leads/${lead.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes, follow_up_date: followUpDate })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save');

    lead.call_status = status;
    lead.notes = notes;
    lead.follow_up_date = followUpDate;

    closeFollowUpModal();

    const formattedDate = followUpDate 
      ? new Date(followUpDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Saved';
    showToast(`✅ "${lead.name}" scheduled for follow-up on ${formattedDate}!`);

    setTimeout(() => {
      navigateLead(1);
    }, 400);
  } catch (err) {
    console.error('Failed to schedule follow up:', err);
    showToast('Failed to schedule follow-up', false);
  }
};

window.confirmSaveOutcomeWithoutSchedule = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const status = pendingOutcomeStatus || 'Interested';
  const notes = (document.getElementById('followUpNotesInput')?.value || '').trim();

  try {
    const res = await fetch(`/api/leads/${lead.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes, follow_up_date: null })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save');

    lead.call_status = status;
    lead.notes = notes;
    lead.follow_up_date = null;

    closeFollowUpModal();
    showToast(`✓ Logged as "${status}" for "${lead.name}"`);

    setTimeout(() => {
      navigateLead(1);
    }, 350);
  } catch (err) {
    console.error('Failed to save status:', err);
    showToast('Failed to save status', false);
  }
};


// ─── Manual Enrichment ────────────────────────────────────────────────────────

window.toggleAddContact = function() {
  const form = document.getElementById('addContactForm');
  const isVisible = form.style.display !== 'none';
  form.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) document.getElementById('newContactName').focus();
};

window.saveNewContact = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const name = document.getElementById('newContactName').value.trim();
  if (!name) { showToast('Name is required', false); return; }

  const title    = document.getElementById('newContactTitle').value.trim()    || 'Contact';
  const email    = document.getElementById('newContactEmail').value.trim()    || null;
  const linkedin = document.getElementById('newContactLinkedIn').value.trim() || null;

  const newContact = { name, title, email_guess: email, linkedin_url: linkedin, source: 'manual' };
  const updatedDMs = [...(lead.decision_makers || []), newContact];

  try {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision_makers: updatedDMs })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    lead.decision_makers = updatedDMs;
    document.getElementById('newContactName').value  = '';
    document.getElementById('newContactTitle').value = '';
    document.getElementById('newContactEmail').value = '';
    document.getElementById('newContactLinkedIn').value = '';
    document.getElementById('addContactForm').style.display = 'none';
    renderActiveLead();
    showToast(`✓ ${name} added as a contact`);
  } catch (err) {
    showToast('Failed to save contact', false);
  }
};

window.importClayCsv = async function(input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  input.value = '';

  showToast('Importing Clay CSV…');
  try {
    const res = await fetch('/api/leads/import-clay-csv', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast(`✓ ${data.matched} contacts imported (${data.skipped} skipped)`);
    // Refresh current lead card if it was affected
    await loadCallerLeads(callerLeads[currentIndex]?.id);
  } catch (err) {
    showToast(`Import failed: ${err.message}`, false);
  }
};

window.removeDecisionMaker = async function(idx) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;
  const updatedDMs = (lead.decision_makers || []).filter((_, i) => i !== idx);
  try {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision_makers: updatedDMs })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    lead.decision_makers = updatedDMs;
    renderActiveLead();
    showToast('Contact removed');
  } catch (err) {
    showToast('Failed to remove contact', false);
  }
};

window.saveEditedPhone = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const newPhone = document.getElementById('editPhoneInput').value.trim();
  if (!newPhone) { showToast('Enter a phone number', false); return; }

  try {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: newPhone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    lead.phone = newPhone;
    document.getElementById('callEditPhoneRow').style.display = 'none';
    renderActiveLead();
    showToast(`✓ Phone updated to ${newPhone}`);
  } catch (err) {
    showToast('Failed to save phone', false);
  }
};

function renderIntelDossier(lead) {
  const section = document.getElementById('callIntelSection');
  const grid = document.getElementById('callIntelGrid');
  const newsRow = document.getElementById('callIntelNewsRow');
  const yelpRow = document.getElementById('callIntelYelpRow');

  const intel = lead.deep_intel;
  if (!intel) { if (section) section.style.display = 'none'; return; }

  const tiles = [];

  // Company age
  const bbbYears = intel.bbb?.years_in_business;
  const corpDate = intel.corporation?.incorporation_date;
  const bbbRating = intel.bbb?.bbb_rating;
  const bbbAccredited = intel.bbb?.bbb_accredited;

  if (bbbYears || corpDate) {
    const age = bbbYears || (corpDate ? `Est. ${corpDate.substring(0, 4)}` : '');
    const accTag = bbbAccredited ? ' · BBB Accredited ✓' : '';
    const ratingTag = bbbRating ? ` · ${bbbRating}` : '';
    tiles.push({ icon: '🏢', label: 'Company Age', value: `${age}${ratingTag}${accTag}` });
  }

  // Legal registration
  const corp = intel.corporation;
  if (corp?.legal_name) {
    tiles.push({ icon: '📋', label: 'Legal Entity', value: `${corp.legal_name}${corp.jurisdiction ? ' · ' + corp.jurisdiction : ''}${corp.current_status ? ' · ' + corp.current_status : ''}` });
  }

  // Officers from OpenCorporates
  if (corp?.officers?.length > 0) {
    const officerList = corp.officers.map(o => `${o.name}${o.position ? ' (' + o.position + ')' : ''}`).join(', ');
    tiles.push({ icon: '👔', label: 'Registered Officers', value: officerList });
  }

  // Yelp rating
  if (intel.yelp?.yelp_rating) {
    tiles.push({ icon: '⭐', label: 'Yelp Rating', value: `${intel.yelp.yelp_rating}★${intel.yelp.yelp_review_count ? ' · ' + intel.yelp.yelp_review_count + ' reviews' : ''}` });
  }

  // Hiring signals
  const hiringSignals = intel.hiring?.hiring_signals || [];
  const jobCount = intel.hiring?.total_openings || 0;
  if (hiringSignals.length > 0) {
    tiles.push({ icon: '💼', label: `Hiring Signal (${jobCount} open ${jobCount === 1 ? 'role' : 'roles'})`, value: hiringSignals.join(' · ') });
  }

  // BBB complaints
  if (intel.bbb?.complaints_count != null) {
    const count = intel.bbb.complaints_count;
    tiles.push({ icon: count > 5 ? '⚠️' : '📝', label: 'BBB Complaints', value: count === 0 ? 'None on record' : `${count} complaint${count !== 1 ? 's' : ''} filed` });
  }

  if (tiles.length === 0) { if (section) section.style.display = 'none'; return; }

  if (grid) grid.innerHTML = tiles.map(t => `
    <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 0.55rem 0.8rem;">
      <div style="font-size: 0.68rem; color: #6ee7b7; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;">${t.icon} ${escapeHtml(t.label)}</div>
      <div style="font-size: 0.8rem; color: #e2e8f0; line-height: 1.35;">${escapeHtml(t.value)}</div>
    </div>
  `).join('');

  // News headline
  const headline = intel.news?.latest_headline;
  const newsHeadlineEl = document.getElementById('callIntelNewsHeadline');
  if (headline && newsHeadlineEl) {
    newsHeadlineEl.textContent = ' ' + headline;
    if (newsRow) newsRow.style.display = 'block';
  } else {
    if (newsRow) newsRow.style.display = 'none';
  }

  // Yelp review voice
  const snippets = intel.yelp?.yelp_review_snippets || [];
  const yelpSnippetEl = document.getElementById('callIntelYelpSnippet');
  if (snippets.length > 0 && yelpSnippetEl) {
    yelpSnippetEl.textContent = ' "' + snippets[0].substring(0, 200) + (snippets[0].length > 200 ? '…' : '') + '"';
    if (yelpRow) yelpRow.style.display = 'block';
  } else {
    if (yelpRow) yelpRow.style.display = 'none';
  }

  if (section) section.style.display = 'block';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// ─── Full Company & Pitch Editor Modal ───────────────────────────────────────

window.openEditModal = function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  // Profile Tab
  document.getElementById('editName').value = lead.name || '';
  document.getElementById('editWebsite').value = lead.website || '';
  document.getElementById('editPhone').value = lead.phone || '';
  document.getElementById('editEmail').value = lead.email || '';
  document.getElementById('editAddress').value = lead.address || lead.location || '';
  document.getElementById('editIndustry').value = lead.industry || '';
  document.getElementById('editSize').value = lead.employee_size || '';

  // Decision Makers Tab
  const dms = lead.decision_makers || [];
  const contactsContainer = document.getElementById('modalContactsList');
  contactsContainer.innerHTML = '';
  if (dms.length > 0) {
    dms.forEach((dm, idx) => addModalContactRow(dm, idx));
  } else {
    addModalContactRow();
  }

  // Social Media Tab
  const social = lead.social_media || {};
  document.getElementById('editSocialLinkedIn').value = social.linkedin || '';
  document.getElementById('editSocialTwitter').value = social.twitter || '';
  document.getElementById('editSocialFacebook').value = social.facebook || '';
  document.getElementById('editSocialInstagram').value = social.instagram || '';

  // Pitch Tab
  const bc = lead.battlecard || {};
  document.getElementById('editPitchHook').value = bc.elevator_pitch || (lead.pitch_script ? lead.pitch_script.opening : '');
  document.getElementById('editPitchAngle').value = bc.big_binary_angle || (lead.pitch_script ? lead.pitch_script.big_binary_advantage : '');
  
  const painPoints = bc.pain_points || (lead.pitch_script && lead.pitch_script.key_pain_points) || [];
  document.getElementById('editPitchPainPoints').value = Array.isArray(painPoints) ? painPoints.join('\n') : String(painPoints || '');

  const objections = bc.objection_responses || {};
  let objText = '';
  if (typeof objections === 'object') {
    objText = Object.entries(objections).map(([k, v]) => `${k}: ${v}`).join('\n\n');
  } else {
    objText = String(objections || '');
  }
  document.getElementById('editPitchObjections').value = objText;

  switchEditTab('profile');
  document.getElementById('companyEditModal').style.display = 'flex';
};

window.closeEditModal = function() {
  document.getElementById('companyEditModal').style.display = 'none';
};

window.switchEditTab = function(tabName) {
  const tabs = ['profile', 'contacts', 'social', 'pitch'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      if (t === tabName) {
        btn.className = 'btn btn-sm btn-accent';
      } else {
        btn.className = 'btn btn-sm btn-secondary';
      }
    }
    if (content) {
      content.style.display = t === tabName ? 'block' : 'none';
    }
  });
};

window.addModalContactRow = function(contact = {}, idx = null) {
  const container = document.getElementById('modalContactsList');
  const rowId = `dm_row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'modal-contact-row';
  row.style = 'background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.75rem; display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr auto; gap: 0.5rem; align-items: center;';

  row.innerHTML = `
    <input type="text" placeholder="Full Name *" value="${escapeHtml(contact.name || '')}" class="form-control form-control-sm dm-name" style="font-size: 0.78rem; padding: 0.35rem 0.5rem;" required>
    <input type="text" placeholder="Title / Role" value="${escapeHtml(contact.title || '')}" class="form-control form-control-sm dm-title" style="font-size: 0.78rem; padding: 0.35rem 0.5rem;">
    <input type="text" placeholder="Email" value="${escapeHtml(contact.email_guess || contact.email || '')}" class="form-control form-control-sm dm-email" style="font-size: 0.78rem; padding: 0.35rem 0.5rem;">
    <input type="text" placeholder="LinkedIn URL" value="${escapeHtml(contact.linkedin_url || '')}" class="form-control form-control-sm dm-linkedin" style="font-size: 0.78rem; padding: 0.35rem 0.5rem;">
    <button type="button" onclick="document.getElementById('${rowId}').remove()" class="btn btn-secondary btn-sm" style="color: #fb7185; padding: 0.35rem 0.6rem;" title="Remove contact">🗑️</button>
  `;
  container.appendChild(row);
};

window.saveCompanyEdits = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const name = document.getElementById('editName').value.trim();
  if (!name) {
    showToast('Company Name is required', false);
    switchEditTab('profile');
    return;
  }

  // Gather Contacts
  const contactRows = document.querySelectorAll('#modalContactsList .modal-contact-row');
  const dms = [];
  contactRows.forEach(r => {
    const cName = r.querySelector('.dm-name').value.trim();
    if (cName) {
      dms.push({
        name: cName,
        title: r.querySelector('.dm-title').value.trim() || 'Executive',
        email_guess: r.querySelector('.dm-email').value.trim() || null,
        linkedin_url: r.querySelector('.dm-linkedin').value.trim() || null,
        source: 'manual_edit'
      });
    }
  });

  // Gather Social Media
  const social = {
    linkedin: document.getElementById('editSocialLinkedIn').value.trim() || null,
    twitter: document.getElementById('editSocialTwitter').value.trim() || null,
    facebook: document.getElementById('editSocialFacebook').value.trim() || null,
    instagram: document.getElementById('editSocialInstagram').value.trim() || null
  };

  // Gather Pitch & Battlecard
  const painPointsRaw = document.getElementById('editPitchPainPoints').value.split('\n').map(s => s.trim()).filter(Boolean);
  const updatedBattlecard = {
    ...(lead.battlecard || {}),
    elevator_pitch: document.getElementById('editPitchHook').value.trim(),
    big_binary_angle: document.getElementById('editPitchAngle').value.trim(),
    pain_points: painPointsRaw,
    custom_objections: document.getElementById('editPitchObjections').value.trim()
  };

  const payload = {
    name,
    website: document.getElementById('editWebsite').value.trim() || '',
    phone: document.getElementById('editPhone').value.trim() || '',
    email: document.getElementById('editEmail').value.trim() || '',
    address: document.getElementById('editAddress').value.trim() || '',
    industry: document.getElementById('editIndustry').value.trim() || lead.industry,
    employee_size: document.getElementById('editSize').value.trim() || lead.employee_size,
    decision_makers: dms,
    social_media: social,
    battlecard: updatedBattlecard
  };

  try {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to update');

    // Update local object & re-render
    Object.assign(lead, payload);
    if (data.lead) Object.assign(lead, data.lead);

    closeEditModal();
    renderActiveLead();
    showToast(`✓ "${name}" details & pitch saved successfully!`);
  } catch (err) {
    console.error('Error saving company edits:', err);
    showToast(`Failed to save changes: ${err.message}`, false);
  }
};

window.runCallerAiEnrich = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const btn = document.getElementById('callerAiEnrichBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ AI Researching...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/leads/${lead.id}/ai-enrich`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'AI Enrichment failed');

    // Update lead in memory
    Object.assign(lead, data.lead);
    renderActiveLead();
    showToast(`✨ Enriched "${lead.name}" with verified AI research!`);
  } catch (err) {
    showToast(`AI Enrichment error: ${err.message}`, false);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

window._latestLiveAuditResult = null;

window.runCallerLiveAudit = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const btn = document.getElementById('callerLiveAuditBtn');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '⏳ Auditing Tech & Reviews...';
    btn.disabled = true;
  }

  try {
    const res = await fetch(`/api/leads/${lead.id}/live-audit`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Live audit failed');

    window._latestLiveAuditResult = data.lead;
    window._latestNewFindings = data.new_findings || [];
    openLiveAuditModal(data.lead, data.new_findings || []);
  } catch (err) {
    showToast(`Live Audit error: ${err.message}`, false);
  } finally {
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
};

window.openLiveAuditModal = function(auditedLead, newFindings) {
  if (!auditedLead) return;

  document.getElementById('auditModalTitle').textContent = `⚡ Live Web Tech Audit: ${auditedLead.name}`;
  document.getElementById('auditModalSubtitle').textContent = `Scan complete for ${auditedLead.website || auditedLead.name}`;

  // 1. Tech Metrics panel — website health snapshot
  const techContainer = document.getElementById('auditTechMetrics');
  const ta = auditedLead.tech_audit || {};

  const sslBadge = auditedLead.has_ssl
    ? '<span style="color:#34d399;font-weight:700;">✅ SSL Valid</span>'
    : '<span style="color:#f43f5e;font-weight:700;">🚨 No SSL</span>';

  const loadSec = auditedLead.load_time_sec ? `${auditedLead.load_time_sec}s` : '—';
  const loadColor = parseFloat(auditedLead.load_time_sec) > 3 ? '#f43f5e' : '#34d399';

  const ttfb = ta.performance?.ttfb_ms ? `${ta.performance.ttfb_ms}ms TTFB` : '';
  const lcp  = ta.performance?.lcp_ms  ? `${(ta.performance.lcp_ms/1000).toFixed(1)}s LCP` : '';

  const copyYear = auditedLead.copyright_year || '—';
  const copyAge  = copyYear !== '—' ? new Date().getFullYear() - parseInt(copyYear) : null;
  const copyColor = copyAge !== null && copyAge >= 4 ? '#f43f5e' : copyAge !== null && copyAge >= 2 ? '#fbbf24' : '#34d399';

  const stackBadges = (auditedLead.tech_stack || []).slice(0, 6).map(t =>
    `<span style="background:rgba(255,255,255,0.07);padding:2px 5px;border-radius:3px;color:#cbd5e1;font-size:0.72rem;">${escapeHtml(t)}</span>`
  ).join(' ') || '<span style="color:#64748b;">Not detected</span>';

  const secScore = ta.dimension_scores?.security ?? null;
  const secColor = secScore !== null ? (secScore >= 15 ? '#34d399' : secScore >= 8 ? '#fbbf24' : '#f43f5e') : '#94a3b8';

  const grade = ta.grade ? `<span style="font-weight:700;color:#a78bfa;">${ta.grade} (${ta.maturity_score ?? '—'}/100)</span>` : '<span style="color:#64748b;">—</span>';

  techContainer.innerHTML = `
    <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:5px;">
      <span style="color:#94a3b8;">Overall Grade</span>${grade}
    </div>
    <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:5px;">
      <span style="color:#94a3b8;">SSL / HTTPS</span>${sslBadge}
    </div>
    <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:5px;">
      <span style="color:#94a3b8;">Load Time</span>
      <span style="color:${loadColor};font-weight:600;">${loadSec}${ttfb ? ' · ' + ttfb : ''}${lcp ? ' · ' + lcp : ''}</span>
    </div>
    <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:5px;">
      <span style="color:#94a3b8;">Security Headers</span>
      <span style="color:${secColor};font-weight:600;">${secScore !== null ? secScore + '/20' : '—'}</span>
    </div>
    <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:5px;">
      <span style="color:#94a3b8;">Copyright Year</span>
      <span style="color:${copyColor};font-weight:600;">${copyYear}${copyAge !== null ? ` (${copyAge}yr old)` : ''}</span>
    </div>
    <div style="border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:5px;">
      <div style="color:#94a3b8;margin-bottom:3px;">Tech Stack</div>
      <div>${stackBadges}</div>
    </div>
  `;

  // 2. New findings checklist
  const findingsContainer = document.getElementById('auditNewFindings');
  if (!newFindings || newFindings.length === 0) {
    findingsContainer.innerHTML = `
      <div style="color:#64748b;font-style:italic;font-size:0.8rem;padding:8px 0;text-align:center;">
        No new signals found — live scan matches AI profile.
      </div>`;
  } else {
    const sevColor = { critical:'#f43f5e', high:'#fb923c', medium:'#fbbf24', low:'#94a3b8', info:'#38bdf8' };
    findingsContainer.innerHTML = newFindings.map((f) => {
      const col = sevColor[f.severity] || '#94a3b8';
      return `
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.25);transition:background 0.15s;"
          onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(0,0,0,0.25)'">
          <input type="checkbox" data-finding-id="${escapeHtml(f.id)}" class="audit-finding-cb" style="margin-top:2px;accent-color:#f59e0b;cursor:pointer;" />
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;">
              <span style="font-size:0.65rem;font-weight:800;text-transform:uppercase;color:${col};background:${col}18;border:1px solid ${col}44;padding:1px 5px;border-radius:3px;">${escapeHtml(f.severity)}</span>
              <span style="font-size:0.68rem;color:#64748b;text-transform:uppercase;">${escapeHtml(f.category)}</span>
            </div>
            <div style="font-size:0.8rem;color:#e2e8f0;line-height:1.35;">${escapeHtml(f.label)}</div>
          </div>
        </label>`;
    }).join('');
  }

  // 3. Re-synthesized pitch hook preview
  const pitchPreview = document.getElementById('auditPitchPreview');
  pitchPreview.textContent = auditedLead.battlecard?.elevator_opener || 'Hi, calling from Big Binary Tech...';

  document.getElementById('liveAuditModal').style.display = 'flex';
};

window.closeLiveAuditModal = function() {
  document.getElementById('liveAuditModal').style.display = 'none';
};

window.applyLiveAuditFindings = async function() {
  const currentLead = callerLeads[currentIndex];
  if (!currentLead) { closeLiveAuditModal(); return; }

  const checked = [...document.querySelectorAll('.audit-finding-cb:checked')];
  if (checked.length === 0) {
    closeLiveAuditModal();
    showToast('No signals selected — nothing applied.');
    return;
  }

  const allFindings = window._latestNewFindings || [];
  const selectedIds = new Set(checked.map(cb => cb.dataset.findingId));
  const selectedFindings = allFindings.filter(f => selectedIds.has(f.id));

  const btn = document.querySelector('[onclick="applyLiveAuditFindings()"]');
  if (btn) { btn.textContent = 'Applying...'; btn.disabled = true; }

  try {
    const res = await fetch(`/api/leads/${currentLead.id}/apply-findings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_findings: selectedFindings })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Apply failed');

    Object.assign(currentLead, data.lead);
    renderActiveLead();
    closeLiveAuditModal();
    showToast(`Applied ${selectedFindings.length} signal${selectedFindings.length !== 1 ? 's' : ''} to battlecard for "${currentLead.name}"!`);
  } catch (err) {
    showToast(`Apply error: ${err.message}`, false);
  } finally {
    if (btn) { btn.textContent = 'Apply Selected to Battlecard'; btn.disabled = false; }
  }
};

window.pushCallerLeadToClay = async function() {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const webhookUrl = localStorage.getItem('clay_webhook_url');
  if (!webhookUrl) {
    const entered = prompt('Enter your Clay Inbound Webhook URL (from your Clay Table):');
    if (!entered || !entered.startsWith('http')) return;
    localStorage.setItem('clay_webhook_url', entered.trim());
  }

  const activeWebhook = localStorage.getItem('clay_webhook_url');
  const btn = document.getElementById('callerClayBtn');
  const origText = btn.innerHTML;
  btn.innerHTML = '⏳ Pushing...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/leads/${lead.id}/clay-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: activeWebhook })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to push');

    showToast(`🧊 Pushed "${lead.name}" to Clay!`);
  } catch (err) {
    showToast(`Clay Push Error: ${err.message}`, false);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
};

// ─── 8 Specialized Buyer Persona Pitch Engine ────────────────────────────────

const PERSONA_SCRIPTS = {
  FOUNDER_CEO: {
    label: 'Founder / CEO',
    getScript: (lead) => `Hi, calling from Big Binary Tech's technical advisory team. We recently ran an operations audit on ${lead.name}. As the Founder, when headcount grows faster than internal systems, operations teams get bogged down in manual workarounds. We act as an outsourced product & engineering partner to modernize workflows and cut admin drag by 60% with zero downtime. Do you have 2 minutes to hear the 3 diagnostic points we identified?`
  },
  OPERATIONS_COO: {
    label: 'COO / Operations Director',
    getScript: (lead) => `Hi, calling from Big Binary Tech. We work with COOs and Operations Directors to eliminate stock variances, accelerate branch coordination, and remove manual dispatch workarounds with unified Odoo ERP and POS automation. I noticed ${lead.name}'s backend has a couple of synchronization gaps between field orders and inventory. Are manual handoffs costing your ops team time each week?`
  },
  FINANCE_CFO: {
    label: 'CFO / Finance Director',
    getScript: (lead) => `Hi, calling from Big Binary Tech's ERP solutions team. We help CFOs and Finance Directors eliminate late month-end closes, automate AP/AR reconciliation, and ensure 100% compliance with ZATCA/VAT e-invoicing and Making Tax Digital. When systems don't talk to accounting, businesses lose hours on manual data matching. How is your finance team currently managing cross-system reconciliation?`
  },
  REVOPS_CRM: {
    label: 'Head of Revenue Operations',
    getScript: (lead) => `Hi, calling from Big Binary Tech. We work with RevOps and CRM Directors to bridge real-time synchronization between CRM (HubSpot/Salesforce/Zoho) and Odoo ERP, automate WhatsApp-to-CRM lead capture, and keep sales and finance perfectly aligned. We eliminate duplicate data entry between pipeline and billing. Is lead routing or billing sync a friction point right now?`
  },
  HR_PEOPLE: {
    label: 'HR Director / People Ops',
    getScript: (lead) => `Hi, Big Binary Tech here. We help HR Directors and People Ops leaders automate onboarding, employee self-service portals, and WPS/GOSI compliance reporting across UAE/KSA. In fact, we recently helped a regional firm reduce their monthly WPS reporting and onboarding cycle from 3 days down to under 2 hours. Would an automated HR workflow bridge be valuable for your team?`
  },
  TECH_CIO_CTO: {
    label: 'CIO / CTO / Head of IT',
    getScript: (lead) => `Hi, calling from Big Binary Tech's engineering team. We act as the specialized 24/7 ERP infrastructure and integration partner for CIOs and IT Directors. We deliver resilient API bridges, role-based security audits, and guaranteed 15-minute SLA ticket support at half standard partner rates — without overburdening your internal developers. Could your IT team benefit from specialized Odoo infrastructure support?`
  },
  RETAIL_RESTAURANT_POS: {
    label: 'Retail / Restaurant Ops Director',
    getScript: (lead) => `Hi, calling from Big Binary Tech. We work with retail and restaurant operations to deploy zero-downtime multi-branch POS, KDS, hardware integration, and real-time inventory tracking. We help managers prevent store checkout slowdowns, eliminate stock discrepancies, and speed up table turns. Are POS hardware glitches or multi-store stock sync an issue across your locations?`
  },
  MARKETING_GROWTH: {
    label: 'VP Marketing / Head of Growth',
    getScript: (lead) => `Hi, calling from Big Binary Tech's growth advisory group. We work with Marketing Leaders and Growth Directors to build high-converting inbound funnels, localized Arabic/English lead capture, and automated attribution tracking so every dollar spent links directly to closed deals. Are you looking to lower customer acquisition costs or improve lead quality this quarter?`
  }
};

window.setCallerPersona = function(personaKey) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const personaConfig = PERSONA_SCRIPTS[personaKey] || PERSONA_SCRIPTS.FOUNDER_CEO;

  // Update button active states
  document.querySelectorAll('.persona-btn').forEach(btn => {
    if (btn.getAttribute('data-persona') === personaKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update badge
  const badge = document.getElementById('activePersonaBadge');
  if (badge) badge.textContent = personaConfig.label;

  // Update Script box
  const scriptBox = document.getElementById('callScriptBox');
  if (scriptBox) {
    scriptBox.textContent = personaConfig.getScript(lead);
  }
};
