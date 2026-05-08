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
    hiring_intent_signals: [],
    operational_maturity_signals: [],
    architectural_complexity_signals: [],
    strategic_direction_signals: [],
    legal_risk_signals: [],
    security_risk_signals: [],
    regulatory_risk_signals: [],
    user_satisfaction_signals: [],
    market_traction_signals: [],
    pivot_signals: [],
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
          source_classes: linkedSourceIds.map((id) => sources.find((source) => source.id === id)?.source_class).filter(Boolean),
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
  const sourceClass = String(source.source_class || "").toLowerCase();
  if (bucket === "pricing_signals") {
    if (/free|discount|0%|zero/.test(text)) return `${competitor} pricing mentions ${shortEvidence || "public pricing terms"}.`;
    if (/mdr|fee|transaction|pricing|price/.test(text)) return `${competitor} has public pricing evidence: ${shortEvidence || source.title}.`;
    return "";
  }
  if (bucket === "positioning_signals") {
    if (/smb|merchant|consumer|enterprise/.test(text)) return `${competitor} targets ${shortEvidence || "a stated buyer segment"}.`;
    if (sourceClass === "employee") return `${competitor} hiring suggests ${shortEvidence || "an internal strategic priority"}.`;
    return "";
  }
  if (bucket === "product_signals") {
    if (/api|integration|developer|platform|payout|settlement|retry|webhook|reconciliation|status|incident/.test(text)) return `${competitor} product evidence mentions ${shortEvidence || source.title}.`;
    if (sourceClass === "compliance_operational") return `${competitor} operational evidence mentions ${shortEvidence || source.title}.`;
    if (sourceClass === "ecosystem") return `${competitor} ecosystem evidence mentions ${shortEvidence || source.title}.`;
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
    const metadata = source.raw_metadata || {};
    
    // Original signal extraction
    if (source.type === "pricing" || /pricing|price|fee|mdr|transaction/.test(text)) maybePush("pricing_signals", source);
    if (source.type === "docs" || source.type === "company" || /merchant|enterprise|consumer|smb|platform/.test(text) || source.source_class === "employee_signals") maybePush("positioning_signals", source);
    if (source.type === "docs" || source.type === "blog" || /api|integration|developer|payout|settlement|feature|launch|retry|webhook|incident|status|reconciliation/.test(text) || ["compliance_operational", "ecosystem_signals"].includes(source.source_class)) maybePush("product_signals", source);
    if (isSentimentSource(source) || ["customer_sentiment", "community_signals"].includes(source.source_class)) maybePush("sentiment_signals", source);
    if (source.type === "news" || /funding|expansion|upi|rbi|compliance|regional|growth|hiring|careers|partnership/.test(text) || ["market_signals", "employee_signals", "community_signals"].includes(source.source_class)) maybePush("market_signals", source);
    
    // Hard-to-find signal extraction
    // Hiring intent signals from job postings and LinkedIn
    if (source.source_class === "employee_signals" && /hiring|job|open role|recruiting|talent|careers|engineers|team growth|expansion/.test(text)) {
      maybePush("hiring_intent_signals", source);
    }
    
    // Operational maturity signals from status pages and uptime monitoring
    if (source.source_class === "compliance_operational" && /uptime|incident|outage|status|sla|availability|reliability/.test(text)) {
      maybePush("operational_maturity_signals", source);
    }
    
    // Architectural complexity from GitHub and engineering blogs
    if ((source.source_class === "employee_signals" || source.type === "blog") && /github|commit|release|api|architecture|infrastructure|scaling|performance/.test(text)) {
      maybePush("architectural_complexity_signals", source);
    }
    
    // Strategic direction from founder/CEO signals
    if (source.source_class === "market_signals" && /founder|ceo|interview|podcast|conference|announcement|direction|strategy|vision/.test(text)) {
      maybePush("strategic_direction_signals", source);
    }

    // Directional risk and market signal extraction.
    // Legal risk signals
    if (metadata.legal_signal || metadata.dispute_history || /litigation|lawsuit|court|dispute|settlement/.test(text)) {
      maybePush("legal_risk_signals", source);
    }
    
    // Security risk signals
    if (metadata.security_signal || /breach|vulnerability|security|incident|exploit|cve/.test(text)) {
      maybePush("security_risk_signals", source);
    }
    
    // Regulatory risk signals
    if (metadata.regulatory_signal || /rbi|npci|compliance|directive|circular|warning|violation/.test(text)) {
      maybePush("regulatory_risk_signals", source);
    }
    
    // User satisfaction signals
    if (metadata.app_store_signal || /app store|play store|rating|review|crash|stability/.test(text)) {
      maybePush("user_satisfaction_signals", source);
    }
    
    // Market traction signals
    if (metadata.product_hunt_signal || /product hunt|launch|announcement|trending/.test(text)) {
      maybePush("market_traction_signals", source);
    }
    
    // Pivot signals from historical changes
    if (metadata.pivot_detection || metadata.historical_analysis || /website redesign|major pivot|strategic shift/.test(text)) {
      maybePush("pivot_signals", source);
    }
  });

  return signals;
}

