import { useEffect, useMemo, useState } from "react";

const QUICK = ["Razorpay", "Paytm", "PhonePe"];
const DEAL_STAGES = ["discovery", "shortlist", "negotiation", "contract"];

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

function formatTalkTrackCopy(script = {}) {
  const aeLine = script.downgraded
    ? script.follow_up || "Use this as a question, not a hard claim."
    : script.script || "Use this as a question, not a hard claim.";
  return [
    `Buyer says: ${tightenWording(script.customer_say || "Why switch?")}`,
    `AE says: ${tightenWording(aeLine)}`,
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
  return linked.map((source) => `${source.title || "Source"} | ${source.type || "source"} | ${source.published_at || source.retrieved_at || "n.d."}`).join(" + ");
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

function buildBattlecardMarkdown({ result, dealStage }) {
  if (!result) return "";
  const bc = result.battlecard || {};
  const pipeline = result.pipeline || {};
  const verdict = bc.ae_quick_verdict || {};
  const signals = bc.competitive_signals || [];
  const angles = bc.attack_angles || [];
  const scripts = bc.live_call_scripts || [];
  const recentMoves = bc.recent_moves || [];
  const recentLaunches = bc.recent_launches || recentMoves;
  const pricingPosture = bc.pricing_posture || {};
  const sentimentThemes = bc.customer_sentiment || [];
  const vulnerable = bc.where_vulnerable || [];
  const wins = bc.where_they_win || [];
  const evidenceClaims = bc.evidence_linked_claims || [];
  const wedge = bc.blostem_wedge || {};
  const evidenceSources = bc.evidence_panel?.sources || [];
  const sources = evidenceSources.length ? evidenceSources : (pipeline.sources || []).map((source) => ({
    label: source.title,
    url: source.url,
  }));

  const lines = [];
  lines.push(`# ${result.competitor} Battlecard`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Deal stage: ${bc.deal_stage || dealStage}`);
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
  lines.push("## How Blostem Wins");
  lines.push(cleanLine(wedge.headline || bc.how_to_win?.win_by || angles[0]?.angle || "Win with evidence-backed decision criteria."));
  lines.push(cleanLine(wedge.wedge || ""));
  lines.push(`Kill question: ${cleanLine(bc.how_to_win?.kill_question || angles[0]?.closing_question || angles[0]?.close || "What breaks first at scale?")}`);
  lines.push("");
  lines.push("## Evidence-Linked Claims");
  evidenceClaims.slice(0, 4).forEach((claim, index) => {
    lines.push(`${index + 1}. ${cleanLine(claim.claim)} (${claim.confidence})`);
    if (claim.evidence?.[0]) lines.push(`   Source: ${claim.evidence[0].title} - ${claim.evidence[0].url}`);
  });
  lines.push("");
  lines.push("## AE Talk Tracks");
  scripts.slice(0, 3).forEach((script, index) => {
    lines.push(`${index + 1}. Buyer: "${cleanLine(script.customer_say)}"`);
    lines.push(`   AE: "${cleanLine(script.script)}"`);
    lines.push(`   Follow-up: "${cleanLine(script.follow_up)}"`);
  });
  if (!scripts.length && angles[0]) {
    lines.push(`1. AE: "${cleanLine(angles[0].what_to_say)}"`);
    lines.push(`   Follow-up: "${cleanLine(angles[0].close || angles[0].closing_question)}"`);
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
    { label: "Synthesis", detail: "Writing a concise battlecard and talk tracks" },
    { label: "Validation", detail: "Downgrading weak claims before output" },
  ];
  const [name, setName] = useState("");
  const [dealStage, setDealStage] = useState("discovery");
  const [retrievalMode, setRetrievalMode] = useState("live");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const battlecard = result?.battlecard || {};
  const pipeline = result?.pipeline || {};
  const metrics = pipeline.metrics || {};
  const verdict = battlecard.ae_quick_verdict || {};
  const signals = battlecard.competitive_signals || [];
  const angles = battlecard.attack_angles || [];
  const scripts = battlecard.live_call_scripts || [];
  const recentMoves = battlecard.recent_moves || [];
  const recentLaunches = battlecard.recent_launches || recentMoves;
  const pricingPosture = battlecard.pricing_posture || {};
  const sentimentThemes = battlecard.customer_sentiment || [];
  const evidenceClaims = battlecard.evidence_linked_claims || [];
  const trustReview = battlecard.trust_review || pipeline.trust_review || {};
  const vulnerable = battlecard.where_vulnerable || [];
  const wins = battlecard.where_they_win || [];
  const wedge = battlecard.blostem_wedge || {};
  const pipelineSteps = pipeline.steps || [];
  const howToWin = battlecard.how_to_win || {};
  const validation = pipeline.validation || battlecard.validation || {};
  const sources = pipeline.sources || [];
  const claimTraces = pipeline.claim_traces || [];
  const contradictions = pipeline.contradictions || [];
  const evidencePanel = battlecard.evidence_panel || {};

  const markdown = useMemo(() => buildBattlecardMarkdown({ result, dealStage }), [result, dealStage]);
  const primaryAngle = angles[0] || {};
  const primaryScript = scripts[0] || {};
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
  const talkTrackCards = useMemo(() => {
    const baseScripts = scripts.length
      ? scripts
      : [{ customer_say: `We already know ${result?.competitor || name || "them"}.`, script: primaryAngle.what_to_say, follow_up: primaryAngle.close }];

    return baseScripts.slice(0, 3).map((script, index) => ({
      ...script,
      title: cleanLaunchText(script.scenario || (script.downgraded ? "Question-led path" : `Call path ${index + 1}`), `Call path ${index + 1}`),
      customer_say: cleanLaunchText(script.customer_say || "Why switch?", "Why switch?"),
      script: cleanLaunchText(script.script || "The risk shows up after scale.", "The risk shows up after scale."),
      follow_up: cleanLaunchText(script.follow_up || "What strains first when volume doubles?", "What strains first when volume doubles?"),
    }));
  }, [scripts, primaryAngle, result?.competitor, name]);
  const trustTone = validation.status === "critical" ? "warning" : validation.status === "ok" ? "success" : "info";
  const trustLabel = validation.status === "critical"
    ? "Needs evidence review"
    : validation.status === "warn"
      ? "Evidence-linked, review caveats"
      : "Evidence-linked";
  const currentLoadingStage = loadingStages[loadingStep] || loadingStages[0];

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
          dealStage,
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
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result?.competitor || "battlecard"}-battlecard.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    if (!markdown) return;
    setLoading(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, competitor: result?.competitor || name, format: "pdf" }),
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
          <div>
            <div style={styles.brand}>BL AI Battlecard Studio</div>
            <h1 style={styles.h1}>Competitive intel judges can trust at a glance</h1>
            <p style={styles.subhead}>
              Enter a fintech competitor. We retrieve live evidence, test it for conflicts, score confidence, and turn it into a tighter one-page battlecard.
            </p>
          </div>
          <div style={styles.headerMeta}>
            <Badge tone="info">Live AI synthesis</Badge>
            <Badge tone="success">Evidence-linked output</Badge>
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
            <label style={styles.label}>Deal Stage</label>
            <select value={dealStage} onChange={(event) => setDealStage(event.target.value)} style={styles.select}>
              {DEAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>{titleCase(stage)}</option>
              ))}
            </select>
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
          <button
            style={{ ...styles.chip, marginLeft: "auto" }}
            onClick={() => setRetrievalMode(retrievalMode === "live" ? "demo" : "live")}
          >
            Data: {retrievalMode === "live" ? "Live" : "Demo"}
          </button>
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
              <div style={styles.heroTop}>
                <div>
                  <div style={styles.kicker}>One-page Battlecard</div>
                  <h2 style={styles.resultTitle}>{result.competitor}</h2>
                  <div style={styles.verdictStack}>
                    {sentenceChunks(verdict.summary || battlecard.summary).map((line, index) => (
                      <p key={index} style={styles.verdict}>{line}</p>
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

              <div style={styles.summaryStrip}>
                <div style={styles.summaryTile}>
                  <span style={styles.label}>Confidence</span>
                  <strong>{verdict.confidence || "Directional"}</strong>
                  <small style={styles.metaText}>{tightenWording(evidencePanel.confidence_reason || "Confidence is computed from evidence quality.")}</small>
                </div>
                <div style={styles.summaryTile}>
                  <span style={styles.label}>Contradictions</span>
                  <strong>{contradictions.length ? `${contradictions.length} flagged` : "None flagged"}</strong>
                  <small style={styles.metaText}>{contradictions[0] ? tightenWording(contradictions[0].theme) : "No major source conflicts surfaced in this run."}</small>
                </div>
                <div style={styles.summaryTile}>
                  <span style={styles.label}>Traceability</span>
                  <strong>{evidencePanel.traceability || `${claimTraces.length}/${claimTraces.length} claims linked`}</strong>
                  <small style={styles.metaText}>{evidencePanel.coverage || "Evidence coverage summary unavailable."}</small>
                </div>
              </div>

              <div style={styles.decisionGrid}>
                <div style={styles.decisionItem}>
                  <span style={styles.label}>Best angle</span>
                  <strong>{tightenWording(primaryAngle.angle || "Evidence-backed procurement framing")}</strong>
                </div>
                <div style={styles.decisionItem}>
                  <span style={styles.label}>Kill question</span>
                  <strong>{tightenWording(howToWin.kill_question || primaryAngle.close || primaryAngle.closing_question || "What strains first at scale?")}</strong>
                </div>
                <div style={styles.decisionItem}>
                  <span style={styles.label}>AE line</span>
                  <strong>{tightenWording(primaryScript.script || primaryAngle.what_to_say || "Use the evidence, then move to risk.")}</strong>
                </div>
              </div>
            </section>

            <div style={styles.twoCol}>
              <div style={styles.mainCol}>
                <Section title="Positioning">
                  <div style={styles.factGrid}>
                    <div style={styles.factCell}><span>Category</span><strong>{battlecard.category || "Fintech/BFSI"}</strong></div>
                    <div style={styles.factCell}><span>Primary Segment</span><strong>{battlecard.primary_segment || "Unknown"}</strong></div>
                    <div style={styles.factCell}><span>Geography</span><strong>{battlecard.geography || "India"}</strong></div>
                  </div>
                </Section>

                <Section title="Live AI Pipeline">
                  <div style={styles.pipelineGrid}>
                    {(pipelineSteps.length ? pipelineSteps : [
                      { label: "Retrieve", detail: `${metrics.source_count || 0} sources` },
                      { label: "Extract", detail: `${metrics.signal_count || 0} signals` },
                      { label: "Reason", detail: metrics.llm_configured ? "Live LLM synthesis" : "Heuristic fallback" },
                      { label: "Validate", detail: validation.status || "review" },
                    ]).map((step, index) => (
                      <div key={index} style={styles.pipelineStep}>
                        <span>{step.label}</span>
                        <strong>{tightenWording(step.detail)}</strong>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Reasoning Trace">
                  <div style={styles.traceGrid}>
                    <div style={styles.traceCard}>
                      <span style={styles.label}>Retrieved</span>
                      <strong>{metrics.source_count || sources.length || 0} sources</strong>
                      <p style={styles.bodyText}>Mix: {Object.entries(metrics.source_type_breakdown || {}).slice(0, 3).map(([type, count]) => `${type} ${count}`).join(" | ") || "No source mix available."}</p>
                    </div>
                    <div style={styles.traceCard}>
                      <span style={styles.label}>Synthesized</span>
                      <strong>{metrics.signal_count || 0} signals</strong>
                      <p style={styles.bodyText}>{metrics.llm_configured ? `Live ${metrics.llm_provider || "LLM"} synthesis used.` : "Heuristic fallback used for synthesis."}</p>
                    </div>
                    <div style={styles.traceCard}>
                      <span style={styles.label}>Intelligence generated</span>
                      <strong>{claimTraces.length || evidenceClaims.length || 0} usable claims</strong>
                      <p style={styles.bodyText}>{tightenWording(evidencePanel.methodology || "Confidence is computed from linked evidence count, authority, and freshness.")}</p>
                    </div>
                  </div>
                </Section>

                <Section title="Where They Win">
                  <div style={styles.cardList}>
                    {(wins.length ? wins : [{ point: verdict.summary || battlecard.summary, why_it_matters: "Respect the strength before challenging tradeoffs.", evidence_ids: [] }]).slice(0, 3).map((item, index) => (
                        <div key={index} style={styles.miniCard}>
                        <strong>{tightenWording(item.point)}</strong>
                        <span>{tightenWording(item.why_it_matters)}</span>
                        <small style={styles.sourceMeta}>{sourceFootnote(item.evidence_ids, sources)}</small>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Where They Are Vulnerable">
                  <div style={styles.cardList}>
                    {(vulnerable.length ? vulnerable : angles).slice(0, 3).map((item, index) => (
                      <div key={index} style={styles.miniCard}>
                        <strong>{tightenWording(item.point || item.angle)}</strong>
                        <span>{tightenWording(item.why_it_matters || item.when_to_use)}</span>
                        <em>"{tightenWording(item.ae_question || item.close || item.closing_question || "What strains first at scale?")}"</em>
                        <small style={styles.sourceMeta}>{sourceFootnote(item.evidence_ids, sources)}</small>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Pricing Posture" aside={pricingSignal?.confidence && <Badge tone={confidenceTone(pricingSignal.confidence)}>{pricingSignal.confidence}</Badge>}>
                  <p style={styles.bodyText}>{tightenWording(pricingPosture.summary || pricingSignal?.signal || pricingSignal?.so_what || "No strong pricing posture extracted.")}</p>
                  {pricingPosture.blostem_attack && <p style={styles.note}>{tightenWording(pricingPosture.blostem_attack)}</p>}
                  <div style={styles.questionBox}>
                    <span>Procurement question</span>
                    <strong>{tightenWording(pricingPosture.discovery_question || "Which pricing assumption becomes expensive after rollout?")}</strong>
                  </div>
                  <small style={styles.sourceMeta}>{sourceFootnote(pricingPosture.evidence_ids, sources)}</small>
                </Section>

                <Section title="Recent Launches / GTM Moves" aside={<Badge tone={curatedRecentLaunches.length ? "info" : "warning"}>{curatedRecentLaunches.length ? `${curatedRecentLaunches.length} recent` : "Filtered"}</Badge>}>
                  {curatedRecentLaunches.length ? (
                    <div style={styles.launchGrid}>
                      {curatedRecentLaunches.slice(0, 3).map((move, index) => (
                        <article key={index} style={styles.launchCard}>
                          <div style={styles.launchHeader}>
                            <div style={styles.launchHeading}>
                              <span style={styles.sectionKicker}>Recent move</span>
                              <strong style={styles.launchTitle}>{move.move}</strong>
                            </div>
                            <Badge tone={confidenceTone(move.confidence)}>{move.confidence || "directional"}</Badge>
                          </div>
                          <p style={styles.launchSummary}>{move.implication || "Verify details, then use it as a discovery prompt."}</p>
                          <div style={styles.launchMetaGrid}>
                            <div style={styles.launchMetaItem}>
                              <span style={styles.launchMetaLabel}>Use it for</span>
                              <strong style={styles.launchMetaValue}>{move.ae_move || "Use as a question until the source is checked."}</strong>
                            </div>
                            <div style={styles.launchMetaItem}>
                              <span style={styles.launchMetaLabel}>Source note</span>
                              <strong style={styles.launchMetaValue}>{normalizeEvidenceSnippet(move.ae_move || move.implication || "Verify the linked source before using this live.")}</strong>
                            </div>
                          </div>
                          <small style={styles.sourceMeta}>{sourceFootnote(move.source_id ? [move.source_id] : [], sources)}</small>
                        </article>
                      ))}
                    </div>
                  ) : productMove ? (
                    <div style={styles.miniCard}>
                      <strong>{tightenWording(productMove.signal)}</strong>
                      <span>{tightenWording(productMove.so_what || "Use this as a discovery prompt and verify launch specifics before overclaiming.")}</span>
                    </div>
                  ) : (
                    <p style={styles.bodyText}>No verified recent launch found in this run. Do not overclaim freshness.</p>
                  )}
                </Section>

                <Section title="Customer Sentiment">
                  <div style={styles.cardList}>
                    {(sentimentThemes.length ? sentimentThemes : [{
                      theme: sentimentSignal?.signal || "No reliable customer sentiment theme was extracted.",
                      evidence: sentimentSignal?.so_what || "Use buyer discovery to verify support, settlement, or reconciliation pain.",
                      ae_move: "Ask the prospect what they have experienced directly.",
                      evidence_ids: sentimentSignal?.evidence_ids || [],
                    }]).slice(0, 3).map((theme, index) => (
                      <div key={index} style={styles.miniCard}>
                        <strong>{tightenWording(theme.theme)}</strong>
                        <span>{tightenWording(theme.evidence)}</span>
                        <em>{tightenWording(theme.ae_move)}</em>
                        <small style={styles.sourceMeta}>{sourceFootnote(theme.evidence_ids, sources)}</small>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="How Blostem Wins">
                  <p style={styles.bodyText}>{tightenWording(wedge.headline || howToWin.win_by || primaryAngle.angle || "Win by forcing a proof-backed comparison around cost, control, and operating risk.")}</p>
                  {wedge.wedge && <p style={styles.note}>{tightenWording(wedge.wedge)}</p>}
                  {wedge.proof_motion && <p style={styles.bodyText}>{tightenWording(wedge.proof_motion)}</p>}
                  <BulletList items={howToWin.sequence || []} />
                </Section>

                <Section title="Evidence-Linked Claims">
                  <div style={styles.cardList}>
                    {(evidenceClaims.length ? evidenceClaims : claimTraces).slice(0, 4).map((claim, index) => (
                      <div key={index} style={styles.claimCard}>
                        <div>
                          <strong>{tightenWording(claim.claim)}</strong>
                          <span>{tightenWording(claim.ae_use || claim.rebuttal || "Use this only with the linked evidence.")}</span>
                        </div>
                        <Badge tone={claim.status === "ready" ? "success" : claim.status === "use_as_question" ? "warning" : "danger"}>
                          {claim.confidence || claim.evidence_tier || claim.status || "linked"}
                        </Badge>
                        <small style={styles.sourceMeta}>
                          {claim.evidence?.[0]?.title || claim.source_title || sourceFootnote(claim.evidence_ids || claim.source_ids, sources)}
                        </small>
                      </div>
                    ))}
                  </div>
                </Section>

                {contradictions.length > 0 && (
                  <Section title="Contradictions">
                    <div style={styles.cardList}>
                      {contradictions.slice(0, 3).map((item, index) => (
                        <div key={item.id || index} style={styles.reviewCard}>
                          <div style={styles.contradictionBody}>
                            <strong>{tightenWording(item.theme || "Evidence conflict")}</strong>
                            <span>{tightenWording(item.message || "Sources disagree and need review before use.")}</span>
                            <small style={styles.sourceMeta}>
                              {item.authoritative?.title ? `Official: ${item.authoritative.title}` : ""}
                              {item.authoritative?.title && item.contradicting?.title ? " | " : ""}
                              {item.contradicting?.title ? `Counter-signal: ${item.contradicting.title}` : ""}
                            </small>
                          </div>
                          <Badge tone="warning">flagged</Badge>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {(trustReview.needs_review?.length > 0 || trustReview.blocked?.length > 0) && (
                  <Section title="Needs Review">
                    <div style={styles.cardList}>
                      {(trustReview.needs_review || []).slice(0, 3).map((item, index) => (
                        <div key={`review-${index}`} style={styles.reviewCard}>
                          <strong>{tightenWording(item.claim || item.signal || item.angle)}</strong>
                          <span>{tightenWording((item.trust?.reasons || []).slice(0, 2).join(" ") || "Evidence needs review before use.")}</span>
                          <Badge tone="warning">review</Badge>
                        </div>
                      ))}
                      {(trustReview.blocked || []).slice(0, 3).map((item, index) => (
                        <div key={`blocked-${index}`} style={styles.reviewCard}>
                          <strong>{tightenWording(item.claim || item.signal || item.angle)}</strong>
                          <span>{tightenWording((item.trust?.reasons || []).slice(0, 2).join(" ") || "Blocked from the main battlecard.")}</span>
                          <Badge tone="danger">blocked</Badge>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                <Section title="AE Talk Tracks" aside={<Badge tone={talkTrackCards.some((item) => item.downgraded) ? "warning" : "info"}>{talkTrackCards.some((item) => item.downgraded) ? "Question-led" : `${talkTrackCards.length} call paths`}</Badge>}>
                  <div style={styles.talkTrackGrid}>
                    {talkTrackCards.map((script, index) => (
                      <article key={index} style={styles.talkTrackCard}>
                        <div style={styles.talkTrackHeader}>
                          <div style={styles.talkTrackHeading}>
                            <span style={styles.sectionKicker}>{script.title}</span>
                            <strong style={styles.talkTrackTitle}>{script.customer_say}</strong>
                          </div>
                          <div style={styles.talkTrackActions}>
                            <Badge tone={script.downgraded ? "warning" : "info"}>{script.downgraded ? "Question-led" : "Talk track"}</Badge>
                            <button style={styles.copyButton} onClick={() => copyText(formatTalkTrackCopy(script))}>Copy</button>
                          </div>
                        </div>
                        <div style={styles.talkTrackBody}>
                          <div style={styles.talkTrackBlock}>
                            <span style={styles.talkTrackBlockLabel}>{script.downgraded ? "AE asks" : "AE says"}</span>
                            <strong style={styles.talkTrackBlockValue}>"{script.downgraded ? script.follow_up : script.script}"</strong>
                          </div>
                          <div style={styles.talkTrackBlock}>
                            <span style={styles.talkTrackBlockLabel}>{script.downgraded ? "Supporting note" : "Follow-up"}</span>
                            <em style={styles.talkTrackBlockValue}>"{script.downgraded ? script.script : script.follow_up}"</em>
                          </div>
                        </div>
                        {script.downgraded && <p style={styles.talkTrackNote}>Use as a question until the linked evidence is reviewed.</p>}
                      </article>
                    ))}
                  </div>
                </Section>
              </div>

              <aside style={styles.sideCol}>
                <Section title="Confidence">
                  <div style={styles.metricStack}>
                    <div style={styles.metricLine}>
                      <span>Overall</span>
                      <strong style={{ color: confidenceColor(verdict.confidence) }}>{verdict.confidence || "Directional"}</strong>
                    </div>
                    <div style={styles.metricLine}>
                      <span>Coverage</span>
                      <strong>{evidencePanel.coverage || "Not available"}</strong>
                    </div>
                    <div style={styles.metricLine}>
                      <span>Freshness</span>
                      <strong>{evidencePanel.freshness || "Not available"}</strong>
                    </div>
                    <div style={styles.metricLine}>
                      <span>Unsupported</span>
                      <strong>{evidencePanel.unsupported_claims ?? 0} claims</strong>
                    </div>
                  </div>
                  <p style={{ ...styles.bodyText, marginTop: 12 }}>{tightenWording(evidencePanel.confidence_reason || "Confidence is computed from evidence quality and coverage.")}</p>
                </Section>

                <Section title="Sources">
                  <div style={styles.sourceList}>
                    {sources.slice(0, 7).map((source) => (
                      <a key={source.id || source.url} href={source.url} target="_blank" rel="noreferrer" style={styles.sourceLink}>
                        <strong>{source.title || "Source"}</strong>
                        <span>{source.type || "source"} | {source.provider || "retrieved"}</span>
                      </a>
                    ))}
                  </div>
                </Section>

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
                    {claimTraces.length > 0 && (
                      <>
                        <h3 style={styles.smallHead}>Claim Trace</h3>
                        <div style={styles.cardList}>
                          {claimTraces.slice(0, 4).map((trace, index) => (
                            <div key={index} style={styles.miniCard}>
                              <strong>{tightenWording(trace.claim)}</strong>
                              <span>{sourceLabel({ title: trace.source_title, published_at: trace.source_date })}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {contradictions.length > 0 && (
                      <>
                        <h3 style={styles.smallHead}>Contradiction Scan</h3>
                        <p style={styles.bodyText}>{contradictions.length} conflict{contradictions.length === 1 ? "" : "s"} flagged between official and directional evidence.</p>
                      </>
                    )}
                    {(trustReview.needs_review?.length > 0 || trustReview.blocked?.length > 0) && (
                      <>
                        <h3 style={styles.smallHead}>Trust Gate</h3>
                        <p style={styles.bodyText}>
                          {trustReview.ready_count || 0} ready/question-ready items, {trustReview.blocked_count || 0} blocked.
                        </p>
                      </>
                    )}
                  </div>
                </details>
              </aside>
            </div>
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
    fontSize: 34,
    lineHeight: 1.05,
    letterSpacing: 0,
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
    padding: 22,
    marginBottom: 14,
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "flex-start",
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
    fontSize: 30,
    lineHeight: 1.1,
  },
  verdict: {
    margin: 0,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 1.55,
  },
  verdictStack: {
    display: "grid",
    gap: 4,
  },
  scoreStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-end",
    minWidth: 220,
  },
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 18,
  },
  summaryTile: {
    display: "grid",
    gap: 6,
    padding: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: "rgba(10,16,23,0.72)",
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
