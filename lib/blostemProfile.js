export const BLOSTEM_PROFILE = {
  name: "Blostem",
  ideal_customer: [
    "Indian BFSI and fintech teams that need proof-backed GTM intelligence",
    "Sales teams facing payment, compliance, settlement, or onboarding objections",
    "AEs who need fast competitor-specific talk tracks before live calls",
  ],
  where_blostem_wins: [
    "Turns public evidence into concise AE talk tracks with source traceability",
    "Keeps claims conservative when evidence is stale, undated, or low-authority",
    "Frames India-specific fintech buying criteria: MDR, UPI, RBI, settlement, reconciliation, compliance, and support",
  ],
  where_blostem_loses: [
    "When buyers only need a generic market overview",
    "When no credible public evidence exists for a competitor",
    "When the sales motion requires private CRM or customer-call evidence not connected yet",
  ],
  pricing_posture: "Value is tied to faster deal preparation and reduced competitive-call risk, not generic content generation.",
  implementation_strengths: [
    "Evidence-first battlecards",
    "Inline citations and validation warnings",
    "Under-60-second demo-safe generation path",
  ],
  proof_points: [
    "Every claim should link to source IDs and snippets",
    "Unknown freshness is not treated as recent evidence",
    "Sales scripts are downgraded when validation is weak",
  ],
};

export function buildBlostemComparison(competitorModel = {}) {
  const competitorStrengths = Array.isArray(competitorModel.strengths) ? competitorModel.strengths : [];
  return {
    where_we_win: BLOSTEM_PROFILE.where_blostem_wins,
    where_we_lose: BLOSTEM_PROFILE.where_blostem_loses,
    what_to_emphasize: [
      "Ask the buyer which competitor claim must be proven before a decision.",
      "Use cited evidence, then move to the commercial risk.",
      "Anchor India-specific operating criteria instead of broad feature parity.",
    ],
    competitor_strengths_to_respect: competitorStrengths.slice(0, 3),
    blostem_positioning: BLOSTEM_PROFILE.pricing_posture,
  };
}
