import { computeConfidenceFromSources } from "./confidenceEngine";

// Classify and score signals, produce simple clusters
export function analyzeSignals(signals = {}, sources = []) {
  const sourceMap = Object.fromEntries((sources || []).map((s) => [s.id, s]));

  const flatten = Object.keys(signals || {}).flatMap((k) => (signals[k] || []).map((item) => ({ ...item, bucket: k })));

  function normalizeInsight(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9%\s]/g, " ")
      .replace(/\b(razorpay|paytm|phonepe|their|they|this|that|the|a|an|to|of|and|for|with|from)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fingerprint(signal = {}) {
    const text = normalizeInsight(signal.insight || signal.signal || signal.description || "");
    const tokens = text.split(" ").filter((token) => token.length >= 4).slice(0, 6);
    return tokens.join(" ").trim();
  }

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

  const grouped = new Map();
  classified.forEach((signal) => {
    const key = fingerprint(signal) || signal.id;
    const existing = grouped.get(key) || [];
    existing.push(signal);
    grouped.set(key, existing);
  });

  const clusters = [];
  const uniqueSignals = [];
  [...grouped.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([key, group]) => {
      const sortedGroup = [...group].sort((a, b) => {
        const sourceA = a.confidence?.score || 0;
        const sourceB = b.confidence?.score || 0;
        return sourceB - sourceA;
      });
      const representative = sortedGroup[0];
      const bucketCounts = sortedGroup.reduce((acc, item) => {
        acc[item.bucket] = (acc[item.bucket] || 0) + 1;
        return acc;
      }, {});
      const theme = sortedGroup.length > 1 ? `${Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || representative.bucket}: ${key}` : key;
      uniqueSignals.push(representative);
      clusters.push({
        id: `cl_${clusters.length + 1}`,
        key,
        theme,
        items: sortedGroup,
        representative,
        size: sortedGroup.length,
        bucket: representative.bucket,
        buckets: Object.keys(bucketCounts),
        cross_bucket: Object.keys(bucketCounts).length > 1,
      });
    });

  const uniqueByBucket = uniqueSignals.reduce((acc, signal) => {
    if (!acc[signal.bucket]) acc[signal.bucket] = [];
    acc[signal.bucket].push(signal);
    return acc;
  }, {});

  Object.keys(uniqueByBucket).forEach((bucket) => {
    uniqueByBucket[bucket] = uniqueByBucket[bucket].sort((a, b) => b.confidence.score - a.confidence.score);
  });

  const summary = {
    total_signals: classified.length,
    unique_signals: uniqueSignals.length,
    cross_bucket_clusters: clusters.filter((cluster) => cluster.cross_bucket).length,
    by_bucket: Object.keys(signals || {}).reduce((acc, k) => ({ ...acc, [k]: (signals[k] || []).length }), {}),
    unique_by_bucket: Object.fromEntries(Object.entries(uniqueByBucket).map(([bucket, items]) => [bucket, items.length])),
    strong_count: classified.filter((c) => c.strength === "strong").length,
  };

  return { classified, uniqueSignals, clusters, summary };
}

export default analyzeSignals;
