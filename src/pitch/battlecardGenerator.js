/**
 * Dynamic Battlecard Generator for Big Binary Tech.
 * Problem points, opener, offer, and objections are all driven by the
 * actual audit signals on the lead — no two leads should read identically.
 */

function generateBattlecard(lead) {
  const currentYear = new Date().getFullYear();
  const companyName = lead.name || 'your company';
  const category = lead.category || 'NEW_IMPLEMENTATION';
  const industry = (lead.industry || 'local business').toLowerCase();
  const copyrightYear = lead.copyright_year || currentYear - 2;
  const yearsOutdated = Math.max(1, currentYear - copyrightYear);
  const reviewsCount = lead.reviews_count || 0;
  const rating = lead.rating || '4.5';
  const techStack = (lead.tech_stack || []).join(', ');
  const f = lead.features || {};
  const hasSSL = lead.has_ssl;
  const loadTime = parseFloat(lead.load_time_sec) || 2.0;
  const employeeSize = lead.employee_size || '11-50';

  // Deep Intel signals
  const intel = lead.deep_intel || {};
  const hiringSignals = intel.hiring?.hiring_signals || [];
  const latestNews = intel.news?.latest_headline || null;
  const bbbYears = intel.bbb?.years_in_business || null;
  const corpDate = intel.corporation?.incorporation_date || null;
  const openJobs = intel.hiring?.jobs_found || [];
  const yearsInBusiness = bbbYears || (corpDate ? `${currentYear - parseInt(corpDate)} years` : null);

  const problemPoints = [];
  let opener = '';
  let targetOffer = '';
  const objections = [];

  // ─── BPO RESCUE (existing Odoo users) ─────────────────────────────────────
  if (category === 'BPO_RESCUE') {
    const isLegacy = f.isLegacyOdoo ||
      ['v12', 'v13', 'v14', 'v15'].some(v => techStack.toLowerCase().includes(v));

    // Problem 1: Version-specific risk
    if (isLegacy) {
      problemPoints.push(
        `Running a legacy Odoo version (${techStack || 'v12–v15'}) — exposed to security vulnerabilities and incompatible with the v17/v18 app ecosystem.`
      );
    } else {
      problemPoints.push(
        `Active Odoo deployment detected (${techStack || 'current version'}) — growing module debt and undocumented customizations are a common long-term liability.`
      );
    }

    // Problem 2: Support cost reality
    problemPoints.push(
      `Regional Odoo partners typically charge $150–$250/hr with multi-week SLAs. A single bad module deploy or data migration issue can stall operations for days.`
    );

    // Problem 3: Scale-specific pain
    if (employeeSize === '51-200') {
      problemPoints.push(
        `At ${employeeSize} employees, Odoo system downtime can cost $5K–$12K/day in lost throughput — without 24/7 monitoring that risk is entirely unmitigated.`
      );
    } else {
      problemPoints.push(
        `At ${employeeSize} employees, dedicated internal Odoo expertise is expensive to maintain. Most companies this size are either understaffed on Odoo or over-reliant on a single consultant.`
      );
    }

    // Problem 4 (intel): Hiring signals reveal operational strain
    if (hiringSignals.length > 0) {
      problemPoints.push(
        `Live hiring data signals: ${hiringSignals[0].toLowerCase()} — a common indicator that manual Odoo workflows are creating bottlenecks that headcount alone won't solve.`
      );
    }

    // Offer — varies by version situation
    if (isLegacy) {
      targetOffer = `Priority v17/v18 Migration + 24/7 BPO Support: full module audit, zero-downtime upgrade path, and ongoing SLA maintenance at 50% below standard partner rates.`;
    } else {
      targetOffer = `Dedicated Odoo BPO & SLA Package: 24/7 ticket resolution, proactive module health monitoring, and custom n8n workflow automation at a fixed monthly cost.`;
    }

    // Opener — two variants based on legacy vs. current; inject news hook if available
    const bpoNewsHook = latestNews ? ` I also saw the recent news about ${companyName} — congrats on the activity.` : '';
    const bpoAgeNote = yearsInBusiness ? ` With ${yearsInBusiness} in the market, ` : ' ';
    if (isLegacy) {
      opener = `Hi, calling from Big Binary Tech — we specialize in Odoo support for operations teams.${bpoNewsHook} I noticed ${companyName} is running an older Odoo version and wanted to check in: are you getting the SLA coverage and upgrade roadmap you need from your current partner?${bpoAgeNote}we've migrated several companies your size to v18 with zero downtime and cut their monthly support bill in half. Worth a 5-minute conversation?`;
    } else {
      opener = `Hi, Big Binary Tech here.${bpoNewsHook} I noticed ${companyName} is running Odoo — great choice for a ${employeeSize}-person operation.${bpoAgeNote}we work with established companies that are happy with Odoo itself but frustrated with partner response times or escalating support costs. We offer 24/7 SLA-backed maintenance at around half the going rate. Is your current Odoo support giving you the coverage you actually need?`;
    }

    // Objections — pick based on legacy status
    const bpoPool = [
      {
        objection: '"We already have an Odoo partner."',
        counter: '"That\'s common — most of our clients kept their partner for roadmap projects and brought us in for 24/7 overflow tickets at half the rate. Happy to send a one-page cost comparison?"'
      },
      {
        objection: '"We built Odoo internally — no outside partner."',
        counter: '"Internal teams are great for new features. We cover the part that\'s hard to staff internally: 24/7 on-call for outages, hotfixes, and monthly health audits — without replacing your team."'
      },
      {
        objection: '"We\'re not planning to upgrade yet."',
        counter: '"Totally fine — we can support your current version today and plan the upgrade on your schedule. The goal is making sure you\'re not stranded on an end-of-life version when a security patch drops."'
      },
      {
        objection: '"We don\'t have budget for this right now."',
        counter: '"That\'s exactly the conversation worth having. We typically reduce monthly Odoo maintenance spend by 40–50%. The switch often pays for itself in month one — can I email you a quick cost breakdown?"'
      }
    ];

    objections.push(bpoPool[0]);
    objections.push(isLegacy ? bpoPool[2] : bpoPool[3]);

  // ─── NEW IMPLEMENTATION (no ERP detected) ──────────────────────────────────
  } else {

    // Problem 1: Digital staleness — only add if meaningful
    if (yearsOutdated >= 5) {
      problemPoints.push(
        `Digital presence last refreshed in ${copyrightYear} — ${yearsOutdated} years without a platform update almost always means the back-office workflows behind it are equally dated.`
      );
    } else if (yearsOutdated >= 3) {
      problemPoints.push(
        `Website copyright stuck at ${copyrightYear} (${yearsOutdated} years ago) — a signal that client-facing tools and internal operations haven't been revisited since then either.`
      );
    }

    // Problem 2: Tech-stack specific — what system are they actually on?
    if (f.hasLegacyCMS) {
      const cmsName = techStack.split(',')[0] || 'Joomla/Drupal';
      problemPoints.push(
        `Running on ${cmsName} — a CMS with no ERP integrations — meaning field jobs, inventory, and billing are tracked in separate spreadsheets with no single source of truth.`
      );
    } else if (f.hasWordPress) {
      problemPoints.push(
        `WordPress site with no operations layer — customer requests, job scheduling, and invoicing are handled outside the website entirely, creating manual handoff friction at every step.`
      );
    } else if (f.noPortal) {
      problemPoints.push(
        `No integrated client portal or dispatch system detected — customers likely call or email to book service with no real-time job status or self-serve tracking available.`
      );
    }

    // Problem 3: Performance / security — only when clearly problematic
    if (!hasSSL) {
      problemPoints.push(
        `No SSL certificate — contact forms and booking submissions are sent in plain text. A credibility red flag for any B2B client doing due diligence before signing a contract.`
      );
    } else if (loadTime > 3.0) {
      problemPoints.push(
        `Site loads in ${loadTime.toFixed(1)}s — above the 3-second threshold where over half of mobile visitors leave. Active inbound leads are being lost before the first page renders.`
      );
    }

    // Problem 4: Revenue signal — reframe as scale constraint
    if (reviewsCount >= 50) {
      problemPoints.push(
        `${reviewsCount} reviews at ${rating}★ confirms strong, recurring demand — but without automated dispatch and invoicing, every new job still requires manual coordination, which caps the volume the team can handle.`
      );
    } else if (reviewsCount >= 20) {
      problemPoints.push(
        `${reviewsCount} reviews at ${rating}★ shows established clientele. That volume of relationships is difficult to maintain manually — automated follow-up and a client portal would directly increase repeat bookings.`
      );
    }

    // Problem 5 (intel): Hiring signals are the strongest real-time pain indicator
    if (hiringSignals.length > 0 && problemPoints.length < 4) {
      problemPoints.push(
        `Live job posting signal: ${hiringSignals[0]} — when headcount grows without automation, every new hire adds coordination overhead rather than capacity.`
      );
    }

    // Cap at 4 — avoid wall-of-text
    while (problemPoints.length > 4) problemPoints.pop();

    // If somehow nothing fired, add a minimal fallback
    if (problemPoints.length === 0) {
      problemPoints.push(`No integrated ERP, CRM, or client portal detected — operations are likely managed through disconnected tools and manual processes.`);
    }

    // Offer — based on the dominant gap identified
    if (f.hasLegacyCMS || f.hasWordPress) {
      targetOffer = `Full Platform Migration: replace legacy CMS with Odoo (CRM + Projects + Field Dispatch + Invoicing) + n8n automation layer. Live in 30 days with zero operational downtime.`;
    } else if (!hasSSL || loadTime > 3.0) {
      targetOffer = `Operations & Infrastructure Overhaul: secure Odoo client portal, automated job-dispatch, and invoicing — built to convert web traffic into booked revenue.`;
    } else {
      targetOffer = `Odoo Business Operations Suite: integrated CRM, Project & Field Dispatch, and Invoicing + n8n automation to replace manual spreadsheets and disconnected tools.`;
    }

    // Industry detection
    const isHealthcare = ['health', 'clinic', 'dental', 'medical', 'physio', 'optom'].some(k => industry.includes(k));
    const isContractor = ['roof', 'hvac', 'plumb', 'construct', 'field service', 'electric', 'solar', 'pest'].some(k => industry.includes(k));
    const isWholesale = ['wholesale', 'distribution', 'logistics', 'manufactur', 'supply'].some(k => industry.includes(k));

    // Build intel hook sentences for opener personalisation
    const newsHook = latestNews ? ` I actually came across some recent news on ${companyName} —` : '';
    const hiringHook = hiringSignals.length > 0 ? ` I noticed you're currently ${hiringSignals[0].toLowerCase()},` : '';
    const ageCredential = yearsInBusiness ? ` For a company with ${yearsInBusiness} of track record,` : '';

    // Opener — industry-specific variant enriched with live intel
    if (isHealthcare) {
      opener = `Hi, calling from Big Binary Tech.${newsHook}${hiringHook} we noticed ${companyName} has a solid patient base${reviewsCount > 0 ? ` — ${reviewsCount} reviews at ${rating}★` : ''}, but your practice management tools haven't been updated in a few years. We help clinics and medical offices replace disconnected scheduling, billing, and patient comms with a single integrated Odoo environment. Are manual scheduling gaps or billing delays costing your staff time right now?`;
    } else if (isContractor) {
      opener = `Hi, Big Binary Tech here.${newsHook}${hiringHook} we work with ${industry} companies to automate job dispatch, quoting, and client follow-up. I noticed ${companyName} has${reviewsCount > 0 ? ` ${reviewsCount} reviews and` : ''} a strong local reputation.${ageCredential} your operations backend likely still runs on spreadsheets or disconnected apps. We can have an integrated Odoo field-ops setup live in under 30 days — do you have 2 minutes to hear how we cut admin time for contractors by 60%?`;
    } else if (isWholesale) {
      opener = `Hi, calling from Big Binary Tech.${newsHook}${hiringHook} we specialize in Odoo ERP for wholesale and distribution operations.${ageCredential} I noticed ${companyName} doesn't appear to have an integrated inventory and order management system — most companies your size are still reconciling orders in Excel at month-end. We connect purchasing, inventory, and invoicing into one Odoo environment. Is that a pain point for your ops team?`;
    } else {
      opener = `Hi, I noticed ${companyName} has built a solid reputation in ${industry}${reviewsCount > 0 ? ` with ${reviewsCount} reviews at ${rating}★` : ''}.${newsHook}${hiringHook}${ageCredential} at Big Binary Tech we help established businesses replace manual workflows with an all-in-one Odoo system and n8n automation. Do you have 2 minutes to hear how we streamline client intake and job tracking?`;
    }

    // Objections — industry-aware pools
    const healthcareObjections = [
      {
        objection: '"We already use a medical billing system."',
        counter: '"Odoo doesn\'t replace your billing system — it integrates with it and adds the scheduling, patient comms, and practice management layer your team is likely missing."'
      },
      {
        objection: '"We\'re too busy to implement new software."',
        counter: '"We hear that constantly from busy practices — that\'s why we handle the full migration while you stay operational. Most clinics see a productivity lift within two weeks of go-live."'
      }
    ];

    const contractorObjections = [
      {
        objection: '"We use QuickBooks and it works fine."',
        counter: '"QuickBooks is great for year-end taxes, but it doesn\'t dispatch field teams, track live job progress, or send automated client updates. Odoo handles everything QuickBooks can\'t."'
      },
      {
        objection: '"We\'re too slammed to switch systems right now."',
        counter: '"That\'s exactly what every top contractor tells us — and why we do 100% of the data migration for you with zero downtime. No lost jobs, no retraining headaches during busy season."'
      }
    ];

    const wholesaleObjections = [
      {
        objection: '"We have a custom system built for us."',
        counter: '"Custom systems often lack real-time inventory sync and automated PO workflows. Odoo can integrate with it or replace it at a fraction of what you pay to maintain custom code."'
      },
      {
        objection: '"An ERP is too expensive for us right now."',
        counter: '"Odoo\'s total cost is typically 70% lower than SAP or NetSuite, and we do phased rollouts — start with just inventory + invoicing and expand from there. What does manual reconciliation cost you in staff hours each month?"'
      }
    ];

    const genericObjections = [
      {
        objection: '"We\'re not looking for new software right now."',
        counter: '"Totally fair — most companies we work with weren\'t either, until we showed them a 15-minute demo of how much time their team wastes on manual steps. Worth 15 minutes to find out?"'
      },
      {
        objection: '"We don\'t have the budget."',
        counter: '"Odoo typically replaces 3–4 separate tools your team already pays for. Can I send you a quick cost comparison so you can see whether it actually saves money net of implementation?"'
      }
    ];

    if (isHealthcare) {
      objections.push(...healthcareObjections);
    } else if (isContractor) {
      objections.push(...contractorObjections);
    } else if (isWholesale) {
      objections.push(...wholesaleObjections);
    } else {
      objections.push(...genericObjections);
    }
  }

  return {
    problem_analysis: problemPoints,
    target_offer: targetOffer,
    elevator_opener: opener,
    objection_handlers: objections,
    review_dossier: lead.review_dossier || null,
    case_study_fit: lead.case_study_fit || null
  };
}

module.exports = { generateBattlecard };
