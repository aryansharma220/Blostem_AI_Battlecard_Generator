import { completion, isLLMConfigured, parseJsonObject } from "./llm";
import { computeConfidenceFromSources, summarizeSignalConfidence } from "./confidenceEngine";

function flattenSignals(signals = {}) {
  const buckets = [
    "pricing_signals",
    "positioning_signals",
    "product_signals",
    "sentiment_signals",
    "market_signals",
  ];
  return buckets.flatMap((bucket) =>
    (signals[bucket] || []).map((signal) => ({
      ...signal,
      bucket,
    }))
  );
}

function threatFromSummary(score, sourceCount) {
  if (score >= 0.7 || sourceCount >= 6) return "HIGH";
  if (score >= 0.45 || sourceCount >= 3) return "MEDIUM";
  return "LOW";
}

function bucketPriority(bucket) {
  if (bucket === "pricing_signals") return 5;
  if (bucket === "product_signals") return 4;
  if (bucket === "sentiment_signals") return 3;
  if (bucket === "market_signals") return 2;
  return 1;
}

function mapSoWhat(bucket) {
  if (bucket === "pricing_signals") return "Use this only to ask a pricing-specific discovery question.";
  if (bucket === "product_signals") return "Use this to test implementation fit and operational exceptions.";
  if (bucket === "sentiment_signals") return "Use this only when the buyer asks about user experience or risk.";
  if (bucket === "market_signals") return "Use this to discuss urgency, focus, or regulatory context.";
  return "Use this as a qualification prompt, not a standalone claim.";
}

function compactPhrase(text = "", maxWords = 6) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function linkedEvidenceText(ids = [], sourceMap = {}) {
  return (ids || [])
    .map((id) => sourceMap[id])
    .filter(Boolean)
    .map((source) => `${source.title || ""} ${source.snippet || ""}`)
    .join(" ")
    .toLowerCase();
}

function hasUnsupportedSpecificity(text = "", evidence = "") {
  const claim = String(text || "").toLowerCase();
  const sourceText = String(evidence || "").toLowerCase();
  const riskyPatterns = [
    /\b\d+(\.\d+)?\s*%/,
    /\b\d+\s*(transactions|days|hours|minutes|months|x|times)\b/,
    /\bsoc\s*2\b/,
    /\biso\s*27001\b/,
    /\baudit trail\b/,
    /\bsla\b/,
    /\bfx\b/,
    /\bmulti-currency\b/,
    /\bmanual reconciliation\b/,
    /\breconciliation\b/,
    /\bsettlement\b/,
    /\bgovernance\b/,
    /\bcompliance\b/,
    /\brole-based\b/,
    /\baudit logging\b/,
    /\bnot documented\b/,
    /\bnot visible\b/,
    /\bno\b/,
    /\black(s|ing)?\b/,
    /\bfails?\b/,
  ];
  return riskyPatterns.some((pattern) => pattern.test(claim) && !pattern.test(sourceText));
}

function isEvidenceSafe(item = {}, sourceMap = {}) {
  const ids = item.evidence_ids || item.source_ids || [];
  const evidence = linkedEvidenceText(ids, sourceMap);
  if (!ids.length || !evidence) return false;
  const text = [item.signal, item.so_what, item.angle, item.what_to_say, item.close, item.claim]
    .filter(Boolean)
    .join(" ");
  return !hasUnsupportedSpecificity(text, evidence);
}

