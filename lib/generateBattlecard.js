import { retrieveCompetitiveIntelligence } from "./retrieval";
import { extractSignals } from "./extractSignals";
import { buildCompetitorModel } from "./buildCompetitorModel";
import { generateBattlecardCore } from "./generateBattlecardCore";
import { generateSalesLayer, buildProcurementRiskDashboard } from "./generateSalesLayer";
import { validateBattlecard } from "./validateBattlecard";
import { buildEvidencePanel, summarizeSignalConfidence } from "./confidenceEngine";
import { analyzeSignals } from "./signalAnalyzer";
import { detectContradictions } from "./contradiction";
import { generateClaimTrace, citationsToMarkdown, formatCitation } from "./citations";
import { getDemoBlueprint } from "./demoData";
import { getLLMProvider } from "./llm";
import {
  cleanEvidenceText,
  evidenceIdsForText,
  evaluateClaimTrust,
  isBoilerplateEvidence,
  isLaunchSource,
  isReviewSource,
  trustGateItems,
} from "./trust";

function normalizeDealStage(dealStage = "discovery") {
  const normalized = String(dealStage || "").toLowerCase();
  if (normalized.includes("negoti")) return "negotiation";
  if (normalized.includes("contract") || normalized.includes("procure")) return "contract";
  if (normalized.includes("shortlist") || normalized.includes("eval")) return "shortlist";
  return "discovery";
}

function normalizeFeedbackSummary(feedbackSummary = null) {
  if (!feedbackSummary || typeof feedbackSummary !== "object") {
    return { total: 0, helpful: 0, stale: 0, wrong: 0, notes: [] };
  }
  return {
    total: Number(feedbackSummary.total || 0),
    helpful: Number(feedbackSummary.helpful || 0),
    stale: Number(feedbackSummary.stale || 0),
    wrong: Number(feedbackSummary.wrong || 0),
    notes: Array.isArray(feedbackSummary.notes) ? feedbackSummary.notes.filter(Boolean).slice(0, 3) : [],
  };
}

function buildRetrievalQuery(competitor, feedbackSummary = null, refreshToken = null) {
  const feedback = normalizeFeedbackSummary(feedbackSummary);
  const parts = [competitor, "pricing docs reviews launches positioning customer feedback"];
  if (refreshToken) {
    parts.push("latest", "current", new Date(refreshToken).getFullYear().toString());
  }
  if (feedback.stale > 0 || feedback.wrong > 0) {
    parts.push("verified", "recent", "official");
  }
  if (feedback.notes.length > 0) {
    parts.push(...feedback.notes.map((note) => String(note).split(/\s+/).slice(0, 4).join(" ")));
  }
  return parts.filter(Boolean).join(" ");
}

function inferMeta(competitor, model) {
  const key = (competitor || "").toLowerCase().replace(/\s+/g, "");
  const map = {
    razorpay: { category: "Payments Infrastructure (India)", primarySegment: "SMB -> Mid-Market", geography: "India" },
    paytm: { category: "Payments + Consumer Fintech", primarySegment: "Consumer + Merchant", geography: "India" },
    phonepe: { category: "UPI + Merchant Payments", primarySegment: "SMB -> Enterprise", geography: "India" },
  };
  const known = map[key] || { category: "Payments / Fintech", primarySegment: model?.target_segment || "SMB -> Mid-Market", geography: model?.geography || "India" };
  return known;
}

function flattenSignals(signals = {}) {
  return Object.values(signals).flatMap((bucket) => bucket || []);
}

function signalBucket(signals = {}, bucketName = "") {
  return Array.isArray(signals[bucketName]) ? signals[bucketName] : [];
}

function linkedTitles(ids = [], sourceMap = {}) {
  return (ids || [])
    .map((id) => sourceMap[id]?.title)
    .filter(Boolean);
}

function sourceMeta(source = {}) {
  const date = source.published_at || source.retrieved_at || "n.d.";
  return `${source.type || "source"} | ${date}`;
}

function isRubbishLaunchText(text = "") {
  const cleaned = cleanEvidenceText(text);
  if (!cleaned) return true;
  const tokens = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return true;
  const uniqueRatio = new Set(tokens).size / tokens.length;
  if (uniqueRatio < 0.55) return true;
  const noiseHits = tokens.filter((token) => ["menu", "icon", "logo", "hamburger", "arrow", "reply", "comment", "like"].includes(token)).length;
  return noiseHits >= 3;
}

function pickSignal(signals = {}, bucketName = "", fallbackBuckets = []) {
  const primary = signalBucket(signals, bucketName)[0];
  if (primary) return primary;
  for (const bucket of fallbackBuckets) {
    const found = signalBucket(signals, bucket)[0];
    if (found) return found;
  }
  return null;
}

function buildEvidenceLinkedClaims(core = {}, sources = [], sourceMap = {}) {
  return (core.key_claims || []).slice(0, 4).map((claim, index) => {
    const linked = (claim.evidence_ids || []).map((id) => sourceMap[id]).filter(Boolean);
    const confidence = claim.confidence || (linked.length >= 2 ? "high" : linked.length ? "medium" : "low");
    const trust = evaluateClaimTrust({
      text: claim.claim,
      evidenceIds: claim.evidence_ids || [],
      sourceMap,
    });
    return {
      id: claim.id || `claim_${index + 1}`,
      claim: claim.claim,
      confidence,
      status: trust.status,
      usage: trust.usage,
      trust_score: trust.score,
      trust_reasons: trust.reasons,
      ae_action: claim.ae_action || "Use as a discovery prompt.",
      buyer_question: claim.buyer_question || "What should the buyer verify next?",
      evidence_ids: claim.evidence_ids || [],
      evidence: linked.slice(0, 2).filter((source) => !isBoilerplateEvidence(source.snippet || source.title)).map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        meta: sourceMeta(source),
        snippet: cleanEvidenceText(source.snippet),
      })),
      ae_use: trust.usage === "say_as_claim"
        ? "Safe to use as a sourced claim."
        : trust.usage === "ask_as_question"
          ? "Use as a discovery question, not a hard claim."
          : "Keep internal until evidence is reviewed.",
    };
  });
}

