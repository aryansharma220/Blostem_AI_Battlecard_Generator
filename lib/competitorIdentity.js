import { normalizeCompetitorKey } from "./sourcePolicy";

function compact(text = "", maxWords = 10) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ");
}

function inferSignalsText(competitorModel = {}, sources = []) {
  const modelText = [
    competitorModel.positioning_summary,
    competitorModel.growth_direction,
    ...(competitorModel.strengths || []),
    ...(competitorModel.weaknesses || []),
  ].join(" ");
  const sourceText = sources.map((source) => `${source.title || ""} ${source.snippet || ""}`).join(" ");
  return `${modelText} ${sourceText}`.toLowerCase();
}

const IDENTITY_MAP = {
  razorpay: {
    archetype: "developer-first payment infrastructure",
    tension: "API speed versus operational control",
    summary: "Fast integration. Governance, auditability, and reconciliation decide the long game.",
    pricing: "Developer convenience versus enterprise cost control",
    product: "Integration depth versus edge-case control",
    proof: "Uptime, docs quality, settlement observability, and traceable exceptions",
    risk: "Operational scale risk",
    opening: "What breaks first when your payment volume and exception count rise?",
    uniqueNarrative: "Razorpay usually wins on onboarding friction, then gets judged on how well it handles scale, control, auditability, and reconciliation.",
  },
  paytm: {
    archetype: "mass-distribution merchant network",
    tension: "brand familiarity versus merchant control depth",
    summary: "Distribution is broad. Merchant trust, governance traceability, and operating consistency decide enterprise fit.",
    pricing: "Brand comfort versus blended commercial cost",
    product: "Merchant reach versus workflow control",
    proof: "Support response, settlement clarity, governance trail, and regulatory confidence",
    risk: "Trust and compliance risk",
    opening: "Which matters more in your workflow: reach or control?",
    uniqueNarrative: "Paytm often enters with familiarity, but larger buyers need proof that the merchant experience stays consistent under pressure and audit review.",
  },
  phonepe: {
    archetype: "upi-led merchant payments platform",
    tension: "distribution scale versus monetization control",
    summary: "Acceptance is wide. Monetization, exception handling, and enterprise workflow control decide the real win.",
    pricing: "Acceptance scale versus commercial discipline",
    product: "Distribution breadth versus workflow control",
    proof: "UPI reach, support consistency, settlement observability, and exception handling",
    risk: "Monetization and execution risk",
    opening: "What would need to change for you to trust the current workflow at higher volume?",
    uniqueNarrative: "PhonePe tends to win on broad acceptance, then gets evaluated on whether its operating model stays tight when buyers push on control, cost, and settlement observability.",
  },
  trustly: {
    archetype: "open-banking and A2A rail",
    tension: "authentication simplicity versus settlement certainty",
    summary: "Open-banking reach helps. Authentication, reconciliation, and ledger traceability decide trust.",
    pricing: "A2A convenience versus settlement confidence",
    product: "Auth flow reliability versus reconciliation depth",
    proof: "PSD2 posture, settlement handling, auth failure handling, and ledger traceability",
    risk: "Reconciliation and auth-flow risk",
    opening: "Where do authentication failures or settlement mismatches show up first today?",
    uniqueNarrative: "Trustly needs to prove that the convenience of account-to-account payment does not create reconciliation surprises, audit gaps, or flow failures at scale.",
  },
};

export function buildCompetitorIdentity(competitor, competitorModel = {}, sources = []) {
  const key = normalizeCompetitorKey(competitor);
  const text = inferSignalsText(competitorModel, sources);
  const known = IDENTITY_MAP[key] || {};

  const inferred = {
    archetype: /upi/.test(text)
      ? "upi-led merchant payments platform"
      : /developer|api|docs|integration/.test(text)
        ? "developer-first payment infrastructure"
        : /settlement|reconciliation|auth|authentication/.test(text)
          ? "payment operations platform"
          : /merchant|distribution|reach/.test(text)
            ? "mass-distribution merchant network"
            : "competitor-specific payment platform",
    tension: /upi/.test(text)
      ? "distribution scale versus monetization control"
      : /developer|api|docs|integration/.test(text)
        ? "API speed versus operational control"
        : /settlement|reconciliation|auth|authentication/.test(text)
          ? "authentication simplicity versus settlement certainty"
          : /merchant|distribution|reach/.test(text)
            ? "brand familiarity versus merchant trust depth"
            : "speed versus control",
    summary: known.summary || `${compact(competitorModel.positioning_summary || competitor || "Competitor", 8)}. ${compact(competitorModel.weaknesses?.[0] || "operational control matters at scale", 8)}.`,
    pricing: known.pricing || "Cost predictability versus operating friction",
    product: known.product || "Workflow fit versus edge-case control",
    proof: known.proof || "Operational proof, not slogans",
    risk: known.risk || "Operational risk",
    opening: known.opening || `What changes when ${competitor} is pushed harder?`,
    uniqueNarrative: known.uniqueNarrative || `${competitor} wins on the obvious value, then gets tested on the operational tradeoff it creates.`,
  };

  const signalNouns = [
    /reconciliation/.test(text) ? "reconciliation" : null,
    /settlement/.test(text) ? "settlement" : null,
    /compliance|rbi|audit/.test(text) ? "compliance" : null,
    /support|incident|uptime/.test(text) ? "operations" : null,
    /api|developer|docs|integration/.test(text) ? "integration" : null,
    /hiring|jobs|careers/.test(text) ? "scale" : null,
    /pricing|fee|mdr/.test(text) ? "commercials" : null,
  ].filter(Boolean);

  const narrativeSuffix = signalNouns.length ? ` ${signalNouns.slice(0, 3).join(', ')}.` : "";

  return {
    competitor,
    key,
    archetype: known.archetype || inferred.archetype,
    tension: known.tension || inferred.tension,
    summary: `${inferred.summary}${narrativeSuffix}`.trim(),
    pricing_label: inferred.pricing,
    product_label: inferred.product,
    proof_label: inferred.proof,
    risk_label: inferred.risk,
    opening_question: inferred.opening,
    unique_narrative: inferred.uniqueNarrative,
    label_seed: `${known.archetype || inferred.archetype} | ${known.tension || inferred.tension}`,
  };
}
