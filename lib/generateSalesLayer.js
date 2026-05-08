import { completion, isLLMConfigured, parseJsonArray, parseJsonObject } from "./llm";
import { buildBlostemComparison } from "./blostemProfile";
import { buildCompetitorIdentity } from "./competitorIdentity";
import { isRecentMoveSource } from "./sourcePolicy";
import { deduplicateAttackAngles, distinctCompetitorFraming } from "./competitorDeduplicator";

function normalizeDealStage(dealStage = "discovery") {
  const normalized = String(dealStage || "").toLowerCase();
  if (normalized.includes("negoti")) return "negotiation";
  if (normalized.includes("contract") || normalized.includes("procure")) return "contract";
  if (normalized.includes("shortlist") || normalized.includes("eval")) return "shortlist";
  return "discovery";
}

function getStageProfile(dealStage = "discovery") {
  const stage = normalizeDealStage(dealStage);
  const profiles = {
    discovery: {
      label: "Discovery",
      angleFocus: "problem framing and commercial pain",
      enterWhen: "Buyer is still defining the problem or comparing broad options.",
      winBy: "Create enough doubt to open the switching conversation.",
      sequence: [
        "Acknowledge why the current stack feels safe.",
        "Name the hidden cost of staying put.",
        "Use one proof-backed angle.",
        "Ask what the buyer fears at scale.",
      ],
    },
    shortlist: {
      label: "Shortlist",
      angleFocus: "fit, proof, and differentiation",
      enterWhen: "Buyer has narrowed options and is asking why you win.",
      winBy: "Show which competitor assumption needs proof under real buying criteria.",
      sequence: [
        "Validate the shortlist criteria.",
        "Map criteria to the strongest proof.",
        "Expose the competitor's weakest fit point.",
        "Close on one high-risk gap.",
      ],
    },
    negotiation: {
      label: "Negotiation",
      angleFocus: "commercial risk and switch timing",
      enterWhen: "Pricing, scope, or contract terms are now in focus.",
      winBy: "Shift the buyer from price comparison to long-term downside.",
      sequence: [
        "Anchor on the future cost of the current choice.",
        "Use the strongest proof-backed downside.",
        "Force the real tradeoff into the open.",
        "Close on timing and commitment.",
      ],
    },
    contract: {
      label: "Contract",
      angleFocus: "final objections and implementation certainty",
      enterWhen: "The buyer is finalizing legal, security, or rollout details.",
      winBy: "Remove the last sources of uncertainty and keep momentum.",
      sequence: [
        "Reassure on implementation path.",
        "Show why delay is the expensive move.",
        "Confirm the decision owner.",
        "Lock the next step now.",
      ],
    },
  };

  return { stage, ...profiles[stage] };
}

function inferIndiaContext(competitor, sources = []) {
  const text = sources.map((source) => `${source.title} ${source.snippet}`).join(" ").toLowerCase();
  const key = (competitor || "").toLowerCase();
  const context = [];

  if (/upi/.test(text) || /phonepe|paytm/.test(key)) context.push("UPI posture is a core commercial and monetization signal.");
  if (/rbi|compliance|audit/.test(text)) context.push("RBI and compliance readiness should be treated as buying criteria, not back-office details.");
  if (/mdr|pricing|fee/.test(text)) context.push("MDR sensitivity remains a practical switching trigger for Indian merchants.");
  if (/regional|tier-2|tier 2|support/.test(text)) context.push("Regional support depth can matter more than brand in non-metro growth motions.");

  return context.slice(0, 4);
}