function heuristicBattlecardCore({ competitor, competitorModel, signals, sources }) {
  const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source]));
  const uniqueSignals = [];
  const seenInsights = new Set();
  flattenSignals(signals).forEach((signal) => {
    const key = `${signal.bucket}:${(signal.insight || "").toLowerCase()}`;
    if (seenInsights.has(key)) return;
    seenInsights.add(key);
    uniqueSignals.push(signal);
  });
  const flattened = uniqueSignals
    .sort((a, b) => bucketPriority(b.bucket) - bucketPriority(a.bucket))
    .slice(0, 6);
  const confidenceSummary = summarizeSignalConfidence(flattened, sourceMap);
  const threatLevel = threatFromSummary(confidenceSummary.score, sources.length);

  const competitiveSignals = flattened.slice(0, 4).map((signal, index) => {
    const confidence = computeConfidenceFromSources(signal.source_ids, sourceMap);
    return {
      id: signal.id || `signal_${index + 1}`,
      signal: signal.insight,
      so_what: mapSoWhat(signal.bucket),
      confidence: confidence.label,
      evidence_ids: signal.source_ids,
      evidence_snippets: signal.source_ids.map((id) => sourceMap[id]?.snippet).filter(Boolean),
      proof: signal.source_ids
        .map((id) => sourceMap[id]?.title)
        .filter(Boolean)
        .join(", "),
    };
  });

  const attackAngles = [];
  const hasPricingSignal = flattened.find((signal) => signal.bucket === "pricing_signals");
  const hasProductSignal = flattened.find((signal) => signal.bucket === "product_signals");
  const hasMarketSignal = flattened.find((signal) => signal.bucket === "market_signals");

  if (hasPricingSignal) {
    attackAngles.push({
      angle: "Pricing Predictability",
      when_to_use: "When buyers compare total commercial impact, not just sticker price.",
      what_to_say: "Looks cheap now. Gets harder at scale.",
      close: "How predictable does spend stay when volume doubles?",
      evidence_ids: hasPricingSignal.source_ids,
      confidence: computeConfidenceFromSources(hasPricingSignal.source_ids, sourceMap).label,
    });
  }
  if (hasProductSignal) {
    attackAngles.push({
      angle: "Workflow Flexibility",
      when_to_use: "When custom integrations or operational edge cases matter.",
      what_to_say: "Standard flows are easy. Edge cases expose rigidity.",
      close: "How many non-standard flows must work on day one?",
      evidence_ids: hasProductSignal.source_ids,
      confidence: computeConfidenceFromSources(hasProductSignal.source_ids, sourceMap).label,
    });
  }
  if (hasMarketSignal) {
    attackAngles.push({
      angle: "Focus and Expansion Risk",
      when_to_use: "When buyers value execution focus or local market nuance.",
      what_to_say: "Expansion stories can hide focus drift.",
      close: "Who owns your most important growth motion for the next 12 months?",
      evidence_ids: hasMarketSignal.source_ids,
      confidence: computeConfidenceFromSources(hasMarketSignal.source_ids, sourceMap).label,
    });
  }

  if (!attackAngles.length) {
    attackAngles.push({
      angle: "Differentiation Gap",
      when_to_use: "When the competitor looks credible but not uniquely strong.",
      what_to_say: "Good enough rarely stays good enough in scale moments.",
      close: "Where do you expect the current stack to break first?",
      evidence_ids: [],
      confidence: "low",
    });
  }

  const keyClaims = competitiveSignals.slice(0, 3).map((signal, index) => ({
    id: `claim_${index + 1}`,
    claim: signal.signal,
    evidence_ids: signal.evidence_ids,
    evidence_snippets: signal.evidence_snippets,
    confidence: signal.confidence,
  }));

  // Contrast-based summary: strength. weakness. (max 12 words)
  const strength = competitorModel.strengths?.[0] || "market reach";
  const weakness = competitorModel.weaknesses?.[0] || "unit economics";
  const summary = `${compactPhrase(strength, 5)}. ${compactPhrase(weakness, 5)}.`;

  return {
    threat_level: threatLevel,
    summary: sources.length ? summary : "Insufficient verified evidence.",
    competitive_signals: competitiveSignals,
    attack_angles: attackAngles,
    key_claims: keyClaims,
  };
}

function buildPrompt({ competitor, competitorModel, signals, feedbackSummary = null }) {
  return `You are a senior enterprise GTM strategist preparing a Blostem AE for a fintech sales conversation.

Your goal:
- Generate tactical, evidence-backed competitive intelligence
- Show where ${competitor} wins and where they are vulnerable
- Help the AE ask credible discovery questions
- Focus on enterprise procurement, operational risk, integration depth, compliance, support, settlement, reconciliation, reliability, and cost predictability

CRITICAL RULES (ENFORCE HARD):
1. MAX 12 WORDS PER LINE — no exceptions
2. NO PARAGRAPHS — only sharp, callable lines
3. NO GENERIC WORDS — kill: "strong", "comprehensive", "robust", "leading"
4. CONTRAST ALWAYS — pair evidence-backed strength + operational tradeoff
5. EVERY LINE MUST ANSWER: "What should the AE do or ask next?"
6. CHOOSE ONLY TOP 2-3 INSIGHTS — cut everything else
7. FACTS AND INFERENCES MUST STAY SEPARATE
8. IF EVIDENCE IS WEAK, SAY SO OR LOWER CONFIDENCE

FOCUS ON BUYER PSYCHOLOGY:
- What does the buyer fear?
- When are they vulnerable to switching?
- What operational risk should be inspected right now?
- What is the most expensive downside?

Competitor model:
${JSON.stringify(competitorModel, null, 2)}

Signals (only use HIGH confidence):
${JSON.stringify(signals, null, 2)}

Prior user feedback:
${JSON.stringify(feedbackSummary || {}, null, 2)}

Use that feedback to avoid repeating stale, unsupported, or overly generic claims.

Output JSON (EXACT format):
{
  "threat_level": "HIGH|MEDIUM|LOW",
  "summary": "<strength>. <weakness>.",
  "competitive_signals": [
    {
      "signal": "<max 12 words, contrast-based>",
      "so_what": "<why this creates a buying moment>",
      "confidence": "high|medium|low",
      "evidence_ids": ["src_1"]
    }
  ],
  "attack_angles": [
    {
      "angle": "<one sharp insight>",
      "when_to_use": "<what buyer says or does>",
      "what_to_say": "<max 12 words, callable>",
      "close": "<question that pushes buyer forward>",
      "evidence_ids": ["src_1"]
    }
  ],
  "key_claims": [
    {
      "claim": "<contrast-based, max 12 words>",
      "evidence_ids": ["src_1"]
    }
  ]
}

EXAMPLES OF GOOD OUTPUT:
Summary: "Fast deployment. Weak at scale."
What to say: "Costs rise with volume."
Close: "Does that matter at your scale?"

EXAMPLES OF BAD OUTPUT (REJECT):
Summary: "Paytm is a formidable competitor with strong market reach"
What to say: "They have comprehensive product offerings"
Close: "Would you like to learn more?"

BE DECISIVE. CHOOSE ONLY THE HIGHEST-IMPACT ANGLES. CUT EVERYTHING ELSE.`;
}

