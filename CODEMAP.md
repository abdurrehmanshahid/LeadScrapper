# CODEMAP — Big Binary Lead Engine

Compact index so an agent can navigate without reading whole files. Read this first;
open a file only when you need to edit it or see exact lines. Keep it updated when
structure changes (new route, new module, moved responsibility).

## Entry & boot
- `run.bat` — Windows launcher: PATH setup, `git pull` (discards local data mirrors first),
  `npm install`, starts ngrok on the reserved domain, then `node src/server/app.js`.
- `src/server/app.js` — Express app + all API routes. Loads `dotenv` at top, then
  `installAuth(app, db)`, page gate → `login.html`, static, `/api` auth gate, enrichment
  role gate. `start()` at bottom: `app.listen` → `db.connect()` → `seedSuperAdmin()` →
  auto-sync from `enriched_odoo_leads.json`.

## Auth (see memory project_auth)
- `src/server/auth.js` — exports `installAuth, seedSuperAdmin, requireAuth, requireRole, ENRICHERS`.
  Roles: `super_admin` / `junior_enricher` / `sdr_user`. Teams: `b2c` / `b2b`.
  Routes: `POST /api/auth/login|logout`, `GET /api/auth/me`, `GET/POST/PATCH/DELETE /api/users` (admin).
- `src/public/login.html`, `src/public/admin.html` (user CRUD), `src/public/js/authClient.js`
  (session check, user chip, hides enrichment controls for sdr_user).

## Data layer
- `src/db/database.js` — singleton `db`; Mongo (Mongoose flexible schema) with `data/*.json`
  fallback. **Source of truth = MongoDB Atlas; JSON files are local mirrors (gitignored).**
  Leads: `getAllLeads, getLeadById, upsertLead, updateLeadFields, updateLeadStatus, appendNote, deleteLead`.
  Users: `getUserByEmail, getUserById, getAllUsers, createUser, updateUser, deleteUser, countUsers`.
  ⚠ Write records with `findOneAndUpdate({id},{$set},{upsert})`, never `create({id})` (Mongoose id/_id virtual).
- Seed: `enriched_odoo_leads.json` (repo root, tracked) → `src/storage/importEnrichedLeads.js`.

## Enrichment & analysis
- `src/enricher/companyResearcher.js` — `warmEnrichLead`, `groundedBriefing(lead, reviews)`
  (Gemini analysis of 1–2★ reviews), `buildProblemMatrix(reviews, analysis)` (deterministic
  Problem × Odoo frequency matrix — no LLM).
- `src/scraper/googleMapsReviews.js` — `scrapeLowestReviews(name, location, {max, address})`.
- `src/scraper/gmapsScraper.js` — `scrapeGoogleMaps` (lead discovery). `browserHelper.js` → `launchBrowser`.
- `src/auditor/clayIntegration.js` — `pushLeadToClay`, `processClayEnrichmentPayload` (maps
  Clay/PDL/RocketReach field variants → lead patch). Inbound at `POST /api/leads/sync` (x-api-key).
- `src/utils/cleanWebsite.js` — `cleanWebsite`, `stripTrackingParams` (unwrap /aclk,/url; drop google/maps).
- `scripts/claude-enrich.js` — CLI: `dump` / `apply` for manual Claude-Code enrichment.

## Key API routes (src/server/app.js)
- Leads: `GET /api/leads`, `GET /api/leads/:id`, `PATCH /api/leads/:id`,
  `POST /api/leads/:id/status|note|analysis` (analysis = human-editable, recomputes matrix).
- Enrichment (role-gated): `/:id/live-audit|warm-enrich|clay-push|grounded-analysis|ai-enrich`,
  `/clay-batch-push`, `/pre-enrich-next`, `/api/scrape/*`.
- Clay callback (x-api-key, not session): `POST /api/leads/sync`, `POST /api/webhooks/clay`.

## Frontend (src/public)
- `index.html` + `js/app.js` — dashboard (table, ranked cards, lead detail modal, Clay buttons).
- `caller.html` + `js/caller.js` — SDR workspace: contact strip (multi-phone, decision makers,
  Add Person modal), 4-col battlecard, editable grounded-analysis panel, objection tallies.
- `css/styles.css` — corporate dark theme (accent #3b82f6; no emoji; tokens --radius/-shadow).

## Conventions
- Lead ids `lead_<ts>_<rand>`; user ids `user_<ts>_<rand>`.
- Clay/Apollo enrichment must never be overwritten by Gemini (Gemini writes only `grounded_analysis`).
  Merge decision_makers by name; Clay-verified email/LinkedIn beats app guesses (`source:public_index`).
- Provenance goal (TODO): per-field `{value, source, url, fetched_at}` with source badges.