function inferDealRisk(threatLevel, warningCount, signalCount, dealStage = "discovery", riskDash = {}) {
  const stage = normalizeDealStage(dealStage);
  const base = threatLevel === "HIGH" ? 74 : threatLevel === "MEDIUM" ? 56 : 38;
  const signalBonus = Math.min(12, signalCount * 2);
  const warningPenalty = Math.min(14, warningCount * 3);
  const procurementRisk = riskDash.risk_score || 0;
  const score = Math.max(18, Math.min(94, base + signalBonus - warningPenalty + (procurementRisk / 10)));
  const stageRisk = {
    discovery: "Early funnel. Shape how they think about operational risk.",
    shortlist: "Comparison mode. Proof and execution capability matter most.",
    negotiation: "Commercial pressure. Focus on cost evolution and blended cost.",
    contract: "Final close. Lock on switching timeline and implementation certainty.",
  }[stage];

  return {
    level: score >= 72 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    score,
    procurement_risk: riskDash.risk_level || "UNKNOWN",
    why: `${signalCount} surfaced signals with ${warningCount} quality warnings. Procurement risk: ${procurementRisk}/100.`,
    risk_moment: stageRisk,
    mitigate: score >= 72 ? "Lead with procurement risk, not features. Make switching cost visible." : "Surface one operational gap that appears at scale.",
    play: score >= 72 ? "Anchor on 3-year blended cost + switching risk." : "Reframe discovery around operational maturity.",
  };
}

export function buildProcurementRiskDashboard(signals = [], sources = []) {
  // Aggregate directional risk signals into a procurement risk profile.
  const riskCategories = {
    legal_risk: { count: 0, severity: 0, label: "Legal/Credibility Risk" },
    security_risk: { count: 0, severity: 0, label: "Security/Execution Risk" },
    regulatory_risk: { count: 0, severity: 0, label: "Regulatory/Compliance Risk" },
    operational_risk: { count: 0, severity: 0, label: "Operational/Reliability Risk" },
    user_satisfaction_risk: { count: 0, severity: 0, label: "Product/User Satisfaction Risk" },
  };

  const flattenedSignals = signals.flatMap((entry) => Array.isArray(entry) ? entry : [entry]).filter(Boolean);

  const increment = (category, severity = 2) => {
    if (!riskCategories[category]) return;
    riskCategories[category].count += 1;
    riskCategories[category].severity = Math.min(10, riskCategories[category].severity + severity);
  };

  flattenedSignals.forEach((signal) => {
    const text = `${signal.bucket || ""} ${signal.insight || ""} ${signal.evidence || ""}`.toLowerCase();
    if (/legal|litigation|lawsuit|court|dispute/.test(text)) increment("legal_risk", 3);
    if (/security|breach|credential|vulnerability|fraud/.test(text)) increment("security_risk", 3);
    if (/regulatory|rbi|npci|compliance|directive|license/.test(text)) increment("regulatory_risk", 3);
    if (/outage|incident|uptime|settlement|reconciliation|support|sla|delay/.test(text)) increment("operational_risk", 2);
    if (/review|rating|complaint|crash|sentiment|user/.test(text)) increment("user_satisfaction_risk", 2);
  });

  sources.forEach((source) => {
    const metadata = source.raw_metadata || {};
    const text = `${source.title || ""} ${source.snippet || ""} ${source.source_class || ""}`.toLowerCase();
    if (metadata.legal_signal || metadata.dispute_history || /litigation|lawsuit|court|dispute/.test(text)) increment("legal_risk", 2);
    if (metadata.security_signal || metadata.execution_risk || /breach|security incident|credential leak/.test(text)) increment("security_risk", 2);
    if (metadata.regulatory_signal || metadata.compliance_history || /rbi|npci|regulatory|compliance/.test(text)) increment("regulatory_risk", 2);
    if (metadata.status_page || metadata.operational_signal || metadata.risk_signal || /outage|incident|settlement|reconciliation|support/.test(text)) increment("operational_risk", 1);
    if (metadata.app_store_signal || metadata.user_satisfaction_metric || /review|rating|complaint|crash/.test(text)) increment("user_satisfaction_risk", 1);
  });

  // Aggregate risk score
  const totalRiskScore = Object.values(riskCategories)
    .reduce((sum, cat) => sum + (cat.count * cat.severity), 0) / Math.max(1, Object.values(riskCategories).reduce((sum, cat) => sum + cat.count, 0));

  const riskLevel = totalRiskScore >= 6 ? "HIGH" : totalRiskScore >= 3 ? "MEDIUM" : "LOW";
  const riskFactors = Object.entries(riskCategories)
    .filter(([_, cat]) => cat.count > 0)
    .sort((a, b) => b[1].severity - a[1].severity)
    .slice(0, 3)
    .map(([_, cat]) => cat.label);

  return {
    risk_score: Math.round(totalRiskScore * 10),
    risk_level: riskLevel,
    risk_factors: riskFactors,
    categories: riskCategories,
    why: riskFactors.length ? `${riskLevel} risk detected in: ${riskFactors.join(', ')}.` : "No major procurement risks detected.",
    procurement_question: riskLevel === "HIGH" 
      ? "Given these risks, what's your switching timeline if execution issues occur?"
      : "Which of these risk areas would trigger a serious look at alternatives?",
  };
}