function buildPrompt(competitor, sources) {
  const sourceContext = sources
    .slice(0, 12)
    .map(
      (source) =>
        `${source.id} | type=${source.type} | class=${source.source_class || "unknown"} | authority=${source.authority} | freshness=${source.freshness}\nTitle: ${source.title}\nSnippet: ${source.snippet}`
    )
    .join("\n\n");

  return `You are a competitive intelligence analyst for a fintech sales team.

You are given normalized web sources about ${competitor}.
Your job is to extract high-signal, evidence-backed insights including operational, strategic, and risk signals.

SIGNAL TYPES:
- pricing_signals: Pricing models, MDR, fees
- positioning_signals: Target segments, buyer personas
- product_signals: Product features, APIs, capabilities
- sentiment_signals: Customer reviews, satisfaction, complaints
- market_signals: Funding, growth, market expansion
- hiring_intent_signals: Job postings, team growth, skill acquisition signals
- operational_maturity_signals: Uptime, incidents, reliability metrics
- architectural_complexity_signals: Technical decisions, scaling approaches
- strategic_direction_signals: Founder/CEO interviews, roadmap hints, market strategy
- legal_risk_signals: Litigation, disputes, legal action risk
- security_risk_signals: Data breaches, security incidents, credential leaks
- regulatory_risk_signals: RBI/NPCI actions, compliance violations, regulatory warnings
- user_satisfaction_signals: App store ratings, user feedback, crash metrics
- market_traction_signals: Product Hunt launches, market validation signals
- pivot_signals: Historical website changes, feature removals, strategic shifts

NON-OBVIOUS DIRECTIONAL INSIGHTS:
- Historical website changes (Wayback Machine) reveal pivots and strategic shifts
- Legal disputes reveal credibility risks and execution challenges
- Security breaches reveal operational maturity issues
- Regulatory actions reveal compliance/operational risks
- App store ratings reveal real user experience (unfiltered)
- Payment processor integration choices reveal payment architecture
- Patent filings reveal innovation direction
- Community discussions reveal unfiltered sentiment and problem areas
- Product Hunt launches reveal market validation attempts

STRICT RULES:
- Extract 1-2 signals maximum per category (empty array if no signal)
- Keep each insight under 18 words
- Keep each evidence field under 22 words
- Do not create fake signals - only extract from evidence present
- Risk signals (legal, security, regulatory) are HIGH VALUE - extract if present
- Directional signals must remain buyer questions until verified
- If a category has no concrete evidence, return empty array
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
  "market_signals": [],
  "hiring_intent_signals": [],
  "operational_maturity_signals": [],
  "architectural_complexity_signals": [],
  "strategic_direction_signals": [],
  "legal_risk_signals": [],
  "security_risk_signals": [],
  "regulatory_risk_signals": [],
  "user_satisfaction_signals": [],
  "market_traction_signals": [],
  "pivot_signals": []
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
