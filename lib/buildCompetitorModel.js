import { completion, isLLMConfigured, parseJsonObject } from "./llm";

const KNOWN_MODELS = {
  razorpay: {
    target_segment: "SMB to mid-market merchants",
    pricing_model: "per_transaction",
    strengths: ["Strong onboarding familiarity", "Recognizable payments brand"],
    weaknesses: ["Predictability concerns at scale", "Less differentiated beyond core payments"],
    positioning_summary: "Trusted payments infrastructure with broad merchant awareness.",
    growth_direction: "Broaden payments-adjacent workflows and merchant operating stack.",
    geography: "India",
  },
  paytm: {
    target_segment: "Consumers and merchants",
    pricing_model: "blended fintech monetization",
    strengths: ["Large distribution footprint", "Consumer familiarity"],
    weaknesses: ["Merchant trust volatility", "Super-app focus can dilute B2B depth"],
    positioning_summary: "Consumer-scale fintech ecosystem with merchant reach.",
    growth_direction: "Cross-sell more fintech services through distribution.",
    geography: "India",
  },
  phonepe: {
    target_segment: "SMB to enterprise merchants",
    pricing_model: "volume and ecosystem monetization",
    strengths: ["UPI scale", "Strong merchant presence"],
    weaknesses: ["Focus dilution from expansion bets", "Monetization pressure"],
    positioning_summary: "UPI-led merchant payments platform with expanding fintech footprint.",
    growth_direction: "Deepen merchant ecosystem and adjacent financial products.",
    geography: "India",
  },
};

function collectInsights(signals) {
  return Object.values(signals || {}).flatMap((bucket) => bucket || []);
}

function inferPricingModel(text) {
  const lower = text.toLowerCase();
  if (/per transaction|transaction|mdr|gateway fee/.test(lower)) return "per_transaction";
  if (/subscription|flat fee|fixed fee/.test(lower)) return "subscription";
  if (/free|zero fee/.test(lower)) return "free_or_subsidized";
  return "blended";
}

function heuristicCompetitorModel(competitor, signals = {}) {
  const known = KNOWN_MODELS[(competitor || "").toLowerCase().replace(/\s+/g, "")];
  const flattened = collectInsights(signals);
  const joined = flattened.map((signal) => `${signal.insight} ${signal.evidence}`).join(" ").toLowerCase();

  const model = {
    target_segment: /enterprise/.test(joined)
      ? "Enterprise merchants"
      : /consumer/.test(joined)
      ? "Consumers and merchants"
      : known?.target_segment || "SMB to mid-market merchants",
    pricing_model: inferPricingModel(joined || known?.pricing_model || ""),
    strengths: [],
    weaknesses: [],
    positioning_summary: known?.positioning_summary || `${competitor} positioning is not verified beyond retrieved public sources.`,
    growth_direction: known?.growth_direction || "No verified growth direction from available evidence.",
    geography: known?.geography || "India",
  };

  flattened.forEach((signal) => {
    const text = `${signal.insight} ${signal.evidence}`.toLowerCase();
    if (/pricing|discount|fee|cost/.test(text)) model.weaknesses.push("Pricing can become a comparison point in larger deals.");
    if (/uptime|support|brand|scale|distribution|merchant/.test(text)) model.strengths.push("Strong market familiarity reduces buyer friction.");
    if (/integration|custom|developer|workflow/.test(text)) model.weaknesses.push("Custom workflow expectations can expose platform rigidity.");
    if (/funding|expansion|launch|regional|upi/.test(text)) model.strengths.push("Visible market momentum reinforces buyer confidence.");
  });

  model.strengths = [...new Set((known?.strengths || []).concat(model.strengths))].slice(0, 4);
  model.weaknesses = [...new Set((known?.weaknesses || []).concat(model.weaknesses))].slice(0, 4);

  return model;
}

function buildPrompt(competitor, signals) {
  return `You are a senior RevOps strategist.

Using the extracted signals below, build a structured model of the competitor ${competitor}.

Rules:
- Be decisive and opinionated
- No generic phrases
- Infer from signals
- Keep it sharp and usable for sales
- Return JSON only

Signals:
${JSON.stringify(signals, null, 2)}

Output:
{
  "target_segment": "",
  "pricing_model": "",
  "strengths": [],
  "weaknesses": [],
  "positioning_summary": "",
  "growth_direction": "",
  "geography": "India"
}`;
}

function evidenceText(signals = {}) {
  return collectInsights(signals).map((signal) => `${signal.insight || ""} ${signal.evidence || ""}`).join(" ").toLowerCase();
}

function keepSupportedList(items = [], evidence = "") {
  const sourceText = String(evidence || "").toLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const text = String(item || "").toLowerCase();
    const risky = [
      /\bno evidence\b/,
      /\bsla\b/,
      /\biso\s*27001\b/,
      /\bsoc\s*2\b/,
      /\bcompliance certification/,
      /\baudit\b/,
      /\bsettlement guarantee/,
      /\brole-based\b/,
    ];
    if (risky.some((pattern) => pattern.test(text) && !pattern.test(sourceText))) return false;
    const tokens = text
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 4 && !["strong", "market", "india", "indian", "business", "merchant", "payment", "evidence", "enterprise-grade"].includes(token));
    if (!tokens.length) return true;
    return tokens.some((token) => sourceText.includes(token));
  });
}

export async function buildCompetitorModel(competitor, signals = {}, options = {}) {
  const fallback = heuristicCompetitorModel(competitor, signals);

  if (options.skipLLM || !isLLMConfigured()) {
    return fallback;
  }

  try {
    const raw = await completion(buildPrompt(competitor, signals), { task: "extraction", maxTokens: 700, temperature: 0.1 });
    const parsed = parseJsonObject(raw);
    const evidence = evidenceText(signals);
    const supportedStrengths = keepSupportedList(parsed?.strengths, evidence);
    const supportedWeaknesses = keepSupportedList(parsed?.weaknesses, evidence);
    return {
      ...fallback,
      ...parsed,
      strengths: supportedStrengths.length ? supportedStrengths : fallback.strengths,
      weaknesses: supportedWeaknesses.length ? supportedWeaknesses : fallback.weaknesses,
    };
  } catch (error) {
    console.warn("Competitor model fallback:", error?.message || error);
    return fallback;
  }
}
