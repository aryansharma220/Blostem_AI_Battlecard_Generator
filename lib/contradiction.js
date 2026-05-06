// Simple contradiction detection between authoritative sources and sentiment/review signals

export function detectContradictions(sources = [], signals = []) {
  const sourceMap = Object.fromEntries((sources || []).map((s) => [s.id, s]));

  const authoritative = (sources || []).filter((s) => ["docs", "pricing", "company"].includes((s.type || "").toLowerCase()));
  const sentiment = (sources || []).filter((s) => ["reviews", "reddit", "forum"].includes((s.type || "").toLowerCase()));

  const contradictions = [];

  // Heuristic: look for keywords in authoritative vs sentiment that conflict
  authoritative.forEach((auth) => {
    const atext = `${auth.title} ${auth.snippet}`.toLowerCase();
    if (/transparent pricing|no hidden|simple pricing/.test(atext)) {
      sentiment.forEach((sent) => {
        const stext = `${sent.title} ${sent.snippet}`.toLowerCase();
        if (/hidden|charge|settlement|fee|payout/.test(stext)) {
          contradictions.push({
            id: `ct_${contradictions.length + 1}`,
            theme: "Pricing contradiction",
            message: "Official messaging claims pricing simplicity but customer reports mention hidden fees or settlement issues.",
            authoritative: { id: auth.id, title: auth.title, snippet: auth.snippet, url: auth.url },
            contradicting: { id: sent.id, title: sent.title, snippet: sent.snippet, url: sent.url },
          });
        }
      });
    }
  });

  // Additional generic contradictions: security/compliance vs customer complaints
  authoritative.forEach((auth) => {
    const atext = `${auth.title} ${auth.snippet}`.toLowerCase();
    if (/secure|compliant|rbi|pci|certified/.test(atext)) {
      sentiment.forEach((sent) => {
        const stext = `${sent.title} ${sent.snippet}`.toLowerCase();
        if (/breach|outage|downtime|fraud/.test(stext)) {
          contradictions.push({
            id: `ct_${contradictions.length + 1}`,
            theme: "Security contradiction",
            message: "Official security/compliance claims are contrasted by operational incidents reported by users.",
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
    if (/transparent pricing/.test(text) && /hidden fee|settlement/.test(text)) {
      contradictions.push({ id: `ct_${contradictions.length + 1}`, theme: "Internal contradiction", message: "Signals contain both pricing simplicity and hidden-fee reports.", sample: s });
    }
  });

  return contradictions;
}

export default detectContradictions;
