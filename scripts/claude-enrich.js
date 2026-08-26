#!/usr/bin/env node
/**
 * Claude Code manual enrichment helper.
 *
 * Lets you (inside the VS Code Claude Code chat) enrich leads WITHOUT the Gemini
 * API — reusing the exact same Google-Maps review scraper and the same
 * `grounded_analysis` shape the UI already renders. The Gemini API path is
 * untouched; this is a parallel, manual, quota-free route.
 *
 * Two-step flow (Claude drives it):
 *
 *   1) node scripts/claude-enrich.js dump [--limit N] [--all] [--name "text"]
 *        → finds un-enriched leads, scrapes their lowest (1–2★) reviews,
 *          persists the reviews, and writes a work file:  data/_enrich_work.json
 *
 *   2) Claude reads data/_enrich_work.json, analyses each lead's bad reviews,
 *      and writes an analyses file (same schema Gemini returns), e.g.
 *      data/_enrich_analyses.json:
 *        [{ "id": "...", "analysis": {
 *             "company_profile": "...",
 *             "ceo": { "name": null, "title": null, "linkedin": null, "email": null },
 *             "decision_makers": [ ... ],
 *             "review_analysis": {
 *               "overall": "...",
 *               "recurring_problems": [ { "problem": "", "keywords": ["..."], "evidence": "" } ],
 *               "snippets": [ { "stars": 1, "text": "" } ]
 *             },
 *             "odoo_mapping": [ { "problem": "", "odoo_module": "", "pitch": "" } ]
 *        } }]
 *
 *   3) node scripts/claude-enrich.js apply data/_enrich_analyses.json
 *        → computes the deterministic Problem × Odoo matrix and saves everything
 *          into each lead's `grounded_analysis` (marked source: "claude_code").
 */

const path = require('path');
const fs = require('fs');

const db = require('../src/db/database');
const { scrapeLowestReviews } = require('../src/scraper/googleMapsReviews');
const { buildProblemMatrix } = require('../src/enricher/companyResearcher');
const { launchBrowser } = require('../src/scraper/browserHelper');

const WORK_FILE = path.join(__dirname, '..', 'data', '_enrich_work.json');

const isBad = (r) => r && r.text && (r.rating == null || r.rating <= 2);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--name') args.name = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function cmdDump(args) {
  await db.connect();
  const all = await db.getAllLeads();
  const limit = Number.isFinite(args.limit) ? args.limit : 5;

  let targets = all.filter((l) => l && l.name);
  if (args.name) {
    const q = args.name.toLowerCase();
    targets = targets.filter((l) => (l.name || '').toLowerCase().includes(q));
  }
  if (!args.all) {
    targets = targets.filter((l) => !l.grounded_analysis); // un-enriched only
  }
  targets = targets.slice(0, limit);

  if (!targets.length) {
    console.log('Nothing to enrich (no matching un-enriched leads). Use --all to re-scrape enriched ones.');
    return;
  }

  console.log(`Scraping lowest reviews for ${targets.length} lead(s)...`);
  const browser = await launchBrowser();
  const work = [];
  try {
    for (const lead of targets) {
      let reviews = ((lead.deep_intel && lead.deep_intel.reviews_dataset) || []).filter(isBad);
      if (reviews.length < 3) {
        const scraped = await scrapeLowestReviews(lead.name, lead.location || '', {
          address: lead.address || '', max: 35, browser
        });
        if (scraped.length) {
          const deep_intel = { ...(lead.deep_intel || {}), reviews_dataset: scraped, reviews_scraped_at: new Date().toISOString() };
          await db.updateLeadFields(lead.id, { deep_intel });
          reviews = scraped.filter(isBad);
        }
      }
      console.log(`  • ${lead.name} — ${reviews.length} bad (1–2★) reviews`);
      work.push({
        id: lead.id,
        name: lead.name,
        location: lead.location || '',
        industry: lead.industry || '',
        website: lead.website || '',
        employee_size: lead.employee_size || '',
        bad_reviews: reviews.slice(0, 25).map((r) => ({ rating: r.rating, reviewer: r.reviewer, date: r.date, text: r.text }))
      });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  fs.writeFileSync(WORK_FILE, JSON.stringify(work, null, 2), 'utf-8');
  console.log(`\nWrote ${work.length} lead(s) with scraped bad reviews →\n  ${WORK_FILE}`);
  console.log('\nNext: analyse each lead in the chat, write data/_enrich_analyses.json, then run:');
  console.log('  node scripts/claude-enrich.js apply data/_enrich_analyses.json');
}

async function cmdApply(args) {
  const file = args._[0];
  if (!file) { console.error('Usage: node scripts/claude-enrich.js apply <analyses.json>'); process.exit(1); }
  const analyses = JSON.parse(fs.readFileSync(path.resolve(file), 'utf-8'));
  if (!Array.isArray(analyses)) { console.error('Analyses file must be a JSON array of { id, analysis }.'); process.exit(1); }

  await db.connect();
  let ok = 0;
  for (const entry of analyses) {
    const { id, analysis } = entry || {};
    if (!id || !analysis) { console.warn('  ! skipped an entry missing id/analysis'); continue; }
    const lead = await db.getLeadById(id);
    if (!lead) { console.warn(`  ! lead not found: ${id}`); continue; }

    const reviews = ((lead.deep_intel && lead.deep_intel.reviews_dataset) || []).filter(isBad);
    analysis.problem_matrix = buildProblemMatrix(reviews, analysis);
    analysis.reviews_scraped = reviews.length;
    if (analysis.review_analysis && analysis.review_analysis.reviews_analysed == null) {
      analysis.review_analysis.reviews_analysed = reviews.length;
    }
    analysis.ai_generated = true;
    analysis.source = 'claude_code';
    analysis.generated_at = new Date().toISOString();

    await db.updateLeadFields(id, { grounded_analysis: analysis });
    const top = (analysis.problem_matrix.rows[0] || {});
    console.log(`  ✓ ${lead.name} — ${reviews.length} reviews · top: ${top.problem || '—'} → ${top.odoo_module || '—'}`);
    ok++;
  }
  console.log(`\nEnriched ${ok} lead(s). Refresh the dashboard/caller to see them.`);
}

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();
  const args = parseArgs(argv);
  try {
    if (cmd === 'dump') await cmdDump(args);
    else if (cmd === 'apply') await cmdApply(args);
    else {
      console.log('Usage:');
      console.log('  node scripts/claude-enrich.js dump [--limit N] [--all] [--name "text"]');
      console.log('  node scripts/claude-enrich.js apply <analyses.json>');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