export function buildDiscoveryAngles(competitor, competitorModel = {}, riskDash = {}) {
  // CFO/Procurement psychology: What matters in decision-making
  const identity = buildCompetitorIdentity(competitor, competitorModel, []);
  const procurementAngles = [
    {
      angle: identity.risk_label,
      trigger: riskDash.risk_score >= 6,
      question: identity.opening_question,
      implication: identity.unique_narrative,
      why_it_works: identity.tension,
    },
    {
      angle: `${identity.proof_label} vs Compliance`,
      trigger: (riskDash.risk_factors || []).includes("Regulatory/Compliance Risk"),
      question: "Has RBI or NPCI issued any directives that affect your payment flow?",
      implication: `${identity.archetype} buyers want proof before trust.`,
      why_it_works: identity.proof_label,
    },
    {
      angle: `${identity.pricing_label} over Switch Timing`,
      trigger: riskDash.risk_level === "HIGH",
      question: "If you switched tomorrow, how long would remediation take before normal operations?",
      implication: identity.tension,
      why_it_works: identity.risk_label,
    },
    {
      angle: identity.pricing_label,
      trigger: true,
      question: "Do you measure true cost as entry + reconciliation overhead + support + settlement delays?",
      implication: identity.unique_narrative,
      why_it_works: identity.pricing_label,
    },
    {
      angle: identity.proof_label,
      trigger: (riskDash.risk_factors || []).includes("Legal/Credibility Risk"),
      question: "Any disputes, litigations, or customer complaints that concern you about stability?",
      implication: identity.unique_narrative,
      why_it_works: identity.proof_label,
    },
    {
      angle: `${identity.archetype} lock-in risk`,
      trigger: riskDash.risk_score >= 3,
      question: "How tightly coupled is your settlement to their systems? Can you port out quickly?",
      implication: identity.tension,
      why_it_works: identity.risk_label,
    },
  ];

  return procurementAngles
    .filter(angle => angle.trigger)
    .map(angle => ({
      angle: angle.angle,
      discovery_question: angle.question,
      implication: angle.implication,
      why_it_works: angle.why_it_works,
      evidence_sources: "risk-dashboard",
    }))
    .slice(0, 3);  // Top 3 angles for this competitor
}

