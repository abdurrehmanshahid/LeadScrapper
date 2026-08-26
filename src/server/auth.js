// Authentication & role-based access for the Lead Intelligence Engine.
// Roles: super_admin (all + user mgmt + enrich), junior_enricher (enrich + manual),
//        sdr_user (caller + manual case-building only, no credit-spending enrichment).
// Teams: b2c, b2b.

const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');

const ROLES = ['super_admin', 'junior_enricher', 'sdr_user'];
const TEAMS = ['b2c', 'b2b'];
// Roles allowed to run credit-spending enrichment (Clay / Apollo / Gemini research)
const ENRICHERS = ['super_admin', 'junior_enricher'];

const sanitize = (u) => {
  if (!u) return null;
  const { password_hash, _id, __v, ...safe } = u;
  return safe;
};

// ── Middleware ───────────────────────────────────────────────────────────────
async function loadUser(req, res, next) {
  try {
    const uid = req.session && req.session.uid;
    if (uid) {
      const u = await req.app.locals.db.getUserById(uid);
      if (u && u.active !== false) req.user = sanitize(u);
    }
  } catch (_) {}
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated', login_required: true });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated', login_required: true });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────
function installAuth(app, db) {
  app.locals.db = db;

  const secret = (process.env.SESSION_SECRET || '').trim() ||
    'bigbinary-dev-session-secret-change-me';
  if (secret === 'bigbinary-dev-session-secret-change-me') {
    console.warn('⚠  SESSION_SECRET not set in .env — using an insecure default. Set one for production.');
  }

  app.use(cookieSession({
    name: 'bb_session',
    keys: [secret],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax'
    // secure omitted so the cookie works on both http://localhost and the https tunnel
  }));

  app.use(loadUser);

  // ── Auth routes ──
  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = String((req.body && req.body.email) || '').trim().toLowerCase();
      const password = String((req.body && req.body.password) || '');
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

      const user = await db.getUserByEmail(email);
      if (!user || user.active === false) return res.status(401).json({ error: 'Invalid credentials.' });

      const ok = await bcrypt.compare(password, user.password_hash || '');
      if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

      req.session.uid = user.id;
      res.json({ success: true, user: sanitize(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated', login_required: true });
    res.json({ user: req.user });
  });

  // ── User management (super_admin only) ──
  app.get('/api/users', requireRole('super_admin'), async (req, res) => {
    const users = await db.getAllUsers();
    res.json({ users: users.map(sanitize) });
  });

  app.post('/api/users', requireRole('super_admin'), async (req, res) => {
    try {
      const { email, password, name, role, team } = req.body || {};
      const e = String(email || '').trim().toLowerCase();
      if (!e || !password) return res.status(400).json({ error: 'Email and password are required.' });
      if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
      if (team && !TEAMS.includes(team)) return res.status(400).json({ error: 'Invalid team.' });
      if (await db.getUserByEmail(e)) return res.status(409).json({ error: 'A user with that email already exists.' });

      const password_hash = await bcrypt.hash(String(password), 10);
      const user = await db.createUser({ email: e, password_hash, name, role, team });
      res.json({ success: true, user: sanitize(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/users/:id', requireRole('super_admin'), async (req, res) => {
    try {
      const { name, role, team, active, password } = req.body || {};
      const patch = {};
      if (name != null) patch.name = name;
      if (role != null) { if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' }); patch.role = role; }
      if (team != null) { if (!TEAMS.includes(team)) return res.status(400).json({ error: 'Invalid team.' }); patch.team = team; }
      if (active != null) patch.active = !!active;
      if (password) patch.password_hash = await bcrypt.hash(String(password), 10);

      // Guardrail: never let the last super_admin lose their admin role or be disabled.
      if ((role && role !== 'super_admin') || active === false) {
        const target = await db.getUserById(req.params.id);
        if (target && target.role === 'super_admin') {
          const admins = (await db.getAllUsers()).filter(u => u.role === 'super_admin' && u.active !== false);
          if (admins.length <= 1) return res.status(400).json({ error: 'Cannot demote or disable the only super admin.' });
        }
      }

      const updated = await db.updateUser(req.params.id, patch);
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      res.json({ success: true, user: sanitize(updated) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/users/:id', requireRole('super_admin'), async (req, res) => {
    try {
      if (req.user.id === req.params.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
      const target = await db.getUserById(req.params.id);
      if (target && target.role === 'super_admin') {
        const admins = (await db.getAllUsers()).filter(u => u.role === 'super_admin' && u.active !== false);
        if (admins.length <= 1) return res.status(400).json({ error: 'Cannot delete the only super admin.' });
      }
      const ok = await db.deleteUser(req.params.id);
      if (!ok) return res.status(404).json({ error: 'User not found.' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// Seed the first super admin if there are no users yet.
async function seedSuperAdmin(db) {
  try {
    const count = await db.countUsers();
    if (count > 0) return;
    const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@bigbinary.local').trim().toLowerCase();
    const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe#2026';
    const password_hash = await bcrypt.hash(String(password), 10);
    await db.createUser({ email, password_hash, name: 'Super Admin', role: 'super_admin', team: 'b2b' });
    console.log('──────────────────────────────────────────────');
    console.log('  Seeded first SUPER ADMIN account:');
    console.log('    email:    ' + email);
    console.log('    password: ' + password);
    console.log('  Log in, then change this password / add your team.');
    console.log('  (Override via SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env before first run.)');
    console.log('──────────────────────────────────────────────');
  } catch (err) {
    console.warn('⚠  Failed to seed super admin:', err.message);
  }
}

module.exports = { installAuth, seedSuperAdmin, requireAuth, requireRole, ROLES, TEAMS, ENRICHERS };
