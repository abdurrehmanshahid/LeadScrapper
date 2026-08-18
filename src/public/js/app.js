// Dashboard Client Logic for Big Binary Tech

let allLeads = [];
let pollingInterval = null;
let currentModalLeadId = null;

document.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  fetchLeads();

  // Forms
  document.getElementById('gmapsForm').addEventListener('submit', handleGmapsSubmit);
  document.getElementById('odooForm').addEventListener('submit', handleOdooSubmit);

  // Filters
  document.getElementById('filterCategory').addEventListener('change', fetchLeads);
  document.getElementById('filterMinScore').addEventListener('change', fetchLeads);
  document.getElementById('filterCallStatus').addEventListener('change', fetchLeads);
  document.getElementById('searchInput').addEventListener('input', debounce(fetchLeads, 300));

  // Actions
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    window.location.href = '/api/export/csv';
  });

  document.getElementById('clearLeadsBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all leads in the local database?')) {
      await fetch('/api/leads/clear', { method: 'POST' });
      fetchStats();
      fetchLeads();
    }
  });

  // Modal Close
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('leadModal').addEventListener('click', (e) => {
    if (e.target.id === 'leadModal') closeModal();
  });
});

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    document.getElementById('statTotalLeads').textContent = data.total_leads || 0;
    document.getElementById('statBpoRescues').textContent = data.bpo_rescues || 0;
    document.getElementById('statNewImpl').textContent = data.new_implementations || 0;
    document.getElementById('statHighFit').textContent = data.high_fit_leads || 0;
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function fetchLeads() {
  const category = document.getElementById('filterCategory').value;
  const minScore = document.getElementById('filterMinScore').value;
  const callStatus = document.getElementById('filterCallStatus').value;
  const search = document.getElementById('searchInput').value;

  const params = new URLSearchParams();
  if (category !== 'ALL') params.append('category', category);
  if (minScore > 0) params.append('min_score', minScore);
  if (callStatus !== 'ALL') params.append('call_status', callStatus);
  if (search) params.append('search', search);

  try {
    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();
    allLeads = data.leads || [];
    renderLeadsTable(allLeads);
  } catch (err) {
    console.error('Failed to fetch leads:', err);
  }
}