function fallbackSalesLayer({ competitor, competitorModel, core, sources, validation, dealStage, riskDash = {} }) {
  const stageProfile = getStageProfile(dealStage);
  const procurementRiskDash = riskDash || buildProcurementRiskDashboard([], sources || []);
  const discoveryAngles = buildDiscoveryAngles(competitor, competitorModel, procurementRiskDash);
  const identity = buildCompetitorIdentity(competitor, competitorModel, sources || []);
  
  // NEW: Use distinct framing for this specific competitor
  const distinctFraming = distinctCompetitorFraming(competitor, competitorModel, identity);

  return {
    // NEW: Procurement Risk Dashboard (primary sales intel)
    procurement_risk_dashboard: {
      risk_level: procurementRiskDash.risk_level || "UNKNOWN",
      risk_score: procurementRiskDash.risk_score || 0,
      risk_factors: procurementRiskDash.risk_factors || [],
      why: procurementRiskDash.why || "No major risks detected.",
      procurement_question: procurementRiskDash.procurement_question || "Which areas concern you most about your current vendor?",
    },

    // NEW: Discovery Angles (CFO-focused discovery questions)
    discovery_angles: discoveryAngles.length > 0 ? discoveryAngles : [
      {
        angle: distinctFraming.angle || identity.risk_label,
        discovery_question: distinctFraming.discovery_question || identity.opening_question,
        implication: distinctFraming.implication || identity.unique_narrative,
        why_it_works: distinctFraming.why_it_works || identity.tension,
        evidence_sources: distinctFraming.evidence_sources || "github, status-page, job-postings, operational-maturity-signals",
      },
    ],

    // NEW: Procurement Conversation Sequence (risk-based discovery, with distinct framings per competitor)
    procurement_conversation_sequence: [
      {
        moment: "Opening (Discovery)",
        what_to_verify: distinctFraming.opening_question || identity.opening_question,
        why: distinctFraming.opening_why || identity.unique_narrative,
        follow_up: distinctFraming.opening_followup || `Which matters more here: ${identity.pricing_label.toLowerCase()} or ${identity.proof_label.toLowerCase()}?`,
      },
      {
        moment: "Mid-Call (Risk surfaces)",
        what_to_verify: distinctFraming.midcall_question || `Which part of the ${identity.archetype} story needs proof in your environment?`,
        why: distinctFraming.midcall_why || identity.tension,
        follow_up: distinctFraming.midcall_followup || `When does ${identity.risk_label.toLowerCase()} become visible in your workflow?`,
      },
      {
        moment: "Closing (If engaged)",
        what_to_verify: distinctFraming.close_question || `What would make ${competitor} harder to keep than to replace?`,
        why: distinctFraming.close_why || identity.summary,
        follow_up: distinctFraming.close_followup || "How long would full migration take? What would speed it up?",
      },
    ],

    // How to Win (refocused on procurement risk, not objections)
    how_to_win: {
      do_not: "Lead with features, parity, or brand. Avoid generic benefits.",
      do: "Lead with risk: execution, compliance, cost clarity, switching cost.",
      enter_when: stageProfile.enterWhen,
      win_by: `Surface and quantify ${procurementRiskDash.risk_level} procurement risk. Show why ${identity.tension.toLowerCase()} matters now.`,
      sequence: [
        `Name the ${identity.risk_label.toLowerCase()} hidden in the current setup`,
        `Show which ${identity.pricing_label.toLowerCase()} assumption needs proof`,
        "Quantify the switching cost (time, resources, implementation)",
        "Lock on next step and timeline",
      ],
      kill_question: "What would need to change for you to seriously look at alternatives?",
      best_entry_point: `${procurementRiskDash.risk_level === 'HIGH' ? 'Early, when risk is highest' : 'Mid-deal, after friction'}`,
    },

    // Deal Context
    deal_context: {
      stage: stageProfile.label,
      angle_focus: stageProfile.angleFocus,
      buyer_motion: stageProfile.enterWhen,
      procurement_risk: procurementRiskDash.risk_level,
      default_opening: distinctFraming.opening_question || identity.opening_question,
    },

    // Keep existing fields
    compare_vs_us: buildBlostemComparison(competitorModel),
    market_reality: {
      positive: Array.isArray(competitorModel.strengths) ? competitorModel.strengths.slice(0, 3) : [],
      negative: Array.isArray(competitorModel.weaknesses) ? competitorModel.weaknesses.slice(0, 3) : [],
    },
    recent_moves: buildRecentMoves(competitor, sources),
    india_context: inferIndiaContext(competitor, sources),
    deal_risk: inferDealRisk(core.threat_level, validation?.warnings?.length || 0, core.competitive_signals.length, dealStage, procurementRiskDash),
  };
}

function buildRecentMoves(competitor, sources = []) {
  const moves = sources
    .filter(isRecentMoveSource)
    .slice(0, 3)
    .map((source) => ({
      move: String(source.title || source.snippet || "").replace(/\s+/g, " ").trim(),
      date: source.published_at || source.date || "recent",
      source_id: source.id,
      implication: `Verify the launch detail, then use it to discuss ${source.type === "news" ? "market urgency" : "product focus"}.`,
    }));

  return moves.length
    ? moves.filter((move) => move.move && !/^(menu|icon|logo|like|reply|comment)$/i.test(move.move))
    : [{
      move: `No verified recent launch found for ${competitor}`,
        date: "unknown",
        implication: "Do not present source titles as launches; ask discovery questions instead.",
      }];
}

function softenIfNeeded(text, validation) {
  if (!text) return text;
  if (!validation) return text;
  const status = (validation.status || '').toLowerCase();
  if (status === 'ok') return text;
  // Prepend a gentle verification flag for UI and callers
  return `(${status === 'critical' ? 'Unverified/Critical' : 'Preliminary'}) ${text}`;
}

