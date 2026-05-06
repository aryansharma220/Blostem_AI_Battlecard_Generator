import axios from "axios";
import { retrieveRelevantSources } from "./rag.js";
import { scrapeCompetitor } from "./scraper.js";
import { getDemoSources } from "./demoData.js";
import { inferSourceAuthority, inferSourceFreshness, isHighQualitySource, isLowQualitySource } from "./sourcePolicy.js";

const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const RETRIEVAL_PROVIDER = (process.env.RETRIEVAL_PROVIDER || "auto").toLowerCase();
const DEFAULT_RETRIEVAL_MODE = (process.env.DEFAULT_RETRIEVAL_MODE || "live").toLowerCase();

const KNOWN_STRUCTURED_HINTS = {
  razorpay: [
    { title: "Razorpay Pricing", url: "https://razorpay.com/pricing/", snippet: "Official pricing and MDR details for Razorpay merchants.", type: "pricing" },
    { title: "Razorpay Docs", url: "https://razorpay.com/docs/", snippet: "Official API and developer documentation.", type: "docs" },
    { title: "Razorpay Blog", url: "https://razorpay.com/blog/", snippet: "Official launches and product announcements.", type: "blog" },
  ],
  paytm: [
    { title: "Paytm for Business Pricing", url: "https://business.paytm.com/pricing", snippet: "Official merchant pricing and settlement posture.", type: "pricing" },
    { title: "Paytm Business Docs", url: "https://business.paytm.com/docs", snippet: "Official APIs and product documentation.", type: "docs" },
    { title: "Paytm Blog", url: "https://paytm.com/blog/", snippet: "Official launches and company announcements.", type: "blog" },
  ],
  phonepe: [
    { title: "PhonePe Business", url: "https://www.phonepe.com/business-solutions/", snippet: "Merchant solutions overview and product positioning.", type: "company" },
    { title: "PhonePe Product Updates", url: "https://www.phonepe.com/blog/", snippet: "Official launches and merchant product updates.", type: "blog" },
    { title: "PhonePe Merchant Stack", url: "https://www.phonepe.com/business-solutions/payment-gateway/", snippet: "Business stack and payments product overview.", type: "docs" },
  ],
};

function inferType(raw = {}) {
  const text = `${raw.title || ""} ${raw.url || ""} ${raw.snippet || raw.content || ""}`.toLowerCase();
  if (raw.type) return raw.type;
  if (/pricing|price|mdr|fee/.test(text)) return "pricing";
  if (/docs|api|developer|reference/.test(text)) return "docs";
  if (/g2|review|trustpilot|reddit/.test(text)) return "reviews";
  if (/blog|launch|announcement/.test(text)) return "blog";
  if (/linkedin|social/.test(text)) return "social";
  if (/news|funding|forbes|techcrunch|times/.test(text)) return "news";
  return "company";
}

function computeCredibilityScore(source) {
  let score = 0.35;
  if (source.authority === "high") score += 0.35;
  if (source.authority === "medium") score += 0.2;
  if (source.freshness === "recent") score += 0.2;
  if (source.freshness === "unknown") score -= 0.08;
  if (source.freshness === "stale") score -= 0.12;
  if (source.type === "pricing" || source.type === "docs" || source.type === "reviews") score += 0.1;
  if (isLowQualitySource(source.url)) score -= 0.3;
  if (isHighQualitySource(source.url)) score += 0.1;
  return Math.min(Math.max(score, 0.05), 1);
}

function normalizeSource(raw, provider, index, competitor = "") {
  const publishedAt = raw.published_at || raw.date || raw.publishedAt || "";
  const retrievedAt = new Date().toISOString();
  const normalized = {
    id: raw.id || `src_${index + 1}`,
    title: raw.title || raw.source || `Source ${index + 1}`,
    url: raw.url || `https://example.com/source-${index + 1}`,
    snippet: raw.snippet || raw.content || raw.description || "",
    published_at: publishedAt,
    retrieved_at: raw.retrieved_at || retrievedAt,
    type: inferType(raw),
    authority: inferSourceAuthority(raw.url || "", competitor),
    freshness: inferSourceFreshness(publishedAt),
    provider,
    credibility_score: 0,
    raw_metadata: raw.raw_metadata || {},
  };
  normalized.credibility_score = computeCredibilityScore(normalized);
  return normalized;
}

function deduplicateNormalizedSources(sources = []) {
  const seen = new Set();
  const deduped = [];
  sources.forEach((source) => {
    const key = (source.url || `${source.title}`).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(source);
  });
  return deduped.map((source, index) => ({ ...source, id: `src_${index + 1}` }));
}

