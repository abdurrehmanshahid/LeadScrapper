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

    const { enrichLead } = require('../enricher/geminiEnricher');
    const { launchBrowser } = require('../scraper/browserHelper');
    const { scrapeGoogleMapsLowestReviews, scrapeHttpReviewsDataset } = require('../auditor/deepResearcher');
    const { generateBattlecard } = require('../pitch/battlecardGenerator');

    browser = await launchBrowser();

    // 1. Scrape real negative reviews — Google Maps lowest-rated first, Yelp fallback
    console.log(`[AI Enrich] Scraping negative reviews for "${lead.name}"...`);
    let negativeReviews = [];
    try {
      negativeReviews = await scrapeGoogleMapsLowestReviews(lead.name, lead.location || '', browser);
    } catch (_) {}

    if (negativeReviews.length === 0) {
      try {
        const httpReviews = await scrapeHttpReviewsDataset(lead.name, lead.location || '', lead.website || '');
        negativeReviews = httpReviews.filter(r => r.rating <= 2);
      } catch (_) {}
    }

    console.log(`[AI Enrich] Found ${negativeReviews.length} negative reviews for "${lead.name}"`);

    // 2. Run Gemini enrichment with real review context
    const enrichment = await enrichLead(lead, negativeReviews);

    // 3. Non-destructive merge — never overwrite existing AI data
    const patch = {};
    for (const [k, v] of Object.entries(enrichment)) {
      const cur = lead[k];
      const curEmpty = cur === null || cur === undefined || cur === ''
        || (Array.isArray(cur) && cur.length === 0)
        || (typeof cur === 'object' && !Array.isArray(cur) && Object.keys(cur || {}).length === 0);
      const newEmpty = v === null || v === undefined || v === ''
        || (Array.isArray(v) && v.length === 0);
      if (curEmpty && !newEmpty) patch[k] = v;
      else if (!curEmpty && !newEmpty) patch[k] = v;
    }

    patch.battlecard = generateBattlecard({ ...lead, ...patch });
    patch.last_enriched_at = new Date().toISOString();
    if (negativeReviews.length > 0) patch.negative_reviews = negativeReviews.slice(0, 15);

    const savedLead = await db.updateLeadFields(lead.id, patch);
    console.log(`[AI Enrich] Gemini enrichment complete for "${lead.name}" (${negativeReviews.length} reviews used)`);
    res.json({ success: true, lead: savedLead, reviews_scraped: negativeReviews.length });
  } catch (err) {
    console.error('[AI Enrich] Error:', err.message);
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

// 4g. Real-Time Live Web Tech Audit (website metrics only — AI enriched data is never overwritten)
app.post('/api/leads/:id/live-audit', async (req, res) => {
  let browser = null;
  try {
    const lead = await db.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { launchBrowser } = require('../scraper/browserHelper');
    const { auditWebsite } = require('../auditor/webHealthAuditor');
    const { generateBattlecard } = require('../pitch/battlecardGenerator');

    browser = await launchBrowser();

    // 1. Live Web Health & Tech Audit only (no review scraping)
    let webAudit = {};
    if (lead.website) {
      try {
        webAudit = await auditWebsite(lead.website, browser);
      } catch (e) {
        console.warn(`[Live Audit] Web audit warning for ${lead.name}:`, e.message);
      }
    }

    // 2. Compute new findings — things the live scan discovered that differ from stored data
    const newFindings = [];
    const currentYear = new Date().getFullYear();

    if (webAudit.has_ssl !== undefined && webAudit.has_ssl !== lead.has_ssl) {
      newFindings.push({
        id: 'ssl_status', category: 'Security',
        label: webAudit.has_ssl ? 'SSL Certificate confirmed live (profile had it missing)' : 'SSL Missing — site is on plain HTTP (profile assumed secure)',
        field: 'has_ssl', value: webAudit.has_ssl,
        severity: webAudit.has_ssl ? 'info' : 'critical'
      });
    }

    if (webAudit.load_time_sec && Math.abs(webAudit.load_time_sec - (lead.load_time_sec || 1.8)) > 0.5) {
      newFindings.push({
        id: 'load_time', category: 'Performance',
        label: `Live page load: ${webAudit.load_time_sec}s (profile had ${lead.load_time_sec || 1.8}s)`,
        field: 'load_time_sec', value: webAudit.load_time_sec,
        severity: webAudit.load_time_sec > 3 ? 'high' : 'medium'
      });
    }

    if (webAudit.copyright_year && String(webAudit.copyright_year) !== String(lead.copyright_year)) {
      const age = currentYear - parseInt(webAudit.copyright_year);
      newFindings.push({
        id: 'copyright_year', category: 'Modernity',
        label: `Copyright year ${webAudit.copyright_year} found live (profile had ${lead.copyright_year || 'unknown'}) — site is ${age} year${age !== 1 ? 's' : ''} outdated`,
        field: 'copyright_year', value: webAudit.copyright_year,
        severity: age >= 4 ? 'high' : 'low'
      });
    }

    const existingStack = new Set((lead.tech_stack || []).map(t => t.toLowerCase()));
    (webAudit.tech_stack || []).filter(t => !existingStack.has(t.toLowerCase())).forEach(tech => {
      newFindings.push({
        id: `tech_${tech.toLowerCase().replace(/\W+/g, '_')}`, category: 'Tech Stack',
        label: `Detected: ${tech} (not in AI profile)`,
        field: 'tech_stack_item', value: tech,
        severity: 'info'
      });
    });

    (webAudit.tech_audit?.issues || [])
      .filter(i => i.severity === 'critical' || i.severity === 'high')
      .forEach((issue, idx) => {
        newFindings.push({
          id: `issue_${idx}`, category: issue.category || 'Technical Issue',
          label: issue.issue + (issue.evidence ? ` — ${issue.evidence}` : ''),
          field: null, value: null,
          severity: issue.severity
        });
      });

    // 3. Patch only web-specific fields — never touch AI enriched data
    const currentFeatures = lead.features || {};
    const webPatch = {
      has_ssl:        webAudit.has_ssl !== undefined ? webAudit.has_ssl : lead.has_ssl,
      load_time_sec:  webAudit.load_time_sec || lead.load_time_sec,
      copyright_year: webAudit.copyright_year || lead.copyright_year,
      tech_audit:     webAudit.tech_audit || null,
      features: {
        ...currentFeatures,
        copyrightAge: webAudit.copyright_year ? Math.max(0, currentYear - webAudit.copyright_year) : (currentFeatures.copyrightAge || 2),
        loadTimeSec:  webAudit.load_time_sec  ? parseFloat(webAudit.load_time_sec)                  : (currentFeatures.loadTimeSec  || 2.0),
        noSSL:        webAudit.has_ssl !== undefined ? !webAudit.has_ssl : (currentFeatures.noSSL ?? false),
        noPortal:     webAudit.has_portal !== undefined ? !webAudit.has_portal : (currentFeatures.noPortal ?? true)
      },
      last_audited_at: new Date().toISOString()
    };

    // Append newly detected tech to the existing AI-enriched stack (never replace)
    const newTech = (webAudit.tech_stack || []).filter(t => !existingStack.has(t.toLowerCase()));
    if (newTech.length > 0) {
      webPatch.tech_stack = [...(lead.tech_stack || []), ...newTech];
    }

    // 4. Regenerate battlecard using AI data + fresh web signals (read-only merge for battlecard input)
    const battlecardInput = { ...lead, ...webPatch };
    webPatch.battlecard = generateBattlecard(battlecardInput);

    const savedLead = await db.updateLeadFields(lead.id, webPatch);
    console.log(`[Live Audit] Web tech audit complete for "${lead.name}" — ${newFindings.length} new signals found.`);
    res.json({
      success: true,
      lead: savedLead,
      new_findings: newFindings,
      web_audit: webAudit.tech_audit || {},
      message: `Live Web Audit complete. ${newFindings.length} new signal${newFindings.length !== 1 ? 's' : ''} found.`
    });
  } catch (err) {
    console.error('Error during live audit:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
  }
});

// 4h. Apply user-selected findings from live audit into lead fields & battlecard
app.post('/api/leads/:id/apply-findings', async (req, res) => {
  const { selected_findings } = req.body;
  if (!Array.isArray(selected_findings) || selected_findings.length === 0) {
    return res.status(400).json({ error: 'No findings selected' });
  }
  try {
    const lead = await db.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { generateBattlecard } = require('../pitch/battlecardGenerator');
    const patch = {};
    const newTechItems = [];

    for (const f of selected_findings) {
      if (f.field === 'has_ssl')          patch.has_ssl = f.value;
      else if (f.field === 'load_time_sec')   patch.load_time_sec = f.value;
      else if (f.field === 'copyright_year')  patch.copyright_year = f.value;
      else if (f.field === 'tech_stack_item') newTechItems.push(f.value);
      // field === null → informational issue, no field to patch
    }

    if (newTechItems.length > 0) {
      patch.tech_stack = [...new Set([...(lead.tech_stack || []), ...newTechItems])];
    }

    // Regenerate battlecard incorporating the accepted findings — AI fields remain untouched
    patch.battlecard = generateBattlecard({ ...lead, ...patch });

    const savedLead = await db.updateLeadFields(lead.id, patch);
    res.json({ success: true, lead: savedLead });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// 11. AI Enrich a single lead via Gemini (never overwrites existing enriched fields)
// 12b. Import Clay CSV — match by domain, update decision_makers
app.post('/api/leads/import-clay-csv', (req, res) => {
  const multer = require('multer');
  const { parse } = require('csv-parse');
  const upload = multer({ storage: multer.memoryStorage() });

  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'File upload error' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let rows = [];
    try {
      rows = await new Promise((resolve, reject) => {
        parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true }, (e, records) => {
          if (e) reject(e); else resolve(records);
        });
      });
    } catch (e) {
      return res.status(400).json({ error: `CSV parse error: ${e.message}` });
    }

    // Normalise column names — Clay exports vary (First Name / first_name / firstName)
    function col(row, ...keys) {
      for (const k of keys) {
        const found = Object.keys(row).find(r => r.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, ''));
        if (found && row[found]?.trim()) return row[found].trim();
      }
      return '';
    }

    function extractDomain(url) {
      try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch { return ''; }
    }

    const allLeads = await db.getAllLeads();
    let matched = 0, skipped = 0;

    for (const row of rows) {
      const firstName  = col(row, 'firstname', 'first name', 'first_name');
      const lastName   = col(row, 'lastname', 'last name', 'last_name');
      const fullName   = col(row, 'fullname', 'full name', 'name', 'contact name') || `${firstName} ${lastName}`.trim();
      const title      = col(row, 'title', 'jobtitle', 'job title', 'position', 'role');
      const email      = col(row, 'email', 'work email', 'workemail', 'email address');
      const linkedin   = col(row, 'linkedin', 'linkedinurl', 'linkedin url', 'linkedin_url');
      const phone      = col(row, 'phone', 'direct phone', 'mobile', 'phonenumber');
      const compDomain = col(row, 'website', 'company domain', 'companydomain', 'domain', 'company website');
      const compName   = col(row, 'company', 'company name', 'companyname', 'organization');

      if (!fullName) { skipped++; continue; }

      // Match lead by domain first, then by company name fuzzy
      const domain = extractDomain(compDomain);
      let lead = domain
        ? allLeads.find(l => extractDomain(l.website || '') === domain)
        : null;
      if (!lead && compName) {
        const cn = compName.toLowerCase();
        lead = allLeads.find(l => (l.name || '').toLowerCase().includes(cn) || cn.includes((l.name || '').toLowerCase().split(' ')[0]));
      }

      if (!lead) { skipped++; continue; }

      const contact = {
        name: fullName,
        title: title || 'Decision Maker',
        email_guess: email || null,
        linkedin_url: linkedin || null,
        phone: phone || null,
        source: 'clay_csv',
        verified: true
      };

      // Deduplicate by name
      const existing = lead.decision_makers || [];
      const alreadyExists = existing.some(dm => dm.name.toLowerCase() === fullName.toLowerCase());
      if (alreadyExists) { skipped++; continue; }

      // Remove AI-guessed contacts for same lead if we now have real data
      const prunedDMs = existing.filter(dm => dm.source !== 'gemini_ai_enrichment');
      const updatedDMs = [...prunedDMs, contact];

      await db.updateLeadFields(lead.id, { decision_makers: updatedDMs });
      matched++;
    }

    res.json({ success: true, matched, skipped, total: rows.length, message: `Matched ${matched} contacts to leads (${skipped} skipped — no match or duplicate)` });
  });
});

// 12. Sync & Ingest Enriched AI Leads from JSON
app.post('/api/leads/sync-enriched', async (_req, res) => {
  try {
    const { importEnrichedLeads } = require('../storage/importEnrichedLeads');
    const count = await importEnrichedLeads();
    res.json({ success: true, message: `Successfully synchronized ${count} AI-enriched leads!`, count });
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
  try {
    await db.connect();
    const existing = await db.getAllLeads();
    const enrichedCount = existing.filter(l => l.odoo_playbook).length;
    if (enrichedCount < 399) {
      console.log(`[Auto-Sync] AI-enriched leads need syncing (${enrichedCount}/399 present). Importing from enriched_odoo_leads.json...`);
      const { importEnrichedLeads } = require('../storage/importEnrichedLeads');
      await importEnrichedLeads();
    } else {
      console.log(`[Auto-Sync] All ${enrichedCount} AI-enriched leads verified and ready (${existing.length} total leads in database).`);
    }
  } catch (err) {
    console.warn('Database initialization warning:', err.message);
  }
}

start().catch(err => {
  console.error('Failed to start server:', err);
});
