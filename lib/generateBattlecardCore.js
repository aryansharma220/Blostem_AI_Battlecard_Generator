import { completion, isLLMConfigured, parseJsonObject } from "./llm";
import { computeConfidenceFromSources, summarizeSignalConfidence } from "./confidenceEngine";
import { buildCompetitorIdentity } from "./competitorIdentity";

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
  const identity = buildCompetitorIdentity(competitor, competitorModel, sources);
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
      angle: identity.pricing_label,
      when_to_use: "When buyers compare total commercial impact, not just sticker price.",
      what_to_say: identity.tension,
      close: identity.opening_question,
      evidence_ids: hasPricingSignal.source_ids,
      confidence: computeConfidenceFromSources(hasPricingSignal.source_ids, sourceMap).label,
    });
  }
  if (hasProductSignal) {
    attackAngles.push({
      angle: identity.product_label,
      when_to_use: "When custom integrations or operational edge cases matter.",
      what_to_say: identity.proof_label,
      close: identity.opening_question,
      evidence_ids: hasProductSignal.source_ids,
      confidence: computeConfidenceFromSources(hasProductSignal.source_ids, sourceMap).label,
    });
  }
  if (hasMarketSignal) {
    attackAngles.push({
      angle: identity.risk_label,
      when_to_use: "When buyers value execution focus or local market nuance.",
      what_to_say: identity.unique_narrative,
      close: identity.opening_question,
      evidence_ids: hasMarketSignal.source_ids,
      confidence: computeConfidenceFromSources(hasMarketSignal.source_ids, sourceMap).label,
    });
  }

  if (!attackAngles.length) {
    attackAngles.push({
      angle: identity.risk_label,
      when_to_use: "When the competitor looks credible but not uniquely strong.",
      what_to_say: identity.unique_narrative,
      close: identity.opening_question,
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
    ae_action: mapSoWhat(signal.bucket),
    buyer_question: signal.bucket === "pricing_signals"
      ? "How does total cost change as volume and exceptions grow?"
      : signal.bucket === "product_signals"
        ? "Which non-standard flows must work on day one?"
        : signal.bucket === "sentiment_signals"
          ? "What user experience problem have buyers actually felt?"
          : signal.bucket === "market_signals"
            ? "What market shift would change the buying decision?"
            : "What should the buyer verify next?",
  }));

  // Contrast-based summary: strength. weakness. (max 12 words)
  const summary = identity.summary || `${compactPhrase(competitorModel.strengths?.[0] || "market reach", 5)}. ${compactPhrase(competitorModel.weaknesses?.[0] || "unit economics", 5)}.`;

  return {
    threat_level: threatLevel,
    summary: sources.length ? summary : "Insufficient verified evidence.",
    competitive_signals: competitiveSignals,
    attack_angles: attackAngles,
    key_claims: keyClaims,
  };
}

function enterpriseTone(text = "") {
  if (!text) return text;
  let t = String(text);
  // Prefer evidence-first language
  t = t.replace(/customer complaints suggest/ig, 'retrieved customer evidence indicates');
  t = t.replace(/customer complaints/ig, 'retrieved customer evidence');
  t = t.replace(/buyer's|buyer['’]s/ig, 'retrieved buyer evidence\'s');
  t = t.replace(/buyer says/ig, 'retrieved buyer evidence indicates');
  t = t.replace(/looks cheap now\.?/ig, 'retrieved evidence indicates cost predictability may decline at scale.');
  t = t.replace(/gets harder at scale\.?/ig, 'cost predictability often degrades as volume increases.');
  t = t.replace(/Which non-standard flows must work on day one\?/ig, 'Which non-standard flows require verification before go-live?');
  t = t.replace(/How many non-standard flows must work on day one\?/ig, 'Which non-standard flows require verification before go-live?');
  t = t.replace(/Which vendor assumption needs proof first\?/ig, 'Which vendor assumption requires operational proof first?');
  t = t.replace(/How does total cost change as volume and exceptions grow\?/ig, 'How does total cost evolve as transaction volume and exceptions scale?');
  return t;
}

function buildPrompt({ competitor, competitorModel, signals, feedbackSummary = null }) {
  const identity = buildCompetitorIdentity(competitor, competitorModel, Array.isArray(signals) ? signals : []);
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
9. USE THE COMPETITOR IDENTITY BELOW. DO NOT REUSE THE SAME LABELS FOR EVERY COMPETITOR.

FOCUS ON BUYER PSYCHOLOGY:
- What does the buyer fear?
- When are they vulnerable to switching?
- What operational risk should be inspected right now?
- What is the most expensive downside?

Competitor model:
${JSON.stringify(competitorModel, null, 2)}

Competitor identity:
${JSON.stringify(identity, null, 2)}

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
      "ae_action": "<what the AE should do next>",
      "buyer_question": "<the question to ask the buyer>",
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
        ae_action: claim.ae_action || fallback.key_claims[index]?.ae_action || "Use as a discovery prompt.",
        buyer_question: claim.buyer_question || fallback.key_claims[index]?.buyer_question || "What should the buyer verify next?",
      };
    }).filter((claim) => claim.claim && isEvidenceSafe(claim, sourceMap));

    const allEvidenceText = (input.sources || []).map((source) => `${source.title || ""} ${source.snippet || ""}`).join(" ");
    const safeSummary = hasUnsupportedSpecificity(parsed.summary || "", allEvidenceText)
      ? fallback.summary
      : parsed.summary || fallback.summary;

    // Apply enterprise tone to key textual outputs
    const toneSignals = (competitiveSignals.length ? competitiveSignals : fallback.competitive_signals).map((s) => ({
      ...s,
      so_what: enterpriseTone(s.so_what),
      signal: enterpriseTone(s.signal),
    }));
    const toneAngles = (attackAngles.length ? attackAngles : fallback.attack_angles).map((a) => ({
      ...a,
      when_to_use: enterpriseTone(a.when_to_use),
      what_to_say: enterpriseTone(a.what_to_say),
      close: enterpriseTone(a.close),
    }));
    const toneClaims = (keyClaims.length ? keyClaims : fallback.key_claims).map((c) => ({
      ...c,
      claim: enterpriseTone(c.claim),
      ae_action: enterpriseTone(c.ae_action),
      buyer_question: enterpriseTone(c.buyer_question),
    }));

    return {
      threat_level: parsed.threat_level || fallback.threat_level,
      summary: enterpriseTone(safeSummary),
      competitive_signals: toneSignals,
      attack_angles: toneAngles,
      key_claims: toneClaims,
    };
  } catch (error) {
    console.warn("Battlecard core fallback:", error?.message || error);
    return fallback;
  }
}
