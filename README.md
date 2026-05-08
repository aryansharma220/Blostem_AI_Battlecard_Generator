# Blostem — Competitive Intelligence Battlecard Generator

**Evidence-governed competitive intelligence for fintech sales teams in <60 seconds.**

> **MVP Status:** Working hackathon prototype with live retrieval/LLM paths, curated demo fallback, and claim-level evidence review.

## Problem
AEs lose deals when they lack timely, source-backed competitive intel. Researching one competitor takes hours, and enterprise buyers care less about generic battlecards than proof: pricing behavior, settlement risk, compliance posture, integration maturity, and what can be safely said in a deal.

## Solution
Blostem Battlecard is a trust-oriented sales-intelligence pipeline: retrieval-heavy, evidence-linked, and LLM-refined. It turns competitor research into an AE live brief with pipeline provenance, confidence scoring, blocked claims, contradiction flags, and buyer verification cues.

## Unique Differentiator: Claims & Evidence Review
Every competitive claim is classified into:
- **Use externally**: linked evidence supports the exact claim
- **Ask, do not assert**: useful clue, but only safe as a buyer question
- **Do not use externally**: blocked because evidence is weak, stale, contradictory, or unsupported

The goal is not to script AEs. It is to stop bad claims and surface the few operational clues worth using in enterprise conversations.

---

## 🚀 Quick Links

| Resource | Purpose |
|----------|---------|
| [**QUICK_START.md**](./QUICK_START.md) | ⚡ Get running in 2 minutes |
| [**FEATURES_SUMMARY.md**](./FEATURES_SUMMARY.md) | 📋 All features & accomplishments |
| [**DEPLOYMENT_GUIDE.md**](./DEPLOYMENT_GUIDE.md) | 📦 Production deployment (Vercel, Docker, AWS) |
| [**DEMO_NARRATIVE.md**](./DEMO_NARRATIVE.md) | 3-minute demo narrative |
| [**PROJECT_SUMMARY.md**](./PROJECT_SUMMARY.md) | 🏗️ Architecture & internals |

---

## Quick Start

### Prerequisites
- Node.js 14+ and npm
- OpenRouter API key for primary live AI synthesis, with Groq available as a secondary provider

### Setup

```bash
# 1. Clone/navigate to the project
cd /path/to/Blostem_AI

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Set up environment (optional)
cp .env.example .env.local
# Edit .env.local and add OPENROUTER_API_KEY
# Optional: add GROQ_API_KEY and set LLM_PROVIDER=groq when you want to switch
# Add TAVILY_API_KEY or SERPER_API_KEY for live web retrieval

# 4. Run dev server
npm run dev
```

Open http://localhost:3000 in your browser.

### Demo Run (First Time)
1. **Input**: Click "Razorpay" quick button (or type competitor name)
2. **AI Step (Live)**: See battlecard generated with:
   - Multi-source retrieval and source normalization
   - Signal extraction and competitor modeling
   - Confidence scoring, validation warnings, and evidence linking
3. **Output**: 
   - Full battlecard with trust metadata and evidence-backed claims
   - **Pipeline Provenance** panel with source counts, signal counts, validation, and model snapshot
4. **Export**: Download as Markdown or copy to clipboard

---

## Architecture

### Frontend (`pages/index.js`)
- Single-page input form
- Battlecard renderer with evidence and provenance panels
- Export to Markdown / PDF

### Backend API Routes
- `/api/query` — Main orchestrator
  - Input: competitor name
  - Output: `pipeline` + `battlecard` + `markdown`
  - Time: <60s for demo
- `/api/export` — Markdown export (extensible to PDF)

### Core Modules
- `lib/generateBattlecard.js` — Main orchestration across retrieval, synthesis, validation, and exports
- `lib/llm.js` — Groq/Gemini LLM wrapper with evidence-discipline prompting
- `lib/retrieval.js` — Provider-driven retrieval orchestration + source normalization
- `lib/extractSignals.js` — Evidence-backed signal extraction
- `lib/buildCompetitorModel.js` — Structured competitor model builder
- `lib/generateBattlecardCore.js` — Core battlecard synthesis
- `lib/generateSalesLayer.js` — Buyer verification cues, procurement risk, and strategy
- `lib/confidenceEngine.js` — Deterministic confidence + evidence panel
- `lib/validateBattlecard.js` — Soft validation warnings
- `lib/citations.js` — Citation formatting + claims/evidence review

### Data Flow
```
Competitor Name 
  ↓
[Retrieval] → provider adapters + normalization + ranking
  ↓
[Signal Extraction] → structured pricing / product / positioning signals
  ↓
[Competitor Model] → target segment, pricing model, strengths, weaknesses
  ↓
[Battlecard Core + Sales Layer] → claims, verification angles, procurement concerns
  ↓
[Confidence + Validation] → claim evidence links, confidence levels, warnings
  ↓
[Render] → AE live brief + Pipeline Provenance + Claims & Evidence Review
```

