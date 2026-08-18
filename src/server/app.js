const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db/database');
const { scrapeGoogleMaps } = require('../scraper/gmapsScraper');
const { scrapeOdooCustomers } = require('../scraper/odooCustomerScraper');
const { searchLeads } = require('../ml/semanticSearch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// In-memory progress tracker for live scraping terminal
let currentScrapeJob = { is_running: false, type: null, logs: [] };

function addScrapeLog(log) {
  const timestamp = new Date().toLocaleTimeString();
  currentScrapeJob.logs.push(`[${timestamp}] [${log.status || 'INFO'}] ${log.message}`);
  if (currentScrapeJob.logs.length > 100) currentScrapeJob.logs.shift();
}

// ─── API Routes ────────────────────────────────────────────────────────────────

// 1. Get All Leads with Filters & Semantic Search
app.get('/api/leads', async (req, res) => {
  try {
    const { category, min_score, search, call_status } = req.query;
    let leads = await db.getAllLeads();

    if (category && category !== 'ALL') leads = leads.filter(l => l.category === category);
    if (min_score) leads = leads.filter(l => (l.success_chance_pct || 0) >= parseInt(min_score, 10));
    if (call_status && call_status !== 'ALL') leads = leads.filter(l => l.call_status === call_status);
    if (search && search.trim()) leads = await searchLeads(search, leads);

    res.json({ count: leads.length, leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Single Lead
app.get('/api/leads/:id', async (req, res) => {
  try {
    const lead = await db.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update Call Status & Notes
app.post('/api/leads/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const updated = await db.updateLeadStatus(req.params.id, status, notes || '');
    if (!updated) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, lead: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Manual Enrichment — patch any contact fields on a lead
app.patch('/api/leads/:id', async (req, res) => {
  try {
    const updated = await db.updateLeadFields(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, lead: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. AI Auto-Enrichment — intelligently research and enrich contact details & decision makers
app.post('/api/leads/:id/ai-enrich', async (req, res) => {
  let browser = null;
  try {
    const lead = await db.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { findDecisionMakers } = require('../auditor/decisionMakerFinder');
    const { classifyIndustry } = require('../utils/industryClassifier');
    const { launchBrowser } = require('../scraper/browserHelper');

    const domain = lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;

    browser = await launchBrowser();
    const dms = await findDecisionMakers(lead.name, lead.website, domain, browser);

    const mergedDMs = [...(lead.decision_makers || [])];
    for (const dm of dms) {
      if (!mergedDMs.some(m => m.name.toLowerCase() === dm.name.toLowerCase())) {
        mergedDMs.push(dm);
      }
    }

    const industry = classifyIndustry(lead.name, lead.notes || '', lead.industry);
    const patch = { decision_makers: mergedDMs, industry };

    const updated = await db.updateLeadFields(req.params.id, patch);
    res.json({ success: true, lead: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
  }
});

// 4c. Push Lead to Clay Webhook for Waterfall Enrichment
app.post('/api/leads/:id/clay-push', async (req, res) => {
  try {
    const { webhook_url } = req.body;
    const webhookUrl = webhook_url || process.env.CLAY_WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Please provide your Clay Inbound Webhook URL' });
    }

    const lead = await db.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { pushLeadToClay } = require('../auditor/clayIntegration');
    const result = await pushLeadToClay(lead, webhookUrl);
    res.json({ success: true, message: `Pushed "${lead.name}" to Clay for waterfall enrichment!`, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4d. Batch Push Top Tier Leads to Clay
app.post('/api/leads/clay-batch-push', async (req, res) => {
  try {
    const { webhook_url, min_score = 85, limit = 50 } = req.body;
    const webhookUrl = webhook_url || process.env.CLAY_WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Please provide your Clay Inbound Webhook URL' });
    }

    const leads = await db.getAllLeads();
    const topLeads = leads
      .filter(l => (l.success_chance_pct || 0) >= min_score)
      .slice(0, parseInt(limit, 10));

    if (topLeads.length === 0) {
      return res.json({ success: false, message: 'No leads found matching minimum score threshold.' });
    }

    const { pushLeadToClay } = require('../auditor/clayIntegration');
    let pushed = 0;
    for (const lead of topLeads) {
      try {
        await pushLeadToClay(lead, webhookUrl);
        pushed++;
      } catch (_) {}
    }

    res.json({ success: true, count: pushed, message: `Successfully dispatched ${pushed} top-tier leads to Clay!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4e. Inbound Webhook: Clay calls this endpoint when enrichment completes
app.post('/api/webhooks/clay', async (req, res) => {
  try {
    const { lead_id } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'Missing lead_id in payload' });

    const lead = await db.getLeadById(lead_id);
    if (!lead) return res.status(404).json({ error: `Lead with ID ${lead_id} not found` });

    const { processClayEnrichmentPayload } = require('../auditor/clayIntegration');
    const patch = processClayEnrichmentPayload(req.body);

    if (patch._new_decision_maker) {
      const dms = [...(lead.decision_makers || [])];
      const newDM = patch._new_decision_maker;
      delete patch._new_decision_maker;

      if (!dms.some(d => d.name.toLowerCase() === newDM.name.toLowerCase())) {
        dms.unshift(newDM);
      }
      patch.decision_makers = dms;
    }

    if (patch._ai_icebreaker) {
      const bc = lead.battlecard || {};
      bc.elevator_pitch = patch._ai_icebreaker;
      patch.battlecard = bc;
      delete patch._ai_icebreaker;
    }

    const updated = await db.updateLeadFields(lead_id, patch);
    console.log(`[Clay Webhook] Enriched lead "${lead.name}" with verified phone/email!`);
    res.json({ success: true, lead: updated });
  } catch (err) {
    console.error('Error processing Clay webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4f. Import Enriched Clay CSV / Sync Updates
app.post('/api/leads/import-clay-csv', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No CSV rows provided' });
    }

    const allLeads = await db.getAllLeads();
    let updatedCount = 0;

    for (const row of rows) {
      const leadId = row.lead_id || row['Lead ID'] || row['id'];
      const compName = (row.company_name || row['Company Name'] || row.name || row['Company'] || '').trim().toLowerCase();
      const website = (row.website || row['Website'] || row['Domain'] || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

      let target = null;
      if (leadId) {
        target = allLeads.find(l => l.id === leadId);
      }
      if (!target && compName) {
        target = allLeads.find(l => l.name.toLowerCase() === compName || l.name.toLowerCase().includes(compName) || compName.includes(l.name.toLowerCase()));
      }
      if (!target && website && website.length > 3) {
        target = allLeads.find(l => l.website && l.website.toLowerCase().includes(website));
      }

      if (target) {
        const patch = {};

        const phone = row.mobile_phone || row['Mobile Phone'] || row['Phone Number'] || row.phone || row['Direct Phone'];
        if (phone && phone.trim() && phone.trim().length >= 6) {
          patch.phone = phone.trim();
        }

        const email = row.work_email || row['Work Email'] || row.verified_email || row['Verified Email'] || row.email || row['Email'];
        if (email && email.trim() && email.includes('@') && !email.includes('operations@') && !email.includes('info@')) {
          patch.email = email.trim();
        }

        const dmName = row.decision_maker_name || row['Decision Maker Name'] || row['Full Name'] || row.name || row['Contact Name'];
        const dmTitle = row.decision_maker_title || row['Job Title'] || row.title || row['Title'] || 'Executive';
        const dmLinkedIn = row.linkedin_url || row['LinkedIn URL'] || row['Person LinkedIn URL'] || row['LinkedIn'];

        if (dmName && dmName.trim() && dmName.trim().length > 2 && dmName.toLowerCase() !== compName) {
          const dms = [...(target.decision_makers || [])];
          const newDM = {
            name: dmName.trim(),
            title: dmTitle.trim(),
            email_guess: patch.email || target.email || null,
            direct_phone: patch.phone || target.phone || null,
            linkedin_url: dmLinkedIn ? dmLinkedIn.trim() : null,
            source: 'clay_enrichment',
            verified: true
          };

          const existingIdx = dms.findIndex(d => d.name.toLowerCase() === dmName.trim().toLowerCase());
          if (existingIdx >= 0) {
            dms[existingIdx] = { ...dms[existingIdx], ...newDM };
          } else {
            dms.unshift(newDM);
          }
          patch.decision_makers = dms;
        }

        if (Object.keys(patch).length > 0) {
          await db.updateLeadFields(target.id, patch);
          updatedCount++;
        }
      }
    }

    res.json({ success: true, updated_count: updatedCount, message: `Successfully synchronized ${updatedCount} leads from Clay!` });
  } catch (err) {
    console.error('Error importing Clay CSV:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4g. Real-Time Live Deep Tech & Negative Review Audit ("Bad Stuff Hunter" & Dynamic Pitch Engine)
app.post('/api/leads/:id/live-audit', async (req, res) => {
  let browser = null;
  try {
    const lead = await db.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { launchBrowser } = require('../scraper/browserHelper');
    const { auditWebsite } = require('../auditor/webHealthAuditor');
    const { deepResearch } = require('../auditor/deepResearcher');
    const { generateReviewDossier } = require('../ml/reviewIntelligence');
    const { generateBattlecard } = require('../pitch/battlecardGenerator');

    browser = await launchBrowser();

    // 1. Live Web Health & Tech Audit
    let webAudit = {};
    if (lead.website) {
      try {
        webAudit = await auditWebsite(lead.website, browser);
      } catch (e) {
        console.warn(`[Live Audit] Web audit warning for ${lead.name}:`, e.message);
      }
    }

    // 2. Live Deep Yelp / GMB Negative Review & Friction Research ("Bad Stuff Hunter")
    let deepIntel = {};
    try {
      deepIntel = await deepResearch(lead.name, lead.location, lead.website);
    } catch (e) {
      console.warn(`[Live Audit] Deep research warning for ${lead.name}:`, e.message);
    }

    // 3. Merge all fresh live signals into candidate lead
    const currentYear = new Date().getFullYear();
    const updatedFeatures = {
      ...(lead.features || {}),
      copyrightAge: webAudit.copyright_year ? Math.max(0, currentYear - webAudit.copyright_year) : (lead.features?.copyrightAge || 2),
      loadTimeSec: webAudit.load_time_sec ? parseFloat(webAudit.load_time_sec) : (lead.features?.loadTimeSec || 2.0),
      noPortal: webAudit.has_portal !== undefined ? !webAudit.has_portal : (lead.features?.noPortal ?? true),
      noSSL: webAudit.has_ssl !== undefined ? !webAudit.has_ssl : (lead.features?.noSSL ?? false)
    };

    const mergedTechStack = [...(webAudit.tech_stack || lead.tech_stack || [])];
    if (mergedTechStack.length === 0) mergedTechStack.push('Odoo ERP');

    const updatedLeadCandidate = {
      ...lead,
      has_ssl: webAudit.has_ssl !== undefined ? webAudit.has_ssl : lead.has_ssl,
      load_time_sec: webAudit.load_time_sec || lead.load_time_sec,
      copyright_year: webAudit.copyright_year || lead.copyright_year,
      tech_stack: mergedTechStack,
      deep_intel: deepIntel,
      features: updatedFeatures
    };

    // 4. Extract Customer Voice & Negative Review Complaints
    const reviewDossier = generateReviewDossier(updatedLeadCandidate);
    updatedLeadCandidate.review_dossier = reviewDossier;

    // 5. Dynamic Battlecard Re-Generation referencing the fresh live audit data
    const freshBattlecard = generateBattlecard(updatedLeadCandidate);

    const patch = {
      has_ssl: updatedLeadCandidate.has_ssl,
      load_time_sec: updatedLeadCandidate.load_time_sec,
      copyright_year: updatedLeadCandidate.copyright_year,
      tech_stack: updatedLeadCandidate.tech_stack,
      deep_intel: updatedLeadCandidate.deep_intel,
      review_dossier: updatedLeadCandidate.review_dossier,
      features: updatedLeadCandidate.features,
      battlecard: freshBattlecard,
      last_audited_at: new Date().toISOString()
    };

    const savedLead = await db.updateLeadFields(lead.id, patch);
    console.log(`[Live Audit] Successfully completed real-time tech & review audit for "${lead.name}"!`);
    res.json({ success: true, lead: savedLead, message: 'Live Tech & Review Audit complete! Pitch re-synthesized.' });
  } catch (err) {
    console.error('Error during live audit:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
  }
});

// 5. Delete Lead
app.delete('/api/leads/:id', async (req, res) => {
  try {
    await db.deleteLead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Clear All Leads
app.post('/api/leads/clear', async (_req, res) => {
  try {
    await db.clearAllLeads();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Scrape Google Maps
app.post('/api/scrape/gmaps', async (req, res) => {
  const { query, location, max_results } = req.body;
  if (!query) return res.status(400).json({ error: 'Search query is required' });
  if (currentScrapeJob.is_running) return res.status(409).json({ error: 'A scrape job is already running' });

  currentScrapeJob = { is_running: true, type: 'gmaps', logs: [] };
  addScrapeLog({ status: 'INIT', message: `Starting Google Maps search: "${query}" in "${location || 'Any'}"` });

  scrapeGoogleMaps(query, location, parseInt(max_results, 10) || 8, (log) => addScrapeLog(log))
    .then(results => {
      addScrapeLog({ status: 'DONE', message: `Job finished! Scraped & scored ${results.length} leads.` });
      currentScrapeJob.is_running = false;
    })
    .catch(err => {
      addScrapeLog({ status: 'ERROR', message: `Scraper crashed: ${err.message}` });
      currentScrapeJob.is_running = false;
    });

  res.status(202).json({ message: 'Scraping job started', status: 'running' });
});

// 7. Scrape Odoo BPO
app.post('/api/scrape/odoo', async (req, res) => {
  const { region, industry, max_results } = req.body;
  if (currentScrapeJob.is_running) return res.status(409).json({ error: 'A scrape job is already running' });

  currentScrapeJob = { is_running: true, type: 'odoo_bpo', logs: [] };
  addScrapeLog({ status: 'INIT', message: `Starting Odoo Customer discovery in "${region || 'North America'}"` });

  scrapeOdooCustomers(region, industry, parseInt(max_results, 10) || 6, (log) => addScrapeLog(log))
    .then(results => {
      addScrapeLog({ status: 'DONE', message: `Job finished! Added ${results.length} Odoo BPO leads.` });
      currentScrapeJob.is_running = false;
    })
    .catch(err => {
      addScrapeLog({ status: 'ERROR', message: `Odoo Scraper crashed: ${err.message}` });
      currentScrapeJob.is_running = false;
    });

  res.status(202).json({ message: 'Odoo BPO discovery started', status: 'running' });
});

// 8. Live Scraper Status
app.get('/api/scrape/status', (_req, res) => {
  res.json(currentScrapeJob);
});

// 9. Dashboard Statistics
app.get('/api/stats', async (_req, res) => {
  try {
    const leads = await db.getAllLeads();
    const logs  = await db.getCallLogs();
    res.json({
      total_leads:       leads.length,
      new_implementations: leads.filter(l => l.category === 'NEW_IMPLEMENTATION').length,
      bpo_rescues:       leads.filter(l => l.category === 'BPO_RESCUE').length,
      high_fit_leads:    leads.filter(l => (l.success_chance_pct || 0) >= 75).length,
      called_count:      leads.filter(l => l.call_status && l.call_status !== 'Uncalled').length,
      interested_count:  leads.filter(l => l.call_status === 'Interested').length,
      call_logs:         logs.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Export CSV
app.get('/api/export/csv', async (_req, res) => {
  try {
    const csv = await db.exportToCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bigbinary_leads_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
  const server = app.listen(PORT, () => {
    console.log('=======================================================');
    console.log('  BIG BINARY TECH - LEAD INTELLIGENCE ENGINE');
    console.log(`  Dashboard:   http://localhost:${PORT}`);
    console.log(`  Caller View: http://localhost:${PORT}/caller.html`);
    console.log('=======================================================');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use by another app.`);
      console.error(`Please close any existing Node.js or web server windows and try again.\n`);
    } else {
      console.error('Server error:', err);
    }
  });

  // Connect to Database (Atlas or local fallback)
  db.connect().catch(err => {
    console.warn('Database initialization warning:', err.message);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
});