export async function generateBattlecardCore(input) {
  const fallback = heuristicBattlecardCore(input);
  const sourceMap = Object.fromEntries((input.sources || []).map((source) => [source.id, source]));

  if (input.skipLLM || !isLLMConfigured()) {
    return fallback;
  }

  try {
    const raw = await completion(buildPrompt(input), { task: "synthesis", maxTokens: 1000, temperature: 0.15 });
    const parsed = parseJsonObject(raw);

    const normalizeEvidence = (ids = []) => Array.isArray(ids) ? ids.filter((id) => sourceMap[id]) : [];

    const competitiveSignals = (parsed.competitive_signals || fallback.competitive_signals).map((signal, index) => {
      const evidenceIds = normalizeEvidence(signal.evidence_ids);
      const confidence = computeConfidenceFromSources(evidenceIds, sourceMap);
      return {
        id: signal.id || `signal_${index + 1}`,
        signal: signal.signal || fallback.competitive_signals[index]?.signal,
        so_what: signal.so_what || fallback.competitive_signals[index]?.so_what,
        confidence: confidence.label,
        evidence_ids: evidenceIds,
        evidence_snippets: evidenceIds.map((id) => sourceMap[id]?.snippet).filter(Boolean),
        proof: evidenceIds.map((id) => sourceMap[id]?.title).filter(Boolean).join(", "),
      };
    }).filter((signal) => signal.signal && isEvidenceSafe(signal, sourceMap));

    const attackAngles = (parsed.attack_angles || fallback.attack_angles).map((angle, index) => {
      const evidenceIds = normalizeEvidence(angle.evidence_ids);
      const confidence = computeConfidenceFromSources(evidenceIds, sourceMap);
      return {
        angle: angle.angle || fallback.attack_angles[index]?.angle,
        when_to_use: angle.when_to_use || fallback.attack_angles[index]?.when_to_use,
        what_to_say: angle.what_to_say || fallback.attack_angles[index]?.what_to_say,
        close: angle.close || fallback.attack_angles[index]?.close,
        evidence_ids: evidenceIds,
        confidence: confidence.label,
      };
    }).filter((angle) => angle.angle && isEvidenceSafe(angle, sourceMap));

    const keyClaims = (parsed.key_claims || fallback.key_claims).map((claim, index) => {
      const evidenceIds = normalizeEvidence(claim.evidence_ids);
      const confidence = computeConfidenceFromSources(evidenceIds, sourceMap);
      return {
        id: claim.id || `claim_${index + 1}`,
        claim: claim.claim || fallback.key_claims[index]?.claim,
        evidence_ids: evidenceIds,
        evidence_snippets: evidenceIds.map((id) => sourceMap[id]?.snippet).filter(Boolean),
        confidence: confidence.label,
      };
    }).filter((claim) => claim.claim && isEvidenceSafe(claim, sourceMap));

    const allEvidenceText = (input.sources || []).map((source) => `${source.title || ""} ${source.snippet || ""}`).join(" ");
    const safeSummary = hasUnsupportedSpecificity(parsed.summary || "", allEvidenceText)
      ? fallback.summary
      : parsed.summary || fallback.summary;

    return {
      threat_level: parsed.threat_level || fallback.threat_level,
      summary: safeSummary,
      competitive_signals: competitiveSignals.length ? competitiveSignals : fallback.competitive_signals,
      attack_angles: attackAngles.length ? attackAngles : fallback.attack_angles,
      key_claims: keyClaims.length ? keyClaims : fallback.key_claims,
    };
  } catch (error) {
    console.warn("Battlecard core fallback:", error?.message || error);
    return fallback;
  }
}
