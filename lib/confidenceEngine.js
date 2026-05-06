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

  const multiSourceBonus = linkedSources.length >= 2 ? 0.2 : 0;
  const score = Math.min(1, authorityAverage * 0.45 + freshnessAverage * 0.35 + multiSourceBonus);

  if (linkedSources.length >= 2 && freshnessAverage >= 0.8 && authorityAverage >= 0.7) {
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

  return {
    sources: sources.slice(0, 6).map((source) => ({
      id: source.id,
      label: `${source.title} • ${(source.type || "source").toUpperCase()} • ${source.published_at || source.retrieved_at || "n.d."}`,
      title: source.title,
      url: source.url,
      date: source.published_at || source.retrieved_at,
      credibility: source.credibility_score,
      type: source.type,
      authority: source.authority,
      freshness: source.freshness,
    })),
    freshness: `${freshnessCount}/${sources.length} recent`,
    coverage: `${authorityCount} high-authority sources across ${new Set(sources.map((source) => source.type)).size} source types`,
    methodology: "Confidence is computed in code from linked evidence count, authority, and freshness.",
    confidence_reason: confidenceReason,
    traceability: `${traceableClaims}/${claims.length} claims linked to evidence`,
    unsupported_claims: unsupportedClaims,
    validation_status: validation?.status || "ok",
    warning_count: validation?.warnings?.length || 0,
    claim_confidences: claimConfidence,
  };
}
