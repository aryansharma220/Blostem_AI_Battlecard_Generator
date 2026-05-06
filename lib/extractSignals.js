import { completion, isLLMConfigured, parseJsonObject } from "./llm";
import { isSentimentSource } from "./sourcePolicy";
import { cleanEvidenceText, isBoilerplateEvidence } from "./trust";

function emptySignals() {
  return {
    pricing_signals: [],
    positioning_signals: [],
    product_signals: [],
    sentiment_signals: [],
    market_signals: [],
  };
}

function normalizeSignalBuckets(parsed, sources) {
  const normalized = emptySignals();
  const sourceIds = new Set(sources.map((source) => source.id));
  let counter = 1;

  Object.keys(normalized).forEach((bucket) => {
    const items = Array.isArray(parsed?.[bucket]) ? parsed[bucket] : [];
    normalized[bucket] = items
      .map((item) => {
        const linkedSourceIds = Array.isArray(item.source_ids)
          ? item.source_ids.filter((id) => sourceIds.has(id))
          : item.source_id && sourceIds.has(item.source_id)
          ? [item.source_id]
          : [];
        if (!item.insight) return null;
        return {
          id: item.id || `sig_${counter++}`,
          insight: item.insight,
          evidence: cleanEvidenceText(item.evidence || ""),
          source_ids: linkedSourceIds,
        };
      })
      .filter(Boolean);
  });

  return normalized;
}

function inferSignalInsight(bucket, source, competitor) {
  const text = `${source.title} ${source.snippet}`.toLowerCase();
  const evidence = String(source.snippet || source.title || "").replace(/\s+/g, " ").trim();
  const shortEvidence = evidence.split(/\s+/).slice(0, 18).join(" ");
  if (bucket === "pricing_signals") {
    if (/free|discount|0%|zero/.test(text)) return `${competitor} pricing mentions ${shortEvidence || "public pricing terms"}.`;
    if (/mdr|fee|transaction|pricing|price/.test(text)) return `${competitor} has public pricing evidence: ${shortEvidence || source.title}.`;
    return "";
  }
  if (bucket === "positioning_signals") {
    if (/smb|merchant|consumer|enterprise/.test(text)) return `${competitor} targets ${shortEvidence || "a stated buyer segment"}.`;
    return "";
  }
  if (bucket === "product_signals") {
    if (/api|integration|developer|platform|payout|settlement/.test(text)) return `${competitor} product evidence mentions ${shortEvidence || source.title}.`;
    return "";
  }
  if (bucket === "sentiment_signals") {
    if (!isSentimentSource(source)) return "";
    if (/praise|love|positive|uptime/.test(text)) return `${competitor} has positive customer sentiment evidence: ${shortEvidence || source.title}.`;
    if (/concern|issue|outage|slow|complaint|support/.test(text)) return `${competitor} has customer concern evidence: ${shortEvidence || source.title}.`;
    return "";
  }
  if (/funding|expansion|launch|upi|rbi|compliance|regional/.test(text)) {
    return `${competitor} market evidence mentions ${shortEvidence || source.title}.`;
  }
  return "";
}

function heuristicSignalExtraction(competitor, sources = []) {
  const signals = emptySignals();
  const seen = new Set();
  let counter = 1;

  const maybePush = (bucket, source) => {
    const key = `${bucket}:${source.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const insight = inferSignalInsight(bucket, source, competitor);
    if (!insight) return;
    signals[bucket].push({
      id: `sig_${counter++}`,
      insight,
      evidence: source.snippet,
      source_ids: [source.id],
    });
  };

  sources.forEach((source) => {
    if (source.type === "notes") return;
    if (isBoilerplateEvidence(source.snippet || source.title)) return;
    const text = `${source.title} ${source.snippet}`.toLowerCase();
    if (source.type === "pricing" || /pricing|price|fee|mdr|transaction/.test(text)) maybePush("pricing_signals", source);
    if (source.type === "docs" || source.type === "company" || /merchant|enterprise|consumer|smb|platform/.test(text)) maybePush("positioning_signals", source);
    if (source.type === "docs" || source.type === "blog" || /api|integration|developer|payout|settlement|feature|launch/.test(text)) maybePush("product_signals", source);
    if (isSentimentSource(source)) maybePush("sentiment_signals", source);
    if (source.type === "news" || /funding|expansion|upi|rbi|compliance|regional|growth/.test(text)) maybePush("market_signals", source);
  });

  return signals;
}

function buildPrompt(competitor, sources) {
  const sourceContext = sources
    .slice(0, 8)
    .map(
      (source) =>
        `${source.id} | type=${source.type} | authority=${source.authority} | freshness=${source.freshness}\nTitle: ${source.title}\nSnippet: ${source.snippet}`
    )
    .join("\n\n");

  return `You are a competitive intelligence analyst for a fintech sales team.

You are given normalized web sources about ${competitor}.
Your job is to extract only high-signal, evidence-backed insights.

STRICT RULES:
- Do not summarize
- Do not use marketing language
- Return at most 1 signal per category
- Keep each insight under 18 words
- Keep each evidence field under 22 words
- Only extract signals useful for sales positioning
- Each signal must be grounded in evidence
- Do not create sentiment signals unless the source is a review, forum, social, app-store, or public complaint source
- If a category has no concrete evidence, return an empty array
- Use source_ids that exactly match the provided IDs
- Return JSON only

Sources:
${sourceContext}

Output:
{
  "pricing_signals": [],
  "positioning_signals": [],
  "product_signals": [],
  "sentiment_signals": [],
  "market_signals": []
}`;
}

export async function extractSignals(competitor, sources = [], options = {}) {
  const fallback = heuristicSignalExtraction(competitor, sources);

  if (options.skipLLM || !sources.length || !isLLMConfigured()) {
    return fallback;
  }

  try {
    const raw = await completion(buildPrompt(competitor, sources), { task: "extraction", maxTokens: 700, temperature: 0.1 });
    const parsed = parseJsonObject(raw);
    const normalized = normalizeSignalBuckets(parsed, sources);
    normalized.sentiment_signals = normalized.sentiment_signals.filter((signal) =>
      (signal.source_ids || []).some((id) => isSentimentSource(sources.find((source) => source.id === id)))
    );
    const totalSignals = Object.values(normalized).reduce((sum, bucket) => sum + bucket.length, 0);
    if (!totalSignals && Object.values(fallback).some((bucket) => bucket.length)) {
      return fallback;
    }
    return normalized;
  } catch (error) {
    console.warn("Signal extraction fallback:", error?.message || error);
    return fallback;
  }
}