async function searchWithTavily(query) {
  if (!TAVILY_API_KEY) return [];
  const response = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: TAVILY_API_KEY,
      query,
      topic: "general",
      search_depth: "advanced",
      max_results: 6,
      include_answer: false,
    },
    { timeout: 10000 }
  );

  return (response.data?.results || []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.content,
    published_at: item.published_date || "",
    raw_metadata: { score: item.score },
  }));
}

async function searchWithSerper(query) {
  if (!SERPER_API_KEY) return [];
  const response = await axios.post(
    "https://google.serper.dev/search",
    { q: query, num: 6 },
    {
      timeout: 10000,
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return (response.data?.organic || []).map((item) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
    published_at: item.date || "",
    raw_metadata: { position: item.position },
  }));
}

function buildStructuredHints(competitor) {
  const key = (competitor || "").toLowerCase().replace(/\s+/g, "");
  return KNOWN_STRUCTURED_HINTS[key] || [];
}

async function fetchRagFallback(competitor, query) {
  try {
    const ragSources = await retrieveRelevantSources(competitor, query, 5);
    return ragSources.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content,
      published_at: item.date,
      type: item.category,
      raw_metadata: { relevance: item.relevance },
    }));
  } catch (error) {
    console.warn("RAG fallback failed:", error?.message || error);
    return [];
  }
}

function selectProviderOrder() {
  if (RETRIEVAL_PROVIDER === "tavily") return ["tavily"];
  if (RETRIEVAL_PROVIDER === "serper") return ["serper"];
  return ["tavily", "serper"];
}

function normalizeRetrievalMode(mode) {
  const normalized = String(mode || DEFAULT_RETRIEVAL_MODE || "live").toLowerCase();
  return normalized === "live" ? "live" : "demo";
}

export async function retrieveCompetitiveIntelligence(competitor, query, options = {}) {
  const retrievalMode = normalizeRetrievalMode(options.mode);

  // Demo mode is deterministic and avoids live scraping/API dependency during demos.
  if (retrievalMode === "demo") {
    const demoRaw = getDemoSources(competitor, query);
    const demoNormalized = deduplicateNormalizedSources(
      demoRaw.map((item, index) => normalizeSource(item, "demo", index, competitor))
    )
      .sort((a, b) => b.credibility_score - a.credibility_score)
      .slice(0, 10)
      .map((source, index) => ({ ...source, id: `src_${index + 1}` }));

    return {
      sources: demoNormalized,
      provider_used: "demo",
      providers_used: ["demo"],
      fallback_used: false,
      retrieval_mode: "demo",
    };
  }

  const providersUsed = [];
  let liveResults = [];

  for (const provider of selectProviderOrder()) {
    try {
      const results = provider === "tavily" ? await searchWithTavily(query) : await searchWithSerper(query);
      if (results.length) {
        providersUsed.push(provider);
        liveResults.push(...results);
      }
    } catch (error) {
      console.warn(`${provider} retrieval failed:`, error?.message || error);
    }
  }

  const [scrapedResults, ragResults] = await Promise.all([
    liveResults.length ? Promise.resolve([]) : scrapeCompetitor(competitor).catch(() => []),
    fetchRagFallback(competitor, query),
  ]);

  if (scrapedResults.length) providersUsed.push("scraper");
  if (ragResults.length) providersUsed.push("rag");

  const combined = [
    ...liveResults.map((item, index) => normalizeSource(item, item.provider || providersUsed[0] || "live", index, competitor)),
    ...buildStructuredHints(competitor).map((item, index) => normalizeSource(item, "structured", liveResults.length + index, competitor)),
    ...scrapedResults.map((item, index) => normalizeSource(item, "scraper", liveResults.length + 10 + index, competitor)),
    ...ragResults.map((item, index) => normalizeSource(item, "rag", liveResults.length + 20 + index, competitor)),
  ];

  const deduped = deduplicateNormalizedSources(combined)
    .sort((a, b) => b.credibility_score - a.credibility_score)
    .slice(0, 10)
    .map((source, index) => ({ ...source, id: `src_${index + 1}` }));
  const providerSet = new Set(providersUsed);
  deduped.forEach((source) => {
    if (source.provider) providerSet.add(source.provider);
  });

  return {
    sources: deduped,
    provider_used: providersUsed[0] || (deduped.length ? "structured" : "none"),
    providers_used: [...providerSet],
    fallback_used: !liveResults.length,
    retrieval_mode: "live",
  };
}

export async function fetchSources(competitor, query = null, options = {}) {
  const retrieval = await retrieveCompetitiveIntelligence(
    competitor,
    query || `${competitor} pricing docs reviews launches`,
    options
  );
  return retrieval.sources;
}

export function deduplicateSources(sources = []) {
  return deduplicateNormalizedSources(sources);
}

export function scoreCredibility(source) {
  return source.credibility_score ?? computeCredibilityScore(source);
}