function buildPricingPosture(competitor, signals = {}, sources = [], sourceMap = {}) {
  const pricingSignal = pickSignal(signals, "pricing_signals");
  const pricingSources = sources.filter((source) => source.type === "pricing");
  const sourceIds = pricingSignal?.source_ids?.length
    ? pricingSignal.source_ids
    : pricingSources.slice(0, 2).map((source) => source.id);
  const hasPricing = Boolean(pricingSignal || pricingSources.length);
  const sourceTitles = linkedTitles(sourceIds, sourceMap);

  return {
    summary: hasPricing
      ? `${competitor} has public pricing evidence, but enterprise discounting and blended cost behavior need verification.`
      : `No reliable pricing source was found for ${competitor} in this run.`,
    buyer_belief: hasPricing
      ? `${competitor} may feel commercially simple because entry pricing is visible.`
      : "Buyer may rely on brand familiarity instead of commercial proof.",
    blostem_attack: hasPricing
      ? "Move the conversation from sticker price to total cost predictability, transaction mix, refunds, payouts, and exceptions."
      : "Ask procurement which commercial assumptions must be proven before shortlist.",
    discovery_question: hasPricing
      ? "How does total cost change when transaction mix, refunds, payouts, and volume grow?"
      : "Which pricing assumption would create the biggest surprise after rollout?",
    confidence: sourceIds.length >= 2 ? "medium" : sourceIds.length ? "directional" : "low",
    evidence_ids: sourceIds,
    evidence_titles: sourceTitles,
  };
}

function buildRecentLaunches(competitor, signals = {}, recentMoves = [], sources = [], sourceMap = {}) {
  const usableMoves = (recentMoves || []).filter((move) => {
    if (/no verified/i.test(move.move || "")) return false;
    const source = sourceMap[move.source_id];
    return source && isLaunchSource(source) && !isRubbishLaunchText(move.move || source.title || source.snippet);
  });
  if (usableMoves.length) {
    return usableMoves.slice(0, 3).map((move) => ({
      move: cleanEvidenceText(move.move || ""),
      implication: cleanEvidenceText(move.implication || ""),
      date: move.date || "unknown",
      source_id: move.source_id,
      confidence: move.source_id ? "medium" : "directional",
      ae_move: "Verify the detail live, then use it to test roadmap relevance.",
    }));
  }

  const launchSource = sources.find(isLaunchSource);
  if (launchSource) {
    return [{
      move: cleanEvidenceText(launchSource.title || launchSource.snippet),
      implication: cleanEvidenceText(launchSource.snippet || launchSource.title || "Verify the launch detail before using it in a call."),
      date: launchSource.published_at || launchSource.retrieved_at || "unknown",
      source_id: launchSource.id,
      confidence: launchSource.freshness === "recent" ? "medium" : "directional",
      ae_move: "Use only after confirming the launch detail in the linked source.",
    }];
  }

  const productSignal = null;
  if (productSignal) {
    return [{
      move: productSignal.insight,
      implication: productSignal.evidence || "Treat this as product/GTM evidence, not a confirmed launch.",
      date: "not verified",
      source_id: productSignal.source_ids?.[0],
      confidence: "directional",
      ae_move: "Say this as a question, not a launch claim.",
    }];
  }

  return [{
    move: `No verified recent launch found for ${competitor}`,
    implication: "Do not claim freshness. Use this gap to ask what changed in the buyer's current vendor roadmap.",
    date: "unknown",
    source_id: null,
    confidence: "low",
    ae_move: "Ask: what recent product change from your current vendor actually matters?",
  }];
}

function buildCustomerSentiment(competitor, signals = {}, sources = [], sourceMap = {}) {
  const sentimentSignals = signalBucket(signals, "sentiment_signals").filter((signal) =>
    (signal.source_ids || []).some((id) => isReviewSource(sourceMap[id]))
  );
  const reviewSources = sources.filter(isReviewSource);
  const themes = sentimentSignals.slice(0, 3).map((signal) => ({
    theme: signal.insight,
    evidence: cleanEvidenceText(signal.evidence || linkedTitles(signal.source_ids, sourceMap).join(", ")),
    confidence: signal.source_ids?.length ? "directional" : "low",
    evidence_ids: signal.source_ids || [],
    ae_move: "Use as a buyer-experience question, not a hard competitive claim.",
  }));

  if (themes.length) return themes;

  if (reviewSources.length) {
    return reviewSources.slice(0, 3).map((source) => ({
      theme: `${competitor} review source should be treated as directional buyer sentiment.`,
      evidence: cleanEvidenceText(source.snippet || source.title),
      confidence: "directional",
      evidence_ids: [source.id],
      ae_move: "Ask whether the buyer has seen this experience internally.",
    }));
  }

  return [{
    theme: "No reliable customer sentiment theme was extracted.",
    evidence: "The current source set did not include usable review, forum, social, or complaint evidence.",
    confidence: "low",
    evidence_ids: [],
    ae_move: "Ask the prospect what support, settlement, or reconciliation pain they have actually experienced.",
  }];
}

