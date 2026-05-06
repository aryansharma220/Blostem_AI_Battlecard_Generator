const BOILERPLATE_PATTERNS = [
  /name\s*\|\s*company name/i,
  /company type\s*\|\s*rating/i,
  /your detailed review\/feedback/i,
  /submit review/i,
  /linkedin profile optional/i,
  /frequently asked questions/i,
  /to view or add a comment/i,
  /see more comments/i,
  /cookie policy/i,
  /sign in/i,
  /sign up/i,
];

const REGULATED_OR_PRECISE_PATTERNS = [
  /\b\d+(\.\d+)?\s*%/g,
  /\b\d+\s*(x|times|transactions|days|hours|minutes|months|crore|lakh|million|billion)\b/gi,
  /\bsoc\s*2\b/gi,
  /\biso\s*27001\b/gi,
  /\brbi\b/gi,
  /\bpci[-\s]?dss\b/gi,
  /\bsla\b/gi,
  /\baudit trail\b/gi,
  /\baudit logging\b/gi,
  /\bsettlement guarantee\b/gi,
  /\brole-based access\b/gi,
  /\bmulti-currency\b/gi,
  /\bfx hedging\b/gi,
];

const NEGATIVE_PROOF_PATTERNS = [
  /\bno\b/i,
  /\bnot\b/i,
  /\black(s|ing)?\b/i,
  /\bmissing\b/i,
  /\bfails?\b/i,
  /\bwithout\b/i,
  /\bcan't\b/i,
  /\bcannot\b/i,
];

const SOURCE_AUTHORITY_SCORE = {
  high: 28,
  medium: 18,
  low: 5,
};

const SOURCE_FRESHNESS_SCORE = {
  recent: 18,
  retrieved: 10,
  stale: 4,
  unknown: 0,
};

function normalize(text = "") {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function cleanEvidenceText(text = "") {
  let cleaned = String(text || "").replace(/\s+/g, " ").trim();
  cleaned = cleaned
    .replace(/LikeReply\d*/gi, "")
    .replace(/See more comments/gi, "")
    .replace(/To view or add a comment, sign in/gi, "")
    .replace(/Read more/gi, "")
    .trim();
  return cleaned.split(/\s+/).slice(0, 45).join(" ");
}

export function isBoilerplateEvidence(text = "") {
  const value = String(text || "");
  if (!value.trim()) return true;
  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  const separators = (value.match(/\|/g) || []).length;
  return separators >= 6 && /name|company|rating|feedback/i.test(value);
}

function extractRiskTokens(text = "") {
  const tokens = [];
  REGULATED_OR_PRECISE_PATTERNS.forEach((pattern) => {
    const matches = String(text || "").match(pattern);
    if (matches) tokens.push(...matches.map((item) => normalize(item)));
  });
  return [...new Set(tokens)];
}

function tokenSupported(token, evidence = "") {
  return normalize(evidence).includes(normalize(token));
}

function contentOverlapScore(claim = "", evidence = "") {
  const stop = new Set(["razorpay", "paytm", "phonepe", "their", "with", "from", "that", "this", "your", "when", "where", "what", "they", "into", "only", "have"]);
  const claimTokens = normalize(claim)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 5 && !stop.has(token));
  if (!claimTokens.length) return 0;
  const evidenceText = normalize(evidence);
  const matched = claimTokens.filter((token) => evidenceText.includes(token));
  return matched.length / claimTokens.length;
}

