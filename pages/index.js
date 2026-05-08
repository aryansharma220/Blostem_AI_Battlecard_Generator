import { useEffect, useMemo, useState } from "react";

const QUICK = ["Razorpay", "Paytm", "PhonePe"];

const PROJECT_NAME = "RivalSense";

const colors = {
  bg: "#070A0F",
  surface: "#0D131B",
  card: "#121A24",
  inset: "#0A1017",
  elevated: "#172230",
  border: "rgba(139, 154, 173, 0.2)",
  borderStrong: "rgba(139, 154, 173, 0.34)",
  primary: "#5B8CFF",
  cyan: "#53D6FF",
  accent: "#33E0B6",
  amber: "#F5B84B",
  danger: "#FF5A5F",
  success: "#2ED573",
  text: "#F4F7FB",
  muted: "#B5C0CC",
  faint: "#7D8A99",
};

function titleCase(value = "") {
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function short(text = "", words = 24) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= words) return parts.join(" ");
  return `${parts.slice(0, words).join(" ")}...`;
}

function cleanLine(text = "", fallback = "Not enough evidence yet.") {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return fallback;
  return value
    .replace(/LikeReply\d*/gi, "")
    .replace(/See more comments/gi, "")
    .replace(/To view or add a comment, sign in/gi, "")
    .trim();
}

function tightenWording(text = "", fallback = "Not enough evidence yet.") {
  const cleaned = cleanLine(text, fallback);
  return cleaned
    .replace(/\b(proves|definitely|always|clearly|obviously|undeniably)\b/gi, "suggests")
    .replace(/\b(hidden fees)\b/gi, "unexpected fees")
    .replace(/\b(breaks|fails)\b/gi, "strains")
    .replace(/\b(crush|destroy|beat)\b/gi, "outperform")
    .replace(/\bmust\b/gi, "should")
    .replace(/\s+/g, " ")
    .trim();
}

function plainSummaryLine(text = "", fallback = "") {
  const cleaned = tightenWording(text, fallback);
  if (!cleaned) return fallback;
  const [head, tail] = cleaned.split(/:\s*/, 2);
  if (!tail) return head;
  if (/references? to\.?$/i.test(tail) || tail.length < 10) return head;
  return `${head}: ${tail}`;
}

