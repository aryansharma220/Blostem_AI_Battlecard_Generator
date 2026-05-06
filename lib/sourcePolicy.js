const OFFICIAL_HINTS = {
  razorpay: ["razorpay.com"],
  paytm: ["paytm.com", "business.paytm.com", "paytmbank.com"],
  phonepe: ["phonepe.com"],
  m2pfintech: ["m2pfintech.com", "m2pfintech.io"],
};

const HIGH_QUALITY_DOMAINS = [
  "rbi.org.in",
  "npci.org.in",
  "techcrunch.com",
  "economictimes.indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "moneycontrol.com",
  "thehindubusinessline.com",
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "reddit.com",
  "linkedin.com",
];

const LOW_QUALITY_DOMAINS = [
  "onepagelove.com",
  "techjockey.com",
  "productgrowth.in",
  "xflowpay.com",
  "alternativeto.net",
  "saasworthy.com",
  "g2crowd.com/categories",
];

export function normalizeCompetitorKey(competitor = "") {
  return String(competitor).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getHostname(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isOfficialCompetitorSource(url = "", competitor = "") {
  const host = getHostname(url);
  const hints = OFFICIAL_HINTS[normalizeCompetitorKey(competitor)] || [];
  return hints.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function isLowQualitySource(url = "") {
  const host = getHostname(url);
  const lower = String(url || "").toLowerCase();
  return LOW_QUALITY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`) || lower.includes(domain));
}

export function isHighQualitySource(url = "", competitor = "") {
  const host = getHostname(url);
  if (isOfficialCompetitorSource(url, competitor)) return true;
  return HIGH_QUALITY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function inferSourceAuthority(url = "", competitor = "") {
  const lower = String(url || "").toLowerCase();
  if (isLowQualitySource(url)) return "low";
  if (isOfficialCompetitorSource(url, competitor)) return "high";
  if (isHighQualitySource(url, competitor)) return "high";
  if (/\/(docs|developers?|api|pricing|blog|news|press|announcements?)(\/|$)/i.test(lower)) return "medium";
  return "low";
}

export function inferSourceFreshness(dateValue) {
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 180) return "recent";
  return "stale";
}

export function isSentimentSource(source = {}) {
  const text = `${source.title || ""} ${source.url || ""} ${source.snippet || ""}`.toLowerCase();
  return (
    source.type === "reviews" ||
    /g2\.com|capterra\.com|trustpilot\.com|reddit\.com|play\.google\.com|apps\.apple\.com|twitter\.com|x\.com/.test(text) ||
    /\breview(s)?\b|complaint|customer feedback|user feedback|app store/.test(text)
  );
}

export function isRecentMoveSource(source = {}) {
  const text = `${source.title || ""} ${source.url || ""} ${source.snippet || ""}`.toLowerCase();
  return (
    source.freshness === "recent" &&
    (source.type === "blog" || source.type === "news" || source.type === "social") &&
    /\b(launch|launched|announces?|announced|introduces?|introduced|rolls out|unveils?|release|partnership|funding|approval)\b/.test(text)
  );
}

export function sourcePolicyNote(source = {}) {
  if (source.provider === "demo") return "curated demo sample";
  if (isLowQualitySource(source.url)) return "low-quality domain";
  if (source.freshness === "unknown") return "undated source";
  if (source.freshness === "stale") return "stale source";
  return "";
}
