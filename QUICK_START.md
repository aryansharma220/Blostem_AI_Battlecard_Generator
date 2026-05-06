# 🚀 Blostem Battlecard — Quick Start (2 Minutes)

> AI competitive intelligence agent. Battlecard in <60s. Ship it now.

---

## ⚡ TL;DR Setup

### Step 1: Install
```bash
cd c:\Users\aryan\OneDrive\Desktop\Blostem_AI
npm install --legacy-peer-deps
```

### Step 2: Run
```bash
npm run dev
```

### Step 3: Open
```
http://localhost:3000
```

**Done!** Click "Razorpay", "Paytm", or "PhonePe" to generate battlecard.

---

## 🎬 Demo (30 Seconds)

1. **Load App:** http://localhost:3000
2. **Click:** "Razorpay" button
3. **See:** Battlecard with positioning, pricing, claims, talk tracks
4. **Explore:** 
   - Switch to **Claim Trace** tab → see AE rebuttals + opportunities
   - Switch to **Sources** tab → see all cited sources + credibility scores
5. **Export:** Click **"Export (MD/PDF)"** to download PDF
6. **Save:** Click **"Save to Favorites"** to persist locally

---

## 📦 What's Included

✅ **AI Synthesis** — OpenAI-powered battlecard generation (with mock fallback)  
✅ **RAG Retrieval** — Semantic search on competitor sources  
✅ **Web Scraping** — Multi-source intelligent scraper (Crunchbase, TechCrunch, LinkedIn)  
✅ **Claim Trace** — Market-aware AE rebuttals + opportunities (unique differentiator)  
✅ **PDF Export** — Puppeteer-powered professional PDFs  
✅ **Favorites** — localStorage persistence  
✅ **AE Quick View** — Condensed live-call mode  
✅ **Confidence Filter** — Interactive claim filtering  

---

## 🔧 Optional: Use Real OpenAI API

Create `.env.local` in project root:
```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
```

Restart `npm run dev`. App will now use live LLM synthesis for extraction and battlecard generation.

---

## 📋 Included Competitors (Expandable)

- Razorpay
- Paytm
- PhonePe

(Add custom competitors by typing name in input box)

---

## 🎯 Use Cases

| Use Case | Time | Action |
|----------|------|--------|
| **Pre-call prep** | 1 min | Click quick button → toggle AE View → export PDF |
| **Competitive research** | 3 min | Type competitor → view battlecard + sources → save favorite |
| **Objection handling** | 2 min | Load favorite → view Claim Trace rebuttals + opportunities |
| **Team sharing** | 1 min | Export PDF → email to team |

---

## 🐛 Troubleshooting

### Port 3000 in use?
```bash
# Windows: Find & kill process
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use different port
npm run dev -- -p 3001  # Note: not all flags work with Next.js script
```

### Missing `cheerio` warning?
```bash
npm install cheerio
```
(Optional; app works without it — graceful fallback)

### Need OpenAI key?
- [Get free API key](https://platform.openai.com/account/api-keys)
- Add to `.env.local` (see Optional section above)
- Mock fallback always available for demo

---

## 📚 Full Documentation

- [Features & Accomplishments](./FEATURES_SUMMARY.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Architecture & Project Summary](./PROJECT_SUMMARY.md)
- [Demo Narrative (3-min pitch)](./DEMO_NARRATIVE.md)

---

## 🎉 Next Steps

1. ✅ Run `npm install`
2. ✅ Run `npm run dev`
3. ✅ Open http://localhost:3000
4. ✅ Click a quick button
5. 🚀 **Ship it!** (See deployment in DEPLOYMENT_GUIDE.md)

---

**Questions?** Check FEATURES_SUMMARY.md or open GitHub issue.

*Built May 2026 • MVP Ready • Production-Grade*