function renderLeadsTable(leads = allLeads) {
  const tbody = document.getElementById('leadsTableBody');
  if (!leads || leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
          No leads matching current filters. Run a discovery search above!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = leads.map(lead => {
    const isRescue = lead.category === 'BPO_RESCUE';
    const catBadge = isRescue 
      ? '<span class="badge badge-rescue">🛡️ ODOO BPO / RESCUE</span>' 
      : '<span class="badge badge-new">📍 NEW IMPLEMENTATION</span>';

    const score = lead.success_chance_pct || 50;
    let scoreClass = 'score-med';
    if (score >= 75) scoreClass = 'score-high';
    else if (score < 50) scoreClass = 'score-low';

    const scorePill = `<span class="score-pill ${scoreClass}">🎯 ${score}%</span>`;
    const techBadges = (lead.tech_stack || []).slice(0, 2).map(t => 
      `<span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; color: #cbd5e1; margin-right: 4px;">${t}</span>`
    ).join('');

    let statusColor = '#9ca3af';
    if (lead.call_status === 'Interested') statusColor = '#34d399';
    if (lead.call_status === 'Callback Requested') statusColor = '#fbbf24';

    const ratingDisplay = lead.rating
      ? (lead.reviews_count && lead.reviews_count > 0 ? `⭐ ${lead.rating} (${lead.reviews_count} revs)` : `⭐ ${lead.rating} (Star Rating)`)
      : `${lead.employee_size || '11-50'} staff`;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #f9fafb; font-size: 0.95rem;">${escapeHtml(lead.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(lead.employee_size || '11-50')} staff | ${ratingDisplay}</div>
        </td>
        <td>${catBadge}</td>
        <td>${scorePill}</td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(lead.industry || 'Business')}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(lead.location || 'Local')}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: #818cf8;">${escapeHtml(lead.phone || 'No Phone')}</div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 1px;">${escapeHtml(lead.email || '')}</div>
          <a href="${escapeHtml(lead.website)}" target="_blank" style="font-size: 0.75rem; color: #38bdf8; text-decoration: none;">
            ${escapeHtml(lead.website ? lead.website.replace(/^https?:\/\//, '').split('/')[0] : '')} ↗
          </a>
        </td>
        <td>
          <div>${techBadges}</div>
          <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 2px;">© ${lead.copyright_year || 'Recent'}</div>
        </td>
        <td>
          <span style="font-size: 0.75rem; font-weight: 700; color: ${statusColor};">
            ● ${escapeHtml(lead.call_status || 'Uncalled')}
          </span>
        </td>
        <td style="white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="openLeadModal('${lead.id}')" style="margin-right: 4px;" title="View battlecard & intelligence">
            📋 Battlecard
          </button>
          <button class="btn btn-secondary btn-sm" onclick="editLeadDirect('${lead.id}')" style="margin-right: 4px; color: #38bdf8; border-color: rgba(56,189,248,0.4);" title="Edit company details & pitch">
            ✏️ Edit
          </button>
          <button class="btn btn-secondary btn-sm" onclick="deleteLead('${lead.id}')" style="color: #fb7185; border-color: rgba(251,113,133,0.3);" title="Delete this lead">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.editLeadDirect = function(id) {
  currentModalLeadId = id;
  window.openDashboardEditModal();
};

// Modal View
window.openLeadModal = function(id) {
  const lead = allLeads.find(l => l.id === id);
  if (!lead) return;
  currentModalLeadId = id;

  document.getElementById('modalCompanyName').textContent = lead.name;
  const metaParts = [lead.industry, lead.location, lead.phone && `📞 ${lead.phone}`, lead.email && `✉ ${lead.email}`].filter(Boolean);
  document.getElementById('modalMeta').textContent = metaParts.join(' • ');

  const isRescue = lead.category === 'BPO_RESCUE';
  document.getElementById('modalCategoryBadge').innerHTML = isRescue
    ? '<span class="badge badge-rescue">🛡️ ODOO BPO / RESCUE</span>'
    : '<span class="badge badge-new">📍 NEW IMPLEMENTATION</span>';

  const modalScore = lead.success_chance_pct || 50;
  let modalScoreClass = 'score-med';
  if (modalScore >= 75) modalScoreClass = 'score-high';
  else if (modalScore < 50) modalScoreClass = 'score-low';
  document.getElementById('modalScorePill').innerHTML = `<span class="score-pill ${modalScoreClass}">🎯 ${modalScore}% Success Chance (${lead.fit_tier})</span>`;
  document.getElementById('modalSizeBadge').innerHTML = `<span class="badge" style="background: rgba(255,255,255,0.08);">👥 Team Size: ${lead.employee_size || '11-50'}</span>`;

  // Decision Makers
  const dms = lead.decision_makers || [];
  const dmSection = document.getElementById('modalDecisionMakersSection');
  const dmContainer = document.getElementById('modalDecisionMakers');
  dmSection.style.display = 'block';
  if (dms.length > 0) {
    dmContainer.innerHTML = dms.map(dm => {
      const sourceIcon = dm.source === 'linkedin_google' ? '🔗' : '🌐';
      const linkedinLink = dm.linkedin_url
        ? `<a href="${escapeHtml(dm.linkedin_url)}" target="_blank" style="color: #818cf8; font-size: 0.7rem; text-decoration: none; display: block; margin-top: 2px;">${sourceIcon} LinkedIn ↗</a>`
        : `<span style="color: #64748b; font-size: 0.7rem;">${sourceIcon} ${dm.source === 'linkedin_google' ? 'via Google' : 'Company Site'}</span>`;
      const emailHint = dm.email_guess
        ? `<div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;" title="Guessed from domain — verify before sending">✉ ${escapeHtml(dm.email_guess)}</div>`
        : '';
      return `
        <div style="background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.25); border-radius: 8px; padding: 0.65rem 0.9rem; min-width: 180px;">
          <div style="font-weight: 700; color: #f1f5f9; font-size: 0.875rem;">${escapeHtml(dm.name)}</div>
          <div style="font-size: 0.775rem; color: #a78bfa; margin-top: 1px;">${escapeHtml(dm.title)}</div>
          ${linkedinLink}
          ${emailHint}
        </div>`;
    }).join('');
  } else {
    const liSearch = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(lead.name)}`;
    const gSearch = `https://www.google.com/search?q=${encodeURIComponent('"' + lead.name + '"')}`;
    dmContainer.innerHTML = `
      <div style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.4rem 0;">
        <span>No contacts found automatically.</span>
        <a href="${liSearch}" target="_blank" style="color: #818cf8; text-decoration: none; font-weight: 600;">🔗 Search LinkedIn ↗</a>
        <a href="${gSearch}" target="_blank" style="color: #38bdf8; text-decoration: none; font-weight: 600;">🔍 Google Search ↗</a>
      </div>`;
  }

  // Pre-Call Intelligence Dossier
  renderModalIntel(lead);

  // AI Review Dossier & Semantic Fit
  const dossierSection = document.getElementById('modalDossierSection');
  const dossierText = document.getElementById('modalDossierText');
  const semanticFitBadge = document.getElementById('modalSemanticFitBadge');
  const dossier = lead.review_dossier || (lead.battlecard && lead.battlecard.review_dossier);
  const csFit = lead.case_study_fit || (lead.battlecard && lead.battlecard.case_study_fit);

  if (dossier && dossier.summary) {
    dossierSection.style.display = 'block';
    const dossierParts = dossier.parts && dossier.parts.length > 0 ? dossier.parts : [dossier.summary];
    const icons = ['🏢', '💬', '💼', '📝', '📰'];
    dossierText.innerHTML = dossierParts.map((p, i) =>
      `<span style="display:block; margin-bottom: 0.35rem; line-height: 1.45; font-size: 0.83rem;">${icons[i] || '•'} ${escapeHtml(p)}</span>`
    ).join('');
    if (csFit && csFit.semantic_fit_pct) {
      semanticFitBadge.textContent = `🎯 ${csFit.semantic_fit_pct}% Case Study Fit (${csFit.matched_case_study})`;
    } else {
      semanticFitBadge.textContent = `🚨 ${dossier.top_friction || 'High Priority'}`;
    }
  } else {
    dossierSection.style.display = 'none';
  }

  // Battlecard
  const bc = lead.battlecard || {};
  const problemList = document.getElementById('modalProblemList');
  problemList.innerHTML = (bc.problem_analysis || [
    `Digital footprint dated: Website copyright is ${lead.copyright_year || 'Legacy'}.`,
    'No integrated customer or job-dispatch portal detected.'
  ]).map(p => `<li>${escapeHtml(p)}</li>`).join('');

  document.getElementById('modalOpener').textContent = bc.elevator_opener || 'Hello, we noticed your client portal is running on legacy tech...';
  document.getElementById('modalOffer').textContent = bc.target_offer || 'Odoo Core + n8n automation workflows by Big Binary Tech.';
  document.getElementById('modalCallerLink').href = `caller.html?id=${lead.id}`;

  document.getElementById('leadModal').style.display = 'flex';
};

function closeModal() {
  document.getElementById('leadModal').style.display = 'none';
  currentModalLeadId = null;
}

window.deleteLead = async function(id) {
  if (!confirm('Remove this lead from the database?')) return;
  try {
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    allLeads = allLeads.filter(l => l.id !== id);
    renderLeadsTable(allLeads);
    fetchStats();
  } catch (err) {
    console.error('Failed to delete lead:', err);
  }
};

// Scraping Handlers
async function handleGmapsSubmit(e) {
  e.preventDefault();
  const query = document.getElementById('gmapsQuery').value;
  const location = document.getElementById('gmapsLocation').value;
  const max = document.getElementById('gmapsMax').value;

  startPollingTerminal();
  try {
    await fetch('/api/scrape/gmaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, max_results: max })
    });
  } catch (err) {
    console.error('Failed to trigger scrape:', err);
  }
}

async function handleOdooSubmit(e) {
  e.preventDefault();
  const region = document.getElementById('odooRegion').value;
  const industry = document.getElementById('odooIndustry').value;
  const max = document.getElementById('odooMax').value;

  startPollingTerminal();
  try {
    await fetch('/api/scrape/odoo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region, industry, max_results: max })
    });
  } catch (err) {
    console.error('Failed to trigger Odoo scrape:', err);
  }
}

function startPollingTerminal() {
  const container = document.getElementById('terminalContainer');
  const box = document.getElementById('terminalBox');
  const badge = document.getElementById('jobBadge');
  container.style.display = 'block';

  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/scrape/status');
      const data = await res.json();

      badge.textContent = data.is_running ? 'SCRAPING & AUDITING...' : 'IDLE / COMPLETE';
      badge.className = data.is_running ? 'badge badge-rescue' : 'badge badge-new';

      box.innerHTML = (data.logs || []).map(l => `<div>${escapeHtml(l)}</div>`).join('');
      box.scrollTop = box.scrollHeight;

      if (!data.is_running && data.logs.length > 0) {
        clearInterval(pollingInterval);
        fetchStats();
        fetchLeads();
      }
    } catch (err) {
      console.error('Error polling status:', err);
    }
  }, 1000);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function renderModalIntel(lead) {
  const section = document.getElementById('modalIntelSection');
  const grid = document.getElementById('modalIntelGrid');
  const newsRow = document.getElementById('modalIntelNewsRow');
  const yelpRow = document.getElementById('modalIntelYelpRow');

  const intel = lead.deep_intel;
  if (!intel) { section.style.display = 'none'; return; }

  const tiles = [];

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

  const corp = intel.corporation;
  if (corp?.legal_name) {
    tiles.push({ icon: '📋', label: 'Legal Entity', value: `${corp.legal_name}${corp.jurisdiction ? ' · ' + corp.jurisdiction : ''}${corp.current_status ? ' · ' + corp.current_status : ''}` });
  }

  if (corp?.officers?.length > 0) {
    const officerList = corp.officers.map(o => `${o.name}${o.position ? ' (' + o.position + ')' : ''}`).join(', ');
    tiles.push({ icon: '👔', label: 'Registered Officers', value: officerList });
  }

  if (intel.yelp?.yelp_rating) {
    tiles.push({ icon: '⭐', label: 'Yelp Rating', value: `${intel.yelp.yelp_rating}★${intel.yelp.yelp_review_count ? ' · ' + intel.yelp.yelp_review_count + ' reviews' : ''}` });
  }

  const hiringSignals = intel.hiring?.hiring_signals || [];
  const jobCount = intel.hiring?.total_openings || 0;
  if (hiringSignals.length > 0) {
    tiles.push({ icon: '💼', label: `Hiring (${jobCount} open ${jobCount === 1 ? 'role' : 'roles'})`, value: hiringSignals.join(' · ') });
  }

  if (intel.bbb?.complaints_count != null) {
    const count = intel.bbb.complaints_count;
    tiles.push({ icon: count > 5 ? '⚠️' : '📝', label: 'BBB Complaints', value: count === 0 ? 'None on record' : `${count} filed` });
  }

  if (tiles.length === 0) { section.style.display = 'none'; return; }

  grid.innerHTML = tiles.map(t => `
    <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(16,185,129,0.2); border-radius: 7px; padding: 0.5rem 0.75rem;">
      <div style="font-size: 0.65rem; color: #6ee7b7; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.15rem;">${t.icon} ${escapeHtml(t.label)}</div>
      <div style="font-size: 0.78rem; color: #e2e8f0; line-height: 1.3;">${escapeHtml(t.value)}</div>
    </div>
  `).join('');

  const headline = intel.news?.latest_headline;
  if (headline) {
    document.getElementById('modalIntelNewsHeadline').textContent = ' ' + headline;
    newsRow.style.display = 'block';
  } else {
    newsRow.style.display = 'none';
  }

  const snippets = intel.yelp?.yelp_review_snippets || [];
  if (snippets.length > 0) {
    document.getElementById('modalIntelYelpSnippet').textContent = ' "' + snippets[0].substring(0, 180) + (snippets[0].length > 180 ? '…' : '') + '"';
    yelpRow.style.display = 'block';
  } else {
    yelpRow.style.display = 'none';
  }

  section.style.display = 'block';
}