function buildHiddenSignals(signalAnalysis = {}, sourceMap = {}) {
  const classified = signalAnalysis.uniqueSignals || signalAnalysis.classified || [];
  const clusters = signalAnalysis.clusters || [];
  const clusterLookup = new Map();

  clusters.slice(0, 3).forEach((cluster) => {
    const lead = cluster.representative || (cluster.items || [])[0];
    if (!lead) return;
    clusterLookup.set(lead.id, cluster);
  });

  return classified
    .filter((signal) => ["market", "employee", "community", "compliance_operational", "ecosystem"].includes(String(signal.confidence?.label || signal.bucket || "").toLowerCase()) || /hiring|reconciliation|settlement|uptime|partner|incident|migration|scale/.test(String(signal.insight || "").toLowerCase()))
    .slice(0, 4)
    .map((signal, index) => {
      const linked = (signal.evidence_ids || []).map((id) => sourceMap[id]).filter(Boolean);
      const cluster = clusterLookup.get(signal.id);
      return {
        id: `hidden_${index + 1}`,
        insight: signal.insight,
        implication: cluster?.theme ? `Merged theme: ${cluster.theme}` : `Directional clue from ${signal.bucket || "signal"} evidence.`,
        tactical_leverage: /hiring|employee/.test(String(signal.insight || "").toLowerCase())
          ? "Ask whether the team is building for scale or fixing a bottleneck."
          : /reconciliation|settlement|uptime|incident/.test(String(signal.insight || "").toLowerCase())
            ? "Use this to probe operational trust and proof of control."
            : "Use this to open a discovery question instead of a claim.",
        evidence_ids: signal.evidence_ids || [],
        source_classes: signal.source_classes || linked.map((item) => item.source_class).filter(Boolean),
      };
    });
}

function buildWhereTheyWin(core = {}, competitorModel = {}, sources = [], sourceMap = {}) {
  const strengths = Array.isArray(competitorModel.strengths) ? competitorModel.strengths : [];
  return strengths.slice(0, 3).map((strength, index) => {
    const evidenceIds = evidenceIdsForText(strength, sources, 1);
    const source = evidenceIds.length ? sourceMap[evidenceIds[0]] : null;
    const trust = evaluateClaimTrust({ text: strength, evidenceIds, sourceMap, usageHint: "claim" });
    return {
      point: strength,
      why_it_matters: "Respect this in the call before challenging the tradeoff.",
      evidence_ids: source?.id ? [source.id] : [],
      evidence_titles: source ? [source.title] : [],
      status: trust.status,
      usage: trust.usage,
      trust_score: trust.score,
    };
  }).filter((item) => item.status === "ready" || item.status === "use_as_question");
}

function buildWhereVulnerable(core = {}, competitorModel = {}, sourceMap = {}) {
  const weaknessAngles = (core.attack_angles || []).slice(0, 3);
  return weaknessAngles.map((angle) => ({
    point: angle.angle,
    why_it_matters: angle.when_to_use || "Use when the buyer is comparing real operating risk.",
    ae_question: angle.close || angle.closing_question || "What breaks first at scale?",
    evidence_ids: angle.evidence_ids || [],
    evidence_titles: linkedTitles(angle.evidence_ids || [], sourceMap),
    confidence: angle.confidence || "medium",
  }));
}

function buildBlostemWedge(battlecardDraft = {}, salesLayer = {}, pricingPosture = {}) {
  const comparison = salesLayer.compare_vs_us || {};
  return {
    headline: "Blostem wins by making the buyer compare evidence, not comfort.",
    wedge: pricingPosture.blostem_attack || "Move the deal from feature parity to proof-backed operating risk.",
    proof_motion: "Show the claim, name the confidence, then ask the operational question.",
    verification_cue: battlecardDraft.verification_sequence?.[0]?.verification_question || "Use the evidence, then verify the buyer's risk.",
    follow_up: battlecardDraft.verification_sequence?.[0]?.listen_for || battlecardDraft.how_to_win?.kill_question,
    where_we_win: comparison.where_we_win || [],
  };
}

function textForReviewItem(item = {}) {
  return item.claim || item.signal || item.angle || item.point || item.summary || "Unsupported claim";
}

function buildAELiveBrief({ battlecard = {}, trustReview = {}, contradictions = [], validation = {}, evidencePanel = {} }) {
  const evidenceClaims = battlecard.evidence_linked_claims || [];
  const ready = evidenceClaims
    .filter((claim) => claim.status === "ready" || claim.usage === "say_as_claim")
    .slice(0, 3)
    .map((claim) => ({
      claim: claim.claim,
      confidence: claim.confidence || "medium",
      use: "External claim",
      proof: claim.evidence?.[0]?.title || "Linked evidence",
      question: claim.buyer_question || "What should the buyer verify next?",
    }));

  const questions = evidenceClaims
    .filter((claim) => claim.status === "use_as_question" || claim.usage === "ask_as_question")
    .slice(0, 3)
    .map((claim) => ({
      claim: claim.claim,
      confidence: claim.confidence || "directional",
      use: "Ask, do not assert",
      proof: claim.evidence?.[0]?.title || "Directional evidence",
      question: claim.buyer_question || "Can the buyer validate this in their workflow?",
    }));

  const blocked = [
    ...(trustReview.blocked || []),
    ...(trustReview.needs_review || []),
  ].slice(0, 4).map((item) => ({
    claim: textForReviewItem(item),
    reason: (item.trust?.reasons || []).slice(0, 2).join(" ") || "Evidence does not support external use.",
    use: "Do not use externally",
  }));

  const contradiction = contradictions[0] ? {
    theme: contradictions[0].theme || "Evidence conflict",
    guidance: "Use this only as a verification path, not as a competitive accusation.",
    question: contradictions[0].buyer_question || "What proof would resolve this inconsistency for your team?",
  } : null;

  return {
    mode: "AE live mode",
    primary_use_policy: evidencePanel.external_use_label || "Use as buyer question",
    top_claims: ready,
    verification_questions: questions,
    do_not_use: blocked,
    contradiction,
    validation_status: validation.status || "ok",
  };
}

function sourceTier(source = {}) {
  const sourceClass = String(source.source_class || "").toLowerCase();
  const type = String(source.type || "").toLowerCase();
  const authority = String(source.authority || "").toLowerCase();
  if (["customer_sentiment", "community_signals"].includes(sourceClass) || ["reviews", "reddit", "forum"].includes(type)) {
    return { tier: "Tier 4", reason: "Unverified customer or community sentiment. Use only as a question." };
  }
  if (sourceClass === "compliance_operational") return { tier: "Tier 1", reason: "Regulatory, security, status, or operational evidence." };
  if (sourceClass === "official_product" || ["docs", "pricing", "company"].includes(type)) return { tier: "Tier 2", reason: "Official vendor-controlled product or commercial evidence." };
  if (["employee_signals", "market_signals", "ecosystem_signals"].includes(sourceClass)) return { tier: "Tier 3", reason: "Directional ecosystem, hiring, product, or market signal." };
  if (authority === "high") return { tier: "Tier 2", reason: "High-authority source, but claim context still needs review." };
  return { tier: "Tier 5", reason: "Weak or uncategorized evidence. Internal use only until reviewed." };
}

