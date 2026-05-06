import { completion, isLLMConfigured, parseJsonArray, parseJsonObject } from "./llm";
import { buildBlostemComparison } from "./blostemProfile";
import { isRecentMoveSource } from "./sourcePolicy";

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
      winBy: "Show where the competitor breaks under real buying criteria.",
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

function inferDealRisk(threatLevel, warningCount, signalCount, dealStage = "discovery") {
  const stage = normalizeDealStage(dealStage);
  const base = threatLevel === "HIGH" ? 74 : threatLevel === "MEDIUM" ? 56 : 38;
  const signalBonus = Math.min(12, signalCount * 2);
  const warningPenalty = Math.min(14, warningCount * 3);
  const score = Math.max(18, Math.min(94, base + signalBonus - warningPenalty));
  const stageRisk = {
    discovery: "Early funnel. Buyers still need a sharp reason to care.",
    shortlist: "Comparison mode. Proof and fit matter more than breadth.",
    negotiation: "Commercial pressure. Price and downside dominate the call.",
    contract: "Final close. Certainty and speed matter most.",
  }[stage];

  return {
    level: score >= 72 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    score,
    why: `${signalCount} surfaced signals with ${warningCount} quality warnings.`,
    risk_moment: stageRisk,
    mitigate: score >= 72 ? "Lead with the strongest proof-backed contrast early." : "Use one sharp angle and validate the switch trigger.",
    play: score >= 72 ? "Anchor on long-term commercial risk and workflow fit." : "Reframe the deal around one concrete downside.",
  };
}

function fallbackSalesLayer({ competitor, competitorModel, core, sources, validation, dealStage }) {
  const stageProfile = getStageProfile(dealStage);
  const primaryAngle = core.attack_angles[0];
  const secondaryAngle = core.attack_angles[1];
  const strengths = Array.isArray(competitorModel.strengths) ? competitorModel.strengths : [];
  const weaknesses = Array.isArray(competitorModel.weaknesses) ? competitorModel.weaknesses : [];
  const respectedStrength = strengths[0] || "market familiarity";
  const exposedWeakness = weaknesses[0] || primaryAngle?.angle || "operating risk";
  const primaryClose = primaryAngle?.close || "What breaks first when volume doubles?";
  const secondaryClose = secondaryAngle?.close || "Which workflow is least forgiving after rollout?";

  return {
    objection_handles: [
      {
        objection: `Why change if ${competitor} already works?`,
        response: `${competitor} may work now. Test ${String(exposedWeakness).toLowerCase()} before scale.`,
        confidence: primaryAngle?.confidence || "medium",
        evidence_ids: primaryAngle?.evidence_ids || [],
      },
      {
        objection: `${competitor} feels safer because of market familiarity.`,
        response: `Respect the familiarity. Make the operating proof do the deciding.`,
        confidence: "medium",
        evidence_ids: core.competitive_signals[0]?.evidence_ids || [],
      },
    ],
    live_call_scripts: [
      {
        scenario: `${stageProfile.label} / Mid-call`,
        customer_say: `We already use ${competitor}.`,
        script: `Respect ${competitor}'s ${String(respectedStrength).toLowerCase()}. Test the tradeoff.`,
        follow_up: primaryClose,
        follow_ups: [secondaryClose, `What changes at 2x scale?`],
      },
      {
        scenario: `${stageProfile.label} / Pricing discussion`,
        customer_say: `${competitor} looks cheaper.`,
        script: `Entry price is visible. Blended cost is the real test.`,
        follow_up: `How stable is cost across volume, refunds, payouts, and mix?`,
        follow_ups: [`What happens when volume grows?`, `Who owns pricing predictability?`],
      },
      {
        scenario: `${stageProfile.label} / Closing`,
        customer_say: "We need a reason to switch.",
        script: `Switch only if the evidence shows a costly operating gap.`,
        follow_up: `What would make ${competitor} risky enough to revisit?`,
        follow_ups: [`What's the real switch trigger?`, `What cost of delay matters most?`],
      },
    ],
    how_to_win: {
      do_not: "Lead with generic feature parity. Avoid brand comparison.",
      enter_when: stageProfile.enterWhen,
      win_by: primaryAngle ? `${stageProfile.winBy} Prove ${primaryAngle.angle.toLowerCase()} creates real downside.` : stageProfile.winBy,
      sequence: stageProfile.sequence,
      kill_question: primaryAngle ? primaryAngle.close : "What breaks first at scale?",
      best_entry_point: `${competitorModel.target_segment || "Mid-funnel, pricing discussion"}`,
    },
    deal_context: {
      stage: stageProfile.label,
      angle_focus: stageProfile.angleFocus,
      buyer_motion: stageProfile.enterWhen,
      default_opening: stageProfile.sequence[0],
    },
    compare_vs_us: buildBlostemComparison(competitorModel),
    market_reality: {
      positive: strengths.slice(0, 3),
      negative: weaknesses.slice(0, 3),
    },
    recent_moves: buildRecentMoves(sources),
    india_context: inferIndiaContext(competitor, sources),
    deal_risk: inferDealRisk(core.threat_level, validation?.warnings?.length || 0, core.competitive_signals.length, dealStage),
  };
}

