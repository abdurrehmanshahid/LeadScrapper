/**
 * Dynamic Consultative Battlecard & Diagnostic Advisory Generator for Big Binary Tech.
 * Converts technical audit signals into authoritative, high-converting SDR advisory scripts.
 */

const _negativeNews = /\b(lawsuit|sued|layoff|laid off|cut|fire|downsize|bankrupt|breach|hack|fine|penalty|investigation|complaint|loss|drop|fall|decline|crisis|probe)\b/i;

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
  const yearsInBusiness = bbbYears || (corpDate ? `${currentYear - parseInt(corpDate)} years` : null);

  const problemPoints = [];
  let opener = '';
  let targetOffer = '';
  const objections = [];

  // Financial Leak & Vulnerability Calculations
  let financialLeakAnnual = '$45,000 – $80,000 / year';
  let vulnerabilityScore = 65;
  const vulnerabilityFlags = [];

  if (employeeSize === '51-200') {
    financialLeakAnnual = '$120,000 – $240,000 / year';
    vulnerabilityScore += 15;
  } else if (employeeSize === '201-500') {
    financialLeakAnnual = '$350,000+ / year';
    vulnerabilityScore += 25;
  }

  // Detects negative news so we don't congratulate a prospect on a lawsuit
  const _negativeNews = /lawsuit|layoff|bankrupt|recall|fraud|scandal|fine|penalt|arrest|shut.?down|investigat|indictment|clos(ed|ing|ure)|breach/i;

  // ─── BPO RESCUE (Existing Odoo Implementations) ───────────────────────────
  if (category === 'BPO_RESCUE') {
    const isLegacy = f.isLegacyOdoo ||
      ['v12', 'v13', 'v14', 'v15'].some(v => techStack.toLowerCase().includes(v));

    if (isLegacy) {
      vulnerabilityScore += 20;
      vulnerabilityFlags.push('🚨 Critical ERP Debt: Running End-of-Life Odoo version (v12–v15)');
      problemPoints.push(
        `Running a legacy Odoo version (${techStack || 'v12–v15'}) — exposed to unpatched security vulnerabilities and incompatible with modern Odoo v18 apps.`
      );
    } else {
      vulnerabilityFlags.push('⚠️ Support SLA & Custom Module Debt: Escalating maintenance costs');
      problemPoints.push(
        `Active Odoo deployment (${techStack || 'current version'}) — growing module debt and undocumented customizations risk crippling daily operations.`
      );
    }

    problemPoints.push(
      `Regional Odoo partners typically charge $150–$250/hr with multi-week ticket response times. A single module conflict can halt warehouse dispatch or payroll for days.`
    );

    if (employeeSize === '51-200') {
      problemPoints.push(
        `At ${employeeSize} employees, system downtime costs an estimated $6,000–$14,000/day in stalled team output.`
      );
    } else {
      problemPoints.push(
        `At ${employeeSize} employees, maintaining in-house Odoo developers is cost-prohibitive. Most firms are vulnerable to single-person dependency risk.`
      );
    }

    if (hiringSignals.length > 0) {
      problemPoints.push(
        `Hiring signal detected: ${hiringSignals[0]} — indicating internal team strain trying to bridge manual Odoo workflow gaps.`
      );
    }

    targetOffer = isLegacy
      ? `Priority v18 Modernization & 24/7 BPO SLA: complete module refactor, zero-downtime database upgrade, and ongoing maintenance at 50% below standard partner rates.`
      : `Dedicated 24/7 Odoo BPO & SLA Package: guaranteed 15-minute critical ticket response, automated n8n workflow bridges, and fixed monthly support pricing.`;

    const bpoNewsHook = latestNews
      ? _negativeNews.test(latestNews)
        ? ` I've been following some of the recent developments around ${companyName}.`
        : ` I noticed the recent company news on ${companyName} — congrats on the expansion.`
      : '';
    const bpoAgeNote = yearsInBusiness ? ` With ${yearsInBusiness} in the market, ` : ' ';

    // Authoritative Consultative Opener
    opener = `Hi, calling from Big Binary Tech's technical advisory team.${bpoNewsHook} I was reviewing ${companyName}'s digital operations backend and noticed you're running Odoo${isLegacy ? ' on an older release' : ''}.${bpoAgeNote}We work with ${employeeSize}-person companies that love Odoo's core capabilities, but are frustrated by escalating partner hourly rates ($180+/hr) or slow response times when critical modules fail. We provide dedicated 24/7 SLA maintenance and upgrade roadmaps at half the going rate. How is your current Odoo support handling critical ticket turnaround?`;

    objections.push(
      {
        objection: '"We already have an Odoo partner / developer."',
        counter: '"That\'s completely normal — most of our clients kept their primary partner for big projects and brought us in for 24/7 emergency ticket overflow and routine health audits at half the cost. Would a 1-page comparison make sense?"'
      },
      {
        objection: '"We built Odoo in-house — no outside help needed."',
        counter: '"Internal engineers are best focused on core product features. We handle the heavy lifting: 24/7 on-call coverage, security patches, and database optimizations so your team isn\'t woken up by weekend crashes."'
      },
      {
        objection: '"We\'re not ready to upgrade yet."',
        counter: '"Understood — we don\'t force sudden upgrades. We support your current version right now to stabilize performance, while mapping out a smooth zero-downtime migration on your timeline."'
      }
    );

  // ─── NEW IMPLEMENTATIONS (No ERP / Legacy Stack) ──────────────────────────
  } else {
    if (yearsOutdated >= 3) {
      vulnerabilityScore += 15;
      vulnerabilityFlags.push(`⚠️ Legacy Tech Stagnation: Website & backend unrefreshed since ${copyrightYear}`);
      problemPoints.push(
        `Digital presence last updated in ${copyrightYear} (${yearsOutdated} years ago) — client intake, dispatch, and billing are operating on disconnected legacy processes.`
      );
    }

    if (f.hasLegacyCMS) {
      vulnerabilityScore += 15;
      vulnerabilityFlags.push('⚠️ CMS Silo: CMS disconnected from accounting & field dispatch');
      problemPoints.push(
        `Running on a legacy CMS without ERP integrations — customer bookings, job scheduling, and invoicing are manually reconciled across Excel spreadsheets.`
      );
    } else if (f.hasWordPress) {
      vulnerabilityScore += 10;
      vulnerabilityFlags.push('⚠️ Disconnected WordPress Stack: No unified operations or CRM layer');
      problemPoints.push(
        `WordPress marketing site with no backend operations bridge — customer requests and job tracking require manual double-entry across multiple disconnected tools.`
      );
    }

    if (!hasSSL) {
      vulnerabilityScore += 20;
      vulnerabilityFlags.push('🚨 Security Risk: Unencrypted forms & missing SSL encryption');
      problemPoints.push(
        `Missing SSL certificate — client contact details and quote requests are submitted without encryption, posing credibility and data security risks.`
      );
    } else if (loadTime > 3.0) {
      vulnerabilityScore += 10;
      vulnerabilityFlags.push(`⚠️ Performance Latency: ${loadTime.toFixed(1)}s load time leaks inbound leads`);
      problemPoints.push(
        `Site load time of ${loadTime.toFixed(1)}s exceeds the 3-second abandonment limit — losing high-intent customer inquiries before pages render.`
      );
    }

    if (reviewsCount >= 40) {
      problemPoints.push(
        `Strong client demand (${reviewsCount} reviews at ${rating}★) — but manual job dispatch and invoicing creates an administrative ceiling that limits monthly revenue scale.`
      );
    }

    while (problemPoints.length > 4) problemPoints.pop();
    if (problemPoints.length === 0) {
      problemPoints.push(`No unified ERP or automated client portal detected — operations rely on manual double-entry.`);
    }

    targetOffer = `Full Business Operations Modernization: Unified Odoo ERP (CRM + Job Dispatch + Automated Invoicing + Client Portal) with automated n8n workflows. Live in 30 days with zero operational downtime.`;

    const isContractor = ['roof', 'hvac', 'plumb', 'construct', 'field service', 'electric', 'solar', 'pest'].some(k => industry.includes(k));
    const isHealthcare = ['health', 'clinic', 'dental', 'medical', 'physio', 'optom'].some(k => industry.includes(k));
    const isWholesale = ['wholesale', 'distribution', 'logistics', 'manufactur', 'supply'].some(k => industry.includes(k));

    const newsHook = latestNews
      ? _negativeNews.test(latestNews)
        ? ` I've been following some of the recent news around ${companyName}.`
        : ` I noticed ${companyName}'s recent company announcement — congrats on the growth.`
      : '';
    const hiringHook = hiringSignals.length > 0 ? ` I saw that you're currently ${hiringSignals[0].toLowerCase()},` : '';
    const ageCredential = yearsInBusiness ? ` For a business with ${yearsInBusiness} in the community,` : '';
    const report = lead.review_dossier?.intelligence_report;

    if (report && report.totalReviewsAnalyzed > 0) {
      const topDetail = report.executiveSummary.primaryDetail;
      opener = `Hi, Big Binary Tech here.${newsHook}${hiringHook} We help growing ${industry} providers replace disconnected scheduling and intake tools with a single automated Odoo platform. Our diagnostic scan of your public feedback showed that ${topDetail} Are communication handoffs or administrative bottlenecks putting unnecessary pressure on your staff?`;
    } else if (isContractor) {
      opener = `Hi, Big Binary Tech here.${newsHook}${hiringHook} We help growing ${industry} contractors eliminate the spreadsheet shuffle between customer calls, crew dispatch, and final invoicing with a custom Odoo workflow. Are manual dispatch handoffs or delayed payment collections currently creating friction for your team?`;
    } else if (isHealthcare) {
      opener = `Hi, Big Binary Tech here.${newsHook}${hiringHook} We help growing medical and specialty clinics replace fragmented patient booking, intake, and invoicing with a single HIPAA-aligned Odoo platform. Are manual scheduling handoffs or billing reconciliation delays costing your admin staff hours each week?`;
    } else if (isWholesale) {
      opener = `Hi, Big Binary Tech here.${newsHook}${hiringHook} We help distribution and wholesale teams replace disconnected inventory, order processing, and accounting spreadsheets with a unified Odoo ERP system. Is manual inventory syncing or delayed order invoicing slowing down your fulfillment speed?`;
    } else {
      opener = `Hi, Big Binary Tech here.${newsHook}${hiringHook}${ageCredential} We build custom Odoo operations platforms that unify customer intake, job tracking, and automated billing into a single screen. Are disconnected software tools or manual double-entry currently creating administrative bottlenecks for your business?`;
    }

    objections.push(
      {
        objection: '"We use QuickBooks / spreadsheets and it works fine."',
        counter: '"QuickBooks is great for bookkeeping, but it doesn\'t track live field jobs, automate customer follow-up, or prevent double-entry. Odoo bridges directly into QuickBooks or replaces the manual work entirely."'
      },
      {
        objection: '"We\'re too busy to change software right now."',
        counter: '"That\'s exactly why we designed our 30-day turnkey rollout — we handle 100% of the data migration and setup in the background so your day-to-day work never skips a beat."'
      },
      {
        objection: '"We don\'t have budget for a big IT project."',
        counter: '"Odoo typically replaces 3 to 4 separate software subscriptions you\'re already paying for. Most clients see the system pay for itself in the first 60 days from admin labor savings alone."'
      }
    );
  }

  // Diagnostic 3-Step Action Plan (For Authoritative Advisory Pitching)
  const advisory3StepPlan = [
    {
      step: '1. Technical Diagnostic Audit',
      action: 'Run a 360° deep scan on database health, API latency, and customer intake forms to locate where leads and invoices drop.'
    },
    {
      step: '2. Automated Workflow Bridge',
      action: 'Deploy n8n webhook automation to bridge CRM, job dispatch, and accounting with zero manual double-entry.'
    },
    {
      step: '3. Phased Zero-Downtime Deployment',
      action: 'Migrate active customer records and history to unified Odoo v18 with full staff onboarding and guaranteed zero business disruption.'
    }
  ];

  return {
    problem_analysis: problemPoints,
    target_offer: targetOffer,
    elevator_opener: opener,
    objection_handlers: objections,
    review_dossier: lead.review_dossier || null,
    case_study_fit: lead.case_study_fit || null,
    // New Consultative Advisory Fields
    vulnerability_score: Math.min(98, Math.max(30, vulnerabilityScore)),
    vulnerability_flags: vulnerabilityFlags,
    estimated_financial_leak: financialLeakAnnual,
    advisory_3step_plan: advisory3StepPlan
  };
}

module.exports = { generateBattlecard };