function enterpriseTone(text = "") {
  if (!text) return text;
  let t = String(text);
  t = t.replace(/customer complaints suggest/ig, 'retrieved customer evidence indicates');
  t = t.replace(/buyer needs business case for change/ig, 'retrieved buyer evidence indicates a need for a quantified business case');
  t = t.replace(/Scaling OK\?/ig, 'Does current evidence support reliability at scale?');
  t = t.replace(/Why \\${competitor} originally, and what would change that now\?/g, (m) => m); // keep templated
  return t;
}
async function generateEvidenceCards({ competitor, competitorModel, core, dealStage }) {
  // Replace scripted objections with evidence-card prompts that guide AEs with buyer questions
  // Goal: Give AEs tactical clues (what to verify), not exact scripts (what to say)
  
  const stageProfile = getStageProfile(dealStage);
  
  // Evidence cards: claim + confidence + buyer question + opportunity
  const cards = (core.claims || [])
    .filter(claim => claim.ae_action || claim.buyer_question) // Only cards that already have tactical structure
    .slice(0, 3) // Top 3 claims as evidence cards
    .map((claim) => ({
      claim: claim.text,
      confidence: claim.confidence || 'Inferred',
      buyer_question: claim.buyer_question || `What validates this for your workflow?`,
      ae_action: claim.ae_action || `Use as leverage point.`,
      evidence_id: claim.evidence_ids?.[0],
      verification_path: `Ask buyer about ${claim.text.toLowerCase().slice(0, 20)}...`
    }));
  
  return cards.length ? cards : [
    {
      claim: 'Evidence base exists for competitive differentiation',
      confidence: 'Directional',
      buyer_question: 'What would validate this for you?',
      ae_action: 'Use to open discussion on execution risk.',
      verification_path: 'Ask about operational proof points.'
    }
  ];
}

async function generateVerificationSequence({ competitor, core, dealStage }) {
  // Replace scripted guidance with verification questions
  // Goal: Guide AEs on what to ask (tactics), not what to say (scripts)
  
  const stageProfile = getStageProfile(dealStage);
  
  // Verification sequence: buyer pain point → verification question → what to listen for
  const sequence = [
    {
      stage_phase: 'Opening',
      pain_point: 'Buyer justifying current vendor',
      verification_question: 'What made you choose ' + competitor + ' originally, and what would change that today?',
      listen_for: 'Evidence of shifting priorities or operational pain. Map to our signals.'
    },
    {
      stage_phase: 'Mid-call',
      pain_point: 'Buyer concerned about switching risk',
      verification_question: 'When volume doubles, which workflow becomes hardest to prove?',
      listen_for: 'Operational gaps. Match against our competitive_signals.'
    },
    {
      stage_phase: 'Closing',
      pain_point: 'Buyer needs business case for change',
      verification_question: 'If we proved lower operational friction at 2x scale, how would you evaluate?',
      listen_for: 'Entry criteria for evaluation. Use as deal motion.'
    }
  ];
  
  return sequence;
}

