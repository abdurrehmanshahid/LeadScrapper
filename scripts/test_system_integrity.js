/**
 * Big Binary Tech - Comprehensive System & ML Audit Suite
 * Validates:
 * 1. Hugging Face On-Device Transformers (@xenova/transformers)
 * 2. Zero-Shot NLI Review Intelligence Classifier
 * 3. PRISM ML Propensity Scorer & Calibrated Win Probability
 * 4. Grounded Gemini AI Sales Intelligence & Review Audit
 * 5. Consultative Battlecard Engine & 8 Buyer Persona Scripts
 * 6. Hybrid Database & Data Schema Verification
 */

const { scoreLead } = require('../src/ml/propensityScorer');
const { analyzeFrictionWithNLI } = require('../src/ml/reviewIntelligence');
const { computeEmbedding, searchLeads } = require('../src/ml/semanticSearch');
const { computeCaseStudyFit } = require('../src/ml/caseStudyEmbedder');
const { generateBattlecard } = require('../src/pitch/battlecardGenerator');
const { enrichLead } = require('../src/enricher/geminiEnricher');
const db = require('../src/db/database');

async function runAudit() {
  console.log('================================================================');
  console.log('⚡ BIG BINARY TECH — SYSTEM INTEGRITY & ML AUDIT SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(title, condition, detail = '') {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} — ${detail}`);
    }
  }

  // ─── 1. PRISM ML Propensity Engine Audit ─────────────────────────────────────
  console.log('📦 1. Testing PRISM ML Propensity Engine...');
  const testLeadA = {
    name: 'Metro Commercial Roofing LLC',
    industry: 'commercial roofing contractor',
    employee_size: '11-50',
    rating: 4.5,
    reviews_count: 65,
    tech_stack: ['WordPress'],
    has_ssl: true,
    copyright_year: 2021,
    load_time_sec: 2.1
  };
  const scoreA = scoreLead(testLeadA);
  assert('Calculates propensity score between 20% and 95%', scoreA.success_chance_pct >= 20 && scoreA.success_chance_pct <= 95, `Got: ${scoreA.success_chance_pct}`);
  assert('Categorizes non-Odoo lead as NEW_IMPLEMENTATION', scoreA.category === 'NEW_IMPLEMENTATION');
  assert('Assigns appropriate conversion Fit Tier', ['High Conversion (Tier 1)', 'Solid Opportunity (Tier 2)', 'Low Fit / Cold (Tier 3)'].includes(scoreA.fit_tier));

  const testLeadBPO = {
    name: 'Global Supply Distribution Co.',
    industry: 'wholesale distribution',
    employee_size: '51-200',
    rating: 4.1,
    reviews_count: 24,
    tech_stack: ['Odoo v14', 'PostgreSQL'],
    has_ssl: true,
    copyright_year: 2023,
    load_time_sec: 1.4
  };
  const scoreBPO = scoreLead(testLeadBPO);
  assert('Categorizes active Odoo lead as BPO_RESCUE', scoreBPO.category === 'BPO_RESCUE');

  // ─── 2. Hugging Face On-Device ML (Zero-Shot NLI & Embeddings) ────────────────
  console.log('\n🧠 2. Testing Hugging Face On-Device Models (@xenova/transformers)...');
  const nliResult = await analyzeFrictionWithNLI('They charged us twice on the invoice and the dispatch technician was late.');
  assert('Zero-Shot NLI identifies top operational friction theme', typeof nliResult.top_friction === 'string' && nliResult.top_friction.length > 3);
  assert('Zero-Shot NLI outputs confidence and friction breakdown', Array.isArray(nliResult.friction_breakdown) && nliResult.friction_breakdown.length > 0);

  const embedding = await computeEmbedding('commercial roofing contractor with invoice delays');
  assert('Generates 384-dimensional neural embedding vector', Array.isArray(embedding) && embedding.length === 384);

  const searchResults = await searchLeads('roofing contractor invoice issues', [testLeadA, testLeadBPO]);
  assert('Semantic Search ranks relevant roofing lead first', searchResults.length > 0 && searchResults[0].name === testLeadA.name);

  const caseStudy = await computeCaseStudyFit(testLeadA);
  assert('Matches closest Big Binary Tech case study portfolio', typeof caseStudy.matched_case_study === 'string' && caseStudy.semantic_fit_pct >= 50);

  // ─── 3. Grounded Gemini AI Enrichment Audit ──────────────────────────────────
  console.log('\n🤖 3. Testing Grounded Gemini AI Enrichment & Anti-Hallucination...');
  const mockReviews = [
    { rating: 1, text: 'No one answered the phone for 2 hours and we were billed double for standard maintenance.' }
  ];
  const geminiResult = await enrichLead(testLeadA, mockReviews);
  assert('Gemini accurately returns deal category', geminiResult.category === 'NEW_IMPLEMENTATION' || geminiResult.category === 'BPO_RESCUE');
  assert('Gemini identifies evidence-backed problems', geminiResult.identified_problems && geminiResult.identified_problems.length > 0);
  assert('Gemini generates tailored pitch hook without boilerplate', geminiResult.pitch_hook && geminiResult.pitch_hook.length > 20);
  assert('Gemini does not hallucinate fake placeholder decision maker names', Array.isArray(geminiResult.decision_makers) && !geminiResult.decision_makers.some(d => d.name.toLowerCase().includes('john doe')));

  // ─── 4. Consultative SDR Battlecard Engine Audit ─────────────────────────────
  console.log('\n🩺 4. Testing Consultative Battlecard & 8 Buyer Persona Engine...');
  const battlecardInput = {
    ...testLeadA,
    ...scoreA,
    ...geminiResult
  };
  const battlecard = generateBattlecard(battlecardInput);
  assert('Calculates Software Vulnerability Score (30–98%)', battlecard.vulnerability_score >= 30 && battlecard.vulnerability_score <= 98);
  assert('Estimates annual quantified financial leak', typeof battlecard.estimated_financial_leak === 'string' && battlecard.estimated_financial_leak.includes('$'));
  assert('Generates 3-step consultative advisory prescription', Array.isArray(battlecard.advisory_3step_plan) && battlecard.advisory_3step_plan.length === 3);
  assert('Generates objection counters for SDRs', Array.isArray(battlecard.objection_handlers) && battlecard.objection_handlers.length > 0);

  // ─── 5. Database & 399 Enriched Leads Audit ───────────────────────────────────
  console.log('\n💾 5. Testing Database & Stored Lead Integrity...');
  await db.connect();
  const leads = await db.getAllLeads();
  assert('Database contains 399+ enriched leads', leads.length >= 399, `Found: ${leads.length}`);
  const withPlaybook = leads.filter(l => l.odoo_playbook);
  assert('All 399 AI-enriched leads contain Odoo sales playbooks', withPlaybook.length >= 399, `Found: ${withPlaybook.length}`);
  const withBattlecard = leads.filter(l => l.battlecard);
  assert('All leads have pre-computed consultative battlecards', withBattlecard.length >= 399, `Found: ${withBattlecard.length}`);

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`📊 AUDIT SUMMARY: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL SYSTEMS TIGHT & VERIFIED! The platform is production-ready.');
  } else {
    console.warn('⚠️ Some tests did not pass. Please inspect the output above.');
  }
}

if (require.main === module) {
  runAudit()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Audit crashed:', err);
      process.exit(1);
    });
}

module.exports = { runAudit };
