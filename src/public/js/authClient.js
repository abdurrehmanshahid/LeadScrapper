// Shared auth client — loaded first on every protected page.
// Confirms the session, exposes window.currentUser, renders the user chip + logout,
// and hides credit-spending enrichment controls from the restricted SDR role.
(function () {
  window.currentUser = null;
  const ENRICHERS = ['super_admin', 'junior_enricher'];

  // Enrichment controls (by id) that spend credits — hidden for sdr_user.
  const ENRICH_CONTROL_IDS = [
    'callerLiveAuditBtn', 'callerWarmEnrichBtn', 'callerClayBtn',
    'groundedRunBtn', 'gaClayEnrichBtn', 'gaClayPullBtn'
  ];

  const ROLE_LABEL = {
    super_admin: 'Super Admin',
    junior_enricher: 'Enricher',
    sdr_user: 'SDR'
  };

  async function init() {
    let user = null;
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) { location.href = 'login.html'; return; }
      const data = await res.json();
      user = data.user;
    } catch (_) {
      // Network issue — leave the page; API calls will surface errors.
      return;
    }
    window.currentUser = user;
    document.body.setAttribute('data-role', user.role);
    document.body.setAttribute('data-team', user.team || '');

    renderUserChip(user);
    applyRoleVisibility(user);
    // Re-apply after other scripts render, in case controls mount late.
    setTimeout(() => applyRoleVisibility(user), 400);
  }

  function renderUserChip(user) {
    const nav = document.querySelector('.nav-actions') || document.body;
    const chip = document.createElement('div');
    chip.className = 'user-chip';
    const isAdmin = user.role === 'super_admin';
    chip.innerHTML =
      `<span class="user-chip-name">${escapeHtml(user.name || user.email)}</span>` +
      `<span class="user-chip-role">${ROLE_LABEL[user.role] || user.role} · ${(user.team || '').toUpperCase()}</span>` +
      (isAdmin ? `<a href="admin.html" class="btn btn-secondary btn-sm">Users</a>` : '') +
      `<button onclick="authLogout()" class="btn btn-secondary btn-sm">Sign out</button>`;
    nav.appendChild(chip);
  }

  function applyRoleVisibility(user) {
    const canEnrich = ENRICHERS.includes(user.role);
    if (!canEnrich) {
      ENRICH_CONTROL_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      document.querySelectorAll('.enricher-only').forEach(el => { el.style.display = 'none'; });
    }
    if (user.role !== 'super_admin') {
      document.querySelectorAll('.admin-only').forEach(el => { el.style.display = 'none'; });
    }
  }

  window.authLogout = async function () {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    location.href = 'login.html';
  };

  // Central 401 handler: if any API call comes back unauthenticated, bounce to login.
  const _fetch = window.fetch;
  window.fetch = function (...args) {
    return _fetch.apply(this, args).then(res => {
      try {
        const url = (args[0] && args[0].url) || String(args[0] || '');
        if (res.status === 401 && url.indexOf('/api/') !== -1 && url.indexOf('/api/auth/') === -1) {
          location.href = 'login.html';
        }
      } catch (_) {}
      return res;
    });
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