function buildSourceQualityReview(sources = []) {
  const reviewed = sources.map((source) => {
    const tier = sourceTier(source);
    return {
      id: source.id,
      title: source.title,
      url: source.url,
      type: source.type || "source",
      source_class: source.source_class || "uncategorized",
      authority: source.authority || "unknown",
      freshness: source.freshness || "unknown",
      tier: tier.tier,
      reason: tier.reason,
      external_use:
        tier.tier === "Tier 1" || tier.tier === "Tier 2"
          ? "Can support external claims if the claim wording matches."
          : tier.tier === "Tier 3" || tier.tier === "Tier 4"
            ? "Use as a discovery question, not an assertion."
            : "Keep internal until stronger evidence is found.",
    };
  });
  const counts = reviewed.reduce((acc, item) => {
    acc[item.tier] = (acc[item.tier] || 0) + 1;
    return acc;
  }, {});
  const hardToGoogleCount = reviewed.filter((item) =>
    ["employee_signals", "customer_sentiment", "community_signals", "compliance_operational", "ecosystem_signals"].includes(item.source_class)
  ).length;

  return {
    counts,
    hard_to_google_count: hardToGoogleCount,
    best_sources: reviewed
      .slice()
      .sort((a, b) => String(a.tier).localeCompare(String(b.tier)))
      .slice(0, 5),
    weak_sources: reviewed.filter((item) => item.tier === "Tier 5").slice(0, 3),
    summary: `${reviewed.length} sources reviewed; ${hardToGoogleCount} directional or operational signals beyond vendor pages.`,
  };
}

function buildExecutiveDecisionBrief({ battlecard = {}, contradictions = [], sourceQuality = {}, procurementRisk = {} }) {
  const readyClaim = battlecard.evidence_linked_claims?.find((claim) => claim.status === "ready" || claim.usage === "say_as_claim");
  const questionClaim = battlecard.evidence_linked_claims?.find((claim) => claim.status === "use_as_question" || claim.usage === "ask_as_question");
  const blockedClaim = battlecard.ae_live_brief?.do_not_use?.[0] || battlecard.trust_review?.blocked?.[0];
  const vulnerability = battlecard.where_vulnerable?.[0];
  const competitorWin = battlecard.where_they_win?.[0];
  const source = sourceQuality.best_sources?.[0];

  return {
    we_win: vulnerability?.point || battlecard.attack_angles?.[0]?.angle || "Evidence-first comparison discipline",
    they_win: competitorWin?.point || battlecard.ae_quick_verdict?.summary || "Brand familiarity and existing buyer comfort",
    use_safely: readyClaim?.claim || "Use only evidence-linked claims where wording matches the source.",
    ask_do_not_assert: contradictions[0]?.buyer_question || questionClaim?.buyer_question || questionClaim?.claim || "Convert weak signals into buyer verification questions.",
    do_not_claim: blockedClaim?.claim || "Do not state unverified security, outage, customer, or pricing claims.",
    procurement_focus: procurementRisk.procurement_question || "Which risk area would trigger serious vendor review?",
    proof_to_open: source ? `${source.tier}: ${source.title}` : sourceQuality.summary || "No high-quality source selected.",
    contradiction_to_show: contradictions[0]
      ? {
          theme: contradictions[0].theme,
          official: contradictions[0].authoritative?.title || "Official source",
          directional: contradictions[0].contradicting?.title || "Directional source",
          guidance: contradictions[0].buyer_question || contradictions[0].uncertainty_marker,
        }
      : null,
  };
}

function buildPipelineSteps(metrics = {}) {
  return [
    { label: "Retrieve", detail: `${metrics.source_count || 0} sources from ${metrics.provider_used || "retrieval"}` },
    { label: "Extract", detail: `${metrics.signal_count || 0} pricing/product/sentiment signals` },
    {
      label: "Reason",
      detail: metrics.llm_configured
        ? `Live ${metrics.llm_provider || "LLM"} synthesis`
        : "Heuristic fallback because no LLM key is configured",
    },
    { label: "Validate", detail: `${metrics.validation_status || "review"} evidence status` },
  ];
}

function buildSafeFallbackCore(core = {}, sources = []) {
  const source = sources.find((item) => !isBoilerplateEvidence(item.snippet || item.title)) || sources[0];
  const evidenceIds = source?.id ? [source.id] : [];
  return {
    ...core,
    threat_level: core.threat_level || "MEDIUM",
    summary: core.summary && !/^insufficient/i.test(core.summary)
      ? core.summary
      : "Evidence is directional. Use discovery before making claims.",
    competitive_signals: [{
      id: "safe_signal_1",
      signal: source
        ? `${source.title} provides directional competitive evidence.`
        : "No source-backed competitive signal is ready.",
      so_what: "Use this as a discovery prompt, not a hard claim.",
      confidence: "low",
      evidence_ids: evidenceIds,
      evidence_snippets: source ? [cleanEvidenceText(source.snippet || source.title)] : [],
      status: evidenceIds.length ? "use_as_question" : "blocked",
      usage: evidenceIds.length ? "ask_as_question" : "internal_only",
      trust_score: evidenceIds.length ? 45 : 0,
    }],
    attack_angles: [{
      angle: "Evidence-first discovery",
      when_to_use: "When the source set is weak, stale, or incomplete.",
      what_to_say: "I would verify this before treating it as a claim.",
      close: "Which current vendor assumption should we prove first?",
      evidence_ids: evidenceIds,
      confidence: "low",
      status: evidenceIds.length ? "use_as_question" : "blocked",
      usage: evidenceIds.length ? "ask_as_question" : "internal_only",
      trust_score: evidenceIds.length ? 45 : 0,
    }],
    key_claims: [{
      id: "safe_claim_1",
      claim: source
        ? `${source.title} is usable as directional evidence.`
        : "No claim is ready without stronger evidence.",
      evidence_ids: evidenceIds,
      evidence_snippets: source ? [cleanEvidenceText(source.snippet || source.title)] : [],
      confidence: "low",
      status: evidenceIds.length ? "use_as_question" : "blocked",
      usage: evidenceIds.length ? "ask_as_question" : "internal_only",
      trust_score: evidenceIds.length ? 45 : 0,
    }],
  };
}

