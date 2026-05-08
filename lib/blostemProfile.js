export const RIVALSENSE_PROFILE = {
  name: "RivalSense",
  ideal_customer: [
    "Indian fintech and BFSI teams that need evidence-governed competitive intel",
    "Sales teams handling pricing, compliance, settlement, integration, or trust objections",
    "AEs and PMMs who need a sourced live brief instead of a generic battlecard",
  ],
  where_rivalsense_wins: [
    "Reconciliation visibility that shows where settlement or exception handling breaks",
    "Implementation control with source-linked claim traces, confidence, and explicit buyer questions",
    "Auditability and governance traceability for procurement, legal, and security review",
    "Enterprise workflow support for evidence review, deal-stage routing, and claim downgrades",
  ],
  where_rivalsense_loses: [
    "When the buyer only wants a broad market overview",
    "When the competitor has a thin public footprint and live retrieval is weak",
    "When the motion depends on private CRM, call notes, or internal customer evidence",
  ],
  pricing_posture: "Value comes from faster deal prep, better claim discipline, and fewer bad calls.",
  implementation_strengths: [
    "Evidence-linked battlecards with source IDs and snippets",
    "Claim Trace with rebuttals, opportunities, and proof status",
    "Inline citations, validation warnings, freshness checks, and downgrade rules",
    "Procurement-aware outputs that separate claims from buyer verification cues",
  ],
  proof_points: [
    "Every external claim should link to source IDs and snippets",
    "Unknown freshness is never treated as recent evidence",
    "AE guidance is downgraded when validation is weak or contradictory",
    "Internal workflow should show why a claim was blocked, not just that it was blocked",
  ],
};

export function buildRivalSenseComparison(competitorModel = {}) {
  const competitorStrengths = Array.isArray(competitorModel.strengths) ? competitorModel.strengths : [];
  const competitorWeaknesses = Array.isArray(competitorModel.weaknesses) ? competitorModel.weaknesses : [];
  const winner = competitorWeaknesses[0] || "their operating tradeoff";
  return {
    where_we_win: RIVALSENSE_PROFILE.where_rivalsense_wins,
    where_we_lose: RIVALSENSE_PROFILE.where_rivalsense_loses,
    what_to_emphasize: [
      "Show the source, then the claim, then the operational control point.",
      "Use cited evidence first, then move to reconciliation, governance, or auditability.",
      `Anchor on the competitor's weakest proven area: ${winner}.`,
    ],
    competitor_strengths_to_respect: competitorStrengths.slice(0, 3),
    competitor_weaknesses_to_test: competitorWeaknesses.slice(0, 3),
    rivalsense_positioning: RIVALSENSE_PROFILE.pricing_posture,
  };
}
