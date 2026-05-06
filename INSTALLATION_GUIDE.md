# Installation & Deployment Guide

## Local Development Setup

### Prerequisites
- **Node.js**: 14.x or higher (download from https://nodejs.org/)
- **npm**: Bundled with Node.js
- **Groq API Key** (optional for demo, but recommended for full experience)

### Step 1: Clone / Download Project

```bash
cd /path/to/Blostem_AI
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- `next` — React framework
- `react`, `react-dom` — UI library
- `openai` — OpenAI-compatible client used against Groq
- Other utilities (axios, marked, etc.)

### Step 3: Environment Setup (Optional)

```bash
# Copy the example environment file
cp .env.example .env.local
```

Then edit `.env.local`:

```
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-your-key-here
OPENROUTER_EXTRACTION_MODEL=qwen/qwen3-next-80b-a3b-instruct
OPENROUTER_SYNTHESIS_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=gsk-your-key-here
GROQ_MODEL=openai/gpt-oss-120b
TAVILY_API_KEY=tvly-your-key-here
SERPER_API_KEY=your-serper-key-here
RETRIEVAL_PROVIDER=auto
DEMO_MODE=true
```

**Without an API key:** The app will use fallback synthesis and built-in source data for Razorpay, Paytm, and PhonePe. This is perfect for a demo.

**With retrieval keys:** the pipeline can pull live search results through Tavily or Serper, normalize and rank them, then feed those sources into the staged synthesis flow.

### Step 4: Run Development Server

```bash
npm run dev
```

You'll see:
```
> blostem-battlecard@0.1.0 dev
> next dev -p 3000

ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

### Step 5: Open in Browser

Open http://localhost:3000

You should see the Blostem Battlecard UI. Try entering:
- `Razorpay`
- `Paytm`
- `PhonePe`

---

## Demo Run Checklist

1. ✅ Type "Razorpay" in the competitor field
2. ✅ Click "Generate" — should complete in <60 seconds
3. ✅ View the full battlecard (positioning, pricing, launches, etc.)
4. ✅ Inspect the "Pipeline Provenance" panel for sources, signals, validation, and competitor model
5. ✅ Review Claim Trace evidence for linked claims and snippets
6. ✅ Download as Markdown or copy to clipboard
7. ✅ Try another competitor (Paytm or PhonePe)

---

## Deployment Options

### Option 1: Vercel (Easiest + Recommended)

Vercel is the creator of Next.js and offers seamless deployment.

**Steps:**

1. **Create a Vercel account** (free tier available):
   - Go to https://vercel.com
   - Sign up with GitHub

2. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

3. **Push code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Blostem Battlecard"
   git remote add origin https://github.com/<your-username>/blostem-battlecard
   git branch -M main
   git push -u origin main
   ```

4. **Deploy to Vercel**:
   ```bash
   vercel
   ```
   
   You'll be prompted:
   - "Set up and deploy? Y/n" → `y`
   - "Which scope? <your-username>"
   - "Link to existing project? N"
   - "What's your project's name?" → `blostem-battlecard`
   - "In which directory is your code? ./` → press Enter

5. **Set environment variables** (in Vercel UI):
   - Go to https://vercel.com/dashboard
   - Select your project
   - Navigate to **Settings** → **Environment Variables**
   - Add `GROQ_API_KEY=gsk-your-key`
   - Redeploy

6. **Your deployment is live!** You'll get a URL like:
   ```
   https://blostem-battlecard.vercel.app
   ```

### Option 2: Render (Alternative)

**Steps:**

1. **Create Render account**: https://render.com

2. **Create a new Web Service**:
   - Connect GitHub repo
   - Select the `blostem-battlecard` repo
   - **Build command**: `npm install && npm run build`
   - **Start command**: `npm start`
   - **Environment**: Node
   - Add env vars: `GROQ_API_KEY`

3. **Deploy** — Render auto-deploys on every GitHub push

**Cost**: Render has a free tier, but may sleep after 15 min of inactivity.

### Option 3: Self-Hosted (AWS, GCP, DigitalOcean)

**Docker Setup** (optional):

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Then deploy to any container platform.

---

## Production Deployment Checklist

- [ ] Set `GROQ_API_KEY` in production environment
- [ ] Test demo on staging URL before going live
- [ ] Set up monitoring / error tracking (e.g., Sentry)
- [ ] Enable CORS if integrating with external platforms (Salesforce, HubSpot)
- [ ] Add rate limiting to `/api/query` to prevent abuse
- [ ] Cache battlecard responses (Redis, in-memory, or Vercel Edge Cache)
- [ ] Document API endpoints for partner integrations

---

## Troubleshooting

### Issue: "npm: command not found"
**Solution**: Node.js is not installed. Download from https://nodejs.org/ and follow the installer.

### Issue: "GROQ_API_KEY not set"
**Solution**: 
1. Copy `.env.example` to `.env.local`
2. Add your Groq API key
3. Restart dev server: `npm run dev`
4. Without a key, the app uses fallback responses and curated sources (still works for demo)

### Issue: live sources are not appearing
**Solution**:
1. Add `TAVILY_API_KEY` or `SERPER_API_KEY`
2. Set `RETRIEVAL_PROVIDER=auto` or choose the provider explicitly
3. Restart the dev server
4. Check server logs for the `Pipeline:` line to see whether fallback retrieval was used

### Issue: "Port 3000 already in use"
**Solution**: Change port in package.json:
```json
"scripts": {
  "dev": "next dev -p 3001"
}
```

### Issue: Build fails with "Module not found"
**Solution**: 
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: LLM responses are generic / mock
**Cause**: Either `GROQ_API_KEY` is not set, or the API is returning a fallback.
**Solution**: 
1. Verify your API key is valid in Groq Console
2. Check your Groq project limits / usage
3. Look at server logs: `npm run dev` will show errors

---

## Next Steps & Roadmap

### Short Term (This Week)
- [ ] Demo to judges
- [ ] Collect feedback on Claim Trace UX

### Medium Term (Months 1–3)
- [ ] Close 3–5 pilot customers
- [ ] Add deeper structured fetchers for pricing, docs, and reviews
- [ ] Strengthen evaluation coverage for confidence and validation
- [ ] Add retrieval caching

### Long Term (Months 3–12)
- [ ] Salesforce CRM connector
- [ ] Slack integration (daily alerts on competitor moves)
- [ ] White-label for platforms (HubSpot, etc.)
- [ ] Expand to other verticals (EdTech, LogTech)

---

## Support

For questions or issues:
1. Check the troubleshooting section above
2. Review the main [README.md](README.md)
3. Check [DEMO_NARRATIVE.md](DEMO_NARRATIVE.md) for pitch strategy

Good luck with your demo! 🚀
