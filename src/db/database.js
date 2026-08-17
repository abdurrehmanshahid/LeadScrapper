const fs = require('fs');
const path = require('path');

// ─── JSON Fallback Storage ─────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE  = path.join(DATA_DIR, 'leads_db.json');
const LOGS_FILE = path.join(DATA_DIR, 'call_logs.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE,  '[]', 'utf-8');
if (!fs.existsSync(LOGS_FILE)) fs.writeFileSync(LOGS_FILE, '[]', 'utf-8');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8') || '[]'); } catch { return []; }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const GENERIC_DOMAINS = ['odoo.sh', 'odoo.com', 'google.com', 'maps.google.com'];
const isGenericWeb = (url) => !url || GENERIC_DOMAINS.some(d => url.includes(d));

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
    this._leads = [];      // in-memory JSON store
    this._logs = [];
  }

  // Called once at server startup — decides which backend to use
  async connect() {
    try {
      require('dotenv').config();
    } catch {}

    const uri = process.env.MONGODB_URI;

    if (!uri) {
      this._leads = loadJSON(DB_FILE);
      this._logs  = loadJSON(LOGS_FILE);
      console.log('ℹ  No MONGODB_URI in .env — using local JSON storage.');
      console.log('   Add MONGODB_URI=<your Atlas URI> to .env to enable cloud sync.');
      return;
    }

    try {
      const mongoose = require('mongoose');
      // Flexible schema — stores any shape of lead data without constraint
      const anySchema = new mongoose.Schema({}, { strict: false, timestamps: true });
      this._Lead    = mongoose.models.Lead    || mongoose.model('Lead',    anySchema);
      this._CallLog = mongoose.models.CallLog || mongoose.model('CallLog', new mongoose.Schema({}, { strict: false, timestamps: true }));

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
      }
      const doc = await this._Lead.findOneAndUpdate(
        { $or: orClauses },
        { $set: leadData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return doc;
    }

    // JSON fallback
    const idx = this._leads.findIndex(l => {
      if (l.id === leadData.id) return true;
      if (l.name && leadData.name && l.name.trim().toLowerCase() === leadData.name.trim().toLowerCase()) return true;
      if (l.website && leadData.website && !isGenericWeb(l.website) && !isGenericWeb(leadData.website) && l.website === leadData.website) return true;
      return false;
    });

    if (idx >= 0) {
      this._leads[idx] = { ...this._leads[idx], ...leadData, updated_at: new Date().toISOString() };
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
      const doc = await this._Lead.findOneAndUpdate(
        { id },
        { $set: patch },
        { new: true }
      ).lean();
      return doc;
    }

    const idx = this._leads.findIndex(l => l.id === id);
    if (idx < 0) return null;
    this._leads[idx] = { ...this._leads[idx], ...patch };
    this._saveLeads();
    return this._leads[idx];
  }

  async updateLeadStatus(id, status, notes = '') {
    const lead = await this.getLeadById(id);
    if (!lead) return null;

    lead.call_status    = status;
    lead.notes          = notes;
    lead.last_called_at = new Date().toISOString();
    lead.updated_at     = new Date().toISOString();

    const logEntry = {
      id: 'log_' + Date.now(),
      lead_id: id,
      company_name: lead.name,
      phone: lead.phone,
      status,
      notes,
      timestamp: new Date().toISOString()
    };

    if (this._mongo) {
      await this._Lead.findOneAndUpdate({ id }, {
        $set: {
          call_status:    lead.call_status,
          notes:          lead.notes,
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

  // ─── Private ─────────────────────────────────────────────────────────────────

  _saveLeads() { fs.writeFileSync(DB_FILE, JSON.stringify(this._leads, null, 2), 'utf-8'); }
  _saveLogs()  { fs.writeFileSync(LOGS_FILE, JSON.stringify(this._logs, null, 2), 'utf-8'); }
}

module.exports = new Database();
