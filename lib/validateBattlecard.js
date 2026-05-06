function isGenericText(text = "") {
  const lower = text.toLowerCase();
  return (
    lower.includes("good option") ||
    lower.includes("strong market position") ||
    lower.includes("competitive player") ||
    lower.includes("meaningful option")
  );
}

function wordCount(text = "") {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

export function validateBattlecard({ sources = [], signals = {}, core = {}, salesLayer = {} }) {
  const findings = [];
  const warnings = [];
  const flattenedSignals = Object.values(signals || {}).flatMap((bucket) => bucket || []);

  const pushFinding = (severity, message, code) => {
    findings.push({ severity, message, code });
    warnings.push(message);
  };

  if (sources.length < 3) pushFinding("warning", "Low-signal source set: fewer than 3 sources were retrieved.", "SOURCE_COUNT_LOW");
  if (!flattenedSignals.length) pushFinding("warning", "No extracted signals were produced from retrieval.", "NO_SIGNALS");
  if (!core.attack_angles?.length) pushFinding("critical", "Battlecard core is missing attack angles.", "NO_ATTACK_ANGLES");
  if (!core.competitive_signals?.length) pushFinding("critical", "Battlecard core is missing competitive signals.", "NO_COMPETITIVE_SIGNALS");

  const isDemoSourceSet = sources.length > 0 && sources.every((source) => source.provider === "demo");
  const recentSources = sources.filter((source) => source.freshness === "recent");
  const staleSources = sources.filter((source) => source.freshness === "stale");
  const unknownSources = sources.filter((source) => source.freshness === "unknown");
  if (!isDemoSourceSet && sources.length > 0 && !recentSources.length) {
    pushFinding("critical", "All retrieved sources look stale or undated.", "STALE_SOURCE_SET");
  } else if (!isDemoSourceSet && staleSources.length > 0) {
    pushFinding("warning", `${staleSources.length} source(s) appear stale and should be rechecked.`, "STALE_SOURCES_PRESENT");
  }
  if (!isDemoSourceSet && unknownSources.length > 0) {
    pushFinding("warning", `${unknownSources.length} source(s) are undated; retrieval date is not evidence freshness.`, "UNKNOWN_SOURCE_DATES");
  }
  if (isDemoSourceSet) {
    pushFinding("warning", "Demo mode uses curated sample evidence and is not freshness-scored.", "DEMO_NOT_FRESHNESS_SCORED");
  }

  sources.forEach((source, index) => {
    if (!source.title || !source.url || !(source.published_at || source.retrieved_at)) {
      pushFinding(
        "critical",
        `Source ${index + 1} is missing provenance fields (title, url, or retrieval date).`,
        "SOURCE_PROVENANCE_MISSING"
      );
    }
  });

  (core.key_claims || []).forEach((claim) => {
    if (!claim.evidence_ids?.length) {
      pushFinding("critical", `Claim "${claim.claim}" has no linked evidence.`, "CLAIM_WITHOUT_EVIDENCE");
    }
    if (!claim.evidence_snippets?.length) {
      pushFinding("warning", `Claim "${claim.claim}" has no evidence snippet attached.`, "CLAIM_WITHOUT_SNIPPET");
    }
  });

  const seenAngles = new Set();
  (core.attack_angles || []).forEach((angle) => {
    const normalized = (angle.angle || "").toLowerCase();
    if (seenAngles.has(normalized)) pushFinding("warning", `Duplicate attack angle detected: ${angle.angle}.`, "DUPLICATE_ATTACK_ANGLE");
    seenAngles.add(normalized);
    if (isGenericText(angle.what_to_say || "")) pushFinding("warning", `Generic attack angle language detected: ${angle.angle}.`, "GENERIC_ATTACK_LANGUAGE");
    if (wordCount(angle.what_to_say || "") > 12) pushFinding("warning", `Attack angle is too long: ${angle.angle}.`, "ATTACK_TOO_LONG");
    if (wordCount(angle.close || angle.closing_question || "") > 15) pushFinding("warning", `Close question is too long: ${angle.angle}.`, "CLOSE_TOO_LONG");
  });

  (core.competitive_signals || []).forEach((signal) => {
    if (wordCount(signal.signal || "") > 12) pushFinding("warning", `Competitive signal is too long: ${signal.signal}.`, "SIGNAL_TOO_LONG");
    if (!signal.evidence_ids?.length) pushFinding("critical", `Competitive signal "${signal.signal}" has no linked evidence.`, "SIGNAL_WITHOUT_EVIDENCE");
  });

  (core.key_claims || []).forEach((claim) => {
    if (wordCount(claim.claim || "") > 12) pushFinding("warning", `Claim is too long: ${claim.claim}.`, "CLAIM_TOO_LONG");
  });

  if (!salesLayer.how_to_win?.sequence?.length) {
    pushFinding("critical", "Deal strategy is missing a sequence.", "NO_STRATEGY_SEQUENCE");
  }

  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;

  return {
    status: criticalCount ? "critical" : warningCount ? "warn" : "ok",
    warnings,
    findings,
    summary: {
      critical: criticalCount,
      warning: warningCount,
      total: findings.length,
    },
  };
}
