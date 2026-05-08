export const BLOSTEM_PROFILE = {
  name: "Blostem",
  ideal_customer: [
    "Indian fintech and BFSI teams that need evidence-governed competitive intel",
    "Sales teams handling pricing, compliance, settlement, integration, or trust objections",
    "AEs and PMMs who need a sourced live brief instead of a generic battlecard",
  ],
  where_blostem_wins: [
    "Turns public evidence into claim traces with source IDs, confidence, and buyer questions",
    "Downgrades or blocks weak claims when evidence is stale, single-source, or contradictory",
    "Surfaces India-specific buying criteria: MDR, UPI, RBI, settlement, reconciliation, compliance, and support",
  ],
  where_blostem_loses: [
    "When the buyer only wants a broad market overview",
    "When the competitor has a thin public footprint and live retrieval is weak",
    "When the motion depends on private CRM, call notes, or internal customer evidence",
  ],
  pricing_posture: "Value comes from faster deal prep, better claim discipline, and fewer bad calls.",
  implementation_strengths: [
    "Evidence-linked battlecards",
    "Claim Trace with rebuttals and opportunities",
    "Inline citations, validation warnings, and source freshness checks",
  ],
  proof_points: [
    "Every external claim should link to source IDs and snippets",
    "Unknown freshness is never treated as recent evidence",
    "AE guidance is downgraded when validation is weak or contradictory",
  ],
};

export function buildBlostemComparison(competitorModel = {}) {
  const competitorStrengths = Array.isArray(competitorModel.strengths) ? competitorModel.strengths : [];
  const competitorWeaknesses = Array.isArray(competitorModel.weaknesses) ? competitorModel.weaknesses : [];
  return {
    where_we_win: BLOSTEM_PROFILE.where_blostem_wins,
    where_we_lose: BLOSTEM_PROFILE.where_blostem_loses,
    what_to_emphasize: [
      "Show the source, then the claim, then the buyer question.",
      "Use cited evidence first, then move to the operational downside.",
      `Anchor on the competitor's weakest proven area: ${competitorWeaknesses[0] || "their operating tradeoff"}.`,
    ],
    competitor_strengths_to_respect: competitorStrengths.slice(0, 3),
    competitor_weaknesses_to_test: competitorWeaknesses.slice(0, 3),
    blostem_positioning: BLOSTEM_PROFILE.pricing_posture,
  };
}
