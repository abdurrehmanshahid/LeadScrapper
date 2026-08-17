// SDR Caller Client Logic for Big Binary Tech

let callerLeads = [];
let currentIndex = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');

  await loadCallerLeads(targetId);

  document.getElementById('prevLeadBtn').addEventListener('click', () => navigateLead(-1));
  document.getElementById('nextLeadBtn').addEventListener('click', () => navigateLead(1));
  document.getElementById('callerCategoryFilter').addEventListener('change', () => loadCallerLeads());

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
  const params = new URLSearchParams();
  if (category !== 'ALL') params.append('category', category);

  try {
    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();
    callerLeads = data.leads || [];

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
  scorePill.textContent = `🎯 ${lead.success_chance_pct || 80}% Success Chance (${lead.fit_tier || 'High'})`;

  document.getElementById('callCompanyName').textContent = lead.name;
  const callerMetaParts = [
    lead.industry || 'Industry',
    lead.location || 'Metro',
    `Team: ${lead.employee_size || '11-50'}`,
    `⭐ ${lead.rating || '4.5'} (${lead.reviews_count || 0} reviews)`,
    lead.email ? `✉ ${lead.email}` : null
  ].filter(Boolean);
  document.getElementById('callCompanyMeta').textContent = callerMetaParts.join(' • ');

  const phone = lead.phone || '';
  const isMissingPhone = !phone || phone === '(555) 000-0000';
  document.getElementById('callPhoneNumber').innerHTML = isMissingPhone
    ? `<span style="color: #64748b; font-size: 0.9rem;">No phone found</span>
       <button onclick="document.getElementById('callEditPhoneRow').style.display='block'; document.getElementById('editPhoneInput').focus();"
         style="background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.4); color: #fbbf24; border-radius: 6px; padding: 0.18rem 0.55rem; font-size: 0.72rem; cursor: pointer; font-weight: 700; margin-left: 8px;">
         ✏️ Add Phone
       </button>`
    : `<a href="tel:${phone.replace(/[^0-9+]/g, '')}" style="color: #818cf8; text-decoration: none;" title="Click to Dial">${escapeHtml(phone)}</a>
       <button onclick="navigator.clipboard.writeText('${phone}'); showToast('📋 Phone copied!');" style="background: none; border: none; cursor: pointer; font-size: 0.9rem; color: var(--text-muted); margin-left: 6px;" title="Copy">📋</button>
       <button onclick="document.getElementById('callEditPhoneRow').style.display='block'; document.getElementById('editPhoneInput').value='${phone}'; document.getElementById('editPhoneInput').focus();"
         style="background: none; border: none; cursor: pointer; font-size: 0.8rem; color: var(--text-muted); margin-left: 2px;" title="Edit phone">✏️</button>`;

  // Reset edit phone row
  const editPhoneRow = document.getElementById('callEditPhoneRow');
  editPhoneRow.style.display = 'none';
  document.getElementById('editPhoneInput').value = '';
  document.getElementById('callWebsiteLink').innerHTML = lead.website 
    ? `<a href="${lead.website}" target="_blank" style="color: #38bdf8; text-decoration: none;">${lead.website.replace(/^https?:\/\//, '').split('/')[0]} ↗</a>` 
    : '';

  // Decision Makers
  const dms = lead.decision_makers || [];
  const dmSection = document.getElementById('callDecisionMakersSection');
  const dmContainer = document.getElementById('callDecisionMakers');
  dmSection.style.display = 'block';
  if (dms.length > 0) {
    dmContainer.innerHTML = dms.map(dm => {
      const safeName = dm.name.replace(/'/g, "\\'");
      const linkedinBtn = dm.linkedin_url
        ? `<a href="${escapeHtml(dm.linkedin_url)}" target="_blank" style="font-size: 0.7rem; color: #818cf8; text-decoration: none; margin-left: 6px;">🔗 LinkedIn ↗</a>`
        : '';
      const emailHint = dm.email_guess
        ? `<div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">✉ ${escapeHtml(dm.email_guess)}</div>`
        : '';
      return `
        <div style="background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.3); border-radius: 8px; padding: 0.6rem 0.9rem; cursor: pointer;"
          onclick="navigator.clipboard.writeText('${safeName}'); showToast('📋 ${safeName} copied!');"
          title="Click to copy name to clipboard">
          <div style="font-weight: 700; color: #f1f5f9; font-size: 0.875rem;">${escapeHtml(dm.name)} ${linkedinBtn}</div>
          <div style="font-size: 0.775rem; color: #a78bfa;">${escapeHtml(dm.title)}</div>
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

  // Pre-Call Intelligence Dossier (deep_intel)
  renderIntelDossier(lead);

  // AI Review Audit Dossier & Semantic Fit
  const dossierSection = document.getElementById('callDossierSection');
  const dossierText = document.getElementById('callDossierText');
  const semanticFitBadge = document.getElementById('callSemanticFitBadge');
  const dossier = lead.review_dossier || (lead.battlecard && lead.battlecard.review_dossier);
  const csFit = lead.case_study_fit || (lead.battlecard && lead.battlecard.case_study_fit);

  if (dossier && dossier.summary) {
    dossierSection.style.display = 'block';
    // Render each part on its own line for readability in the caller portal
    const dossierParts = dossier.parts && dossier.parts.length > 0 ? dossier.parts : [dossier.summary];
    dossierText.innerHTML = dossierParts.map((p, i) => {
      const icons = ['🏢', '💬', '💼', '📝', '📰'];
      return `<span style="display:block; margin-bottom: ${i < dossierParts.length - 1 ? '0.5rem' : '0'}; line-height: 1.5;">${icons[i] || '•'} ${escapeHtml(p)}</span>`;
    }).join('');
    if (csFit && csFit.semantic_fit_pct) {
      semanticFitBadge.textContent = `🎯 ${csFit.semantic_fit_pct}% Case Study Fit (${csFit.matched_case_study})`;
    } else {
      semanticFitBadge.textContent = `🚨 ${dossier.top_friction || 'High Priority'}`;
    }
  } else {
    dossierSection.style.display = 'none';
  }

  // Consultative Technical Diagnostic & Advisory Box
  const advisorySection = document.getElementById('callAdvisorySection');
  const bc = lead.battlecard || {};

  if (advisorySection) {
    advisorySection.style.display = 'block';
    const fragilityScore = bc.vulnerability_score || (lead.category === 'BPO_RESCUE' ? 82 : 74);
    const fragilityBadge = document.getElementById('callFragilityBadge');
    if (fragilityBadge) {
      fragilityBadge.textContent = `🚨 ${fragilityScore}% Fragility Risk`;
      if (fragilityScore >= 80) {
        fragilityBadge.style.background = 'rgba(239,68,68,0.25)';
        fragilityBadge.style.color = '#f87171';
      } else {
        fragilityBadge.style.background = 'rgba(245,158,11,0.2)';
        fragilityBadge.style.color = '#fbbf24';
      }
    }

    const leakBadge = document.getElementById('callLeakBadge');
    if (leakBadge) {
      leakBadge.textContent = `💸 Leak: ${bc.estimated_financial_leak || '$45K-$80K/yr'}`;
    }

    const flagsContainer = document.getElementById('callVulnerabilityFlags');
    if (flagsContainer) {
      const flags = bc.vulnerability_flags && bc.vulnerability_flags.length > 0
        ? bc.vulnerability_flags
        : [
            lead.category === 'BPO_RESCUE'
              ? '🚨 ERP Support Debt: Escalating partner hourly costs & slow SLA resolution'
              : '⚠️ Disconnected Workflow Island: Intake, dispatch & billing operate in silos'
          ];
      flagsContainer.innerHTML = flags.map(f => `
        <div style="font-size: 0.78rem; font-weight: 700; color: #fecaca; display: flex; align-items: center; gap: 6px;">
          ${escapeHtml(f)}
        </div>
      `).join('');
    }

    const prescriptionContainer = document.getElementById('call3StepPrescription');
    if (prescriptionContainer) {
      const steps = bc.advisory_3step_plan || [
        { step: '1. Technical Diagnostic', action: 'Scan database health, API latency & intake forms to locate churn bottlenecks.' },
        { step: '2. Workflow Automation Bridge', action: 'Deploy n8n webhooks to automate CRM, dispatch & billing with 0 double-entry.' },
        { step: '3. Zero-Downtime Migration', action: 'Migrate to unified Odoo v18 with full staff onboarding and 0 disruption.' }
      ];
      prescriptionContainer.innerHTML = steps.map(s => `
        <div>
          <span style="font-weight: 800; color: #a5b4fc;">${escapeHtml(s.step)}:</span>
          <span style="color: #cbd5e1; margin-left: 4px;">${escapeHtml(s.action)}</span>
        </div>
      `).join('');
    }
  }

  // Problem Analysis
  const problemList = document.getElementById('callProblemList');
  const problems = bc.problem_analysis && bc.problem_analysis.length > 0
    ? bc.problem_analysis
    : [
        `Site last updated around ${lead.copyright_year || '2019'} with no client portal.`,
        `Operating on manual spreadsheets/disconnected accounting.`
      ];
  problemList.innerHTML = problems.map(p => `<li>${escapeHtml(p)}</li>`).join('');

  // Elevator Script
  document.getElementById('callScriptBox').textContent = 
    bc.elevator_opener || `Hi, I noticed ${lead.name} is running strong operations, but your web systems haven't been updated recently...`;

  // Objection Handlers
  const objList = document.getElementById('callObjectionsList');
  const objections = bc.objection_handlers && bc.objection_handlers.length > 0
    ? bc.objection_handlers
    : [
        { objection: '"We already use QuickBooks."', counter: '"QuickBooks is great for taxes, but Odoo connects your field jobs, inventory, and billing automatically."' }
      ];

  objList.innerHTML = objections.map(o => `
    <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.65rem 0.85rem; font-size: 0.825rem;">
      <div style="font-weight: 700; color: #fbbf24; margin-bottom: 0.2rem;">${escapeHtml(o.objection)}</div>
      <div style="color: #cbd5e1;">↳ ${escapeHtml(o.counter)}</div>
    </div>
  `).join('');

  document.getElementById('callNotesInput').value = lead.notes || '';
}

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

window.logOutcome = async function(status) {
  const lead = callerLeads[currentIndex];
  if (!lead) return;

  const notes = document.getElementById('callNotesInput').value;

  try {
    await fetch(`/api/leads/${lead.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes })
    });

    lead.call_status = status;
    lead.notes = notes;

    showToast(`✓ Logged as "${status}" — Advancing to next lead!`);
    setTimeout(() => {
      navigateLead(1);
    }, 400);
  } catch (err) {
    console.error('Failed to log outcome:', err);
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
  if (!intel) { section.style.display = 'none'; return; }

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

  if (tiles.length === 0) { section.style.display = 'none'; return; }

  grid.innerHTML = tiles.map(t => `
    <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 0.55rem 0.8rem;">
      <div style="font-size: 0.68rem; color: #6ee7b7; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;">${t.icon} ${escapeHtml(t.label)}</div>
      <div style="font-size: 0.8rem; color: #e2e8f0; line-height: 1.35;">${escapeHtml(t.value)}</div>
    </div>
  `).join('');

  // News headline
  const headline = intel.news?.latest_headline;
  if (headline) {
    document.getElementById('callIntelNewsHeadline').textContent = ' ' + headline;
    newsRow.style.display = 'block';
  } else {
    newsRow.style.display = 'none';
  }

  // Yelp review voice
  const snippets = intel.yelp?.yelp_review_snippets || [];
  if (snippets.length > 0) {
    document.getElementById('callIntelYelpSnippet').textContent = ' "' + snippets[0].substring(0, 200) + (snippets[0].length > 200 ? '…' : '') + '"';
    yelpRow.style.display = 'block';
  } else {
    yelpRow.style.display = 'none';
  }

  section.style.display = 'block';
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
