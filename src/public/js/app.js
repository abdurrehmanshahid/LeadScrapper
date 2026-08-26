// Dashboard Client Logic for Big Binary Tech - Lead Intelligence Engine

let allLeads = [];
let viewMode = 'table'; // 'table' or 'cards' — table is the primary view

// ── Starred (manually flagged) leads, remembered across reloads ──────────────
const STARRED_KEY = 'bb_starred_leads';

function getStarredSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STARRED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function toggleStar(leadId, btnEl) {
  if (!leadId) return;
  const starred = getStarredSet();
  const id = String(leadId);
  const row = btnEl?.closest('tr');

  if (starred.has(id)) {
    starred.delete(id);
    btnEl?.classList.remove('starred');
    if (btnEl) btnEl.textContent = '☆';
    row?.classList.remove('row-starred');
  } else {
    starred.add(id);
    btnEl?.classList.add('starred');
    if (btnEl) btnEl.textContent = '★';
    row?.classList.add('row-starred');
  }
  localStorage.setItem(STARRED_KEY, JSON.stringify([...starred]));
}

// Map a call outcome to a highlight row class (kept in sync with caller.js outcomes)
function callStatusRowClass(status) {
  switch (status) {
    case 'Interested': return 'row-interested';
    case 'Callback Requested': return 'row-callback';
    case 'No Answer / Voicemail': return 'row-voicemail';
    case 'Not a Fit': return 'row-notfit';
    case 'Do Not Call': return 'row-donotcall';
    default: return '';
  }
}

function scorePillClass(score) {
  if (score >= 80) return 'score-high';
  if (score >= 60) return 'score-med';
  return 'score-low';
}

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

const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shortHost = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

document.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  fetchLeads();

  // Forms
  document.getElementById('gmapsForm')?.addEventListener('submit', handleGmapsSubmit);
  document.getElementById('odooForm')?.addEventListener('submit', handleOdooSubmit);

  // Filters & Search
  document.getElementById('filterCategory')?.addEventListener('change', fetchLeads);
  document.getElementById('filterMinScore')?.addEventListener('change', fetchLeads);
  document.getElementById('filterCallStatus')?.addEventListener('change', fetchLeads);
  document.getElementById('leadSortFilter')?.addEventListener('change', sortAndRenderLeads);
  document.getElementById('searchInput')?.addEventListener('input', debounce(fetchLeads, 300));

  // Actions
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    window.location.href = '/api/export/csv';
  });

  document.getElementById('clearLeadsBtn')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all leads in the database?')) {
      await fetch('/api/leads/clear', { method: 'POST' });
      fetchStats();
      fetchLeads();
    }
  });

  // Modal Close
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  document.getElementById('leadModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'leadModal') closeModal();
  });
});

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const total = data.total_leads || 0;
    const highFit = data.high_fit_leads || 0;
    
    document.getElementById('statTotalLeads').textContent = total.toLocaleString();
    document.getElementById('statHighFit').textContent = highFit.toLocaleString();
    
    // Dynamic Pipeline Value calculation
    const pipelineEst = (total * 45000) / 1000000;
    document.getElementById('statPipelineVal').textContent = `$${Math.max(1.2, pipelineEst).toFixed(1)}M`;
    
    // Funnel metrics
    const discovery = total || 150;
    const qual = Math.round(discovery * 0.6) || 90;
    const proposal = Math.round(qual * 0.5) || 45;
    const won = Math.round(proposal * 0.28) || 12;
    
    document.getElementById('funnelDiscoveryCount').textContent = discovery;
    document.getElementById('funnelQualCount').textContent = qual;
    document.getElementById('funnelProposalCount').textContent = proposal;
    document.getElementById('funnelWonCount').textContent = won;
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function fetchLeads() {
  const category = document.getElementById('filterCategory')?.value || 'ALL';
  const minScore = document.getElementById('filterMinScore')?.value || '0';
  const callStatus = document.getElementById('filterCallStatus')?.value || 'ALL';
  const search = document.getElementById('searchInput')?.value || '';

  const params = new URLSearchParams();
  if (category !== 'ALL') params.append('category', category);
  if (minScore > 0) params.append('min_score', minScore);
  if (callStatus !== 'ALL') params.append('call_status', callStatus);
  if (search) params.append('search', search);

  try {
    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();
    allLeads = data.leads || [];
    sortAndRenderLeads();
  } catch (err) {
    console.error('Failed to fetch leads:', err);
  }
}

