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

function textForSource(source = {}) {
  return `${source.title || ""} ${source.url || ""} ${source.snippet || ""}`.toLowerCase();
}

export function inferSourceClass(source = {}) {
  const type = String(source.type || "").toLowerCase();
  const text = textForSource(source);
  const metadata = source.raw_metadata || {};

  // Hard-to-find source signals (highest value for competitive intelligence)
  if (metadata.github_type || metadata.engineering_signal || metadata.velocity_signal) {
    return "employee_signals";  // Engineering velocity = internal signal
  }
  if (metadata.status_page || metadata.operational_signal) {
    return "compliance_operational";  // Uptime/incidents = operational truth
  }
  if (metadata.engineering_blog || metadata.architecture_signal) {
    return "employee_signals";  // Engineering blog = internal thinking
  }
  if (metadata.job_posting || metadata.hiring_intent_signal) {
    return "employee_signals";  // Hiring patterns = internal priorities
  }
  if (metadata.founder_signal || metadata.strategic_intent_signal) {
    return "market_signals";  // CEO/founder = strategic direction
  }

  // Directional intelligence sources. These can reveal useful clues, but they
  // still need claim-level verification before an AE uses them externally.
  if (metadata.wayback_signal || metadata.pivot_detection || metadata.historical_analysis) {
    return "compliance_operational";  // Historical pivots reveal operational reality
  }
  if (metadata.regulatory_signal || metadata.compliance_history) {
    return "compliance_operational";  // Regulatory actions = operational truth
  }
  if (metadata.app_store_signal || metadata.user_satisfaction_metric) {
    return "customer_sentiment";  // App ratings = real user experience
  }
  if (metadata.patent_signal || metadata.innovation_signal) {
    return "market_signals";  // Patents reveal innovation priorities
  }
  if (metadata.community_discussion || metadata.unfiltered_sentiment) {
    return "community_signals";  // Reddit/HN = unfiltered community voice
  }
  if (metadata.legal_signal || metadata.dispute_history || metadata.credibility_risk) {
    return "compliance_operational";  // Legal disputes = execution credibility risk
  }
  if (metadata.processor_signal || metadata.architecture_hint) {
    return "employee_signals";  // Payment architecture = internal decision
  }
  if (metadata.security_signal || metadata.execution_risk) {
    return "compliance_operational";  // Security breaches = operational execution failure
  }
  if (metadata.product_hunt_signal || metadata.market_traction) {
    return "market_signals";  // Product Hunt = market validation
  }
  if (metadata.newsletter_signal || metadata.communication_pattern || metadata.customer_outreach) {
    return "market_signals";  // Newsletter messaging = strategic communication
  }
  if (metadata.linkedin_hiring || metadata.hiring_velocity || metadata.team_composition) {
    return "employee_signals";  // Hiring patterns = team priorities
  }
  if (metadata.risk_signal || metadata.risk_category) {
    return "compliance_operational";  // Risk aggregation = operational reality
  }

  // Official product sources
  if (type === "pricing" || /pricing|price|mdr|fee|subscription|billing|cost|plan/.test(text)) return "official_product";
  if (type === "docs" || /docs?|developers?|api|webhook|integration|sdk|reference|guide/.test(text)) return "official_product";
  
  // Customer sentiment sources
  if (type === "reviews" || /g2\.com|capterra\.com|trustpilot\.com|app store|play store|reddit\.com/.test(text)) return "customer_sentiment";
  
  // Social/LinkedIn sources
  if (type === "social" || /linkedin\.com|twitter\.com|x\.com/.test(text)) return /hiring|job|open role|we\s+are\s+hiring|looking for/.test(text) ? "employee_signals" : "community_signals";
  
  // News and market sources
  if (type === "news" || /funding|launch|announc|acquir|merger|expansion|investment|press|founder|ceo|interview|podcast/.test(text)) return "market_signals";
  
  // Compliance/operational sources
  if (/status|incident|uptime|sla|downtime|outage|availability|reliability|rbi|compliance|security|audit|settlement|reconciliation/.test(text)) return "compliance_operational";
  
  // Ecosystem/partnership sources
  if (/partner|integration|ecosystem|marketplace|app directory|certified partner/.test(text)) return "ecosystem_signals";
  
  // Employee/hiring sources
  if (/hiring|open role|careers|jobs|recruiting|team|talent|employee|engineer|team growth/.test(text)) return "employee_signals";
  
  // Community sources
  if (/forum|community|substack|medium|youtube|podcast|twitter|x\.com/.test(text)) return "community_signals";

  return "uncategorized";
}

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
    inferSourceClass(source) === "customer_sentiment" ||
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