function insightKey(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueInsightPoints(items = [], fallback = [], limit = 3) {
  const seen = new Set();
  const normalized = [];
  (items || []).forEach((item) => {
    const text = plainSummaryLine(item || "", "");
    if (!text || text.length < 12) return;
    const key = insightKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push(text);
  });
  if (!normalized.length) return (fallback || []).slice(0, limit);
  return normalized.slice(0, limit);
}

function excludeOverlappingInsights(points = [], blockedPoints = [], fallback = [], limit = 3) {
  const blocked = new Set((blockedPoints || []).map((item) => insightKey(item)).filter(Boolean));
  const filtered = (points || []).filter((item) => !blocked.has(insightKey(item)));
  if (!filtered.length) return (fallback || []).slice(0, limit);
  return filtered.slice(0, limit);
}

function normalizeEvidenceSnippet(text = "", fallback = "Evidence needs a cleaner source excerpt.") {
  const cleaned = cleanLine(text, fallback)
    .replace(/\b(menu|icon|logo|hamburger|arrow|right-arrow)\b/gi, " ")
    .replace(/\b(menu\s+){2,}/gi, " ")
    .replace(/\b(icon\s+){2,}/gi, " ")
    .replace(/\b(phonepe)\s+\1\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  const noiseHits = tokens.filter((token) => ["menu", "icon", "logo", "hamburger", "arrow"].includes(token)).length;
  const uniqueTokens = new Set(tokens).size;
  const repeatedNoise = noiseHits >= 4 || (tokens.length > 0 && uniqueTokens / tokens.length < 0.45);

  if (!cleaned || repeatedNoise) return fallback;
  return short(cleaned, 26);
}

function isRubbishLaunchText(text = "") {
  const cleaned = cleanLine(text, "");
  if (!cleaned) return true;
  const tokens = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return true;
  const uniqueRatio = new Set(tokens).size / tokens.length;
  if (uniqueRatio < 0.55) return true;
  const noiseHits = tokens.filter((token) => ["menu", "icon", "logo", "hamburger", "arrow", "reply", "comment", "like"].includes(token)).length;
  return noiseHits >= 3;
}

function cleanLaunchText(text = "", fallback = "") {
  const cleaned = cleanLine(text, fallback || "");
  if (!cleaned || isRubbishLaunchText(cleaned)) return fallback;
  return short(cleaned, 22);
}

function formatVerificationCopy(script = {}) {
  const aeLine = script.downgraded
    ? script.follow_up || "Use this as a question, not a hard claim."
    : script.script || "Use this as a question, not a hard claim.";
  return [
    `Buyer says: ${tightenWording(script.customer_say || "Why switch?")}`,
    `Verify: ${tightenWording(script.verification_question || aeLine)}`,
    `Follow-up: ${tightenWording(script.downgraded ? script.script : script.follow_up || "What strains first when volume doubles?")}`,
  ].join("\n");
}

function confidenceColor(value = "") {
  const normalized = String(value).toLowerCase();
  if (normalized.includes("high") || normalized.includes("verified")) return colors.success;
  if (normalized.includes("low") || normalized.includes("critical")) return colors.danger;
  return colors.amber;
}

function confidenceTone(value = "") {
  const normalized = String(value).toLowerCase();
  if (normalized.includes("high") || normalized.includes("verified")) return "success";
  if (normalized.includes("low") || normalized.includes("critical") || normalized.includes("hypothesis")) return "danger";
  if (normalized.includes("%")) {
    const parsed = Number.parseInt(normalized, 10);
    if (parsed >= 75) return "success";
    if (parsed < 45) return "danger";
  }
  return "warning";
}

function sourceTierTone(tier = "") {
  const normalized = String(tier || "").toLowerCase();
  if (normalized.includes("tier 1") || normalized.includes("tier 2")) return "success";
  if (normalized.includes("tier 5")) return "danger";
  return "warning";
}

function compactSourceReason(source = {}) {
  return `${source.tier || "Tier ?"} | ${source.source_class || "uncategorized"} | ${source.external_use || source.reason || "Review source policy."}`;
}

function categorizeSource(source = {}) {
  const cls = String(source.source_class || "").toLowerCase();
  const type = String(source.type || "").toLowerCase();
  const url = String(source.url || "").toLowerCase();

  if (/(official|product|docs|company)/.test(cls) || /docs|company/.test(type)) return "Official";
  if (/(compliance|operational|status|uptime|incident)/.test(cls) || /status|uptime|incident/.test(type)) return "Operational Signals";
  if (/(employee|staff|job|linkedin|review|customer|sentiment|support)/.test(cls) || /(review|g2|trustpilot|customer)/.test(type) || /review|support|complain|praise/.test(url)) return "Customer Signals";
  if (/(market|news|funding|press|podcast|blog|ecosystem|community)/.test(cls) || /(news|press|funding|blog)/.test(type)) return "Market Signals";
  if (/(regulatory|legal|compliance|rbi|lawsuit|litigation)/.test(cls) || /(regulatory|rbi|court|lawsuit|compliance)/.test(url)) return "Regulatory";
  return "Other";
}

function signalQualification({ confidence, evidenceCount = 0, sourceClasses = [], text = "" } = {}) {
  const normalized = String(confidence || "").toLowerCase();
  const classSet = new Set((sourceClasses || []).map((value) => String(value).toLowerCase()));
  const operationalCue = [...classSet].some((value) => ["compliance_operational", "official_product", "employee_signals"].includes(value));
  const textCue = /reconciliation|settlement|uptime|incident|compliance|audit|support|sla|integration|enterprise|governance/i.test(String(text));

  if (normalized.includes("verified") || (normalized.includes("high") && evidenceCount >= 2)) return "Verified";
  if (normalized.includes("directional") || normalized.includes("medium") || evidenceCount >= 1) return "Directional";
  if (operationalCue && textCue && evidenceCount >= 1) return "Operational hypothesis";
  return "Weak signal";
}

function qualifyRiskLevel(level = "") {
  const normalized = String(level).toUpperCase();
  if (normalized === "HIGH") return "danger";
  if (normalized === "MEDIUM") return "warning";
  return "success";
}

function sentenceChunks(text = "", limit = 2) {
  return tightenWording(text)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, limit);
}

function sourceLabel(source) {
  if (!source) return "Source";
  const date = source.published_at || source.retrieved_at;
  const suffix = date ? ` (${String(date).slice(0, 10)})` : "";
  return `${source.title || "Source"}${suffix}`;
}

function sourceFootnote(ids = [], sources = []) {
  const linked = (ids || [])
    .map((id) => sources.find((source) => source.id === id))
    .filter(Boolean)
    .slice(0, 2);
  if (!linked.length) return "No linked source";
  return linked.map((source) => `${source.title || "Source"} | ${source.type || "source"} | ${source.source_class || "uncategorized"} | ${source.published_at || source.retrieved_at || "n.d."}`).join(" + ");
}

function BulletList({ items = [], empty = "No items found." }) {
  const visible = items.filter(Boolean).slice(0, 4);
  if (!visible.length) return <p style={styles.bodyText}>{empty}</p>;
  return (
    <ul style={styles.list}>
      {visible.map((item, index) => (
        <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
      ))}
    </ul>
  );
}

function Section({ title, children, aside }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHead}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function normalizeComparisonItem(item, fallbackLabel = "Item") {
  if (!item) return null;
  if (typeof item === "string") {
    const value = tightenWording(item);
    return value ? { label: fallbackLabel, value } : null;
  }

  const value = tightenWording(
    item.point || item.claim || item.theme || item.signal || item.angle || item.move || item.summary || item.what_to_say || item.script || fallbackLabel,
    fallbackLabel,
  );
  const detail = tightenWording(item.why_it_matters || item.when_to_use || item.implication || item.follow_up || item.ae_question || item.evidence || item.note || "");
  if (!value && !detail) return null;
  return {
    label: item.label || fallbackLabel,
    value: value || fallbackLabel,
    detail,
    meta: item.confidence || item.status || item.source_class || "",
  };
}

function ComparisonColumn({ title, tone, side = "us", items = [], empty }) {
  const visible = items.filter(Boolean).slice(0, 2);
  const sideLabel = side === "us" ? "RivalSense" : "Competitor";
  return (
    <div style={side === "us" ? styles.compareColumnUs : styles.compareColumnThem}>
      <div style={styles.compareColumnHead}>
        <span style={styles.sectionKicker}>{title}</span>
      </div>
      <div style={styles.compareColumnLabel}>{sideLabel}</div>
      <div style={styles.compareColumnBody}>
        {visible.length ? visible.map((item, index) => (
          <div key={`${title}-${index}`} style={side === "us" ? styles.compareItemUs : styles.compareItemThem}>
            <strong style={side === "us" ? styles.compareItemTitleUs : styles.compareItemTitleThem}>{item.value}</strong>
            {item.detail && <span>{item.detail}</span>}
            {item.meta && <small style={styles.sourceMeta}>{item.meta}</small>}
          </div>
        )) : (
          <div style={side === "us" ? styles.compareItemUs : styles.compareItemThem}>
            <strong>{empty}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonSection({ section }) {
  return (
    <section id={section.id} style={styles.compareSection}>
      <div style={styles.compareSectionHead}>
        <div>
          <div style={styles.sectionKicker}>{section.kicker}</div>
          <h2 style={styles.compareTitle}>{section.title}</h2>
          <p style={styles.compareSummary}>{section.summary}</p>
        </div>
        {section.badge}
      </div>
      <div style={styles.compareGrid}>
        <ComparisonColumn side="us" title="Us" tone="success" items={section.us} empty={section.usEmpty || "No clear advantage surfaced."} />
        <ComparisonColumn side="them" title="Them" tone="warning" items={section.them} empty={section.themEmpty || "No clear counter-signal surfaced."} />
      </div>
      {section.footer && <p style={styles.compareFooter}>{section.footer}</p>}
    </section>
  );
}

function Badge({ children, tone = "default" }) {
  const toneColor =
    tone === "success" ? colors.success :
    tone === "warning" ? colors.amber :
    tone === "danger" ? colors.danger :
    tone === "info" ? colors.cyan :
    colors.muted;
  return (
    <span style={{ ...styles.badge, color: toneColor, borderColor: `${toneColor}55`, background: `${toneColor}15` }}>
      {children}
    </span>
  );
}

function ProgressDot({ active = false, done = false }) {
  return (
    <span
      style={{
        ...styles.progressDot,
        background: done ? colors.accent : active ? colors.cyan : "transparent",
        borderColor: done ? `${colors.accent}77` : active ? `${colors.cyan}77` : colors.borderStrong,
        boxShadow: active ? `0 0 0 5px ${colors.cyan}14` : "none",
      }}
    />
  );
}

function buildBattlecardMarkdown({ result }) {
  if (!result) return "";
  const bc = result.battlecard || {};
  const pipeline = result.pipeline || {};
  const verdict = bc.ae_quick_verdict || {};
  const signals = bc.competitive_signals || [];
  const angles = bc.attack_angles || [];
  const verificationSequence = bc.verification_sequence || [];
  const recentMoves = bc.recent_moves || [];
  const recentLaunches = bc.recent_launches || recentMoves;
  const pricingPosture = bc.pricing_posture || {};
  const sentimentThemes = bc.customer_sentiment || [];
  const vulnerable = bc.where_vulnerable || [];
  const wins = bc.where_they_win || [];
  const hiddenSignals = bc.hidden_signals || [];
  const compareVsUs = bc.compare_vs_us || {};
  const evidenceClaims = bc.evidence_linked_claims || [];
  const wedge = bc.rivalsense_wedge || {};
  const evidenceSources = bc.evidence_panel?.sources || [];
  const sources = evidenceSources.length ? evidenceSources : (pipeline.sources || []).map((source) => ({
    label: source.title,
    url: source.url,
  }));

  const lines = [];
  lines.push(`# ${result.competitor} Battlecard`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Threat: ${verdict.threat_level || bc.threat_level || "MEDIUM"}`);
  lines.push(`Confidence: ${verdict.confidence || "Directional"}`);
  lines.push("");
  lines.push("## Quick Verdict");
  lines.push(cleanLine(verdict.summary || bc.summary));
  lines.push("");
  lines.push("## Positioning");
  lines.push(`Category: ${bc.category || "Fintech/BFSI"}`);
  lines.push(`Primary segment: ${bc.primary_segment || "Unknown"}`);
  lines.push(`Geography: ${bc.geography || "India"}`);
  lines.push("");
  lines.push("## Pricing Posture");
  lines.push(cleanLine(pricingPosture.summary || signals.find((signal) => String(signal.signal || "").toLowerCase().includes("pricing"))?.signal || signals[0]?.signal));
  if (pricingPosture.discovery_question) lines.push(`Question: ${cleanLine(pricingPosture.discovery_question)}`);
  if (pricingPosture.evidence_titles?.length) lines.push(`Evidence: ${pricingPosture.evidence_titles.join("; ")}`);
  lines.push("");

  lines.push("## Hidden Signals");
  hiddenSignals.slice(0, 4).forEach((signal, index) => {
    lines.push(`${index + 1}. ${cleanLine(signal.insight)} - ${cleanLine(signal.implication)}`);
    lines.push(`   Leverage: ${cleanLine(signal.tactical_leverage)}`);
  });
  if (!hiddenSignals.length) lines.push("No hidden signals extracted in this run.");
  lines.push("");

  lines.push("## What We Have vs What They Have");
  (compareVsUs.where_we_win || []).slice(0, 2).forEach((item, index) => {
    lines.push(`${index + 1}. Us: ${cleanLine(item)}`);
  });
  (compareVsUs.where_we_lose || []).slice(0, 2).forEach((item, index) => {
    lines.push(`${index + 1}. Them: ${cleanLine(item)}`);
  });
  if (!((compareVsUs.where_we_win || []).length || (compareVsUs.where_we_lose || []).length)) lines.push("No compare-vs-us frame available.");
  lines.push("");

  lines.push("## Where They Win");
  wins.slice(0, 3).forEach((item, index) => {
    lines.push(`${index + 1}. ${cleanLine(item.point)} - ${cleanLine(item.why_it_matters)}`);
  });
  lines.push("");
  lines.push("## Where They Are Vulnerable");
  vulnerable.slice(0, 3).forEach((item, index) => {
    lines.push(`${index + 1}. ${cleanLine(item.point)} - Ask: ${cleanLine(item.ae_question)}`);
  });
  lines.push("");
  lines.push("## Recent Launches / Moves");
  recentLaunches.slice(0, 3).forEach((move, index) => {
    lines.push(`${index + 1}. ${cleanLine(move.move)} - ${cleanLine(move.implication)}`);
  });
  if (!recentLaunches.length) lines.push("No verified recent launch found in this run.");
  lines.push("");
  lines.push("## Customer Sentiment");
  sentimentThemes.slice(0, 3).forEach((theme, index) => {
    lines.push(`${index + 1}. ${cleanLine(theme.theme)} - ${cleanLine(theme.ae_move)}`);
  });
  if (!sentimentThemes.length) lines.push("No sentiment theme extracted.");
  lines.push("");
  lines.push("## How RivalSense Wins");
  lines.push(cleanLine(wedge.headline || bc.how_to_win?.win_by || angles[0]?.angle || "Win with evidence-backed decision criteria."));
  lines.push(cleanLine(wedge.wedge || ""));
  lines.push(`Key buyer question: ${cleanLine(bc.how_to_win?.kill_question || angles[0]?.closing_question || angles[0]?.close || "Which vendor assumption needs proof at scale?")}`);
  lines.push("");
  lines.push("## Evidence-Linked Claims");
  evidenceClaims.slice(0, 4).forEach((claim, index) => {
    lines.push(`${index + 1}. ${cleanLine(claim.claim)} (${claim.confidence})`);
    if (claim.evidence?.[0]) lines.push(`   Source: ${claim.evidence[0].title} - ${claim.evidence[0].url}`);
  });
  lines.push("");
  lines.push("## AE Verification Cues");
  verificationSequence.slice(0, 3).forEach((script, index) => {
    lines.push(`${index + 1}. Buyer condition: "${cleanLine(script.pain_point || script.customer_say)}"`);
    lines.push(`   Verify: "${cleanLine(script.verification_question)}"`);
    lines.push(`   Listen for: "${cleanLine(script.listen_for)}"`);
  });
  if (!verificationSequence.length && angles[0]) {
    lines.push(`1. Verify: "${cleanLine(angles[0].what_to_say)}"`);
    lines.push(`   Buyer question: "${cleanLine(angles[0].close || angles[0].closing_question)}"`);
  }
  if (bc.ae_live_brief?.do_not_use?.length) {
    lines.push("");
    lines.push("## Do Not Use Externally");
    bc.ae_live_brief.do_not_use.slice(0, 4).forEach((item, index) => {
      lines.push(`${index + 1}. ${cleanLine(item.claim)} - ${cleanLine(item.reason)}`);
    });
  }
  lines.push("");
  lines.push("## Sources");
  sources.slice(0, 8).forEach((source, index) => {
    lines.push(`${index + 1}. ${source.label || source.title || "Source"} - ${source.url || ""}`);
  });
  return lines.join("\n");
}

export default function Home() {
  const loadingStages = [
    { label: "Retrieval", detail: "Pulling public sources and pricing evidence" },
    { label: "Extraction", detail: "Finding product, pricing, and sentiment signals" },
    { label: "Contradiction check", detail: "Looking for evidence that disagrees" },
    { label: "Confidence scoring", detail: "Scoring freshness, authority, and coverage" },
    { label: "Synthesis", detail: "Building a concise battlecard and verification cues" },
    { label: "Validation", detail: "Downgrading weak claims before output" },
  ];
  const [name, setName] = useState("");
  const [retrievalMode, setRetrievalMode] = useState("live");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [showAllSources, setShowAllSources] = useState(false);
  const [compactView, setCompactView] = useState(true);
  const [sectionQuery, setSectionQuery] = useState("");
  const [showEvidenceRail, setShowEvidenceRail] = useState(false);

  const battlecard = result?.battlecard || {};
  const pipeline = result?.pipeline || {};
  const metrics = pipeline.metrics || {};
  const verdict = battlecard.ae_quick_verdict || {};
  const signals = battlecard.competitive_signals || [];
  const angles = battlecard.attack_angles || [];
  const evidenceCards = battlecard.evidence_cards || [];
  const verificationSequence = battlecard.verification_sequence || [];
  const recentMoves = battlecard.recent_moves || [];
  const recentLaunches = battlecard.recent_launches || recentMoves;
  const pricingPosture = battlecard.pricing_posture || {};
  const sentimentThemes = battlecard.customer_sentiment || [];
  const evidenceClaims = battlecard.evidence_linked_claims || [];
  const trustReview = battlecard.trust_review || pipeline.trust_review || {};
  const vulnerable = battlecard.where_vulnerable || [];
  const wins = battlecard.where_they_win || [];
  const hiddenSignals = battlecard.hidden_signals || [];
  const compareVsUs = battlecard.compare_vs_us || {};
  const wedge = battlecard.rivalsense_wedge || {};
  const pipelineSteps = pipeline.steps || [];
  const howToWin = battlecard.how_to_win || {};
  const validation = pipeline.validation || battlecard.validation || {};
  const sources = pipeline.sources || [];
  const groupedSources = useMemo(() => {
    const keys = ["Official", "Operational Signals", "Customer Signals", "Market Signals", "Regulatory", "Other"];
    const map = keys.reduce((acc, k) => ({ ...acc, [k]: [] }), {});
    (sources || []).forEach((s) => {
      const cat = categorizeSource(s) || "Other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(s);
    });
    return map;
  }, [sources]);
  const claimTraces = pipeline.claim_traces || [];
  const contradictions = pipeline.contradictions || [];
  const evidencePanel = battlecard.evidence_panel || {};
  const procurementRisk = battlecard.procurement_risk_dashboard || {};
  const aeLiveBrief = battlecard.ae_live_brief || {};
  const sourceQuality = battlecard.source_quality_review || pipeline.source_quality_review || {};
  const executiveBrief = battlecard.executive_decision_brief || {};
  const inputCorrection = result?.input_correction || null;

  const markdown = useMemo(() => buildBattlecardMarkdown({ result }), [result]);
  const primaryAngle = angles[0] || {};
  const pricingSignal =
    signals.find((signal) => /pricing|price|fee|mdr/i.test(signal.signal || "")) ||
    signals.find((signal) => /pricing|price|fee|mdr|cost/i.test(`${signal.signal} ${signal.so_what}`)) ||
    signals[0];
  const sentimentSignal = signals.find((signal) => /review|sentiment|customer|support|complain|praise|g2|trustpilot/i.test(`${signal.signal} ${signal.so_what}`));
  const productMove =
    signals.find((signal) => /launch|product|update/i.test(`${signal.signal} ${signal.so_what}`)) ||
    signals.find((signal) => /gtm|motion|narrative/i.test(`${signal.signal} ${signal.so_what}`)) ||
    signals.find((signal) => /blog|company/i.test((signal.evidence_ids || []).map((id) => sources.find((source) => source.id === id)?.type).join(" ")));
  const curatedRecentLaunches = useMemo(() => {
    return (recentLaunches || [])
      .map((move) => ({
        ...move,
        move: cleanLaunchText(move.move, ""),
        implication: cleanLaunchText(move.implication, ""),
        ae_move: cleanLaunchText(move.ae_move, ""),
      }))
      .filter((move) => move.move && !isRubbishLaunchText(move.move));
  }, [recentLaunches]);
  const verificationCards = useMemo(() => {
    const baseScripts = evidenceCards.length
      ? evidenceCards
      : [{ claim: `We already know ${result?.competitor || name || "them"}.`, buyer_question: primaryAngle.what_to_say, ae_action: primaryAngle.close }];

    return baseScripts.slice(0, 3).map((script, index) => ({
      ...script,
      title: cleanLaunchText(script.title || script.scenario || script.stage_phase || (script.downgraded ? "Question-led path" : `Verification path ${index + 1}`), `Verification path ${index + 1}`),
      customer_say: cleanLaunchText(script.claim || script.customer_say || script.pain_point || "Buyer defends current vendor", "Buyer defends current vendor"),
      script: cleanLaunchText(script.buyer_question || script.verification_question || script.script || "Which assumption needs proof at scale?", "Which assumption needs proof at scale?"),
      follow_up: cleanLaunchText(script.ae_action || script.listen_for || script.follow_up || "Evidence of operational pain or switching trigger.", "Evidence of operational pain or switching trigger."),
    }));
  }, [evidenceCards, primaryAngle, result?.competitor, name]);
  const strongestVulnerability = vulnerable[0] || {};
  const strongestContradiction = contradictions[0] || null;
  const topEvidenceSource = evidencePanel.sources?.[0] || sources[0] || null;
  const heroStrengthPoints = uniqueInsightPoints([
    primaryAngle.angle,
    primaryAngle.what_to_say,
    pricingPosture.summary,
    wins[0]?.point,
    wins[1]?.point,
    curatedRecentLaunches[0]?.move,
  ], ["Strong market familiarity and proven execution in core segment."]);
  const heroWeaknessPoints = excludeOverlappingInsights(uniqueInsightPoints([
    strongestVulnerability.point,
    strongestVulnerability.why_it_matters,
    vulnerable[1]?.point,
    sentimentThemes[0]?.theme,
    contradictions[0]?.theme,
    contradictions[0]?.message,
  ], ["Operational gaps may surface under high-volume or complex workflows."]), heroStrengthPoints, ["Operational gaps may surface under high-volume or complex workflows."]);
  const heroRiskPoints = excludeOverlappingInsights(uniqueInsightPoints([
    procurementRisk.risk_level ? `${procurementRisk.risk_level} procurement risk` : "",
    procurementRisk.procurement_question,
    strongestContradiction?.message,
    validation.warnings?.[0],
    trustReview.blocked?.[0]?.claim,
    trustReview.blocked?.[0]?.trust?.reasons?.[0],
  ], ["Evidence is directional in parts; verify critical claims before using externally."]), [...heroStrengthPoints, ...heroWeaknessPoints], ["Evidence is directional in parts; verify critical claims before using externally."]);
  const heroKeyPoints = [
    {
      label: "Their strength",
      value: heroStrengthPoints[0] || "Proven capability in their market",
      points: heroStrengthPoints,
      tone: "info",
    },
    {
      label: "Their weakness",
      value: heroWeaknessPoints[0] || "Operational limitation found",
      points: heroWeaknessPoints,
      tone: "warning",
    },
    {
      label: "Main risk",
      value: heroRiskPoints[0] || "Risk level unclear",
      points: heroRiskPoints,
      tone: procurementRisk.risk_level === "HIGH" ? "danger" : "warning",
    },
  ];
  const heroCaveat = strongestContradiction
    ? tightenWording(strongestContradiction.message || "There is a conflicting signal to review.")
    : tightenWording(evidencePanel.external_use_policy || "No major issues surfaced.");
  const heroFootnote = `${evidencePanel.traceability || `${claimTraces.length}/${claimTraces.length} claims linked`} · ${metrics.source_count || sources.length || 0} sources · ${metrics.signal_count || 0} signals`;
  const topSourceQuality = sourceQuality.best_sources || [];
  const trustTone = validation.status === "critical" ? "warning" : validation.status === "ok" ? "success" : "info";
  const trustLabel = validation.status === "critical"
    ? "Needs evidence review"
    : validation.status === "warn"
      ? "Evidence-linked, review caveats"
      : "Evidence-linked";
  const currentLoadingStage = loadingStages[loadingStep] || loadingStages[0];
  const topicSections = useMemo(() => {
    const pricingUs = [
      ...((compareVsUs.where_we_win || []).slice(0, 2).map((item) => normalizeComparisonItem(item, "Us pricing point"))),
      normalizeComparisonItem({ point: pricingPosture.rivalsense_attack || pricingSignal?.so_what || pricingSignal?.signal, why_it_matters: pricingPosture.discovery_question }, "Our pricing wedge"),
    ].filter(Boolean);
    const pricingThem = [
      ...((compareVsUs.where_we_lose || []).slice(0, 2).map((item) => normalizeComparisonItem(item, "Their pricing risk"))),
      normalizeComparisonItem({ point: pricingPosture.summary || pricingSignal?.signal, why_it_matters: pricingPosture.discovery_question }, "Their pricing posture"),
    ].filter(Boolean);

    const positioningUs = [
      normalizeComparisonItem({ point: primaryAngle.angle || "Evidence-backed positioning", why_it_matters: primaryAngle.what_to_say || primaryAngle.close }, "Our position"),
      ...((wins || []).slice(0, 2).map((item) => normalizeComparisonItem(item, "Our angle"))),
    ].filter(Boolean);
    const positioningThem = [
      normalizeComparisonItem({ point: verdict.summary || battlecard.summary || "Their narrative is still active", why_it_matters: wedge.wedge || howToWin.win_by }, "Their position"),
      ...((vulnerable || []).slice(0, 2).map((item) => normalizeComparisonItem(item, "Their weakness"))),
    ].filter(Boolean);

    const trustUs = [
      normalizeComparisonItem({ point: evidencePanel.confidence_reason || "Evidence-linked and traceable", why_it_matters: `${claimTraces.length || evidenceClaims.length || 0} claims linked` }, "Our evidence posture"),
      normalizeComparisonItem({ point: trustLabel, why_it_matters: validation.warnings?.[0] || "Review caveats before use." }, "Our trust state"),
    ].filter(Boolean);
    const trustThem = [
      normalizeComparisonItem({ point: contradictions[0]?.theme || "Counter-signals exist", why_it_matters: contradictions[0]?.message || "Not all evidence points the same way." }, "Their risk"),
      normalizeComparisonItem({ point: procurementRisk.risk_level ? `${procurementRisk.risk_level} procurement risk` : "Procurement risk not clear", why_it_matters: procurementRisk.procurement_question }, "Their risk posture"),
    ].filter(Boolean);

    const recentUs = [
      normalizeComparisonItem({ point: productMove?.so_what || "Use recent product changes as a question to ask", why_it_matters: productMove?.signal }, "Our move"),
      normalizeComparisonItem({ point: wedge.headline || howToWin.win_by || "Win by focusing on risk and proof", why_it_matters: wedge.proof_motion || wedge.wedge }, "Our move"),
    ].filter(Boolean);
    const recentThem = curatedRecentLaunches.slice(0, 3).map((move) => normalizeComparisonItem(move, "Their move")).filter(Boolean);

    const sentimentUs = [
      normalizeComparisonItem({ point: sentimentSignal?.so_what || "Ask the buyer directly to confirm the pain", why_it_matters: sentimentSignal?.signal }, "Our sentiment posture"),
      normalizeComparisonItem({ point: "Ask for direct buyer evidence", why_it_matters: "Do not overclaim on weak sentiment" }, "Our sentiment play"),
    ].filter(Boolean);
    const sentimentThem = (sentimentThemes.length ? sentimentThemes : [{ theme: "No clear customer feedback was found.", evidence: "Ask buyers directly about support, settlement, or reconciliation problems." }])
      .slice(0, 3)
      .map((theme) => normalizeComparisonItem(theme, "Their sentiment"))
      .filter(Boolean);

    const objectionUs = verificationCards.slice(0, 3).map((script) => normalizeComparisonItem({ point: script.customer_say, why_it_matters: script.downgraded ? script.follow_up : script.script }, "Verify")).filter(Boolean);
    const objectionThem = verificationCards.slice(0, 3).map((script) => normalizeComparisonItem({ point: script.script || script.follow_up, why_it_matters: script.customer_say }, "Buyer cue")).filter(Boolean);

    const sections = [
      {
        id: "pricing",
        kicker: "Pricing",
        title: "Pricing",
        summary: tightenWording(pricingPosture.summary || pricingSignal?.signal || "What they charge and what the buyer worries about."),
        badge: <Badge tone={confidenceTone(pricingSignal?.confidence || pricingPosture.confidence || "medium")}>{pricingSignal?.confidence || pricingPosture.confidence || "directional"}</Badge>,
        us: pricingUs,
        them: pricingThem,
        footer: pricingPosture.discovery_question ? `Ask: ${tightenWording(pricingPosture.discovery_question)}` : "",
      },
      {
        id: "positioning",
        kicker: "Product",
        title: "Product",
        summary: tightenWording(primaryAngle.what_to_say || primaryAngle.angle || "Why the product matters to the buyer."),
        badge: <Badge tone={confidenceTone(primaryAngle.confidence || verdict.confidence)}>{signalQualification({ confidence: primaryAngle.confidence || verdict.confidence, evidenceCount: primaryAngle.evidence_ids?.length || 0, text: primaryAngle.angle })}</Badge>,
        us: positioningUs,
        them: positioningThem,
        footer: primaryAngle.close ? `Try this: ${tightenWording(primaryAngle.close)}` : "",
      },
      {
        id: "trust",
        kicker: "Trust",
        title: "Proof and risk",
        summary: tightenWording(evidencePanel.confidence_reason || "How strong the proof is and what to be careful about."),
        badge: <Badge tone={trustTone}>{trustLabel}</Badge>,
        us: trustUs,
        them: trustThem,
        footer: validation.warnings?.[0] ? `Watch out: ${tightenWording(validation.warnings[0])}` : "",
      },
      {
        id: "recent-moves",
        kicker: "Moves",
        title: "Updates",
        summary: tightenWording(productMove?.signal || "What they changed and what it means for us."),
        badge: <Badge tone={curatedRecentLaunches.length ? "info" : "warning"}>{curatedRecentLaunches.length ? `${curatedRecentLaunches.length} recent` : "Sparse"}</Badge>,
        us: recentUs,
        them: recentThem,
        footer: curatedRecentLaunches[0]?.implication ? `Why it matters: ${tightenWording(curatedRecentLaunches[0].implication)}` : "",
      },
      {
        id: "sentiment",
        kicker: "Sentiment",
        title: "Customer feedback",
        summary: tightenWording(sentimentSignal?.signal || "What buyers are saying and what to ask next."),
        badge: <Badge tone={sentimentThemes.length ? "success" : "warning"}>{sentimentThemes.length ? `${sentimentThemes.length} themes` : "Sparse"}</Badge>,
        us: sentimentUs,
        them: sentimentThem,
        footer: sentimentSignal?.so_what ? `Ask next: ${tightenWording(sentimentSignal.so_what)}` : "",
      },
      {
        id: "objections",
        kicker: "Verify",
        title: "Questions to ask",
        summary: tightenWording("Use these as questions, not as a script."),
        badge: <Badge tone={verificationCards.some((item) => item.downgraded) ? "warning" : "info"}>{verificationCards.some((item) => item.downgraded) ? "Question-led" : `${verificationCards.length} cues`}</Badge>,
        us: objectionUs,
        them: objectionThem,
        footer: "These questions are built into the main flow instead of being a separate script section.",
      },
    ];

    return sections.map((section) => ({
      ...section,
      search: `${section.title} ${section.summary} ${section.footer || ""} ${section.us.map((item) => `${item?.label || ""} ${item?.value || ""} ${item?.detail || ""}`).join(" ")} ${section.them.map((item) => `${item?.label || ""} ${item?.value || ""} ${item?.detail || ""}`).join(" ")}`.toLowerCase(),
    }));
  }, [battlecard.summary, compareVsUs, pricingPosture, pricingSignal, primaryAngle, verdict.summary, verdict.confidence, wins, vulnerable, evidencePanel.confidence_reason, claimTraces.length, evidenceClaims.length, trustLabel, validation.warnings, contradictions, procurementRisk, productMove, curatedRecentLaunches, sentimentSignal, sentimentThemes, verificationCards, howToWin, wedge]);
  const visibleSections = topicSections.filter((section) => {
    const query = sectionQuery.trim().toLowerCase();
    if (!query) return true;
    return section.search.includes(query);
  });
  const compactSectionIds = new Set(["pricing", "positioning", "trust", "sentiment"]);
  const renderedSections = compactView ? visibleSections.filter((section) => compactSectionIds.has(section.id)) : visibleSections;

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return undefined;
    }
    const interval = setInterval(() => {
      setLoadingStep((current) => Math.min(current + 1, loadingStages.length - 1));
    }, 900);
    return () => clearInterval(interval);
  }, [loading]);

  async function runFor(value = name) {
    const competitor = String(value || "").trim();
    if (!competitor) return;
    setName(competitor);
    setLoading(true);
    setError("");
    setResult(null);
    setLoadingStep(0);
    setLoadingStage("Retrieval in progress...");

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor,
          retrievalMode,
          refreshToken: Date.now(),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setResult(await response.json());
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
      setLoadingStage("");
    }
  }

  async function copyText(text) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopyMessage("Copied");
    setTimeout(() => setCopyMessage(""), 1600);
  }

  function downloadMarkdown() {
    if (!markdown) return;
    setLoading(true);
    fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markdown,
        competitor: result?.competitor || name,
        format: "md",
        result,
        battlecard,
        pipeline,
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${result?.competitor || "battlecard"}-battlecard.md`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      })
      .catch((err) => {
        setError(err.message || String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function exportPDF() {
    if (!markdown) return;
    setLoading(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown,
          competitor: result?.competitor || name,
          format: "pdf",
          result,
          battlecard,
          pipeline,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${result?.competitor || "battlecard"}-battlecard.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${colors.bg}; color: ${colors.text}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        button, input, select { font: inherit; }
        button:disabled { opacity: 0.55; cursor: not-allowed; }
        a { color: ${colors.cyan}; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.projectRow}>
              <div style={styles.logo}>{PROJECT_NAME.charAt(0)}</div>
              <div style={{ marginLeft: 12 }}>
                <div style={styles.projectName}>{PROJECT_NAME}</div>
                <div style={styles.projectDescriptor}>Battlecard Studio — Evidence-backed intel</div>
              </div>
            </div>

            <h1 style={styles.h1}>Actionable competitive intelligence, trusted at a glance</h1>
            <p style={styles.subhead}>
              Type a competitor and get a concise, evidence-linked battlecard — retrieval, contradiction checks, confidence scoring, and a verification path.
            </p>
          </div>

          <div style={styles.headerMeta}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge tone="info">Live AI Synthesis</Badge>
              <Badge tone="success">Evidence-Linked Output</Badge>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={styles.ghostButton} onClick={() => setCompactView((current) => !current)}>
                {compactView ? "Full view" : "Compact view"}
              </button>
            </div>
          </div>
        </header>

        <section style={styles.controlBar}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Competitor</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && runFor()}
              placeholder="Razorpay, Paytm, PhonePe..."
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroupSmall}>
            <label style={styles.label}>Data Mode</label>
            <button
              style={styles.select}
              onClick={() => setRetrievalMode(retrievalMode === "live" ? "demo" : "live")}
              type="button"
            >
              {retrievalMode === "live" ? "Live" : "Demo"}
            </button>
          </div>
          <button style={styles.primaryButton} onClick={() => runFor()} disabled={!name || loading}>
            {loading ? currentLoadingStage.label : "Generate Battlecard"}
          </button>
        </section>

        <div style={styles.quickRow}>
          {QUICK.map((item) => (
            <button key={item} style={styles.chip} onClick={() => runFor(item)} disabled={loading}>
              {item}
            </button>
          ))}
          <span style={{ ...styles.metaText, marginLeft: "auto" }}>
            Data: {retrievalMode === "live" ? "Live" : "Demo"}
          </span>
        </div>

        {copyMessage && <div style={styles.toast}>{copyMessage}</div>}
        {error && <div style={styles.error}>Error: {error}</div>}

        {!result && !loading && (
          <section style={styles.empty}>
            <h2 style={styles.emptyTitle}>Simple demo, visible reasoning</h2>
            <p style={styles.bodyText}>Run a competitor and we will show retrieval, contradiction checks, confidence scoring, and final synthesis in one flow.</p>
          </section>
        )}

        {loading && (
          <section style={styles.empty}>
            <div style={styles.liveHeader}>
              <div style={styles.spinner} />
              <div>
                <h2 style={{ ...styles.emptyTitle, marginBottom: 6 }}>{currentLoadingStage.label}</h2>
                <p style={styles.bodyText}>{currentLoadingStage.detail}</p>
              </div>
            </div>
            <div style={styles.liveTrace}>
              {loadingStages.map((step, index) => {
                const done = index < loadingStep;
                const active = index === loadingStep;
                return (
                  <div key={step.label} style={{ ...styles.liveStep, borderColor: active ? `${colors.cyan}55` : styles.liveStep.borderColor }}>
                    <div style={styles.liveStepTop}>
                      <ProgressDot active={active} done={done} />
                      <strong style={{ color: done || active ? colors.text : colors.muted }}>{step.label}</strong>
                      <span style={styles.liveStatus}>{done ? "Done" : active ? "Running" : "Queued"}</span>
                    </div>
                    <p style={styles.liveDetail}>{step.detail}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {result && !loading && (
          <>
            <section style={styles.heroCard}>
              {retrievalMode === "demo" && (
                <div style={{
                  backgroundColor: '#fef08a',
                  border: '2px solid #eab308',
                  color: '#713f12',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  fontWeight: '600',
                }}>
                  DEMO MODE: This battlecard uses curated sample evidence to demonstrate the workflow. Live retrieval requires configured API keys. All sources are marked [DEMO] below.
                </div>
              )}
              {inputCorrection?.from && inputCorrection?.to && (
                <div style={styles.inputCorrection}>
                  Input corrected: using <strong>{inputCorrection.to}</strong> instead of <strong>{inputCorrection.from}</strong>.
                </div>
              )}
              <div style={styles.heroTop}>
                <div style={styles.heroLead}>
                  <div style={styles.kicker}>AE live brief</div>
                  <h2 style={styles.resultTitle}>{result.competitor}</h2>
                  <div style={styles.verdictStack}>
                    {sentenceChunks(verdict.summary || battlecard.summary).map((line, index) => (
                      <div key={index} style={styles.heroSummaryItem}>
                        <span style={styles.heroSummaryLabel}>{index === 0 ? "Main point" : "Watch out"}</span>
                        <p style={styles.verdict}>{plainSummaryLine(line)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={styles.scoreStack}>
                  <Badge tone={String(verdict.threat_level || battlecard.threat_level).toLowerCase().includes("high") ? "danger" : "warning"}>
                    {verdict.threat_level || battlecard.threat_level || "MEDIUM"} threat
                  </Badge>
                  <Badge tone={trustTone}>{trustLabel}</Badge>
                  <Badge tone={confidenceTone(verdict.confidence || evidencePanel.confidence_reason)}>
                    {verdict.confidence || "Directional"} confidence
                  </Badge>
                  <span style={styles.metaText}>
                    {metrics.elapsed_ms ? `${Math.round(metrics.elapsed_ms / 1000)}s` : "Generated"} | {metrics.source_count || sources.length || 0} sources | {metrics.signal_count || 0} signals
                  </span>
                </div>
              </div>

              <div style={styles.decisionCockpit}>
                <div style={styles.decisionCockpitHead}>
                  <div>
                    <div style={styles.kicker}>Key facts</div>
                    <h3 style={styles.cockpitTitle}>What you need to know right now</h3>
                  </div>
                  <Badge tone={sourceQuality.hard_to_google_count ? "success" : "warning"}>
                    {sourceQuality.hard_to_google_count || 0} useful facts
                  </Badge>
                </div>
                <div style={styles.decisionBriefGrid}>
                  {heroKeyPoints.map((card) => {
                    const detailPoints = (card.points || []).filter((point) => insightKey(point) !== insightKey(card.value)).slice(0, 3);
                    return (
                      <div key={card.label} style={card.tone === "danger" ? styles.decisionBriefCardDanger : styles.decisionBriefCard}>
                        <div style={styles.briefingHeader}>
                          <span style={styles.label}>{card.label}</span>
                          <Badge tone={card.tone}>{card.tone}</Badge>
                        </div>
                        <strong>{card.value}</strong>
                        <ul style={styles.decisionPointList}>
                          {detailPoints.map((point, idx) => (
                            <li key={`${card.label}-${idx}`} style={styles.decisionPointItem}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                <p style={styles.metaText}>
                  {heroCaveat} · {heroFootnote}
                </p>
              </div>
            </section>

            <section style={styles.sectionToolbar}>
              <div style={styles.searchGroup}>
                <label style={styles.label}>Find section</label>
                <input
                  value={sectionQuery}
                  onChange={(event) => setSectionQuery(event.target.value)}
                  placeholder="Search pricing, risk, launches, sentiment..."
                  style={styles.searchInput}
                />
              </div>
              <div style={styles.jumpBar}>
                {topicSections.map((section) => (
                  <a key={section.id} href={`#${section.id}`} style={styles.jumpChip}>
                    {section.kicker}
                  </a>
                ))}
              </div>
              <div style={styles.jumpMeta}>{renderedSections.length} visible section{renderedSections.length === 1 ? "" : "s"}</div>
            </section>

            <div style={styles.sectionStack}>
              {renderedSections.length ? renderedSections.map((section) => (
                <ComparisonSection key={section.id} section={section} />
              )) : (
                <section style={styles.empty}>
                  <h2 style={styles.emptyTitle}>No matching sections</h2>
                  <p style={styles.bodyText}>Clear the search filter to show all topics again.</p>
                </section>
              )}
            </div>

            <section style={styles.bottomRail}>
              <div style={styles.bottomRailHead}>
                <div>
                  <div style={styles.kicker}>Sources</div>
                  <h3 style={styles.bottomTitle}>Source list and export</h3>
                </div>
                  <div style={styles.bottomRailActions}>
                    <Badge tone="info">Bottom rail</Badge>
                    <button style={styles.secondaryButton} onClick={() => setShowEvidenceRail((current) => !current)}>
                      {showEvidenceRail || !compactView ? "Collapse" : "Expand"}
                    </button>
                  </div>
              </div>

              {(!compactView || showEvidenceRail) && (
              <div style={styles.bottomStack}>
                <Section title="Sources" aside={<Badge tone="info">{sources.length} total</Badge>}>
                  <div style={styles.sourceList}>
                    {[
                      "Official",
                      "Operational Signals",
                      "Customer Signals",
                      "Market Signals",
                      "Regulatory",
                      "Other",
                    ].map((category) => {
                      const items = groupedSources[category] || [];
                      if (!items.length) return null;
                      return (
                        <div key={category} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <strong style={{ color: colors.cyan }}>{category}</strong>
                            <small style={styles.metaText}>{items.length} item{items.length === 1 ? "" : "s"}</small>
                          </div>
                          {(showAllSources ? items : items.slice(0, 5)).map((source) => {
                            const reviewedSource = (sourceQuality.best_sources || []).find((item) => item.id === source.id) ||
                              (sourceQuality.weak_sources || []).find((item) => item.id === source.id) ||
                              source;

                            let badgeKey = null;
                            const rsStatus = String(reviewedSource.status || reviewedSource.trust || "").toLowerCase();
                            if (rsStatus.includes("verified") || reviewedSource.verified || String(reviewedSource.tier || "").toLowerCase().includes("tier 1")) badgeKey = "verified";
                            if (rsStatus.includes("critical") || String(reviewedSource.tier || "").toLowerCase().includes("tier 5")) badgeKey = "critical";
                            if (!badgeKey && contradictions.some((c) => (c.source_ids || []).includes(source.id))) badgeKey = "conflicted";

                            const badgeTone = badgeKey === "verified" ? "success" : badgeKey === "critical" ? "danger" : badgeKey === "conflicted" ? "warning" : null;

                            return (
                              <a key={source.id || source.url} href={source.url} target="_blank" rel="noreferrer" style={styles.sourceLink}>
                                <div style={styles.sourceLinkHeader}>
                                  <strong>
                                    {source.is_synthetic && '[DEMO] '}
                                    {source.title || "Source"}
                                  </strong>
                                  {badgeKey ? <Badge tone={badgeTone}>{badgeKey}</Badge> : <small style={styles.sourceMeta}>{reviewedSource.tier || "Unranked"}</small>}
                                </div>
                                {!badgeKey && (
                                  <span>{source.type || "source"} | {titleCase(source.source_class || "uncategorized")} | {source.authority || "unknown"} authority | {source.freshness || "unknown"} freshness</span>
                                )}
                                <small style={styles.sourceMeta}>{source.provider || "retrieved"} | {source.published_at || source.retrieved_at || "n.d."} | {reviewedSource.external_use || reviewedSource.reason || "Review before external use."}</small>
                              </a>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  {sources.length > 5 && (
                    <button
                      style={{
                        ...styles.secondaryButton,
                        width: "100%",
                        marginTop: 12,
                        fontSize: 13,
                      }}
                      onClick={() => setShowAllSources(!showAllSources)}
                    >
                      {showAllSources ? `Show Less (${sources.length} total)` : `Show All ${sources.length} Sources`}
                    </button>
                  )}
                </Section>

                <Section title="Claims and checks">
                  <div style={styles.cardList}>
                    {(claimTraces.length ? claimTraces : evidenceClaims).slice(0, 4).map((trace, index) => (
                      <div key={index} style={styles.miniCard}>
                        <strong>{tightenWording(trace.claim || trace.title || trace.point)}</strong>
                        <span>{sourceLabel({ title: trace.source_title || trace.title, published_at: trace.source_date })}</span>
                        <small style={styles.sourceMeta}>{trace.evidence_status || trace.status || "evidence-linked"} | {trace.inference_note || "Review exact source support before external use."}</small>
                      </div>
                    ))}
                  </div>
                </Section>

                {(contradictions.length > 0 || trustReview.needs_review?.length > 0 || trustReview.blocked?.length > 0) && (
                  <Section title="Things to check">
                    <div style={styles.cardList}>
                      {contradictions.slice(0, 3).map((item, index) => (
                        <div key={item.id || index} style={styles.reviewCard}>
                          <div style={styles.contradictionBody}>
                            <strong>{tightenWording(item.theme || "Something does not match")}</strong>
                            <span>{tightenWording(item.message || "These sources do not agree yet.")}</span>
                            {(item.authoritative || item.contradicting) && (
                              <small style={styles.sourceMeta}>
                                Main source: {item.authoritative?.title || "n/a"} | Other source: {item.contradicting?.title || "n/a"}
                              </small>
                            )}
                            {item.buyer_question && <span>{tightenWording(item.buyer_question)}</span>}
                          </div>
                          <Badge tone="warning">flagged</Badge>
                        </div>
                      ))}
                      {(trustReview.needs_review || []).slice(0, 2).map((item, index) => (
                        <div key={`review-${index}`} style={styles.reviewCard}>
                          <strong>{tightenWording(item.claim || item.signal || item.angle)}</strong>
                          <span>{tightenWording((item.trust?.reasons || []).slice(0, 2).join(" ") || "Take another look before using this.")}</span>
                          <Badge tone="warning">review</Badge>
                        </div>
                      ))}
                      {(trustReview.blocked || []).slice(0, 2).map((item, index) => (
                        <div key={`blocked-${index}`} style={styles.reviewCard}>
                          <strong>{tightenWording(item.claim || item.signal || item.angle)}</strong>
                          <span>{tightenWording((item.trust?.reasons || []).slice(0, 2).join(" ") || "Do not use this yet.")}</span>
                          <Badge tone="danger">blocked</Badge>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                <Section title="Export">
                  <div style={styles.exportRow}>
                    <button style={styles.secondaryButton} onClick={downloadMarkdown}>Markdown</button>
                    <button style={styles.secondaryButton} onClick={exportPDF}>PDF</button>
                  </div>
                </Section>

                <details style={styles.advanced} open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
                  <summary style={styles.advancedSummary}>Advanced: Evidence & Pipeline Trace</summary>
                  <div style={styles.advancedBody}>
                    <div style={styles.metricGrid}>
                      <div><span>Retrieval </span><strong>{metrics.retrieval_mode || retrievalMode}</strong></div>
                      <div><span>Provider </span><strong>{metrics.provider_used || "none"}</strong></div>
                      <div><span>LLM </span><strong>{metrics.llm_provider || "none"}</strong></div>
                      <div><span>Validation </span><strong>{validation.status || "ok"}</strong></div>
                    </div>
                    {validation.warnings?.length > 0 && (
                      <>
                        <h3 style={styles.smallHead}>Warnings</h3>
                        <BulletList items={validation.warnings.slice(0, 5)} />
                      </>
                    )}
                    {contradictions.length > 0 && (
                      <>
                        <h3 style={styles.smallHead}>What does not match</h3>
                        <p style={styles.bodyText}>{contradictions.length} item{contradictions.length === 1 ? "" : "s"} still need a closer look.</p>
                      </>
                    )}
                    {(trustReview.needs_review?.length > 0 || trustReview.blocked?.length > 0) && (
                      <>
                        <h3 style={styles.smallHead}>Review notes</h3>
                        <p style={styles.bodyText}>
                          {trustReview.ready_count || 0} ready items and {trustReview.blocked_count || 0} blocked items.
                        </p>
                      </>
                    )}
                  </div>
                </details>
              </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: `radial-gradient(circle at top left, rgba(83,214,255,0.11), transparent 28%), ${colors.bg}`,
  },
  shell: {
    width: "min(1180px, calc(100% - 32px))",
    margin: "0 auto",
    padding: "34px 0 60px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    alignItems: "flex-start",
    marginBottom: 22,
    padding: 18,
    borderRadius: 12,
    background: `linear-gradient(180deg, rgba(83,214,255,0.04), rgba(51,224,182,0.02))`,
    border: `1px solid rgba(83,214,255,0.08)`,
    boxShadow: "0 8px 30px rgba(3,10,18,0.45)",
  },
  headerLeft: {
    display: "grid",
    gap: 10,
    flex: "1 1 720px",
    minWidth: 0,
  },
  projectRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: `linear-gradient(135deg, ${colors.cyan}, ${colors.accent})`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    color: colors.bg,
    fontSize: 22,
  },
  projectName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0.6,
  },
  projectDescriptor: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  brand: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  h1: {
    margin: "8px 0 8px",
    fontSize: 40,
    lineHeight: 1.02,
    letterSpacing: -0.2,
  },
  subhead: {
    margin: 0,
    maxWidth: 720,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 1.6,
  },
  headerMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  controlBar: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) 180px 220px",
    gap: 12,
    padding: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.surface,
  },
  inputGroup: {
    display: "grid",
    gap: 7,
  },
  inputGroupSmall: {
    display: "grid",
    gap: 7,
  },
  label: {
    color: colors.faint,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: 800,
  },
  input: {
    width: "100%",
    height: 46,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.text,
    padding: "0 14px",
    outline: "none",
  },
  select: {
    width: "100%",
    height: 46,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.text,
    padding: "0 12px",
    outline: "none",
  },
  primaryButton: {
    alignSelf: "end",
    height: 46,
    border: "none",
    borderRadius: 8,
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.cyan})`,
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  quickRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    margin: "12px 0 18px",
  },
  chip: {
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    background: colors.inset,
    color: colors.text,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 750,
    cursor: "pointer",
  },
  empty: {
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.card,
    padding: 44,
    color: colors.muted,
  },
  liveHeader: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  liveTrace: {
    display: "grid",
    gap: 10,
  },
  liveStep: {
    display: "grid",
    gap: 8,
    padding: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    textAlign: "left",
  },
  liveStepTop: {
    display: "grid",
    gridTemplateColumns: "14px 1fr auto",
    gap: 10,
    alignItems: "center",
  },
  liveStatus: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  liveDetail: {
    margin: 0,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.55,
  },
  emptyTitle: {
    margin: "0 0 8px",
    color: colors.text,
    fontSize: 20,
  },
  heroCard: {
    border: `1px solid rgba(83,214,255,0.28)`,
    borderRadius: 8,
    background: `linear-gradient(135deg, rgba(83,214,255,0.09), rgba(51,224,182,0.06)), ${colors.card}`,
    padding: 18,
    marginBottom: 14,
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  heroLead: {
    display: "grid",
    gap: 8,
    flex: "1 1 520px",
    minWidth: 0,
  },
  kicker: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  resultTitle: {
    margin: "6px 0 8px",
    fontSize: 28,
    lineHeight: 1.1,
    overflowWrap: "anywhere",
  },
  verdict: {
    margin: 0,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 1.45,
  },
  heroSummaryItem: {
    display: "grid",
    gap: 4,
  },
  heroSummaryLabel: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  verdictStack: {
    display: "grid",
    gap: 4,
  },
  scoreStack: {
    display: "grid",
    gap: 8,
    justifyItems: "end",
    alignContent: "start",
    minWidth: 0,
    flex: "0 0 240px",
  },
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  summaryTile: {
    display: "grid",
    gap: 6,
    padding: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: "rgba(10,16,23,0.72)",
  },
  decisionCockpit: {
    display: "grid",
    gap: 12,
    marginTop: 14,
    padding: 14,
    border: `1px solid rgba(83,214,255,0.26)`,
    borderRadius: 8,
    background: "rgba(7,10,15,0.62)",
  },
  decisionCockpitHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  cockpitTitle: {
    margin: "5px 0 0",
    fontSize: 18,
    lineHeight: 1.2,
  },
  decisionBriefGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
  },
  decisionBriefCard: {
    display: "grid",
    gap: 8,
    minHeight: 112,
    padding: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.45,
  },
  decisionBriefCardDanger: {
    display: "grid",
    gap: 8,
    minHeight: 112,
    padding: 12,
    border: `1px solid rgba(255,90,95,0.36)`,
    borderRadius: 8,
    background: "rgba(255,90,95,0.07)",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.45,
  },
  decisionPointList: {
    margin: 0,
    paddingLeft: 16,
    display: "grid",
    gap: 4,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  decisionPointItem: {
    margin: 0,
  },
  contradictionPair: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
  },
  contradictionEvidence: {
    display: "grid",
    gap: 6,
    padding: 11,
    border: `1px solid rgba(46,213,115,0.26)`,
    borderRadius: 8,
    background: "rgba(46,213,115,0.06)",
    fontSize: 12,
    lineHeight: 1.45,
  },
  contradictionEvidenceWarning: {
    display: "grid",
    gap: 6,
    padding: 11,
    border: `1px solid rgba(245,184,75,0.32)`,
    borderRadius: 8,
    background: "rgba(245,184,75,0.06)",
    fontSize: 12,
    lineHeight: 1.45,
  },
  contradictionGuidance: {
    display: "grid",
    gap: 6,
    padding: 11,
    border: `1px solid rgba(83,214,255,0.25)`,
    borderRadius: 8,
    background: "rgba(83,214,255,0.05)",
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  sourceQualityRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
  },
  sourceQualityPill: {
    display: "grid",
    gap: 6,
    padding: 10,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: "rgba(10,16,23,0.78)",
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  briefingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 10,
    marginTop: 14,
  },
  liveBriefGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 10,
    marginTop: 14,
  },
  liveBriefPanel: {
    display: "grid",
    gap: 10,
    alignContent: "start",
    padding: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: "rgba(10,16,23,0.72)",
  },
  liveBriefPanelDanger: {
    display: "grid",
    gap: 10,
    alignContent: "start",
    padding: 12,
    border: `1px solid rgba(255,90,95,0.34)`,
    borderRadius: 8,
    background: "rgba(255,90,95,0.07)",
  },
  liveBriefItem: {
    display: "grid",
    gap: 4,
    paddingTop: 9,
    borderTop: `1px solid ${colors.border}`,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  briefingCard: {
    display: "grid",
    gap: 8,
    padding: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: "rgba(10,16,23,0.72)",
    minHeight: 98,
  },
  briefingHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  stakeholderRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
    marginTop: 10,
  },
  stakeholderPill: {
    display: "grid",
    gap: 4,
    padding: 11,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  sectionToolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(250px, 320px) 1fr auto",
    gap: 12,
    alignItems: "end",
    padding: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.surface,
    marginBottom: 14,
  },
  searchGroup: {
    display: "grid",
    gap: 7,
  },
  searchInput: {
    width: "100%",
    height: 44,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.text,
    padding: "0 14px",
    outline: "none",
  },
  jumpBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  jumpChip: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 12px",
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 999,
    background: colors.inset,
    color: colors.text,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 800,
  },
  jumpMeta: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  sectionStack: {
    display: "grid",
    gap: 14,
    marginBottom: 14,
  },
  compareSection: {
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    background: colors.card,
    padding: 14,
  },
  compareSectionHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  compareTitle: {
    margin: "6px 0 6px",
    fontSize: 20,
    lineHeight: 1.1,
    overflowWrap: "anywhere",
  },
  compareSummary: {
    margin: 0,
    color: colors.muted,
    lineHeight: 1.5,
    maxWidth: 780,
    fontSize: 13,
  },
  compareGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    alignItems: "start",
  },
  compareColumn: {
    display: "grid",
    gap: 10,
    padding: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.inset,
  },
  compareColumnUs: {
    display: "grid",
    gap: 8,
    padding: 12,
    border: `1px solid rgba(46, 213, 115, 0.34)`,
    borderRadius: 10,
    background: `linear-gradient(180deg, rgba(46,213,115,0.09), rgba(10,16,23,0.96))`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    alignSelf: "start",
  },
  compareColumnThem: {
    display: "grid",
    gap: 8,
    padding: 12,
    border: `1px solid rgba(245, 184, 75, 0.36)`,
    borderRadius: 10,
    background: `linear-gradient(180deg, rgba(245,184,75,0.08), rgba(10,16,23,0.96))`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    alignSelf: "start",
  },
  compareColumnHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  compareColumnLabel: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.faint,
    background: "rgba(255,255,255,0.03)",
  },
  compareColumnBody: {
    display: "grid",
    gap: 8,
  },
  compareItemUs: {
    display: "grid",
    gap: 5,
    padding: 10,
    border: `1px solid rgba(46, 213, 115, 0.24)`,
    borderRadius: 8,
    background: "rgba(7, 10, 15, 0.78)",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  },
  compareItemThem: {
    display: "grid",
    gap: 5,
    padding: 10,
    border: `1px solid rgba(245, 184, 75, 0.24)`,
    borderRadius: 8,
    background: "rgba(7, 10, 15, 0.78)",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  },
  compareItemTitleUs: {
    color: colors.success,
  },
  compareItemTitleThem: {
    color: colors.amber,
  },
  compareFooter: {
    margin: "12px 0 0",
    color: colors.faint,
    fontSize: 12,
    lineHeight: 1.45,
  },
  bottomRail: {
    display: "grid",
    gap: 12,
    padding: 16,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    background: colors.card,
  },
  bottomRailHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  bottomTitle: {
    margin: "6px 0 0",
    fontSize: 18,
    lineHeight: 1.2,
  },
  bottomStack: {
    display: "grid",
    gap: 14,
  },
  metaText: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: 700,
  },
  decisionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 18,
  },
  decisionItem: {
    display: "grid",
    gap: 8,
    padding: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: "rgba(10,16,23,0.72)",
    minHeight: 110,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    gap: 14,
    alignItems: "start",
  },
  mainCol: {
    display: "grid",
    gap: 14,
  },
  sideCol: {
    display: "grid",
    gap: 14,
    position: "sticky",
    top: 14,
  },
  section: {
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.card,
    padding: 18,
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    margin: 0,
    color: colors.text,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bodyText: {
    margin: 0,
    color: colors.muted,
    lineHeight: 1.7,
    fontSize: 14,
  },
  note: {
    margin: "10px 0 0",
    borderLeft: `3px solid ${colors.cyan}`,
    paddingLeft: 10,
    color: colors.text,
    lineHeight: 1.6,
    fontSize: 13,
  },
  list: {
    margin: 0,
    paddingLeft: 18,
    color: colors.muted,
    lineHeight: 1.75,
    fontSize: 14,
  },
  factGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  pipelineGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },
  pipelineStep: {
    display: "grid",
    gap: 7,
    minHeight: 82,
    padding: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.muted,
    fontSize: 12,
  },
  traceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  traceCard: {
    display: "grid",
    gap: 8,
    padding: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
  },
  factCell: {
    display: "grid",
    gap: 6,
    padding: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.muted,
    fontSize: 12,
  },
  cardList: {
    display: "grid",
    gap: 10,
  },
  launchGrid: {
    display: "grid",
    gap: 12,
  },
  launchCard: {
    display: "grid",
    gap: 12,
    padding: 16,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(18,26,36,0.96), rgba(10,16,23,0.98))",
    color: colors.muted,
    boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
  },
  launchHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  launchHeading: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  launchTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 1.35,
    fontWeight: 900,
  },
  launchSummary: {
    margin: 0,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.6,
  },
  launchMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  launchMetaItem: {
    display: "grid",
    gap: 5,
    padding: 11,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.surface,
  },
  launchMetaLabel: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  launchMetaValue: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 1.5,
  },
  sectionKicker: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  miniCard: {
    display: "grid",
    gap: 7,
    padding: 13,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.55,
  },
  miniCardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  claimCard: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "start",
    padding: 13,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.55,
  },
  reviewCard: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "start",
    padding: 13,
    border: `1px solid rgba(245,184,75,0.35)`,
    borderRadius: 8,
    background: "rgba(245,184,75,0.06)",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.55,
  },
  contradictionBody: {
    display: "grid",
    gap: 7,
  },
  questionBox: {
    display: "grid",
    gap: 6,
    marginTop: 12,
    padding: 12,
    border: `1px solid rgba(83,214,255,0.26)`,
    borderRadius: 8,
    background: "rgba(83,214,255,0.06)",
    color: colors.muted,
    fontSize: 12,
  },
  sourceMeta: {
    color: colors.faint,
    fontSize: 11,
    lineHeight: 1.45,
  },
  metricStack: {
    display: "grid",
    gap: 10,
  },
  metricLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    paddingBottom: 10,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.muted,
    fontSize: 13,
  },
  talkTrackGrid: {
    display: "grid",
    gap: 12,
  },
  talkTrackCard: {
    display: "grid",
    gap: 12,
    padding: 16,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(18,26,36,0.96), rgba(10,16,23,0.98))",
    color: colors.muted,
    boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
  },
  talkTrackHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  talkTrackHeading: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  talkTrackActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  talkTrackTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 1.35,
    fontWeight: 900,
  },
  talkTrackBody: {
    display: "grid",
    gap: 8,
  },
  talkTrackBlock: {
    display: "grid",
    gap: 4,
    padding: "11px 12px",
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.inset,
  },
  talkTrackBlockLabel: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  talkTrackBlockValue: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 1.55,
    fontWeight: 700,
  },
  talkTrackNote: {
    margin: 0,
    color: colors.faint,
    fontSize: 11,
    lineHeight: 1.45,
  },
  copyButton: {
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 999,
    background: colors.elevated,
    color: colors.text,
    padding: "9px 12px",
    lineHeight: 1,
    fontWeight: 900,
    cursor: "pointer",
  },
  sourceList: {
    display: "grid",
    gap: 9,
  },
  sourceLink: {
    display: "grid",
    gap: 5,
    padding: 11,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.inset,
    textDecoration: "none",
    color: colors.text,
    fontSize: 12,
    lineHeight: 1.45,
  },
  sourceLinkHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  exportRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  secondaryButton: {
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 8,
    background: colors.inset,
    color: colors.text,
    padding: "11px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  ghostButton: {
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 999,
    background: "transparent",
    color: colors.muted,
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  advanced: {
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.card,
    overflow: "hidden",
  },
  advancedSummary: {
    cursor: "pointer",
    padding: 16,
    fontWeight: 900,
    color: colors.text,
  },
  advancedBody: {
    borderTop: `1px solid ${colors.border}`,
    padding: 16,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 14,
  },
  smallHead: {
    margin: "16px 0 10px",
    color: colors.cyan,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    border: "1px solid",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    whiteSpace: "nowrap",
  },
  toast: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 10,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 8,
    background: colors.elevated,
    color: colors.text,
    padding: "10px 14px",
    fontWeight: 800,
  },
  error: {
    border: `1px solid rgba(255,90,95,0.45)`,
    borderRadius: 8,
    background: "rgba(255,90,95,0.08)",
    color: colors.text,
    padding: 14,
    marginBottom: 14,
  },
  inputCorrection: {
    border: `1px solid rgba(83,214,255,0.45)`,
    borderRadius: 8,
    background: "rgba(83,214,255,0.10)",
    color: colors.text,
    padding: "12px 14px",
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 1.4,
  },
  spinner: {
    width: 28,
    height: 28,
    flexShrink: 0,
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.cyan,
    borderRadius: "50%",
    animation: "spin 900ms linear infinite",
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    border: `1px solid ${colors.borderStrong}`,
  },
};
