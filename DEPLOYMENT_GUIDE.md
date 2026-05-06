# Blostem Battlecard — Deployment & Quick Start Guide

> Competitive intelligence AI agent that generates 1-page battlecards in <60 seconds with Claim Trace rebuttals, PDF export, and AE-ready formatting.

---

## 📋 Table of Contents
1. [Quick Start (Local Dev)](#quick-start)
2. [Features Shipped](#features)
3. [Architecture & Stack](#architecture)
4. [Environment Setup](#environment)
5. [Deployment to Production](#deployment)
6. [Demo Flow (3-Minute Pitch)](#demo-flow)
7. [API Reference](#api-reference)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start (Local Dev)

### Prerequisites
- **Node.js** 16+ (LTS recommended)
- **npm** 8+
- **Optional:** Groq API key for live LLM (mock fallback available)

### Installation & Run

```bash
# Clone/navigate to project
cd c:\Users\aryan\OneDrive\Desktop\Blostem_AI

# Install dependencies
npm install --legacy-peer-deps

# (Optional) Install additional scraping dependencies
npm install cheerio  # for HTML parsing (optional; graceful degradation if absent)

# Start dev server
npm run dev

# Open browser
# → http://localhost:3000
```

**Expected Output:**
```
▲ Next.js 16.2.4 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://192.168.1.5:3000
✓ Ready in 832ms
```

---

## 🚀 Features Shipped

### ✅ Core Battlecard Generation
- **Live LLM Reasoning:** Groq-hosted Llama synthesis (mock fallback for demo mode)
- **Retrieval Orchestration:** Provider-driven search adapters with fallback retrieval
- **Evidence Linking:** Claims, attack angles, and claim traces tied back to source IDs
- **Claim Trace:** Unique AE rebuttals + market opportunities per claim (market-aware)
- **Structured Pipeline Output:** `pipeline` + `battlecard` + `markdown`

### ✅ Frontend & UX
- **Structured Card Renderer:** Human-readable HTML rendering (not raw Markdown)
- **AE Quick View:** Condensed view for live calls (top claims + 2 talk tracks)
- **Claim Confidence Filter:** Interactive slider to filter claims (0-100%)
- **Favorites System:** localStorage persistence (up to 10 battlecards)
- **Export Options:** 
  - ✅ Download as Markdown (.md)
  - ✅ Export PDF (Puppeteer-powered)
  - [ ] Share link (future)
  - [ ] Salesforce sync (future)

### ✅ Performance & Quality
- **<1s Generation:** Mock mode; ~2-5s with real LLM + scraping
- **Source Attribution:** All claims cited with credibility scores
- **Competitive Database:** Razorpay, Paytm, PhonePe (extensible)
- **Market-Aware Rebuttals:** 50+ templated rebuttals matched by keyword
- **Dynamic Opportunities:** Competitor-specific expansion angles

---

## 🏗️ Architecture & Stack

### Tech Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 (hooks) | UI, state management, export UX |
| **Framework** | Next.js 16 (pages router) | API routes, SSR, fast dev |
| **LLM** | OpenRouter primary (`qwen/qwen3-next-80b-a3b-instruct`, `openai/gpt-oss-120b`), Groq secondary | Extraction and battlecard synthesis |
| **Retrieval** | RAG (semantic search) + Web Scraper | Competitive source fetching |
| **Export** | Puppeteer | PDF generation |
| **Parsing** | Cheerio | HTML scraping (optional) |
| **Marked** | Marked v5 | Markdown → HTML rendering |

### File Structure
```
Blostem_AI/
├── pages/
│   ├── index.js               # Main UI (structured card, favorites, AE view)
│   ├── api/
│   │   ├── query.js           # Battlecard generation orchestrator
│   │   └── export.js          # PDF/Markdown export endpoint
├── lib/
│   ├── llm.js                 # Groq wrapper + mock fallback
│   ├── retrieval.js           # Provider-driven retrieval + normalization
│   ├── extractSignals.js      # Signal extraction stage
│   ├── buildCompetitorModel.js# Competitor model stage
│   ├── generateBattlecardCore.js # Core battlecard stage
│   ├── generateSalesLayer.js  # Objections, scripts, strategy
│   ├── confidenceEngine.js    # Deterministic confidence + evidence panel
│   ├── validateBattlecard.js  # Soft validation warnings
│   ├── rag.js                 # Vector store + semantic search fallback
│   ├── generateBattlecard.js  # Main orchestration logic
│   ├── citations.js           # Claim Trace (rebuttals, opportunities)
│   └── demoPersonas.js        # Persona presets
├── package.json
├── next.config.js
├── .env.example
├── README.md
├── DEMO_NARRATIVE.md
└── DEPLOYMENT_GUIDE.md (this file)
```

### Data Flow
```
User Input (competitor name)
    ↓
[API] /api/query
    ↓
Retrieval (Provider adapters → normalization → ranking → fallback)
    ↓
Signal Extraction
    ↓
Competitor Model
    ↓
Battlecard Core + Sales Layer
    ↓
Confidence + Validation
    ↓
Markdown + pipeline + battlecard returned
    ↓
Frontend renders structured HTML card + provenance panel
    ↓
User can export PDF / Markdown / Save favorite
```

---

## 🔧 Environment Setup

### 1. LLM API Keys

Create `.env.local`:
```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxx
OPENROUTER_EXTRACTION_MODEL=qwen/qwen3-next-80b-a3b-instruct
OPENROUTER_SYNTHESIS_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=gsk-xxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=openai/gpt-oss-120b
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx
SERPER_API_KEY=your-serper-key
RETRIEVAL_PROVIDER=auto
```

If not set, mock responses are used (demo-ready but predefined).

### 2. Verify Dependencies

```bash
npm list next axios marked puppeteer
# Should show versions ≥ 16, 1.4, 5, 22 respectively
```

### 3. Build for Production

```bash
npm run build
npm run start  # starts on http://localhost:3000
```

---

## 📦 Deployment to Production

### Option 1: Vercel (Recommended for Next.js)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
# Follow prompts (connect GitHub, select framework: Next.js, etc.)
```

**Notes:**
- Puppeteer (PDF export) requires serverless-compatible setup; use `vercel.json`:
  ```json
  {
    "functions": {
      "pages/api/export.js": {
        "memory": 3008,
        "maxDuration": 30
      }
    }
  }
  ```
- NewsAPI requires API key in environment (set in Vercel dashboard).

### Option 2: Docker (Self-Hosted)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

```bash
docker build -t blostem-battlecard .
docker run -p 3000:3000 -e GROQ_API_KEY=gsk-xxx blostem-battlecard
```

### Option 3: AWS Lambda + API Gateway

Use Serverless Framework or AWS Copilot:
```bash
npx serverless-next.js deploy
```

---

## 🎬 Demo Flow (3-Minute Pitch)

### Scenario: Live Sales Demo

1. **Intro (0:00–0:30)**
   - "Blostem generates competitive battlecards in <60 seconds using AI + real sources."
   - "Perfect for AE pitch prep or RevOps competitive tracking."

2. **Quick Demo (0:30–1:30)**
   - Open http://localhost:3000
   - Click **"Razorpay"** quick button
   - Highlight: "Structured battlecard with evidence-linked claims, attack angles, and objections."
   - Show **Pipeline Provenance**: source count, signal count, validation, provider, and competitor model.

3. **Advanced Features (1:30–2:30)**
   - Show **Claim Trace**: 
     - Claim: "99.9% uptime SLA"
     - AE Rebuttal: "Acknowledge strength; differentiate on unique value prop"
     - Opportunity: "Market expansion into tier 2-3 cities"
   - Call out deterministic confidence from recency + source overlap
   - Save to **Favorites** (localStorage).

4. **Export (2:30–3:00)**
   - Click **"Export (MD/PDF)"** → generates PDF in browser
   - Mention: "Download, attach to Salesforce, share with team."
   - Show **"Download .md"** option for quick Slack share.

---

## 📡 API Reference

### POST /api/query

**Request:**
```json
{
  "competitor": "Razorpay"
}
```

**Response:**
```json
{
  "competitor": "Razorpay",
  "pipeline": {
    "sources": [],
    "signals": {},
    "competitor_model": {},
    "validation": {
      "status": "ok",
      "warnings": []
    },
    "metrics": {
      "source_count": 8,
      "signal_count": 12,
      "elapsed_ms": 1245
    }
  },
  "battlecard": {
    "summary": "...",
    "threat_level": "HIGH",
    "competitive_signals": [],
    "attack_angles": [],
    "objection_handles": [],
    "live_call_scripts": [],
    "how_to_win": {},
    "deal_risk": {},
    "evidence_panel": {}
  },
  "markdown": "# Razorpay - Trustable Competitive Battlecard\n..."
}
```

### POST /api/export

**Request:**
```json
{
  "markdown": "# Battlecard\n...",
  "competitor": "Razorpay",
  "format": "pdf"
}
```

**Response:** Binary PDF file (Content-Type: application/pdf)

---

## 🔍 Troubleshooting

### Issue: `Module not found: Can't resolve 'cheerio'`

**Solution:** Cheerio is optional. Install it:
```bash
npm install cheerio
```

Or app will gracefully fall back to NewsAPI + RAG (no local HTML parsing).

### Issue: `GROQ_API_KEY not found`

**Solution:** 
1. Create `.env.local` with `GROQ_API_KEY=gsk-xxx`
2. App defaults to mock responses (fully demo-ready)

### Issue: retrieval keeps falling back to mock

**Solution:**
1. Add `TAVILY_API_KEY` or `SERPER_API_KEY`
2. Set `RETRIEVAL_PROVIDER=auto`
3. Restart the app
4. Check the `Pipeline:` log line in server output for `fallback_used`

### Issue: PDF export times out / fails

**Solution:**
1. Verify Puppeteer installed: `npm list puppeteer`
2. Check disk space (Puppeteer downloads Chromium)
3. If serverless, increase memory/timeout in `vercel.json` (see Deployment)

### Issue: High memory usage on startup

**Solution:** Puppeteer lazy-loads Chromium. On first PDF export, expect ~200MB temp usage.

### Port 3000 Already in Use

```bash
# Find and kill process on port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Or use different port
npm run dev -- -p 3001  # Note: update package.json if permanent
```

---

## 📚 Extended Reading

- [Architecture Overview](./PROJECT_SUMMARY.md)
- [Demo Narrative](./DEMO_NARRATIVE.md)
- [Claim Trace Logic](./lib/citations.js)
- [RAG System](./lib/rag.js)
- [Web Scraper](./lib/scraper.js)

---

## 📝 Next Steps (Future Roadmap)

- [ ] Vector store with FAISS/Pinecone for persistent knowledge base
- [ ] Real-time webscraping + caching (every 12h)
- [ ] Salesforce/HubSpot CRM integration
- [ ] Slack bot for battlecard delivery
- [ ] Multi-language support (Spanish, Mandarin)
- [ ] Custom competitor database upload
- [ ] Claim feedback loop (AE upvote/flag) for model improvement
- [ ] Shared links with edit access for team collaboration

---

**Questions or feedback?** Open an issue or email the team.

**Status:** ✅ MVP Ready | 🚀 Production-Grade | 📈 Extensible

*Last updated: May 2026*