async function generateStrategy({ competitor, competitorModel, core, dealStage }) {
  const stageProfile = getStageProfile(dealStage);
  const identity = buildCompetitorIdentity(competitor, competitorModel, core?.sources || []);
  const fallback = fallbackSalesLayer({ competitor, competitorModel, core, sources: [], validation: { warnings: [] }, dealStage }).how_to_win;
  if (!isLLMConfigured()) return fallback;

  const prompt = `You are a senior enterprise GTM strategist preparing a Blostem AE to compete against ${competitor}.

Be specific, evidence-backed, and operational. No fluff.
Your job: create a credible deal playbook.

CRITICAL RULES:
- DO NOT: <specific mistake to avoid>
- ENTER WHEN: <exact buyer condition>
- WIN BY: <one sharp angle>
- KILL QUESTION: <the close>
- SEQUENCE: <3-4 steps, max 12 words each>

Deal stage: ${stageProfile.label}
Commercial focus: ${stageProfile.angleFocus}

Competitor identity:
${JSON.stringify(identity, null, 2)}

CONTEXT:
${JSON.stringify({ competitorModel, attack_angles: core.attack_angles, summary: core.summary, identity }, null, 2)}

RULES:
- Reuse the competitor identity above.
- Do not use generic terms like "strong", "comprehensive", or "robust".
- Make the opening, win-by, and kill question distinct for this competitor.
- Keep sequence steps tied to the competitor's actual tension.

EXAMPLE OUTPUT:
{
  "do_not": "Lead with feature parity or generic comparison.",
  "enter_when": "Buyer mentions volume scaling or cost predictability.",
  "win_by": "Pressure-test long-term cost predictability with evidence.",
  "sequence": [
    "Acknowledge why the current competitor feels safe.",
    "Shift to the specific operational tension that matters.",
    "Use one proof-backed angle with evidence.",
    "Close on the switch trigger, not generic preference."
  ],
  "kill_question": "Which vendor assumption becomes hardest to prove at scale?",
  "best_entry_point": "Mid-funnel, when pricing comparisons begin."
}

Output JSON:
{
  "do_not": "",
  "enter_when": "",
  "win_by": "",
  "sequence": [],
  "kill_question": "",
  "best_entry_point": ""
}`;

  try {
    const raw = await completion(prompt, { task: "synthesis", maxTokens: 400, temperature: 0.15 });
    const parsed = parseJsonObject(raw);
    return {
      ...fallback,
      ...parsed,
      sequence: Array.isArray(parsed?.sequence) && parsed.sequence.length ? parsed.sequence : fallback.sequence,
    };
  } catch {
    return fallback;
  }
}

export async function generateSalesLayer(input) {
  const fallback = fallbackSalesLayer(input);

  if (input.skipLLM || !isLLMConfigured()) {
    return fallback;
  }

  const [evidenceCards, verificationSequence, howToWin] = await Promise.all([
    generateEvidenceCards(input),
    generateVerificationSequence(input),
    generateStrategy(input),
  ]);

  // If validation indicates warnings/critical issues, mark evidence cards as needing review
  const needsSoftening = (input.validation && (input.validation.status || '').toLowerCase() !== 'ok');

  // Evidence cards contain buyer questions, not scripts
  const softenedEvidenceCards = (evidenceCards || []).map((card) => ({
    ...card,
    verification_note: needsSoftening ? 'Validation warnings exist; verify evidence quality.' : undefined,
    requires_review: !!needsSoftening,
  }));

  // Verification sequence: what to ask, not what to say
  const softenedVerificationSequence = (verificationSequence || fallback.procurement_conversation_sequence || []).map((phase) => ({
    ...phase,
    requires_evidence_support: needsSoftening,
  }));

  const softenedHowToWin = {
    ...(howToWin || fallback.how_to_win || {}),
    win_by: needsSoftening ? softenIfNeeded((howToWin?.win_by || fallback?.how_to_win?.win_by || ''), input.validation) : (howToWin?.win_by || fallback?.how_to_win?.win_by || ''),
  };

  return {
    ...fallback,
    // New fields: evidence-based tactical guidance, not scripts
    evidence_cards: (softenedEvidenceCards || []).map((card) => ({
      ...card,
      claim: enterpriseTone(card.claim),
      buyer_question: enterpriseTone(card.buyer_question),
      ae_action: enterpriseTone(card.ae_action),
      verification_path: enterpriseTone(card.verification_path),
    })),
    verification_sequence: (softenedVerificationSequence || []).map((phase) => ({
      ...phase,
      verification_question: enterpriseTone(phase.verification_question),
      listen_for: enterpriseTone(phase.listen_for),
      pain_point: enterpriseTone(phase.pain_point || phase.customer_say),
    })),
    how_to_win: {
      ...softenedHowToWin,
      win_by: enterpriseTone(softenedHowToWin.win_by || ''),
      do: enterpriseTone(softenedHowToWin.do || ''),
      do_not: enterpriseTone(softenedHowToWin.do_not || ''),
      sequence: (softenedHowToWin.sequence || []).map(s => enterpriseTone(s)),
    },
    compare_vs_us: buildBlostemComparison(input.competitorModel || {}),
    recent_moves: buildRecentMoves(input.competitor, input.sources || []),
  };
}
