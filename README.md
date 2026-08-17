# ⚡ Big Binary Tech — Lead Intelligence & SDR Engine

> **Zero-API-Cost Lead Discovery, Web Technographic Auditor, Hugging Face ML Propensity Scorer & High-Velocity SDR Dialer.**

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![Express](https://img.shields.io/badge/Express-4.19-blue.svg)
![Puppeteer](https://img.shields.io/badge/Puppeteer%20Stealth-Browser-orange.svg)
![MongoDB](https://img.shields.io/badge/MongoDB%20Atlas-Cloud%20Sync-brightgreen.svg)
![Transformers](https://img.shields.io/badge/Hugging%20Face-Xenova%20Transformers-yellow.svg)

---

## 🌟 Overview

Big Binary Tech's **Lead Intelligence Engine** is a full-stack, autonomous sales prospecting and cold-calling system built specifically for B2B tech services, Odoo ERP implementations, and high-ticket BPO rescues.

It combines **stealth web scraping**, **on-device NLP models**, **Google Maps (GMB) knowledge extraction**, and an **interactive SDR calling workspace** to identify high-probability prospects and arm sales reps with actionable battlecards.

---

## 🚀 Key Features

### 1. 🗺️ Pipeline A: Google Maps (GMB) Technographic Discovery
- Extracts verified physical street addresses, direct phone numbers, live review counts, star ratings, and corporate URLs.
- Crawls and audits prospective business websites in real-time to identify legacy tech debt, missing ERPs, and SSL/speed bottlenecks.

### 2. 🛡️ Pipeline B: Odoo Customer Rescue & BPO Mining
- Mines active Odoo enterprise directories across North America, UK, Europe, GCC, and Australia.
- Runs **Dual Reverse-Search (GMB + Bing)** to unmask direct phone numbers, physical locations, and official domains.
- **Intelligent Entity Parser:** Automatically separates compound titles (`Company Name, Executive Name`) while preserving legal entity suffixes (`LLC`, `Inc`, `Ltd`, `S.A.`).

### 3. 🧠 PRISM ML Propensity Scoring & Review Intelligence
- Computes multi-signal win probability (0–100%) using operational friction, company age, employee size, and review volume.
- **Zero-Shot NLI & Hugging Face Transformers:** Analyzes negative review themes (e.g., dispatch delays, invoicing errors, inventory friction) to synthesize targeted 2-sentence SDR pain-point dossiers.

### 4. 📞 High-Velocity SDR Caller Portal (`caller.html`)
- Keyboard-driven dialer workflow (`Space` = Log, `→` = Next Lead, `←` = Previous Lead).
- Live 30-second cold-call elevator openers, Big Binary advantage hooks, and objection counter-responses.
- **1-Click LinkedIn Search:** Direct search links for verified CEOs, owners, and managing directors.

### 5. ✏️ Full Company & Pitch Editor
- Interactive 4-tab modal on both Dashboard and Caller Portal allowing real-time editing of Company Profiles, Decision Makers, Social Media Links, and Custom Pitches.

---

## 📂 Project Structure

```
LeadScrapper/
├── data/
│   ├── leads_db.json              # Local persistent seed database (390+ pre-mined leads)
│   └── call_logs.json             # SDR call history & disposition logs
├── src/
│   ├── auditor/
│   │   ├── deepResearcher.js      # Parallel research engine (Yelp, News, Jobs, BBB)
│   │   ├── decisionMakerFinder.js # Executive discovery via public index & LinkedIn
│   │   ├── reverseSearcher.js     # GMB & Bing dual reverse-search engine
│   │   └── webHealthAuditor.js    # Tech stack detection & CMS scanner
│   ├── db/
│   │   └── database.js            # MongoDB Atlas cloud sync + JSON fallback
│   ├── ml/
│   │   ├── caseStudyEmbedder.js   # Cosine similarity semantic matching
│   │   ├── propensityScorer.js    # PRISM ML win probability engine
│   │   ├── reviewIntelligence.js  # Zero-shot NLI friction classifier
│   │   └── semanticSearch.js      # Xenova MiniLM semantic query engine
│   ├── pitch/
│   │   └── battlecardGenerator.js # Custom sales scripts & objection handlers
│   ├── public/
│   │   ├── index.html             # Main Lead Management Dashboard
│   │   ├── caller.html            # SDR Cold Calling Portal
│   │   ├── css/
│   │   │   ├── styles.css         # Dashboard dark-mode glassmorphic theme
│   │   │   └── caller.css         # Minimalist SDR dialing interface
│   │   └── js/
│   │       ├── app.js             # Dashboard controller & filters
│   │       └── caller.js          # Dialer state machine & outcome logger
│   ├── scraper/
│   │   ├── browserHelper.js       # Stealth Puppeteer cluster management
│   │   ├── gmapsScraper.js        # Google Maps real-time business scraper
│   │   └── odooCustomerScraper.js # Odoo directory miner & enricher
│   ├── server/
│   │   └── app.js                 # Express REST API backend
│   └── utils/
│       ├── entityParser.js        # Multi-part name & legal suffix classifier
│       └── industryClassifier.js  # 11-sector domain taxonomy classifier
├── run.bat                        # 1-Click Windows Launch Script
├── package.json
└── .env.example
```

---

## ⚡ Quick Start

### Option 1: 1-Click Windows Launch (Recommended)
Simply double-click **`run.bat`**. It will automatically:
1. Detect Node.js.
2. Install dependencies (if first time).
3. Start the server on port `3000`.
4. Open the Dashboard in your default browser at `http://localhost:3000`.

---

### Option 2: Manual Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd LeadScrapper
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment (Optional for Cloud Sync):**
   ```bash
   cp .env.example .env
   ```
   *Add your MongoDB Atlas URI if you wish to sync live leads across multiple PCs.*

4. **Start the application:**
   ```bash
   npm start
   ```

5. **Open in Browser:**
   - **Main Dashboard:** [http://localhost:3000](http://localhost:3000)
   - **SDR Caller Portal:** [http://localhost:3000/caller.html](http://localhost:3000/caller.html)

---

## ☁️ MongoDB Atlas Cloud Sync Setup

To share live leads, notes, and call dispositions across multiple computers:
1. Register a free cluster on [MongoDB Atlas](https://cloud.mongodb.com).
2. Under **Network Access**, add `0.0.0.0/0` (Allow Access from Anywhere).
3. Copy your connection string into `.env`:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/bigbinary_leads?retryWrites=true&w=majority
   ```

---

## 📄 License
Proprietary — Built for **Big Binary Tech**.