function applyTrustGate(core = {}, sources = []) {
  const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source]));
  const signalGate = trustGateItems(
    core.competitive_signals || [],
    sourceMap,
    (item) => `${item.signal || ""} ${item.so_what || ""}`,
    (item) => item.evidence_ids || [],
    "claim"
  );
  const angleGate = trustGateItems(
    core.attack_angles || [],
    sourceMap,
    (item) => `${item.angle || ""} ${item.what_to_say || ""} ${item.close || ""}`,
    (item) => item.evidence_ids || [],
    "question"
  );
  const claimGate = trustGateItems(
    core.key_claims || [],
    sourceMap,
    (item) => item.claim || "",
    (item) => item.evidence_ids || [],
    "claim"
  );

  const trusted = {
    ...core,
    competitive_signals: signalGate.ready.slice(0, 4),
    attack_angles: angleGate.ready.slice(0, 3),
    key_claims: claimGate.ready.slice(0, 4),
  };

  const safeCore = (trusted.competitive_signals.length && trusted.attack_angles.length && trusted.key_claims.length)
    ? trusted
    : buildSafeFallbackCore(trusted, sources);

  return {
    core: safeCore,
    trust_review: {
      needs_review: [...signalGate.review, ...angleGate.review, ...claimGate.review],
      blocked: [...signalGate.blocked, ...angleGate.blocked, ...claimGate.blocked],
      ready_count: signalGate.ready.length + angleGate.ready.length + claimGate.ready.length,
      blocked_count: signalGate.blocked.length + angleGate.blocked.length + claimGate.blocked.length,
    },
  };
}