export function evaluateClaimTrust({ text = "", evidenceIds = [], sourceMap = {}, usageHint = "claim" }) {
  const linkedSources = (evidenceIds || []).map((id) => sourceMap[id]).filter(Boolean);
  const evidenceText = linkedSources.map((source) => `${source.title || ""} ${source.snippet || ""}`).join(" ");
  const reasons = [];
  let score = 15;

  if (!text || !linkedSources.length) {
    return {
      status: "blocked",
      usage: "internal_only",
      score: 0,
      reasons: ["No linked evidence."],
      evidence: [],
    };
  }

  if (linkedSources.some((source) => isBoilerplateEvidence(source.snippet || source.title))) {
    score -= 50;
    reasons.push("Linked evidence looks like boilerplate or form text.");
  }

  linkedSources.forEach((source) => {
    score += SOURCE_AUTHORITY_SCORE[source.authority] || 5;
    score += SOURCE_FRESHNESS_SCORE[source.freshness] || 0;
  });

  if (linkedSources.length >= 2) score += 10;

  const overlap = contentOverlapScore(text, evidenceText);
  score += Math.round(overlap * 25);
  if (overlap < 0.25) reasons.push("Claim wording has weak overlap with linked evidence.");

  const riskyTokens = extractRiskTokens(text);
  const unsupportedRisk = riskyTokens.filter((token) => !tokenSupported(token, evidenceText));
  if (unsupportedRisk.length) {
    score -= 70;
    reasons.push(`Unsupported precise/regulated term: ${unsupportedRisk.slice(0, 3).join(", ")}.`);
  }

  const negativeClaim = NEGATIVE_PROOF_PATTERNS.some((pattern) => pattern.test(text));
  const negativeEvidence = NEGATIVE_PROOF_PATTERNS.some((pattern) => pattern.test(evidenceText));
  if (negativeClaim && !negativeEvidence) {
    score -= 35;
    reasons.push("Negative/absence claim is not directly stated in linked evidence.");
  }

  score = Math.max(0, Math.min(100, score));
  let status = "blocked";
  let usage = "internal_only";
  if (score >= 78 && !unsupportedRisk.length) {
    status = "ready";
    usage = "say_as_claim";
  } else if (score >= 45 && !unsupportedRisk.length) {
    status = "use_as_question";
    usage = "ask_as_question";
  } else if (score >= 25) {
    status = "needs_review";
    usage = usageHint === "question" ? "ask_as_question" : "internal_only";
  }

  return {
    status,
    usage,
    score,
    reasons,
    evidence: linkedSources.slice(0, 2).map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      type: source.type,
      date: source.published_at || source.retrieved_at || "n.d.",
      snippet: cleanEvidenceText(source.snippet || source.title),
    })),
  };
}

export function trustGateItems(items = [], sourceMap = {}, getText, getEvidenceIds, usageHint = "claim") {
  const ready = [];
  const review = [];
  const blocked = [];

  items.forEach((item) => {
    const trust = evaluateClaimTrust({
      text: getText(item),
      evidenceIds: getEvidenceIds(item),
      sourceMap,
      usageHint,
    });
    const enriched = { ...item, trust, status: trust.status, usage: trust.usage, trust_score: trust.score };
    if (trust.status === "ready" || trust.status === "use_as_question") ready.push(enriched);
    else if (trust.status === "needs_review") review.push(enriched);
    else blocked.push(enriched);
  });

  return { ready, review, blocked };
}

export function isLaunchSource(source = {}) {
  const text = normalize(`${source.title || ""} ${source.snippet || ""}`);
  return (
    ["blog", "news", "social"].includes(String(source.type || "").toLowerCase()) &&
    /\b(launch|launched|announces?|announced|introduces?|introduced|rolls out|unveils?|release|partnership|funding|approval)\b/.test(text) &&
    !isBoilerplateEvidence(source.snippet || source.title)
  );
}

export function isReviewSource(source = {}) {
  const text = normalize(`${source.title || ""} ${source.url || ""} ${source.snippet || ""}`);
  return (
    ["reviews", "social"].includes(String(source.type || "").toLowerCase()) ||
    /g2\.com|capterra\.com|trustpilot\.com|reddit\.com|play\.google\.com|apps\.apple\.com/.test(text)
  ) && !isBoilerplateEvidence(source.snippet || source.title);
}

export function evidenceIdsForText(text = "", sources = [], limit = 1) {
  const scored = sources
    .filter((source) => !isBoilerplateEvidence(source.snippet || source.title))
    .map((source) => ({
      source,
      score: contentOverlapScore(text, `${source.title || ""} ${source.snippet || ""}`),
    }))
    .filter((entry) => entry.score > 0.15)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.source.id);
}