function sortAndRenderLeads() {
  const sort = document.getElementById('leadSortFilter')?.value || 'highest_fit';
  let sorted = [...allLeads];

  if (sort === 'highest_fit') {
    sorted.sort((a, b) => (b.success_chance_pct || 50) - (a.success_chance_pct || 50));
  } else if (sort === 'bpo') {
    sorted = sorted.filter(l => l.category === 'BPO_RESCUE');
  } else if (sort === 'gmaps') {
    sorted = sorted.filter(l => l.category === 'NEW_IMPLEMENTATION');
  }

  renderRankedCards(sorted.slice(0, 10));
  renderLeadsTable(sorted);
}

function renderRankedCards(leads) {
  const container = document.getElementById('activeLeadsGrid');
  if (!container) return;

  if (!leads || leads.length === 0) {
    container.innerHTML = `
      <div style="grid-column: span 2; text-align: center; padding: 2rem; color: #94a3b8;">
        No active leads found. Run discovery to mine new prospects!
      </div>
    `;
    return;
  }

  container.innerHTML = leads.map((lead, idx) => {
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    const score = lead.success_chance_pct || 75;
    const isRescue = lead.category === 'BPO_RESCUE';
    const tagSource = isRescue ? 'Odoo Enterprise' : 'Google Maps Verified';
    
    // Executive Decision Maker
    const dm = (lead.decision_makers && lead.decision_makers[0]) || { name: 'Executive Contact', title: 'Director of Ops' };
    const web = cleanWebsite(lead.website);

    // Compact contact links (website / LinkedIn / email / cell)
    const link = (href, label) => href
      ? `<a href="${escHtml(href)}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="color:#60a5fa; text-decoration:none;">${label}</a>`
      : '';
    const contactLinks = [
      web ? link(web, 'Website') : '',
      dm.linkedin_url ? link(dm.linkedin_url, 'LinkedIn') : '',
      dm.email_guess ? link('mailto:' + dm.email_guess, 'Email') : '',
      dm.cell ? link('tel:' + dm.cell, 'Cell') : ''
    ].filter(Boolean).join('<span style="color:#334155;">·</span>');

    return `
      <div class="lead-ranked-card">
        <div class="lead-card-top">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <div class="lead-rank-badge ${rankClass}">${rank}</div>
            <div class="lead-card-company" title="${escHtml(lead.name)}">${escHtml(lead.name)}</div>
          </div>
          <span style="font-size: 0.7rem; color: #94a3b8; font-weight: 700;">${escHtml(lead.employee_size || '')}</span>
        </div>

        <div style="margin-bottom: 0.4rem;">
          <div class="lead-card-contact">${escHtml(dm.name)}</div>
          <div class="lead-card-title">${escHtml(dm.title)}</div>
        </div>

        <div class="lead-card-fit-bar">
          <span>${score}% Fit ML Propensity Score</span>
          <span style="color: #34d399; font-weight: 800;">${score >= 80 ? 'Tier 1' : 'Tier 2'}</span>
        </div>

        <div class="lead-card-contact-links" style="display:flex; gap:0.5rem; align-items:center; font-size:0.72rem; margin-top:0.5rem; min-height:1rem;">
          ${contactLinks || '<span style="color:#64748b;">No contact links yet</span>'}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
          <div class="lead-card-tags">
            <span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${tagSource}</span>
          </div>
          <a href="caller.html?id=${lead.id || lead._id}" class="btn btn-accent btn-sm" style="padding: 0.25rem 0.65rem; font-size: 0.72rem;">
            Dial
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById('leadsTableBody');
  if (!tbody) return;

  if (!leads || leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
          No leads matching current filters.
        </td>
      </tr>
    `;
    return;
  }

  const starred = getStarredSet();

  tbody.innerHTML = leads.map(lead => {
    const leadId = lead.id || lead._id || '';
    const isRescue = lead.category === 'BPO_RESCUE';
    const catBadge = isRescue
      ? '<span class="badge badge-rescue">ODOO BPO</span>'
      : '<span class="badge badge-new">GMAPS</span>';

    const score = lead.success_chance_pct || 70;
    const dm = (lead.decision_makers && lead.decision_makers[0]) || { name: 'Leadership', title: 'Executive' };
    const status = lead.call_status || 'Uncalled';

    const isStarred = starred.has(String(leadId));
    // Star flag takes visual priority; otherwise color by call outcome.
    const rowClass = isStarred ? 'row-starred' : callStatusRowClass(status);

    return `
      <tr data-lead-id="${leadId}" class="${rowClass}" style="cursor: pointer;" onclick="openLeadDetail('${leadId}')">
        <td style="text-align: center;">
          <button class="row-star-btn ${isStarred ? 'starred' : ''}" title="Flag this lead"
                  onclick="event.stopPropagation(); toggleStar('${leadId}', this)">${isStarred ? '★' : '☆'}</button>
        </td>
        <td style="font-weight: 700; color: #fff;">${lead.name}</td>
        <td>${catBadge}</td>
        <td><span class="score-pill ${scorePillClass(score)}">${score}%</span></td>
        <td style="color: #3b82f6; font-family: monospace;">${lead.phone || '--'}</td>
        <td>
          <div style="font-weight: 600; color: #e2e8f0;">${dm.name}</div>
          <div style="font-size: 0.7rem; color: #94a3b8;">${dm.title}</div>
        </td>
        <td><span style="font-size: 0.75rem; color: #cbd5e1;">${status}</span></td>
        <td>
          <a href="caller.html?id=${leadId}" class="btn btn-accent btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="event.stopPropagation();">Call</a>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleViewMode() {
  const grid = document.getElementById('activeLeadsGrid');
  const table = document.getElementById('leadsTableContainer');
  const btn = document.getElementById('viewModeToggleBtn');

  if (viewMode === 'cards') {
    viewMode = 'table';
    grid.style.display = 'none';
    table.style.display = 'block';
    btn.textContent = 'Cards View';
  } else {
    viewMode = 'cards';
    grid.style.display = 'grid';
    table.style.display = 'none';
    btn.textContent = 'Table View';
  }
}

// Scraper Submission Handlers
async function handleGmapsSubmit(e) {
  e.preventDefault();
  const query = document.getElementById('gmapsQuery').value;
  const location = document.getElementById('gmapsLocation').value;
  const max = parseInt(document.getElementById('gmapsMax').value, 10);
  const btn = document.getElementById('startGmapsBtn');

  btn.disabled = true;
  btn.textContent = 'Mining Google Maps & Auditing Tech...';

  try {
    await fetch('/api/scrape/gmaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, max_results: max })
    });
    setTimeout(() => {
      fetchStats();
      fetchLeads();
      btn.disabled = false;
      btn.textContent = 'Start Discovery & Technographic Audit';
    }, 2500);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Start Discovery & Technographic Audit';
  }
}

async function handleOdooSubmit(e) {
  e.preventDefault();
  const region = document.getElementById('odooRegion').value;
  const max = parseInt(document.getElementById('odooMax').value, 10);
  const btn = document.getElementById('startOdooBtn');

  btn.disabled = true;
  btn.textContent = 'Mining Odoo Customer Directory...';

  try {
    await fetch('/api/scrape/odoo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region, max_results: max })
    });
    setTimeout(() => {
      fetchStats();
      fetchLeads();
      btn.disabled = false;
      btn.textContent = 'Start Odoo Mining & Dual Reverse-Search';
    }, 2500);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Start Odoo Mining & Dual Reverse-Search';
  }
}

// Clay Integrations
async function pushTopTierLeadsToClay() {
  const topLeads = allLeads.filter(l => (l.success_chance_pct || 0) >= 80);
  if (topLeads.length === 0) {
    alert('No Top Tier (≥80%) leads found to push.');
    return;
  }
  const webhook_url = localStorage.getItem('clay_webhook_url') || '';
  if (!webhook_url) { alert('Set your Clay webhook first (⚙️ Clay button).'); return; }
  const btn = document.getElementById('batchClayBtn');
  btn.disabled = true;
  btn.textContent = 'Pushing to Clay...';

  try {
    const res = await fetch('/api/leads/clay-batch-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: topLeads, webhook_url })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    alert(`Pushed ${data.pushed_count ?? topLeads.length} lead(s) to Clay waterfall enrichment.`);
  } catch (err) {
    alert('Failed to push to Clay: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push to Clay';
  }
}

function handleClayCsvUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);

  fetch('/api/leads/import-clay-csv', { method: 'POST', body: formData })
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
    .then(data => {
      alert(`Clay CSV synced — updated ${data.updated_count || 0} lead(s) with verified emails & cell phones.`);
      fetchLeads();
    })
    .catch(err => alert('CSV sync failed: ' + err.message))
    .finally(() => { event.target.value = ''; }); // allow re-uploading the same file
}

// Navigation Tabs & Modals
function switchNavTab(tab) {
  document.getElementById('navTabDashboard')?.classList.toggle('active', tab === 'dashboard');
  document.getElementById('navTabLeads')?.classList.toggle('active', tab === 'leads');
}

function openPipelineModal() {
  document.getElementById('pipelineModal').style.display = 'flex';
}
function closePipelineModal() {
  document.getElementById('pipelineModal').style.display = 'none';
}

function openRoiModal() {
  document.getElementById('roiModal').style.display = 'flex';
}
function closeRoiModal() {
  document.getElementById('roiModal').style.display = 'none';
}

function openLeadDetail(leadId) {
  const lead = allLeads.find(l => String(l.id || l._id) === String(leadId));
  if (!lead) return;

  const score = lead.success_chance_pct || 70;
  const status = lead.call_status || 'Uncalled';
  const isRescue = lead.category === 'BPO_RESCUE';

  document.getElementById('modalCompanyName').textContent = lead.name || 'Company Details';
  document.getElementById('modalCompanyMeta').textContent =
    [lead.industry, lead.location, isRescue ? 'Odoo BPO / Rescue' : 'New Implementation']
      .filter(Boolean).join(' · ');

  const dmLink = (href, label) => href
    ? `<a href="${escHtml(href)}" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:none;">${label}</a>`
    : '';

  const dmRows = (lead.decision_makers || []).slice(0, 4).map(dm => {
    const links = [
      dm.cell ? dmLink('tel:' + dm.cell, 'Cell: ' + escHtml(dm.cell)) : '',
      dm.email_guess ? dmLink('mailto:' + dm.email_guess, escHtml(dm.email_guess)) : '',
      dm.linkedin_url ? dmLink(dm.linkedin_url, 'LinkedIn') : ''
    ].filter(Boolean).join('<span style="color:#334155; margin:0 0.35rem;">·</span>');
    return `
    <div style="padding: 0.6rem 0.75rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
      <div style="font-weight: 700; color: #e2e8f0;">${escHtml(dm.name || 'Executive')} <span style="font-weight: 500; color: #94a3b8;">— ${escHtml(dm.title || '')}</span></div>
      ${dm.persona_label ? `<div style="font-size: 0.72rem; color: #60a5fa; margin-top: 0.15rem;">${escHtml(dm.persona_label)}</div>` : ''}
      ${links ? `<div style="font-size: 0.72rem; margin-top: 0.3rem;">${links}</div>` : ''}
    </div>`;
  }).join('') || '<div style="color:#94a3b8; font-size:0.8rem;">No decision makers identified yet.</div>';

  const infoCell = (label, value) => `
    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-sm); padding: 0.65rem 0.8rem;">
      <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.2rem;">${label}</div>
      <div style="font-size: 0.85rem; color: #e2e8f0; font-weight: 600; word-break: break-word;">${value || '—'}</div>
    </div>`;

  const web = cleanWebsite(lead.website);
  const websiteLink = web
    ? `<a href="${escHtml(web)}" target="_blank" rel="noopener" style="color:#60a5fa;">${escHtml(shortHost(web))}</a>`
    : '—';
  const linkedinLink = lead.linkedin
    ? `<a href="${escHtml(lead.linkedin)}" target="_blank" rel="noopener" style="color:#60a5fa;">Company page</a>`
    : '—';

  const analysisHtml = groundedAnalysisHtml(lead);

  document.getElementById('modalBody').innerHTML = `
    <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap;">
      <span class="score-pill ${scorePillClass(score)}">${score}% Propensity</span>
      <span style="font-size: 0.78rem; color: #cbd5e1;">Status: <strong>${status}</strong></span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin-bottom: 1.25rem;">
      ${infoCell('Phone', lead.phone ? `<a href="tel:${escHtml(lead.phone)}" style="color:#60a5fa;">${escHtml(lead.phone)}</a>` : null)}
      ${infoCell('Website', websiteLink)}
      ${infoCell('LinkedIn', linkedinLink)}
      ${infoCell('Email', lead.email ? `<a href="mailto:${escHtml(lead.email)}" style="color:#60a5fa;">${escHtml(lead.email)}</a>` : null)}
      ${infoCell('Employees', lead.employee_size)}
      ${infoCell('Industry', lead.industry)}
      ${infoCell('Rating', lead.rating ? `${lead.rating} ★ (${lead.reviews_count || 0})` : null)}
      ${infoCell('Current ERP', lead.has_odoo ? 'Odoo' : (lead.tech_stack || []).join(', '))}
    </div>

    <div style="font-size: 0.8rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem;">Decision Makers</div>
    ${dmRows}

    ${lead.battlecard ? `<div style="margin-top: 1.25rem;"><div style="font-size: 0.8rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem;">Battlecard</div><div style="font-size: 0.8rem; color: #cbd5e1; line-height: 1.5;">${typeof lead.battlecard === 'string' ? lead.battlecard : (lead.battlecard.summary || '')}</div></div>` : ''}

    <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.6rem;">
      <div style="font-size: 0.8rem; font-weight: 800; color: #fff;">Review Intelligence → Odoo</div>
      <button id="dashAnalysisBtn" onclick="runDashboardAnalysis('${lead.id || lead._id}')" class="btn btn-primary btn-sm">${lead.grounded_analysis ? 'Re-run Analysis' : 'Run Gemini Analysis'}</button>
    </div>
    <div id="dashAnalysisBox" style="margin-top: 0.75rem;">${analysisHtml}</div>

    <div style="margin-top: 1.5rem; display: flex; gap: 0.6rem;">
      <a href="caller.html?id=${lead.id || lead._id}" class="btn btn-accent">Open in Caller Workspace</a>
    </div>
  `;

  document.getElementById('leadModal').style.display = 'flex';
}

// Build the grounded-analysis + Problem×Odoo matrix HTML for a lead (dashboard modal).
function groundedAnalysisHtml(lead) {
  const a = lead.grounded_analysis;
  if (!a) {
    return `<div style="font-size:0.8rem; color:#94a3b8; line-height:1.5;">No analysis yet. Click <strong style="color:#60a5fa;">Run Gemini Analysis</strong> to scrape the lowest-rating reviews, rank the recurring problems, and map them to Odoo modules.</div>`;
  }
  const ra = a.review_analysis || {};
  const matrix = a.problem_matrix || null;
  const rows = (matrix && matrix.rows || []).filter(r => r.count > 0);
  const snippets = (ra.snippets || []);

  const matrixHtml = rows.length ? `
    <div class="ga-section-label">Problem × Odoo Matrix · ${matrix.total_bad_reviews} bad reviews</div>
    <table class="ga-matrix">
      <thead><tr><th>Problem</th><th>Reviews</th><th>Share</th><th>Odoo module</th></tr></thead>
      <tbody>${rows.map((r, i) => `
        <tr class="${i === 0 ? 'ga-matrix-top' : ''}">
          <td>${escHtml(r.problem)}</td>
          <td class="ga-matrix-num">${r.count}</td>
          <td class="ga-matrix-num">${r.share_pct}%</td>
          <td class="ga-matrix-mod">${escHtml(r.odoo_module || '—')}</td>
        </tr>`).join('')}</tbody>
    </table>
    ${rows[0] && rows[0].odoo_module ? `<div class="ga-lead-pitch">Lead with <strong>${escHtml(rows[0].odoo_module)}</strong> — it fixes the #1 complaint (${rows[0].share_pct}% of bad reviews).</div>` : ''}` : '';

  const mapping = (a.odoo_mapping || []);
  return `
    ${a.company_profile ? `<div class="ga-text" style="margin-bottom:0.5rem;">${escHtml(a.company_profile)}</div>` : ''}
    ${matrixHtml}
    ${ra.overall ? `<div class="ga-section-label">Lowest-Rating Review Analysis${ra.reviews_analysed ? ` · ${ra.reviews_analysed} real reviews` : ''}</div><div class="ga-text">${escHtml(ra.overall)}</div>` : ''}
    ${snippets.length ? `<div class="ga-section-label">Sample Bad-Review Snippets</div>${snippets.map(s => `<div class="ga-snippet"><span class="ga-snippet-star">${s.stars ? escHtml(s.stars) + '★' : ''}</span><span class="ga-snippet-text">“${escHtml((s.text || '').slice(0, 220))}”</span></div>`).join('')}` : ''}
    ${!rows.length && mapping.length ? `<div class="ga-section-label">Odoo Modules to Sell</div>${mapping.map(m => `<div class="ga-map"><div class="ga-map-top"><span class="ga-map-problem">${escHtml(m.problem)}</span><span class="ga-map-arrow">→</span><span class="ga-map-module">${escHtml(m.odoo_module)}</span></div>${m.pitch ? `<div class="ga-map-pitch">${escHtml(m.pitch)}</div>` : ''}</div>`).join('')}` : ''}
  `;
}

// Trigger the scrape+Gemini analysis from the dashboard modal.
async function runDashboardAnalysis(leadId) {
  const btn = document.getElementById('dashAnalysisBtn');
  const box = document.getElementById('dashAnalysisBox');
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
  if (box) box.innerHTML = '<div class="ga-loading"><span class="ga-spinner"></span> Scraping lowest-rating reviews, then Gemini ranks problems &amp; maps to Odoo… (~30s)</div>';
  try {
    const res = await fetch(`/api/leads/${leadId}/grounded-analysis`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');
    if (data.gemini_failed) {
      const isQuota = /429|quota/i.test(data.error || '');
      const rows = (data.reviews || []).slice(0, 10).map(r =>
        `<div class="ga-snippet"><span class="ga-snippet-star">${r.rating ? escHtml(r.rating) + '★' : ''}</span><span class="ga-snippet-text">“${escHtml((r.text || '').slice(0, 180))}”</span></div>`).join('');
      if (box) box.innerHTML =
        `<div class="ga-error" style="color:#fb7185;font-size:0.8rem;margin-bottom:0.4rem;">${isQuota ? 'Gemini quota reached' : 'Gemini unavailable'} — ${escHtml(data.error || '')}</div>` +
        `<div class="ga-section-label">Scraped ${data.reviews_count != null ? data.reviews_count : (data.reviews || []).length} bad (1–2★) reviews (saved)</div>` +
        `<div class="ga-text" style="margin-bottom:0.4rem;">Reviews stored — click Re-run once quota resets.</div>` + (rows || '<div class="ga-empty">No reviews captured.</div>');
      if (btn) btn.textContent = 'Re-run Analysis';
      return;
    }
    const lead = allLeads.find(l => String(l.id || l._id) === String(leadId));
    if (lead) { Object.assign(lead, data.lead || {}); lead.grounded_analysis = data.analysis; }
    if (box) box.innerHTML = groundedAnalysisHtml(lead || { grounded_analysis: data.analysis });
    if (btn) btn.textContent = 'Re-run Analysis';
  } catch (err) {
    if (box) box.innerHTML = `<div class="ga-error" style="color:#fb7185; font-size:0.8rem;">Analysis failed: ${escHtml(err.message)}</div>`;
    if (btn) btn.textContent = 'Run Gemini Analysis';
  } finally {
    if (btn) btn.disabled = false;
  }
}

function closeModal() {
  document.getElementById('leadModal').style.display = 'none';
}

function openClayConfigModal() {
  const webhook = prompt('Enter your Clay.com Inbound Webhook URL:', localStorage.getItem('clay_webhook_url') || '');
  if (webhook !== null) {
    localStorage.setItem('clay_webhook_url', webhook);
    alert('Clay webhook URL saved locally.');
  }
}
