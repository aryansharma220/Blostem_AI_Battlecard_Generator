function authorityWeight(authority) {
  if (authority === "high") return 1;
  if (authority === "medium") return 0.7;
  return 0.4;
}

function freshnessWeight(freshness) {
  if (freshness === "recent") return 1;
  if (freshness === "retrieved") return 0.65;
  if (freshness === "stale") return 0.55;
  return 0.35;
}

function sourceClassWeight(sourceClass) {
  const normalized = String(sourceClass || "").toLowerCase();
  
  // Hard-to-find signals are weighted heavily because they're harder to fake/manipulate
  if (normalized === "official_product") return 1;
  if (normalized === "compliance_operational") return 0.98;  // Uptime/incidents are operational truth - can't fake
  if (normalized === "employee_signals") return 0.88;  // GitHub, hiring, eng blogs - deliberate leaks, hard to fake
  if (normalized === "market_signals") return 0.8;  // Founder intent, interviews
  if (normalized === "ecosystem_signals") return 0.76;  // Partner/integration ecosystem
  if (normalized === "customer_sentiment") return 0.68;  // Reviews, Reddit
  if (normalized === "community_signals") return 0.55;  // Community forums
  
  return 0.5;
}

export function computeConfidenceFromSources(sourceIds = [], sourceMap = {}) {
  const linkedSources = (sourceIds || [])
    .map((id) => sourceMap[id])
    .filter(Boolean);

  if (!linkedSources.length) {
    return { label: "low", score: 0.2, linkedSources: [] };
  }

  const authorityAverage =
    linkedSources.reduce((sum, source) => sum + authorityWeight(source.authority), 0) /
    linkedSources.length;
  const freshnessAverage =
    linkedSources.reduce((sum, source) => sum + freshnessWeight(source.freshness), 0) /
    linkedSources.length;
  const sourceClassAverage =
    linkedSources.reduce((sum, source) => sum + sourceClassWeight(source.source_class), 0) /
    linkedSources.length;

  const multiSourceBonus = linkedSources.length >= 2 ? 0.2 : 0;
  const score = Math.min(1, authorityAverage * 0.36 + freshnessAverage * 0.26 + sourceClassAverage * 0.18 + multiSourceBonus);

  if (linkedSources.length >= 2 && freshnessAverage >= 0.8 && authorityAverage >= 0.7 && sourceClassAverage >= 0.65) {
    return { label: "high", score, linkedSources };
  }
  if (linkedSources.length >= 1 && score >= 0.45) {
    return { label: "medium", score, linkedSources };
  }
  return { label: "low", score, linkedSources };
}

export function summarizeSignalConfidence(signals = [], sourceMap = {}) {
  const scored = signals.map((signal) => ({
    id: signal.id,
    confidence: computeConfidenceFromSources(signal.source_ids || signal.evidence_ids || [], sourceMap),
  }));

  if (!scored.length) {
    return { label: "low", score: 0.2, scored };
  }

  const score =
    scored.reduce((sum, entry) => sum + entry.confidence.score, 0) / Math.max(scored.length, 1);

  if (score >= 0.75) return { label: "high", score, scored };
  if (score >= 0.45) return { label: "medium", score, scored };
  return { label: "low", score, scored };
}

export function buildEvidencePanel(sources = [], claims = [], validation = null) {
  const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source]));
  const claimConfidence = claims.map((claim) => {
    const conf = computeConfidenceFromSources(claim.evidence_ids || [], sourceMap);
    const tier = conf.label === 'high' ? 'Verified' : conf.label === 'medium' ? 'Inferred' : 'Hypothesis';
    return { claim_id: claim.id || null, claim: claim.claim || claim.text || '', confidence: conf, tier, evidence_ids: claim.evidence_ids || [] };
  });

  const averageScore = claimConfidence.length
    ? claimConfidence.reduce((sum, entry) => sum + entry.confidence.score, 0) / claimConfidence.length
    : 0;
  const freshnessCount = sources.filter((source) => source.freshness === "recent").length;
  const authorityCount = sources.filter((source) => source.authority === "high").length;
  const traceableClaims = claims.filter((claim) => (claim.evidence_ids || []).length > 0).length;
  const unsupportedClaims = Math.max(0, claims.length - traceableClaims);

  let confidenceReason = "Directional evidence only.";
  if (averageScore >= 0.75) {
    confidenceReason = "High confidence: multiple linked claims are supported by recent, authoritative sources.";
  } else if (averageScore >= 0.45) {
    confidenceReason = "Medium confidence: the strongest claims have evidence, but coverage is still partial.";
  }

  if (validation?.warnings?.length) {
    confidenceReason += ` Validation warnings: ${validation.warnings.length}.`;
  }

  // Map numeric score + validation state to the simplified taxonomy requested by product:
  // Verified — strong corroboration
  // Directional — partial evidence
  // Conflicted — evidence mismatch
  // Unsupported — weak evidence
  let evidence_label = "Unsupported";
  let evidence_meaning = "weak evidence";

  if (validation?.warnings?.length) {
    // If there are validation warnings, surface conflicted evidence when coverage is non-trivial
    if (averageScore >= 0.45) {
      evidence_label = "Conflicted";
      evidence_meaning = "evidence mismatch";
    } else {
      evidence_label = "Unsupported";
      evidence_meaning = "weak evidence";
    }
  } else {
    if (averageScore >= 0.75) {
      evidence_label = "Verified";
      evidence_meaning = "strong corroboration";
    } else if (averageScore >= 0.45) {
      evidence_label = "Directional";
      evidence_meaning = "partial evidence";
    } else {
      evidence_label = "Unsupported";
      evidence_meaning = "weak evidence";
    }
  }

  return {
    sources: sources.slice(0, 6).map((source) => ({
      id: source.id,
      label: `${source.title} • ${(source.type || "source").toUpperCase()} • ${(source.source_class || "uncategorized").toUpperCase()} • ${source.published_at || source.retrieved_at || "n.d."}`,
      title: source.title,
      url: source.url,
      date: source.published_at || source.retrieved_at,
      credibility: source.credibility_score,
      type: source.type,
      source_class: source.source_class,
      authority: source.authority,
      freshness: source.freshness,
    })),
    freshness: `${freshnessCount}/${sources.length} recent`,
    coverage: `${authorityCount} high-authority sources across ${new Set(sources.map((source) => source.type)).size} source types and ${new Set(sources.map((source) => source.source_class)).size} signal classes`,
    methodology: "Confidence is computed in code from linked evidence count, authority, and freshness.",
    confidence_reason: confidenceReason,
    external_use_label: evidence_label,
    external_use_meaning: evidence_meaning,
    external_use_policy: "Use externally only when the exact claim is supported by linked evidence. Directional sources should be phrased as buyer questions.",
    traceability: `${traceableClaims}/${claims.length} claims linked to evidence`,
    unsupported_claims: unsupportedClaims,
    validation_status: validation?.status || "ok",
    warning_count: validation?.warnings?.length || 0,
    claim_confidences: claimConfidence,
  };
}
