RivalSense

Problem

Sales teams and GTM leaders need concise, evidence-backed competitive battlecards to win enterprise deals. Competitive intelligence is scattered across product pages, docs, press releases, and unstructured web sources; manually finding, verifying, and synthesizing that information is slow, inconsistent, and error-prone. When sellers lack timely, defensible intelligence they miss discovery signals, mis-prioritize objections, and lose procurement or implementation discussions.

Solution

RivalSense automates the creation of competitive intelligence by crawling and extracting signals from public sources, deduplicating and scoring evidence, and synthesizing actionable positioning and discovery questions using an LLM-driven pipeline. The app produces structured battlecards that surface where competitors win, where they are weak, and what to ask in sales conversations — with evidence and confidence metadata attached.

Approach

RivalSense uses a modular pipeline: scraping and fetch (lib/scraper.js), signal extraction (lib/extractSignals.js), deduplication and identity resolution (lib/competitorDeduplicator.js and lib/competitorIdentity.js), evidence scoring and confidence (lib/confidenceEngine.js), and retrieval-augmented synthesis (lib/llm.js and lib/generateBattlecardCore.js). We chose a retrieval + structured-extraction pattern to avoid hallucination and to make claims auditable; that ruled out a purely prompt-only approach or manual templates. We favored open, configurable LLM providers (OpenRouter / GROQ) over a single locked vendor so the pipeline stays portable and testable.

What's next

With another month of work the highest-impact items are: 1) an interactive UI for reviewers and sales users to correct evidence and accept/reject claims (closing the feedback loop), 2) additional connectors (public filings, job-postings, and partner sites) to broaden coverage, and 3) automated evaluation and benchmarking to measure claim precision and recall against labeled examples.

How to run

- Install dependencies and run locally:

```bash
npm install
npm run dev
```

- Required environment variables: set either `OPENROUTER_API_KEY` or `GROQ_API_KEY` (and optionally `LLM_PROVIDER` to `openrouter` or `groq`). Example (PowerShell):

```powershell
$env:OPENROUTER_API_KEY = "your_key_here"
npm run dev
```

- The API endpoints live under `pages/api/` (for example, `/api/query` and `/api/export`) and the battlecard generation logic is in `lib/`.

Architecture (3–4 sentences)

RivalSense is a Next.js app with a server-side pipeline that transforms scraped documents into structured evidence, indexes them for retrieval, and invokes LLMs for extraction and synthesis. The system separates extraction (structured JSON from source text) from synthesis (narrative battlecard), enabling provenance and confidence scoring for every claim. Components are modular so crawlers, rankers, and LLM providers can be swapped independently.