---

## Demo Script (3 Minutes)

**Problem (30 sec):**
"AEs in India's fintech space lose deals because they lack real-time competitive intel. Researching Razorpay or Paytm takes hours."

**Demo (90 sec):**
1. Enter "Razorpay" → Generate battlecard in 30 seconds
2. Show AE live brief: use externally, ask-only, and blocked claims
3. Show Claims & Evidence Review with source quality and contradictions
4. Highlight procurement questions and evidence caveats
5. Export to Markdown

**Extension (30 sec):**
"Next: Integrate with Salesforce/HubSpot, add real-time Slack alerts for competitor moves, and scale to 10K+ users."

---

## Sample Competitors (Built-in Demo Data)

The app ships with mock data for three competitors:
- **Razorpay**: Payment gateway positioning, funding round, customer feedback
- **Paytm**: Super app, fintech diversification, GMV growth
- **PhonePe**: UPI leadership, BNPL expansion, Series G funding

Try any of these names in the input field.

---

## Deployment

### Vercel (Recommended)
```bash
# 1. Push code to GitHub
git init && git add . && git commit -m "initial"
git remote add origin https://github.com/<your-org>/blostem-battlecard
git push -u origin main

# 2. Deploy to Vercel
npm install -g vercel
vercel
# Follow prompts; set LLM + retrieval env vars in Vercel Secrets
```

### Render / Heroku
```bash
# Render
vercel build && vercel start

# Or manually on Render:
# 1. Link GitHub repo
# 2. Set Node.js environment
# 3. Add env vars (OPENROUTER_API_KEY, optional GROQ_API_KEY, plus retrieval keys)
# 4. Deploy
```

---

## Extending the Demo

### 1. Add Real Web Scraping
Replace mock data in `lib/retrieval.js` with `node-fetch` + `cheerio`:
```javascript
const fetch = require('node-fetch');
const cheerio = require('cheerio');

export async function fetchSources(competitor) {
  const url = `https://www.google.com/search?q=${competitor}+fintech`;
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);
  // Parse results...
}
```

### 2. Add PDF Export
Install `puppeteer` and create a server-side render:
```javascript
// pages/api/export-pdf.js
import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  const { markdown } = req.body;
  const html = markdownToHtml(markdown); // Use a library like `marked`
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf();
  res.setHeader('Content-Type', 'application/pdf');
  res.send(pdf);
}
```

### 3. Add Vector Store (RAG)
```bash
npm install faiss-node
```
Use FAISS to embed sources and retrieve context-aware snippets for LLM.

---

## Key Files

| File | Purpose |
|------|---------|
| `pages/index.js` | Main UI (input + results + tabs) |
| `pages/api/query.js` | API orchestrator |
| `lib/generateBattlecard.js` | Battlecard + AE live brief synthesis |
| `lib/llm.js` | LLM API wrapper |
| `lib/retrieval.js` | Source fetching + scoring |
| `lib/citations.js` | Citation formatting + claims/evidence review |
| `package.json` | Dependencies |
| `.env.example` | Environment template |

---

## Evaluation Criteria (Hackathon)

### Relevance to Brief (25%)
✓ Directly addresses AE battlecard need for fintech
✓ Targets India-specific pain point (competitive velocity)

### Technical Execution (25%)
✓ End-to-end flow: input → AI step → structured output
✓ Live LLM calls (not mocked)
✓ Simple, deployable code
✓ API routes + frontend integrated

### Innovation & Thinking (20%)
✓ **Claims & Evidence Review**: Use externally / ask-only / blocked claim workflow
✓ Confidence scoring (data credibility signal)
✓ Multi-view UI (AE live brief + source trace + trust review)

### Demo & Narrative (20%)
✓ Clean 30/90/30 demo narrative
✓ Live demo runs in <60s
✓ Output is immediately usable (Markdown export)

### Potential & Scale (10%)
✓ TAM: 1000+ B2B SaaS + 10K+ AEs in India
✓ Path to revenue: RevOps + Salesforce integration
✓ Non-dilutive: Can be white-labeled for platforms

---

## Notes

- **LLM required for judging**: Set `OPENROUTER_API_KEY` so extraction and synthesis run live. Set `LLM_PROVIDER=groq` with `GROQ_API_KEY` only when you want to switch providers.
- **Live retrieval**: Add `TAVILY_API_KEY` or `SERPER_API_KEY`, and optionally `RETRIEVAL_PROVIDER=auto|tavily|serper`
- **Response contract**: `/api/query` now returns `competitor`, `pipeline`, `battlecard`, and `markdown`
- **Demo data**: Razorpay, Paytm, PhonePe have curated fallback sources and India-specific logic

---

## Questions?
Reach out with feature requests or feedback. Built for fintech AEs. Powered by AI.