function buildClaimTraces(claims = [], sources = [], competitor) {
  const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source]));
  return claims.map((claim) => {
    const linkedSources = (claim.evidence_ids || []).map((id) => sourceMap[id]).filter(Boolean);
    const primarySource = linkedSources[0] || sourceMap[claim.evidence_ids?.[0]] || sources[0] || { url: "", snippet: claim.evidence_snippets?.[0] || claim.claim };
    const numericConfidence =
      claim.confidence === "high" ? 0.9 : claim.confidence === "medium" ? 0.65 : 0.35;
    const trace = generateClaimTrace(claim.claim, primarySource, numericConfidence, competitor, linkedSources.slice(1));
    return {
      ...trace,
      source_ids: claim.evidence_ids || trace.source_ids || [],
      source_title: primarySource?.title || "Source",
      source_date: primarySource?.published_at
        ? new Date(primarySource.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : primarySource?.retrieved_at
          ? `retrieved ${new Date(primarySource.retrieved_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
          : "n.d.",
      source_type: primarySource?.type ? primarySource.type.toUpperCase() : "ARTICLE",
      source_url: primarySource?.url,
      linked_source_count: linkedSources.length || (claim.evidence_ids || []).length,
      ae_action: claim.ae_action || trace.ae_action || "Use as a discovery prompt.",
      buyer_question: claim.buyer_question || trace.buyer_question || "What should the buyer verify next?",
    };
  });
}

function pickEvidenceIdsByType(sources = [], sourceType = null, limit = 2) {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  if (!sourceType) return sources.slice(0, limit).map((item) => item.id).filter(Boolean);
  const matched = sources.filter((item) => String(item.type || "").toLowerCase() === String(sourceType).toLowerCase());
  const fallback = matched.length ? matched : sources;
  return fallback.slice(0, limit).map((item) => item.id).filter(Boolean);
}

function hydrateEvidenceSnippets(items = [], sourceMap = {}) {
  return items.map((item) => {
    const snippets = (item.evidence_ids || [])
      .map((id) => sourceMap[id]?.snippet || sourceMap[id]?.title)
      .filter(Boolean)
      .slice(0, 2);
    return {
      ...item,
      evidence_snippets: item.evidence_snippets?.length ? item.evidence_snippets : snippets,
    };
  });
}

function applyDemoCoreGuardrails(core, blueprint, sources) {
  if (!blueprint) return core;

  const competitiveSignals = (blueprint.competitive_signals || []).map((signal, index) => ({
    signal: signal.signal,
    so_what: signal.so_what,
    confidence: "medium",
    evidence_ids: pickEvidenceIdsByType(sources, signal.source_type, 2),
    evidence_snippets: [],
    type: "validated",
    priority: index + 1,
  }));

  const attackAngles = (blueprint.attack_angles || []).map((angle, index) => ({
    angle: angle.angle,
    when_to_use: angle.when_to_use,
    what_to_say: angle.what_to_say,
    close: angle.close,
    confidence: "medium",
    evidence_ids: pickEvidenceIdsByType(sources, angle.source_type, 2),
    evidence_snippets: [],
    priority: index + 1,
  }));

  const keyClaims = (blueprint.approved_claims || []).map((claimText, index) => ({
    claim: claimText,
    confidence: "medium",
    evidence_ids: pickEvidenceIdsByType(sources, index % 2 === 0 ? "docs" : "pricing", 2),
    evidence_snippets: [],
  }));

  return {
    ...core,
    threat_level: blueprint.threat_level || core.threat_level,
    summary: blueprint.summary || core.summary,
    competitive_signals: competitiveSignals.length ? hydrateEvidenceSnippets(competitiveSignals, Object.fromEntries(sources.map((source) => [source.id, source]))) : core.competitive_signals,
    attack_angles: attackAngles.length ? hydrateEvidenceSnippets(attackAngles, Object.fromEntries(sources.map((source) => [source.id, source]))) : core.attack_angles,
    key_claims: keyClaims.length ? hydrateEvidenceSnippets(keyClaims, Object.fromEntries(sources.map((source) => [source.id, source]))) : core.key_claims,
  };
}

function applyValidationToSalesLayer(salesLayer, validation) {
  const status = (validation?.status || "ok").toLowerCase();
  const actionableFindings = (validation?.findings || []).filter((finding) => finding.code !== "DEMO_NOT_FRESHNESS_SCORED");
  const effectiveStatus = actionableFindings.some((finding) => finding.severity === "critical") ? "critical" : "ok";
  const needsDowngrade = effectiveStatus === "critical";
  const soften = (text = "") => {
    const cleaned = String(text || "").replace(/^\((Unverified\/Critical|Preliminary)\)\s*/i, "");
    return cleaned;
  };

  return {
    ...salesLayer,
    evidence_cards: (salesLayer.evidence_cards || []).map((item) => ({
      ...item,
      buyer_question: needsDowngrade ? "I would verify the evidence before using that as a claim." : soften(item.buyer_question),
      downgraded: needsDowngrade,
      usage: needsDowngrade ? "ask_as_question" : "say_as_claim",
    })),
    verification_sequence: (salesLayer.verification_sequence || []).map((item) => ({
      ...item,
      verification_question: needsDowngrade ? "Use this as a question, not a hard claim." : soften(item.verification_question),
      listen_for: soften(item.listen_for),
      downgraded: needsDowngrade,
      usage: needsDowngrade ? "ask_as_question" : "say_as_claim",
    })),
    how_to_win: {
      ...(salesLayer.how_to_win || {}),
      win_by: soften(salesLayer.how_to_win?.win_by || ""),
    },
  };
}

function applyDemoSalesGuardrails(salesLayer, blueprint) {
  if (!blueprint?.stage_profile) return salesLayer;
  return {
    ...salesLayer,
    how_to_win: {
      ...(salesLayer.how_to_win || {}),
      enter_when: blueprint.stage_profile.enter_when || salesLayer?.how_to_win?.enter_when,
      win_by: blueprint.stage_profile.win_by || salesLayer?.how_to_win?.win_by,
      kill_question: blueprint.stage_profile.kill_question || salesLayer?.how_to_win?.kill_question,
    },
  };
}

function buildWorkflowOutputs({ competitor, battlecard, pipeline, dealStage }) {
  const topSignal = battlecard.competitive_signals?.[0];
  const topTrace = pipeline.claim_traces?.[0];
  const stageLabel = dealStage.charAt(0).toUpperCase() + dealStage.slice(1);
  return {
    stage: dealStage,
    slack_snippet: [
      `*${competitor}* — ${stageLabel}`,
      battlecard.ae_quick_verdict?.summary || "No summary available.",
      topSignal ? `Signal: ${topSignal.signal}` : null,
      topTrace ? `Evidence: ${topTrace.source_title} (${topTrace.source_meta})` : null,
    ].filter(Boolean).join("\n"),
    crm_note: [
      `Competitor: ${competitor}`,
      `Stage: ${stageLabel}`,
      `Threat: ${battlecard.ae_quick_verdict?.threat_level || "MEDIUM"}`,
      `Primary angle: ${battlecard.attack_angles?.[0]?.angle || "Unclear"}`,
      topTrace ? `Claim trace: ${topTrace.claim} -> ${topTrace.source_title}` : null,
    ].filter(Boolean).join(" | "),
    share_note: `${competitor} | ${stageLabel} | ${battlecard.ae_quick_verdict?.threat_level || "MEDIUM"} | ${battlecard.ae_quick_verdict?.summary || "No summary available."}`,
  };
}

function threatLevelScore(level) {
  if (level === "HIGH") return 82;
  if (level === "MEDIUM") return 58;
  return 34;
}

function buildDealRisk(core, validation, signals) {
  const signalCount = core.competitive_signals.length || flattenSignals(signals).length;
  const warningCount = validation.warnings.length;
  const score = Math.max(22, Math.min(95, threatLevelScore(core.threat_level) + signalCount * 2 - warningCount * 3));
  const level = score >= 72 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
  return {
    score,
    level,
    why: `${signalCount} surfaced signals with ${warningCount} validation warnings.`,
    risk_moment: level === "HIGH" ? "Early-stage deals where comfort and familiarity dominate." : "Mid-funnel comparison moments.",
    mitigate: level === "HIGH" ? "Lead with proof-backed contrast before the buyer defaults to familiarity." : "Use one sharp angle and verify the true switch trigger.",
    play: level === "HIGH" ? "Anchor on long-term cost and workflow risk." : "Frame the next decision around the most expensive downside.",
    rationale: `${signalCount} signals and ${warningCount} warnings shape the current risk posture.`,
    action: level === "HIGH" ? "Run the strongest angle early and force the buyer into a proof-based comparison." : "Use one strong angle, then confirm timing.",
  };
}

function buildVerdict(core, meta, confidenceSummary) {
  return {
    threat_level: core.threat_level,
    confidence: `${Math.round(confidenceSummary.score * 100)}%`,
    summary: core.summary,
    win_strategy: core.attack_angles.slice(0, 3).map((angle) => angle.angle),
    avoid: ["Do not rely on generic feature parity.", "Do not compete on brand familiarity alone."],
    best_use_case: meta.primarySegment,
    primary_weakness: core.attack_angles[0]?.angle || "Differentiation is still thin",
    closing_move: core.attack_angles[0]?.close || "What makes the current setup risky to keep?",
  };
}

function buildMarkdown({ competitor, battlecard, pipeline }) {
  const sourceMap = Object.fromEntries((pipeline.sources || []).map((source) => [source.id, source]));
  const cite = (ids = []) => ids
    .map((id) => sourceMap[id])
    .filter(Boolean)
    .map((source) => `${source.title}, ${source.published_at ? `published ${source.published_at}` : `retrieved ${new Date(source.retrieved_at).toLocaleDateString("en-US")}`}`)
    .join("; ");
  let markdown = "";
  markdown += `# ${competitor} - Trustable Competitive Battlecard\n\n`;
  markdown += `Category: ${battlecard.category}\n`;
  markdown += `Primary Segment: ${battlecard.primary_segment}\n`;
  markdown += `Geography: ${battlecard.geography}\n\n`;
  markdown += `Deal Stage: ${battlecard.deal_stage || "discovery"}\n`;
  markdown += `Threat Level: ${battlecard.ae_quick_verdict.threat_level}\n`;
  markdown += `Confidence: ${battlecard.ae_quick_verdict.confidence}\n`;
  markdown += `Pipeline: ${pipeline.metrics.source_count} sources, ${pipeline.metrics.signal_count} signals, validation ${pipeline.validation.status}\n\n`;

  markdown += `## AE Quick Verdict\n${battlecard.ae_quick_verdict.summary}\n\n`;

  markdown += `## Competitive Signals\n`;
  battlecard.competitive_signals.forEach((signal, index) => {
    markdown += `**${index + 1}. ${signal.signal}**\n`;
    markdown += `${signal.so_what}\n`;
    markdown += `Confidence: ${signal.confidence}\n`;
    markdown += `Source: ${cite(signal.evidence_ids) || "No verified source linked"}\n\n`;
  });

  markdown += `## Verification Angles\n`;
  battlecard.attack_angles.forEach((angle, index) => {
    markdown += `**${index + 1}. ${angle.angle}**\n`;
    markdown += `When to use: ${angle.when_to_use}\n`;
    markdown += `Verify: "${angle.what_to_say}"\n`;
    markdown += `Buyer question: "${angle.close || angle.closing_question}"\n`;
    markdown += `Source: ${cite(angle.evidence_ids) || "No verified source linked"}\n\n`;
  });

  markdown += `## Buyer Verification Cues\n`;
  (battlecard.evidence_cards || []).forEach((item) => {
    markdown += `**Cue:** ${item.claim || "Buyer concern"}\n`;
    markdown += `**Question:** ${item.buyer_question || item.ae_action || "Verify with buyer evidence."}\n\n`;
  });

  markdown += `## How to Win This Deal\n`;
  markdown += `DO NOT: ${battlecard.how_to_win.do_not}\n`;
  markdown += `ENTER WHEN: ${battlecard.how_to_win.enter_when}\n`;
  markdown += `WIN BY: ${battlecard.how_to_win.win_by}\n`;
  markdown += `KILL QUESTION: "${battlecard.how_to_win.kill_question}"\n\n`;

  markdown += `## Validation\n`;
  markdown += `Status: ${pipeline.validation.status}\n`;
  if (pipeline.validation.summary) {
    markdown += `Summary: ${pipeline.validation.summary.critical || 0} critical, ${pipeline.validation.summary.warning || 0} warning, ${pipeline.validation.summary.total || 0} total\n`;
  }
  (pipeline.validation.warnings || []).forEach((warning) => {
    markdown += `- ${warning}\n`;
  });
  markdown += `\n`;
  if (battlecard.ae_live_brief?.do_not_use?.length) {
    markdown += `## Do Not Use Externally\n`;
    battlecard.ae_live_brief.do_not_use.forEach((item) => {
      markdown += `- ${item.claim}: ${item.reason}\n`;
    });
    markdown += `\n`;
  }
  markdown += citationsToMarkdown(pipeline.claim_traces || []);

  markdown += `## Sources\n`;
  pipeline.sources.forEach((source, index) => {
    markdown += `${formatCitation(source, index + 1)}\n`;
  });

  return markdown;
}

export async function generateBattlecard(competitor, options = {}) {
  const dealStage = normalizeDealStage(options.dealStage);
  const feedbackSummary = normalizeFeedbackSummary(options.feedbackSummary);
  const query = buildRetrievalQuery(competitor, feedbackSummary, options.refreshToken);
  const retrieval = await retrieveCompetitiveIntelligence(competitor, query, { mode: options.retrievalMode });
  const retrievalMode = retrieval.retrieval_mode || options.retrievalMode || "live";
  const skipLLM = Boolean(options.skipLLM);
  const sources = retrieval.sources;
  const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source]));

  const signals = await extractSignals(competitor, sources, { skipLLM });
  const analyzed = analyzeSignals(signals, sources);
  const competitorModel = await buildCompetitorModel(competitor, signals, { skipLLM });
  const coreModelOutput = await generateBattlecardCore({ competitor, competitorModel, signals, sources, feedbackSummary, skipLLM });
  const contradictions = detectContradictions(sources, flattenSignals(signals));
  const demoBlueprint = retrievalMode === "demo" ? getDemoBlueprint(competitor, dealStage) : null;
  const shouldUseDemoGuardrails = retrievalMode === "demo" && (skipLLM || !getLLMProvider().configured);
  const rawCore = shouldUseDemoGuardrails
    ? applyDemoCoreGuardrails(coreModelOutput, demoBlueprint, sources)
    : coreModelOutput;
  const trustGate = applyTrustGate(rawCore, sources);
  const core = trustGate.core;

  // NEW: Build procurement risk dashboard from signals
  const riskDash = buildProcurementRiskDashboard(Object.values(signals), sources);

  const salesLayerModelOutput = await generateSalesLayer({ competitor, competitorModel, core, sources, validation: { status: "ok", warnings: [] }, dealStage, skipLLM, riskDash });
  const rawSalesLayer = shouldUseDemoGuardrails
    ? applyDemoSalesGuardrails(salesLayerModelOutput, demoBlueprint)
    : salesLayerModelOutput;

  const validation = validateBattlecard({ sources, signals, core, salesLayer: rawSalesLayer });
  const salesLayer = applyValidationToSalesLayer(rawSalesLayer, validation);
  const confidenceSummary = summarizeSignalConfidence(core.competitive_signals, sourceMap);
  const claimTraces = buildClaimTraces(core.key_claims, sources, competitor);
  const signalAnalysis = analyzed || { classified: [], clusters: [], summary: {} };
  const uniqueSignals = signalAnalysis.uniqueSignals || signalAnalysis.classified || [];
  const meta = inferMeta(competitor, competitorModel);
  const validationSummary = validation.summary || { critical: 0, warning: validation.warnings.length, total: validation.warnings.length };

  const pricingPosture = buildPricingPosture(competitor, signals, sources, sourceMap);
  const recentLaunches = buildRecentLaunches(competitor, signals, rawSalesLayer.recent_moves, sources, sourceMap);
  const customerSentiment = buildCustomerSentiment(competitor, signals, sources, sourceMap);

  const battlecard = {
    category: meta.category,
    primary_segment: meta.primarySegment,
    geography: meta.geography,
    deal_stage: dealStage,
    summary: core.summary,
    threat_level: core.threat_level,
    ae_quick_verdict: buildVerdict(core, meta, confidenceSummary),
    competitive_signals: core.competitive_signals,
    attack_angles: core.attack_angles.map((angle) => ({
      ...angle,
      closing_question: angle.close,
      proof: (angle.evidence_ids || []).map((id) => sourceMap[id]?.title).filter(Boolean).join(", "),
    })),
    key_claims: core.key_claims,
    how_to_win: salesLayer.how_to_win,
    compare_vs_us: salesLayer.compare_vs_us,
    procurement_risk_dashboard: salesLayer.procurement_risk_dashboard,
    discovery_angles: salesLayer.discovery_angles,
    procurement_conversation_sequence: salesLayer.procurement_conversation_sequence,
    evidence_cards: salesLayer.evidence_cards,
    verification_sequence: salesLayer.verification_sequence,
    workflow_outputs: buildWorkflowOutputs({ competitor, battlecard: { ...core, ae_quick_verdict: buildVerdict(core, meta, confidenceSummary), competitive_signals: core.competitive_signals, attack_angles: core.attack_angles }, pipeline: { claim_traces: claimTraces }, dealStage }),
    deal_risk: buildDealRisk(core, validation, signals),
    market_reality: salesLayer.market_reality,
    recent_moves: salesLayer.recent_moves,
    india_context: salesLayer.india_context,
    evidence_panel: buildEvidencePanel(sources, core.key_claims, validation),
    validation_summary: validationSummary,
    feedback_summary: feedbackSummary,
    demo_guardrails: retrievalMode === "demo" ? {
      enabled: shouldUseDemoGuardrails,
      retrieval_seeded: true,
      llm_synthesis_live: !skipLLM && getLLMProvider().configured,
      approved_claims_count: (demoBlueprint?.approved_claims || []).length,
      stage_profile_applied: shouldUseDemoGuardrails && Boolean(demoBlueprint?.stage_profile),
    } : { enabled: false },
    validation,
    trust_review: trustGate.trust_review,
  };

  battlecard.evidence_linked_claims = buildEvidenceLinkedClaims(core, sources, sourceMap);
  battlecard.where_they_win = buildWhereTheyWin(core, competitorModel, sources, sourceMap);
  battlecard.where_vulnerable = buildWhereVulnerable(core, competitorModel, sourceMap);
  battlecard.pricing_posture = pricingPosture;
  battlecard.recent_launches = recentLaunches;
  battlecard.customer_sentiment = customerSentiment;
  battlecard.hidden_signals = buildHiddenSignals(signalAnalysis, sourceMap);
  battlecard.blostem_wedge = buildBlostemWedge(battlecard, salesLayer, pricingPosture);
  battlecard.ae_live_brief = buildAELiveBrief({
    battlecard,
    trustReview: trustGate.trust_review,
    contradictions,
    validation,
    evidencePanel: battlecard.evidence_panel,
  });
  battlecard.source_quality_review = buildSourceQualityReview(sources);
  battlecard.executive_decision_brief = buildExecutiveDecisionBrief({
    battlecard,
    contradictions,
    sourceQuality: battlecard.source_quality_review,
    procurementRisk: battlecard.procurement_risk_dashboard,
  });

  const signalCounts = Object.fromEntries(
    Object.entries(signals).map(([key, bucket]) => [key, bucket.length])
  );
  const sourceTypeBreakdown = sources.reduce((acc, source) => {
    acc[source.type] = (acc[source.type] || 0) + 1;
    return acc;
  }, {});
  const sourceClassBreakdown = sources.reduce((acc, source) => {
    const key = source.source_class || "uncategorized";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const pipeline = {
    sources,
    signals,
    competitor_model: competitorModel,
    claim_traces: claimTraces,
    deal_stage: dealStage,
    feedback_summary: feedbackSummary,
    validation,
    trust_review: trustGate.trust_review,
    contradictions: contradictions || [],
    signal_analysis: signalAnalysis,
    source_quality_review: battlecard.source_quality_review,
    unique_signal_count: uniqueSignals.length,
    metrics: {
      source_count: sources.length,
      signal_count: flattenSignals(signals).length,
      unique_signal_count: uniqueSignals.length,
      signal_breakdown: signalCounts,
      source_type_breakdown: sourceTypeBreakdown,
      source_class_breakdown: sourceClassBreakdown,
      provider_used: retrieval.provider_used,
      providers_used: retrieval.providers_used,
      llm_provider: getLLMProvider().provider,
      llm_model: getLLMProvider().model,
      llm_configured: getLLMProvider().configured,
      fallback_used: retrieval.fallback_used,
      retrieval_mode: retrievalMode,
      elapsed_ms: 0,
    },
  };
  pipeline.metrics.validation_status = validation.status;
  pipeline.steps = buildPipelineSteps(pipeline.metrics);

  console.log("Pipeline:", {
    competitor,
    provider: pipeline.metrics.provider_used,
    sources: pipeline.metrics.source_count,
    signals: pipeline.metrics.signal_count,
    validation: pipeline.validation.status,
    fallback_used: pipeline.metrics.fallback_used,
  });

  const markdown = buildMarkdown({ competitor, battlecard, pipeline });

  return {
    competitor,
    pipeline,
    battlecard,
    markdown,
  };
}