window.toggleModalAddContact = function() {
  const form = document.getElementById('modalAddContactForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display !== 'none') {
    document.getElementById('modalNewContactName').focus();
  }
};

window.saveModalContact = async function() {
  const name = document.getElementById('modalNewContactName').value.trim();
  if (!name) { alert('Full name is required.'); return; }
  if (!currentModalLeadId) return;

  const title       = document.getElementById('modalNewContactTitle').value.trim();
  const email       = document.getElementById('modalNewContactEmail').value.trim();
  const linkedinUrl = document.getElementById('modalNewContactLinkedIn').value.trim();

  const lead = allLeads.find(l => l.id === currentModalLeadId);
  if (!lead) return;

  const existingDMs = lead.decision_makers || [];
  const alreadyPresent = existingDMs.some(dm => dm.name.toLowerCase() === name.toLowerCase());
  if (alreadyPresent) { alert(`"${name}" is already in the contact list.`); return; }

  const updatedDMs = [
    { name, title: title || 'Contact', email_guess: email || null, linkedin_url: linkedinUrl || null, source: 'manual' },
    ...existingDMs
  ];

  try {
    const res = await fetch(`/api/leads/${currentModalLeadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision_makers: updatedDMs })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Update failed');

    // Update local cache and re-render
    const idx = allLeads.findIndex(l => l.id === currentModalLeadId);
    if (idx >= 0) allLeads[idx] = data.lead;

    // Re-open modal with fresh data so DM list refreshes
    document.getElementById('modalAddContactForm').style.display = 'none';
    document.getElementById('modalNewContactName').value = '';
    document.getElementById('modalNewContactTitle').value = '';
    document.getElementById('modalNewContactEmail').value = '';
    document.getElementById('modalNewContactLinkedIn').value = '';
    window.openLeadModal(currentModalLeadId);
  } catch (err) {
    alert('Failed to save contact: ' + err.message);
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// ─── Dashboard Full Company & Pitch Editor Modal ─────────────────────────────

window.openDashboardEditModal = function() {
  const lead = allLeads.find(l => l.id === currentModalLeadId);
  if (!lead) return;

  // Profile Tab
  document.getElementById('dashEditName').value = lead.name || '';
  document.getElementById('dashEditWebsite').value = lead.website || '';
  document.getElementById('dashEditPhone').value = lead.phone || '';
  document.getElementById('dashEditEmail').value = lead.email || '';
  document.getElementById('dashEditAddress').value = lead.address || lead.location || '';
  document.getElementById('dashEditIndustry').value = lead.industry || '';
  document.getElementById('dashEditSize').value = lead.employee_size || '';

  // Decision Makers Tab
  const dms = lead.decision_makers || [];
  const contactsContainer = document.getElementById('dashModalContactsList');
  contactsContainer.innerHTML = '';
  if (dms.length > 0) {
    dms.forEach((dm, idx) => addDashboardModalContactRow(dm, idx));
  } else {
    addDashboardModalContactRow();
  }

  // Social Media Tab
  const social = lead.social_media || {};
  document.getElementById('dashEditSocialLinkedIn').value = social.linkedin || '';
  document.getElementById('dashEditSocialTwitter').value = social.twitter || '';
  document.getElementById('dashEditSocialFacebook').value = social.facebook || '';
  document.getElementById('dashEditSocialInstagram').value = social.instagram || '';

  // Pitch Tab
  const bc = lead.battlecard || {};
  document.getElementById('dashEditPitchHook').value = bc.elevator_pitch || bc.elevator_opener || '';
  document.getElementById('dashEditPitchAngle').value = bc.big_binary_angle || bc.target_offer || '';
  
  const painPoints = bc.pain_points || bc.problem_analysis || [];
  document.getElementById('dashEditPitchPainPoints').value = Array.isArray(painPoints) ? painPoints.join('\n') : String(painPoints || '');

  const objections = bc.objection_responses || bc.custom_objections || {};
  let objText = '';
  if (typeof objections === 'object') {
    objText = Object.entries(objections).map(([k, v]) => `${k}: ${v}`).join('\n\n');
  } else {
    objText = String(objections || '');
  }
  document.getElementById('dashEditPitchObjections').value = objText;

  switchDashboardEditTab('profile');
  document.getElementById('dashboardEditModal').style.display = 'flex';
};

window.closeDashboardEditModal = function() {
  document.getElementById('dashboardEditModal').style.display = 'none';
};

window.switchDashboardEditTab = function(tabName) {
  const tabs = ['profile', 'contacts', 'social', 'pitch'];
  tabs.forEach(t => {
    const btn = document.getElementById(`dashTabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const content = document.getElementById(`dashTabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
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

window.addDashboardModalContactRow = function(contact = {}, idx = null) {
  const container = document.getElementById('dashModalContactsList');
  const rowId = `dash_dm_row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'dash-modal-contact-row';
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

window.saveDashboardCompanyEdits = async function() {
  const lead = allLeads.find(l => l.id === currentModalLeadId);
  if (!lead) return;

  const name = document.getElementById('dashEditName').value.trim();
  if (!name) {
    alert('Company Name is required');
    switchDashboardEditTab('profile');
    return;
  }

  // Gather Contacts
  const contactRows = document.querySelectorAll('#dashModalContactsList .dash-modal-contact-row');
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
    linkedin: document.getElementById('dashEditSocialLinkedIn').value.trim() || null,
    twitter: document.getElementById('dashEditSocialTwitter').value.trim() || null,
    facebook: document.getElementById('dashEditSocialFacebook').value.trim() || null,
    instagram: document.getElementById('dashEditSocialInstagram').value.trim() || null
  };

  // Gather Pitch & Battlecard
  const painPointsRaw = document.getElementById('dashEditPitchPainPoints').value.split('\n').map(s => s.trim()).filter(Boolean);
  const updatedBattlecard = {
    ...(lead.battlecard || {}),
    elevator_pitch: document.getElementById('dashEditPitchHook').value.trim(),
    elevator_opener: document.getElementById('dashEditPitchHook').value.trim(),
    big_binary_angle: document.getElementById('dashEditPitchAngle').value.trim(),
    target_offer: document.getElementById('dashEditPitchAngle').value.trim(),
    pain_points: painPointsRaw,
    problem_analysis: painPointsRaw,
    custom_objections: document.getElementById('dashEditPitchObjections').value.trim()
  };

  const payload = {
    name,
    website: document.getElementById('dashEditWebsite').value.trim() || '',
    phone: document.getElementById('dashEditPhone').value.trim() || '',
    email: document.getElementById('dashEditEmail').value.trim() || '',
    address: document.getElementById('dashEditAddress').value.trim() || '',
    industry: document.getElementById('dashEditIndustry').value.trim() || lead.industry,
    employee_size: document.getElementById('dashEditSize').value.trim() || lead.employee_size,
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

    // Update local cache
    const idx = allLeads.findIndex(l => l.id === lead.id);
    if (idx >= 0) allLeads[idx] = data.lead || { ...lead, ...payload };

    closeDashboardEditModal();
    renderLeadsTable(allLeads);
    window.openLeadModal(lead.id);
  } catch (err) {
    console.error('Error saving company edits:', err);
    alert(`Failed to save changes: ${err.message}`);
  }
};

window.triggerAISearch = async function() {
  const query = document.getElementById('searchInput').value.trim();
  const btn = document.getElementById('aiSearchBtn');
  if (btn) btn.textContent = '⏳ Searching...';
  try {
    await fetchLeads();
  } finally {
    if (btn) btn.textContent = '🔍 AI Search';
  }
};

window.mineNewFromSearch = function() {
  const raw = document.getElementById('searchInput').value.trim();
  if (!raw) { alert('Type a query first — e.g. "Commercial Roofing in Dallas TX"'); return; }

  // Split "Industry in Location" → populate both fields
  // Matches: "roofing contractors in Dallas, TX" or "dental clinics near Houston"
  const locationMatch = raw.match(/\s+(?:in|near|around)\s+(.+)$/i);
  let keyword = raw;
  let location = document.getElementById('gmapsLocation').value || '';

  if (locationMatch) {
    keyword  = raw.slice(0, raw.length - locationMatch[0].length).trim();
    location = locationMatch[1].trim();
  }

  document.getElementById('gmapsQuery').value    = keyword;
  document.getElementById('gmapsLocation').value = location;

  // Scroll to the pipeline and fire the scrape
  document.getElementById('gmapsForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => document.getElementById('gmapsForm').requestSubmit(), 400);
};

window.clearSearch = function() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterCategory').value = 'ALL';
  document.getElementById('filterMinScore').value = '0';
  document.getElementById('filterCallStatus').value = 'ALL';
  fetchLeads();
};

window.runLeadAiEnrich = async function() {
  if (!currentModalLeadId) return;
  const btn = document.getElementById('modalAiEnrichBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ AI Researching...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/leads/${currentModalLeadId}/ai-enrich`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'AI Enrichment failed');

    // Update local lead cache
    const idx = allLeads.findIndex(l => l.id === currentModalLeadId);
    if (idx >= 0) allLeads[idx] = data.lead;

    window.openLeadModal(currentModalLeadId);
    renderLeadsTable(allLeads);
    alert(`✨ Successfully enriched "${data.lead.name}" with verified intelligence!`);
  } catch (err) {
    alert(`AI Enrichment error: ${err.message}`);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// ─── Automated Clay Integration Handlers ─────────────────────────────────────

window.openClayConfigModal = function() {
  const savedUrl = localStorage.getItem('clay_webhook_url') || '';
  document.getElementById('clayWebhookInput').value = savedUrl;
  document.getElementById('clayConfigModal').style.display = 'flex';
};

window.closeClayConfigModal = function() {
  document.getElementById('clayConfigModal').style.display = 'none';
};

window.saveClayConfig = function() {
  const url = document.getElementById('clayWebhookInput').value.trim();
  if (url && !url.startsWith('http')) {
    alert('Please enter a valid URL (e.g. https://api.clay.com/v3/sources/webhook/...)');
    return;
  }
  localStorage.setItem('clay_webhook_url', url);
  closeClayConfigModal();
  alert('✓ Clay Webhook configuration saved!');
};

window.pushCurrentLeadToClay = async function() {
  if (!currentModalLeadId) return;
  const webhookUrl = localStorage.getItem('clay_webhook_url');
  if (!webhookUrl) {
    alert('Please configure your Clay Webhook URL first via "⚙️ Clay Setup" in the top bar!');
    openClayConfigModal();
    return;
  }

  const btn = document.getElementById('modalClayPushBtn');
  const origText = btn.innerHTML;
  btn.innerHTML = '⏳ Pushing to Clay...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/leads/${currentModalLeadId}/clay-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: webhookUrl })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to push to Clay');

    alert(`🧊 Dispatched lead to Clay! Clay is running waterfall enrichment and will update contacts automatically.`);
  } catch (err) {
    alert(`Clay Push Error: ${err.message}`);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
};

window.pushTopTierLeadsToClay = async function() {
  const webhookUrl = localStorage.getItem('clay_webhook_url');
  if (!webhookUrl) {
    alert('Please configure your Clay Webhook URL first via "⚙️ Clay Setup" in the top bar!');
    openClayConfigModal();
    return;
  }

  const btn = document.getElementById('batchClayBtn');
  const origText = btn.innerHTML;
  btn.innerHTML = '⏳ Dispatching to Clay...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/leads/clay-batch-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: webhookUrl, min_score: 85, limit: 50 })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || data.message || 'Batch push failed');

    alert(`🧊 ${data.message}`);
  } catch (err) {
    alert(`Clay Batch Error: ${err.message}`);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
};

window.handleClayCsvUpload = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    if (!text || text.length < 10) {
      alert('The selected CSV file is empty.');
      return;
    }

    const btn = document.getElementById('syncClayCsvBtn');
    const origText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = '⏳ Syncing...'; btn.disabled = true; }

    try {
      const rows = parseCsvText(text);
      if (rows.length === 0) throw new Error('Could not parse any rows from the CSV file.');

      const res = await fetch('/api/leads/import-clay-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Sync failed');

      alert(`✅ ${data.message}`);
      await fetchLeads();
      await fetchStats();
    } catch (err) {
      alert(`Clay Sync Error: ${err.message}`);
    } finally {
      if (btn) { btn.innerHTML = origText; btn.disabled = false; }
      event.target.value = '';
    }
  };
  reader.readAsText(file);
};

function parseCsvText(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line) => {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur.trim());
    return values.map(v => v.replace(/^"|"$/g, '').trim());
  };

  const headers = parseLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length >= headers.length / 2) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }
  }

  return rows;
}
