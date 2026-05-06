import { computeConfidenceFromSources } from "./confidenceEngine";

// Classify and score signals, produce simple clusters
export function analyzeSignals(signals = {}, sources = []) {
  const sourceMap = Object.fromEntries((sources || []).map((s) => [s.id, s]));

  const flatten = Object.keys(signals || {}).flatMap((k) => (signals[k] || []).map((item) => ({ ...item, bucket: k })));

  const classified = flatten.map((sig) => {
    const conf = computeConfidenceFromSources(sig.source_ids || [], sourceMap);
    const strength = conf.label === "high" ? "strong" : conf.label === "medium" ? "medium" : "weak";
    return {
      id: sig.id || `an_${Math.random().toString(36).slice(2, 9)}`,
      bucket: sig.bucket,
      insight: sig.insight || sig.signal || sig.description || "",
      evidence_ids: sig.source_ids || sig.evidence_ids || [],
      evidence_snippets: sig.evidence || sig.evidence_snippets || [],
      confidence: conf,
      strength,
    };
  });

  // Simple clustering by normalized insight text (very small heuristic)
  const clusters = [];
  const seen = new Set();
  classified.forEach((c) => {
    if (seen.has(c.id)) return;
    const key = (c.insight || "").toLowerCase().split(/\W+/).slice(0, 6).join(" ");
    const group = classified.filter((other) => {
      const otherKey = (other.insight || "").toLowerCase().split(/\W+/).slice(0, 6).join(" ");
      return otherKey === key || (other.insight || "").toLowerCase().includes((c.insight || "").slice(0, 12).toLowerCase());
    });
    group.forEach((g) => seen.add(g.id));
    clusters.push({ id: `cl_${clusters.length + 1}`, key, items: group, size: group.length });
  });

  const summary = {
    total_signals: classified.length,
    by_bucket: Object.keys(signals || {}).reduce((acc, k) => ({ ...acc, [k]: (signals[k] || []).length }), {}),
    strong_count: classified.filter((c) => c.strength === "strong").length,
  };

  return { classified, clusters, summary };
}

export default analyzeSignals;
