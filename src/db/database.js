const fs = require('fs');
const path = require('path');
const dns = require('dns');

// Fix for Windows / ISP DNS servers failing to resolve MongoDB Atlas SRV (_mongodb._tcp) records
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);
} catch (_) {}

// ─── JSON Fallback Storage ─────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE  = path.join(DATA_DIR, 'leads_db.json');
const LOGS_FILE = path.join(DATA_DIR, 'call_logs.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE,  '[]', 'utf-8');
if (!fs.existsSync(LOGS_FILE)) fs.writeFileSync(LOGS_FILE, '[]', 'utf-8');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf-8');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8') || '[]'); } catch { return []; }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const GENERIC_DOMAINS = ['odoo.sh', 'odoo.com', 'google.com', 'maps.google.com'];
const isGenericWeb = (url) => !url || GENERIC_DOMAINS.some(d => url.includes(d));

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return (url || '').toLowerCase(); }
}

function makeId() {
  return 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function escapeRegex(str) {
  return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Database Class ────────────────────────────────────────────────────────────

class Database {
  constructor() {
    this._mongo = false;   // true when connected to Atlas
    this._Lead = null;
    this._CallLog = null;
    this._User = null;
    this._leads = [];      // in-memory JSON store
    this._logs = [];
    this._users = [];      // in-memory JSON store for auth users
  }

  // Called once at server startup — decides which backend to use
  async connect() {
    try {
      require('dotenv').config();
    } catch {}

    const uri = (process.env.MONGODB_URI || '').trim();
    const isPlaceholder = !uri || uri.includes('<username>') || uri.includes('<password>') || uri.includes('cluster0.xxxxx.mongodb.net');

    if (isPlaceholder) {
      this._leads = loadJSON(DB_FILE);
      this._logs  = loadJSON(LOGS_FILE);
      this._users = loadJSON(USERS_FILE);
      console.log('ℹ  Local JSON storage active (400+ leads loaded).');
      console.log('   (To enable MongoDB Atlas cloud sync, set a valid MONGODB_URI in .env)');
      return;
    }

    try {
      const mongoose = require('mongoose');
      // Flexible schema — stores any shape of lead data without constraint
      const anySchema = new mongoose.Schema({}, { strict: false, timestamps: true });
      this._Lead    = mongoose.models.Lead    || mongoose.model('Lead',    anySchema);
      this._CallLog = mongoose.models.CallLog || mongoose.model('CallLog', new mongoose.Schema({}, { strict: false, timestamps: true }));
      this._User    = mongoose.models.User    || mongoose.model('User',    new mongoose.Schema({}, { strict: false, timestamps: true }));

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠  MongoDB Atlas disconnected. Attempting auto-reconnection...');
      });
      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB Atlas reconnected successfully.');
      });
      mongoose.connection.on('error', (err) => {
        console.warn('⚠  MongoDB Atlas connection error:', err.message);
      });

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        maxPoolSize: 10
      });
      this._mongo = true;
      console.log('✅ Connected to MongoDB Atlas — cloud sync active.');
    } catch (err) {
      console.warn('⚠  MongoDB connection failed:', err.message);
      console.warn('   Falling back to local JSON storage.');
      this._leads = loadJSON(DB_FILE);
      this._logs  = loadJSON(LOGS_FILE);
      this._users = loadJSON(USERS_FILE);
    }
  }

  // ─── Leads ──────────────────────────────────────────────────────────────────

  async getAllLeads() {
    if (this._mongo) {
      try {
        const docs = await this._Lead.find({}).sort({ createdAt: -1 }).lean();
        if (docs && docs.length > 0) {
          // Keep local mirror updated
          try { fs.writeFileSync(DB_FILE, JSON.stringify(docs, null, 2), 'utf-8'); } catch (_) {}
        }
        return docs;
      } catch (err) {
        console.warn('MongoDB query failed, reading local mirror:', err.message);
        return loadJSON(DB_FILE);
      }
    }
    return this._leads;
  }

  async getLeadById(id) {
    if (this._mongo) {
      try {
        return await this._Lead.findOne({ id }).lean();
      } catch (err) {
        const local = loadJSON(DB_FILE);
        return local.find(l => l.id === id) || null;
      }
    }
    return this._leads.find(l => l.id === id) || null;
  }

  async upsertLead(leadData) {
    if (!leadData.id) leadData.id = makeId();
    leadData.created_at  = leadData.created_at || new Date().toISOString();
    leadData.updated_at  = new Date().toISOString();
    leadData.call_status = leadData.call_status || 'Uncalled';

    if (this._mongo) {
      const orClauses = [
        { id: leadData.id },
        { name: new RegExp(`^${escapeRegex(leadData.name)}$`, 'i') }
      ];
      if (!isGenericWeb(leadData.website)) {
        orClauses.push({ website: leadData.website });
        orClauses.push({ domain: extractDomain(leadData.website) });
      }
      const doc = await this._Lead.findOneAndUpdate(
        { $or: orClauses },
        { $set: leadData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return doc;
    }

    // JSON fallback — match by id, name, or same root domain
    const incomingDomain = !isGenericWeb(leadData.website) ? extractDomain(leadData.website) : null;
    const idx = this._leads.findIndex(l => {
      if (l.id === leadData.id) return true;
      if (l.name && leadData.name && l.name.trim().toLowerCase() === leadData.name.trim().toLowerCase()) return true;
      if (incomingDomain && !isGenericWeb(l.website) && extractDomain(l.website) === incomingDomain) return true;
      return false;
    });

    if (idx >= 0) {
      // Non-destructive merge: incoming values only overwrite if the existing slot is empty
      const existing = this._leads[idx];
      const merged = { ...existing };
      for (const [k, v] of Object.entries(leadData)) {
        const cur = existing[k];
        const curEmpty = cur === null || cur === undefined || cur === '' || (Array.isArray(cur) && cur.length === 0);
        const newEmpty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
        if (curEmpty && !newEmpty) merged[k] = v;   // fill gap
        else if (!curEmpty && !newEmpty) merged[k] = v; // update with real value
        // if curEmpty && newEmpty: keep existing (nothing to gain)
        // if !curEmpty && newEmpty: keep existing (never overwrite enriched with blank)
      }
      merged.updated_at = new Date().toISOString();
      this._leads[idx] = merged;
      this._saveLeads();
      return this._leads[idx];
    }
    this._leads.unshift(leadData);
    this._saveLeads();
    return leadData;
  }

  async updateLeadFields(id, fields) {
    const patch = {};
    for (const key of Object.keys(fields)) {
      if (key !== 'id' && key !== '_id') {
        patch[key] = fields[key];
      }
    }
    patch.updated_at = new Date().toISOString();
    patch.manually_enriched = true;

    if (this._mongo) {
      // Retry transient Atlas resets (ECONNRESET / network blips) so a momentary
      // hiccup doesn't surface as "NOT saved" and lose the user's edits.
      return await this._withRetry(() =>
        this._Lead.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean()
      );
    }

    const idx = this._leads.findIndex(l => l.id === id);
    if (idx < 0) return null;
    this._leads[idx] = { ...this._leads[idx], ...patch };
    this._saveLeads();
    return this._leads[idx];
  }

  async updateLeadStatus(id, status, notes = '', followUpDate = null) {
    const lead = await this.getLeadById(id);
    if (!lead) return null;

    lead.call_status = status;
    // APPEND the call note (timestamped) — never wipe existing notes. An empty
    // note leaves prior notes untouched. (This previously overwrote notes with ''
    // on every outcome log, silently destroying data.)
    const note = (notes || '').trim();
    if (note) {
      const stamp = `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] (${status}) ${note}`;
      lead.notes = lead.notes ? `${lead.notes}\n${stamp}` : stamp;
    }
    // Only change follow-up when a date is explicitly supplied; otherwise keep it.
    if (followUpDate) lead.follow_up_date = followUpDate;
    lead.last_called_at = new Date().toISOString();
    lead.updated_at     = new Date().toISOString();

    const logEntry = {
      id: 'log_' + Date.now(),
      lead_id: id,
      company_name: lead.name,
      phone: lead.phone,
      status,
      notes: note,
      follow_up_date: lead.follow_up_date || null,
      timestamp: new Date().toISOString()
    };

    if (this._mongo) {
      await this._Lead.findOneAndUpdate({ id }, {
        $set: {
          call_status:    lead.call_status,
          notes:          lead.notes,
          follow_up_date: lead.follow_up_date,
          last_called_at: lead.last_called_at,
          updated_at:     lead.updated_at
        }
      });
      await new this._CallLog(logEntry).save();
    } else {
      const idx = this._leads.findIndex(l => l.id === id);
      if (idx >= 0) this._leads[idx] = lead;
      this._saveLeads();
      this._logs.unshift(logEntry);
      this._saveLogs();
    }

    return lead;
  }

  // Append a free-form, timestamped note to a lead without touching call_status.
  async appendNote(id, text) {
    const note = (text || '').trim();
    if (!note) return null;
    const lead = await this.getLeadById(id);
    if (!lead) return null;

    const stamp = `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${note}`;
    const merged = lead.notes ? `${lead.notes}\n${stamp}` : stamp;
    return this.updateLeadFields(id, { notes: merged });
  }

  async deleteLead(id) {
    if (this._mongo) {
      await this._Lead.deleteOne({ id });
    } else {
      this._leads = this._leads.filter(l => l.id !== id);
      this._saveLeads();
    }
    return true;
  }

  async clearAllLeads() {
    if (this._mongo) {
      await this._Lead.deleteMany({});
    } else {
      this._leads = [];
      this._saveLeads();
    }
    return true;
  }

  // ─── Call Logs ───────────────────────────────────────────────────────────────

  async getCallLogs() {
    if (this._mongo) return this._CallLog.find({}).sort({ timestamp: -1 }).limit(100).lean();
    return this._logs;
  }

  // ─── CSV Export ──────────────────────────────────────────────────────────────

  async exportToCSV() {
    const leads = await this.getAllLeads();
    if (!leads.length) return '';

    const headers = [
      'ID', 'Company Name', 'Category', 'Success Chance %', 'Fit Tier', 'Industry',
      'Phone', 'Email', 'Website', 'Address', 'Rating', 'Reviews Count',
      'Employee Size', 'Tech Stack', 'Copyright Year', 'Call Status', 'Notes',
      'Decision Makers', 'DM Emails (Guessed)'
    ];

    const rows = leads.map(l => {
      const dms = l.decision_makers || [];
      const dmNames  = dms.map(d => `${d.name} (${d.title})`).join(' | ');
      const dmEmails = dms.map(d => d.email_guess || '').filter(Boolean).join(' | ');
      const q = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
      return [
        q(l.id), q(l.name), q(l.category), q(`${l.success_chance_pct || 0}%`),
        q(l.fit_tier), q(l.industry), q(l.phone), q(l.email), q(l.website),
        q(l.address), q(l.rating || ''), q(l.reviews_count || ''),
        q(l.employee_size || '11-50'), q((l.tech_stack || []).join(', ')),
        q(l.copyright_year || ''), q(l.call_status || 'Uncalled'), q(l.notes || ''),
        q(dmNames), q(dmEmails)
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  // ─── Users (authentication) ──────────────────────────────────────────────────

  async getUserByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return null;
    if (this._mongo) {
      try { return await this._User.findOne({ email: e }).lean(); }
      catch { return (loadJSON(USERS_FILE)).find(u => u.email === e) || null; }
    }
    return this._users.find(u => u.email === e) || null;
  }

  async getUserById(id) {
    if (this._mongo) {
      try { return await this._User.findOne({ id }).lean(); }
      catch { return (loadJSON(USERS_FILE)).find(u => u.id === id) || null; }
    }
    return this._users.find(u => u.id === id) || null;
  }

  async getAllUsers() {
    if (this._mongo) {
      try { return await this._User.find({}).sort({ createdAt: 1 }).lean(); }
      catch { return loadJSON(USERS_FILE); }
    }
    return this._users;
  }

  async createUser(user) {
    const doc = {
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      email: String(user.email || '').trim().toLowerCase(),
      password_hash: user.password_hash,
      name: user.name || '',
      role: user.role || 'sdr_user',
      team: user.team || 'b2b',
      active: user.active !== false,
      created_at: new Date().toISOString()
    };
    if (this._mongo) {
      // Use $set upsert (not create) so the literal `id` field is written — a
      // plain create() collides with Mongoose's built-in id→_id virtual.
      return await this._User.findOneAndUpdate(
        { id: doc.id }, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
    }
    this._users.push(doc);
    this._saveUsers();
    return doc;
  }

  async updateUser(id, fields) {
    const patch = {};
    for (const k of Object.keys(fields)) { if (k !== 'id' && k !== '_id') patch[k] = fields[k]; }
    if (this._mongo) {
      return await this._User.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean();
    }
    const idx = this._users.findIndex(u => u.id === id);
    if (idx < 0) return null;
    this._users[idx] = { ...this._users[idx], ...patch };
    this._saveUsers();
    return this._users[idx];
  }

  async deleteUser(id) {
    if (this._mongo) {
      const r = await this._User.deleteOne({ id });
      return r.deletedCount > 0;
    }
    const before = this._users.length;
    this._users = this._users.filter(u => u.id !== id);
    if (this._users.length !== before) { this._saveUsers(); return true; }
    return false;
  }

  async countUsers() {
    if (this._mongo) { try { return await this._User.countDocuments({}); } catch { return loadJSON(USERS_FILE).length; } }
    return this._users.length;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  // Retry a Mongo operation on transient network/connection errors (Atlas on
  // flaky Windows/ISP links resets sockets — retryWrites alone doesn't cover all).
  async _withRetry(fn, tries = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg = `${err && err.name} ${err && err.message}`.toLowerCase();
        const transient = /econnreset|etimedout|enotfound|socket|network|pool.*(clear|destroy)|topology|server selection|timed out/.test(msg);
        if (!transient || attempt === tries) break;
        await new Promise(r => setTimeout(r, 300 * attempt)); // 300ms, 600ms backoff
        console.warn(`[DB] transient error, retry ${attempt}/${tries - 1}: ${err.message}`);
      }
    }
    throw lastErr;
  }

  _saveLeads() { fs.writeFileSync(DB_FILE, JSON.stringify(this._leads, null, 2), 'utf-8'); }
  _saveLogs()  { fs.writeFileSync(LOGS_FILE, JSON.stringify(this._logs, null, 2), 'utf-8'); }
  _saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(this._users, null, 2), 'utf-8'); }
}

module.exports = new Database();
