// Deduplication and uniqueness scoring for competitor signals
// Goal: eliminate repetitive concepts, prioritize distinct insights, block near-duplicate angles

function normalizeForDedup(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptFingerprint(text = "") {
  const normalized = normalizeForDedup(text);
  const stopwords = new Set([
    "risk",
    "when",
    "what",
    "which",
    "how",
    "can",
    "does",
    "should",
    "at",
    "on",
    "in",
    "for",
    "with",
    "or",
    "and",
    "to",
    "the",
    "a",
    "an",
  ]);
  const tokens = normalized.split(" ").filter((t) => !stopwords.has(t) && t.length >= 4);
  return tokens.slice(0, 4).join(" ");
}

function conceptSimilarity(fp1, fp2) {
  if (!fp1 || !fp2) return 0;
  const t1 = new Set(fp1.split(" "));
  const t2 = new Set(fp2.split(" "));
  const overlap = [...t1].filter((token) => t2.has(token)).length;
  const union = new Set([...t1, ...t2]).size;
  return overlap / Math.max(union, 1);
}

function blockRepetitiveFrame(items = []) {
  // Remove items that share >70% concept overlap
  const survivors = [];
  const fps = [];
  items.forEach((item) => {
    const text = item.claim || item.signal || item.angle || item.point || "";
    const fp = conceptFingerprint(text);
    const similar = fps.findIndex((existing) => conceptSimilarity(existing, fp) > 0.7);
    if (similar === -1) {
      survivors.push(item);
      fps.push(fp);
    }
  });
  return survivors;
}

function scoreUniqueness(item, allItems = []) {
  // Higher score = more unique vs peer set
  const text = item.claim || item.signal || item.angle || item.point || "";
  const fp = conceptFingerprint(text);
  const overlaps = allItems
    .filter((other) => other !== item)
    .map((other) => {
      const otherText = other.claim || other.signal || other.angle || other.point || "";
      const otherFp = conceptFingerprint(otherText);
      return conceptSimilarity(fp, otherFp);
    });
  const avgOverlap = overlaps.length ? overlaps.reduce((a, b) => a + b) / overlaps.length : 0;
  return 1 - avgOverlap;
}

function scoreOperationalDepth(item) {
  // Higher score = more concrete and operational, lower = generic/strategic
  const text = `${item.claim || item.signal || item.angle || item.point || ""} ${item.evidence || item.snippet || ""}`.toLowerCase();
  let score = 0;
  if (/reconciliation|settlement|audit|trace|ledger|incident|outage|sla/.test(text)) score += 0.3;
  if (/uptime|latency|failure|exception|error|retry|timeout|refund/.test(text)) score += 0.25;
  if (/integration|api|webhook|payload|request|response|format/.test(text)) score += 0.2;
  if (/compliance|rbi|npci|regulation|directive|certification|audit/.test(text)) score += 0.25;
  if (/support|escalation|response time|resolution/.test(text)) score += 0.15;
  if (/generic|strategic|strong|comprehensive|robust|leading|advantage/.test(text)) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

function scoreRivalSenseContrast(item, competitorModel = {}) {
  // Higher score = this directly creates a RivalSense wedge
  const text = `${item.claim || item.signal || item.angle || item.point || ""} ${item.evidence || item.snippet || ""}`.toLowerCase();
  let score = 0.5; // baseline
  if (/control|visibility|traceability|governance|auditability|transparency/.test(text)) score += 0.3;
  if (/hidden|lack|missing|weak|manual|unclear|opaque/.test(text)) score += 0.25;
  if (/scale|volume|edge|exception/.test(text)) score += 0.15;
  if (/pricing|fee|cost|discount/.test(text) && !/settlement|reconciliation/.test(text)) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

export function deduplicateAndRankSignals(items = [], competitorModel = {}, topN = 3) {
  // Step 1: block literal repetition
  const deduped = blockRepetitiveFrame(items);

  // Step 2: score each remaining item
  const scored = deduped.map((item) => ({
    ...item,
    uniqueness_score: scoreUniqueness(item, deduped),
    operational_depth: scoreOperationalDepth(item),
    rivalsense_contrast: scoreRivalSenseContrast(item, competitorModel),
  }));

  // Step 3: composite rank (weighted toward operational depth and rivalsense contrast)
  const ranked = scored
    .map((item) => ({
      ...item,
      rank_score: item.uniqueness_score * 0.25 + item.operational_depth * 0.5 + item.rivalsense_contrast * 0.25,
    }))
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, topN);

  return ranked;
}

export function deduplicateAttackAngles(angles = []) {
  // Block literal repetition, keep highest-contrast angles
  const deduped = blockRepetitiveFrame(angles);
  return deduped.sort((a, b) => {
    const aScore = scoreOperationalDepth(a);
    const bScore = scoreOperationalDepth(b);
    return bScore - aScore;
  });
}

export function reduceCompetitiveSummary(summary = "", competitorKey = "") {
  // Avoid "X wins on Y, then gets tested on Y" redundancy
  if (!summary || summary.length < 20) return summary;

  const sentences = summary.split(/\.\s+/).filter(Boolean);
  if (sentences.length < 2) return summary;

  const keywords = [];
  sentences.forEach((sent) => {
    const matches = sent.match(/\b(pricing|product|scale|support|integration|reconciliation|settlement|compliance|governance|control)\b/gi);
    if (matches) keywords.push(...matches.map((m) => m.toLowerCase()));
  });

  const uniqueKeywords = [...new Set(keywords)];
  const repeated = keywords.filter((k, i) => keywords.indexOf(k) !== i);

  // If we have strong repetition, thin the summary
  if (repeated.length > uniqueKeywords.length * 0.4) {
    // Keep first and last sentence, drop middle duplicates
    if (sentences.length > 2) {
      return `${sentences[0]}. ${sentences[sentences.length - 1]}.`;
    }
  }

  return summary;
}

export function distinctCompetitorFraming(competitor, competitorModel = {}, identity = {}) {
  // Ensure framing varies by competitor, not generic
  const competitorKey = (competitor || "").toLowerCase().replace(/\s+/g, "");

  const framingVariants = {
    razorpay:
      identity.unique_narrative ||
      "Wins on developer speed. Loses on operational control, governance traceability, and reconciliation observability under scale.",
    paytm:
      identity.unique_narrative ||
      "Wins on brand familiarity. Loses on merchant trust depth, governance consistency, and support accountability.",
    phonepe:
      identity.unique_narrative ||
      "Wins on UPI distribution. Loses on monetization clarity, settlement observability, and enterprise workflow control.",
    trustly:
      identity.unique_narrative ||
      "Wins on A2A simplicity. Loses on reconciliation certainty, ledger traceability, and auth failure handling.",
  };

  return (
    framingVariants[competitorKey] ||
    identity.unique_narrative ||
    `${competitor || "Competitor"} wins on market appeal. Loses on operational depth.`
  );
}

export default {
  deduplicateAndRankSignals,
  deduplicateAttackAngles,
  reduceCompetitiveSummary,
  distinctCompetitorFraming,
};
