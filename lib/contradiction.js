// Source-class-aware contradiction detection between official messaging, operational evidence, and sentiment signals

function normalizeText(source = {}) {
  return `${source.title || ""} ${source.snippet || ""} ${source.url || ""}`.toLowerCase();
}

function isOfficialClass(source = {}) {
  const sourceClass = String(source.source_class || "").toLowerCase();
  const type = String(source.type || "").toLowerCase();
  if (["forum", "reviews", "reddit"].includes(type)) return false;
  if (sourceClass === "compliance_operational" && String(source.authority || "").toLowerCase() === "low") return false;
  return ["official_product", "compliance_operational", "ecosystem", "ecosystem_signals"].includes(sourceClass);
}

function isDirectionalClass(source = {}) {
  return [
    "customer_sentiment",
    "community",
    "community_signals",
    "employee",
    "employee_signals",
    "market",
    "market_signals",
  ].includes(String(source.source_class || "").toLowerCase());
}

export function detectContradictions(sources = [], signals = []) {
  const sourceMap = Object.fromEntries((sources || []).map((s) => [s.id, s]));

  const authoritative = (sources || []).filter((s) => isOfficialClass(s) || ["docs", "pricing", "company"].includes((s.type || "").toLowerCase()));
  const sentiment = (sources || []).filter((s) => isDirectionalClass(s) || ["reviews", "reddit", "forum"].includes((s.type || "").toLowerCase()));

  const contradictions = [];

  // Heuristic: look for keywords in authoritative vs sentiment that conflict
  authoritative.forEach((auth) => {
    const atext = normalizeText(auth);
    if (/transparent pricing|no hidden|simple pricing|predictable pricing|settlement visibility|reconciliation visibility/.test(atext)) {
      sentiment.forEach((sent) => {
        const stext = normalizeText(sent);
        if (/hidden|charge|settlement|fee|payout|reconciliation|support|delay|unresponsive/.test(stext)) {
          contradictions.push({
            id: `ct_${contradictions.length + 1}`,
            theme: "Pricing contradiction",
            message: "Official pricing or operations simplicity is countered by directional friction evidence.",
            uncertainty_marker: "Detected via keyword analysis. Verify by asking the buyer directly.",
            buyer_question: "Which fees, payouts, refunds, or reconciliation paths create surprise after volume grows?",
            external_use_policy: "Internal verification cue only. Do not accuse the competitor.",
            authoritative: { id: auth.id, title: auth.title, snippet: auth.snippet, url: auth.url },
            contradicting: { id: sent.id, title: sent.title, snippet: sent.snippet, url: sent.url },
          });
        }
      });
    }
  });

  // Additional generic contradictions: security/compliance vs customer complaints
  authoritative.forEach((auth) => {
    const atext = normalizeText(auth);
    if (/secure|compliant|rbi|pci|certified|audit|governance|uptime|sla/.test(atext)) {
      sentiment.forEach((sent) => {
        const stext = normalizeText(sent);
        if (/breach|outage|downtime|fraud|latency|support|incident|reconciliation|settlement/.test(stext)) {
          contradictions.push({
            id: `ct_${contradictions.length + 1}`,
            theme: "Security contradiction",
            message: "Official security or compliance language is contrasted by operational friction evidence.",
            uncertainty_marker: "Detected via keyword analysis. Verify by requesting audit evidence or customer references.",
            buyer_question: "What audit artifact or customer reference would resolve this risk for procurement?",
            external_use_policy: "Use as procurement diligence, not a public competitive claim.",
            authoritative: { id: auth.id, title: auth.title, snippet: auth.snippet, url: auth.url },
            contradicting: { id: sent.id, title: sent.title, snippet: sent.snippet, url: sent.url },
          });
        }
      });
    }
  });

  authoritative.forEach((auth) => {
    const atext = normalizeText(auth);
    if (/hiring|team|careers|talent|roles|engineer|operations/.test(atext)) {
      sentiment.forEach((sent) => {
        const stext = normalizeText(sent);
        if (/support|onboarding|reconciliation|settlement|migration|delay|scale/.test(stext)) {
          contradictions.push({
            id: `ct_${contradictions.length + 1}`,
            theme: "Operational focus contradiction",
            message: "Hiring emphasis suggests a scaling priority, while directional evidence points to operational friction.",
            uncertainty_marker: "Detected via signal clustering. Verify by asking about support SLAs and scaling experience.",
            buyer_question: "Is the team expanding capacity, or correcting a bottleneck buyers already feel?",
            external_use_policy: "Directional clue only. Ask the buyer to validate the pattern.",
            authoritative: { id: auth.id, title: auth.title, snippet: auth.snippet, url: auth.url },
            contradicting: { id: sent.id, title: sent.title, snippet: sent.snippet, url: sent.url },
          });
        }
      });
    }
  });

  // Also compare extracted signals for contradictions (simple overlap of opposite keywords)
  (signals || []).forEach((s) => {
    const text = (s.insight || s.signal || "").toLowerCase();
    if (/transparent pricing/.test(text) && /hidden fee|settlement|reconciliation/.test(text)) {
      contradictions.push({ 
        id: `ct_${contradictions.length + 1}`, 
        theme: "Internal contradiction", 
        message: "Signals contain both pricing simplicity and operational friction cues.",
        uncertainty_marker: "Detected via signal overlap. May indicate a complex product with specific use cases.",
        sample: s 
      });
    }
  });

  return contradictions;
}

export default detectContradictions;