function buildRecentMoves(sources = []) {
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
        move: "No verified recent launch found",
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
function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

async function generateObjections({ competitor, competitorModel, core, dealStage }) {
  const stageProfile = getStageProfile(dealStage);
  const fallback = fallbackSalesLayer({ competitor, competitorModel, core, sources: [], validation: { warnings: [] }, dealStage }).objection_handles;
  if (!isLLMConfigured()) return fallback;

  const prompt = `You are a senior enterprise GTM strategist helping a Blostem AE handle objections in a fintech sales call.

You reframe with evidence. You stay credible. You avoid hype.

Deal stage: ${stageProfile.label}
Primary motion: ${stageProfile.angleFocus}

Your goal:
- Handle objections by surfacing evidence-backed tradeoffs about ${competitor}
- Guide buyers toward a clearer operational evaluation
- Use short, sharp, memorable responses
- Every response must be usable in a live call

CRITICAL RULES:
1. Response: MAX 12 WORDS
2. No explanations — only contrast or reframing
3. Kill generic words: "understand", "appreciate", "consider"
4. Each response should create a follow-up opening for you

OBJECTION HANDLING TEMPLATE:
Buyer says: "<objection>"
You say: "<12 words max, reframe to advantage>"
It creates: "<what emotional shift happens>"

Context:
${JSON.stringify({ competitorModel, competitive_signals: core.competitive_signals, attack_angles: core.attack_angles }, null, 2)}

Generate 3 realistic objections and reframes for ${competitor}.
Each reframe must mention either ${competitor}, a named tradeoff from the context, or a specific operating criterion.

EXAMPLES OF GOOD RESPONSES:
- Objection: "We already use ${competitor}"
  Response: "That made sense early. Scaling changes everything."

- Objection: "${competitor} is cheaper"
  Response: "Cheap now. Expensive later."

EXAMPLES OF BAD RESPONSES (REJECT):
- "I understand your perspective. Let me explain..."
- "That's a great question. Let's consider the benefits..."

Output JSON:
[
  {
    "objection": "<what buyer says>",
    "response": "<max 12 words, reframe only>",
    "evidence_ids": ["src_1"]
  }
]`;

  try {
    const raw = await completion(prompt, { task: "synthesis", maxTokens: 500, temperature: 0.15 });
    const parsed = parseJsonArray(raw);
    const objections = normalizeJsonArray(parsed).map((item) => ({
      objection: item.objection,
      response: item.response,
      evidence_ids: Array.isArray(item.evidence_ids) ? item.evidence_ids : [],
      confidence: "medium",
    })).filter((item) => item.objection && item.response);
    return objections.length ? objections : fallback;
  } catch {
    return fallback;
  }
}

async function generateTalkTracks({ competitor, core, dealStage }) {
  const stageProfile = getStageProfile(dealStage);
  const fallback = fallbackSalesLayer({ competitor, competitorModel: {}, core, sources: [], validation: { warnings: [] }, dealStage }).live_call_scripts;
  if (!isLLMConfigured()) return fallback;

  const prompt = `You are a top-performing Account Executive on a live call with a buyer.

You have 30 seconds to say your strongest thing. Make it SHARP.

Your goal:
- Each line is callable in a real conversation
- Contrast-based (strength vs weakness)
- Max 12 words per line
- Create buying moments, not explanations

Deal stage: ${stageProfile.label}
What to emphasize: ${stageProfile.angleFocus}

CRITICAL RULE:
Script line: MAX 12 WORDS
Follow-up: MAX 15 WORDS

Scenarios:
1. Mid-call: Buyer already using ${competitor}
2. Pricing: Buyer comparing costs
3. Closing: Buyer needs a switch reason

Context:
${JSON.stringify({ attack_angles: core.attack_angles, summary: core.summary }, null, 2)}

Specificity rule:
- Mention ${competitor} or the exact tradeoff from the selected attack angle
- Do not return lines that could apply unchanged to every competitor
- If evidence is weak, phrase the line as a question

EXAMPLES:
Scenario: Mid-call
Customer says: "We use ${competitor} now"
Script: "Works now. Risk shows later."
Follow-up: "What breaks first at 2x volume?"

EXAMPLES OF BAD OUTPUT (REJECT):
Script: "We offer comprehensive solutions that better address..."
Follow-up: "Would you like to understand our approach?"

Output JSON:
[
  {
    "scenario": "Mid-call|Pricing|Closing",
    "customer_say": "<what buyer says>",
    "script": "<max 12 words, contrast-based>",
    "follow_up": "<max 15 words, pushes forward>",
    "follow_ups": ["<alternative if buyer stalls>"]
  }
]`;

  try {
    const raw = await completion(prompt, { task: "synthesis", maxTokens: 500, temperature: 0.2 });
    const parsed = parseJsonArray(raw);
    const scripts = normalizeJsonArray(parsed).filter((item) => item.scenario && item.script);
    return scripts.length ? scripts : fallback;
  } catch {
    return fallback;
  }
}

async function generateStrategy({ competitor, competitorModel, core, dealStage }) {
  const stageProfile = getStageProfile(dealStage);
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

CONTEXT:
${JSON.stringify({ competitorModel, attack_angles: core.attack_angles, summary: core.summary }, null, 2)}

EXAMPLE OUTPUT:
{
  "do_not": "Lead with feature parity or generic comparison.",
  "enter_when": "Buyer mentions volume scaling or cost predictability.",
  "win_by": "Pressure-test long-term cost predictability with evidence.",
  "sequence": [
    "Acknowledge why ${competitor} feels safe.",
    "Shift to the most expensive part of their journey.",
    "Use one proof-backed angle with evidence.",
    "Close on the switch trigger, not generic preference."
  ],
  "kill_question": "What breaks first when volume doubles?",
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

  const [objectionHandles, liveCallScripts, howToWin] = await Promise.all([
    generateObjections(input),
    generateTalkTracks(input),
    generateStrategy(input),
  ]);

  // If validation indicates warnings/critical issues, soften generated scripts and mark downgrade
  const needsSoftening = (input.validation && (input.validation.status || '').toLowerCase() !== 'ok');

  const softenedObjections = (objectionHandles || fallback.objection_handles).map((o) => ({
    ...o,
    response: needsSoftening ? softenIfNeeded(o.response, input.validation) : o.response,
    downgraded: !!needsSoftening,
  }));

  const softenedScripts = (liveCallScripts || fallback.live_call_scripts).map((s) => ({
    ...s,
    script: needsSoftening ? softenIfNeeded(s.script, input.validation) : s.script,
    follow_up: needsSoftening ? softenIfNeeded(s.follow_up, input.validation) : s.follow_up,
    downgraded: !!needsSoftening,
  }));

  const softenedHowToWin = {
    ...howToWin,
    win_by: needsSoftening ? softenIfNeeded(howToWin.win_by || '', input.validation) : howToWin.win_by,
  };

  return {
    ...fallback,
    objection_handles: softenedObjections,
    live_call_scripts: softenedScripts,
    how_to_win: softenedHowToWin,
    compare_vs_us: buildBlostemComparison(input.competitorModel || {}),
    recent_moves: buildRecentMoves(input.sources || []),
  };
}
