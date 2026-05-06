function keyFor(competitor = "") {
  return String(competitor || "").toLowerCase().replace(/\s+/g, "");
}

const DEMO_DATA = {
  razorpay: [
    {
      title: "Razorpay Pricing (Official)",
      url: "https://razorpay.com/pricing/",
      published_at: "2025-01-10",
      snippet:
        "Razorpay's pricing page positions transparent online payment pricing for Indian merchants and startups.",
      type: "pricing",
    },
    {
      title: "Razorpay Payment Gateway Docs",
      url: "https://razorpay.com/docs/payments/",
      published_at: "2025-02-12",
      snippet:
        "Developer docs emphasize API-first integration, checkout customization, and payment method coverage.",
      type: "docs",
    },
    {
      title: "Razorpay Product Updates (Official Blog)",
      url: "https://razorpay.com/blog/",
      published_at: "2025-01-28",
      snippet:
        "Product updates highlight platform breadth across gateway, payouts, and merchant operations.",
      type: "blog",
    },
    {
      title: "Razorpay Merchant Solutions",
      url: "https://razorpay.com/payment-gateway/",
      published_at: "2025-02-22",
      snippet:
        "Positioning focuses on fast onboarding, conversion optimization, and scale-readiness for Indian businesses.",
      type: "company",
    },
    {
      title: "Razorpay Support Documentation",
      url: "https://razorpay.com/docs/",
      published_at: "2025-02-05",
      snippet:
        "Documentation indicates mature operational support patterns and broad implementation guidance.",
      type: "docs",
    },
  ],
  paytm: [
    {
      title: "Paytm for Business Pricing",
      url: "https://business.paytm.com/pricing",
      published_at: "2025-01-15",
      snippet:
        "Paytm for Business pricing emphasizes broad merchant adoption and familiarity in the Indian market.",
      type: "pricing",
    },
    {
      title: "Paytm Business Payments Gateway",
      url: "https://business.paytm.com/payment-gateway",
      published_at: "2025-02-03",
      snippet:
        "Messaging focuses on conversion, acceptance breadth, and trusted consumer brand recall.",
      type: "company",
    },
    {
      title: "Paytm Business APIs and Documentation",
      url: "https://business.paytm.com/docs",
      published_at: "2025-02-18",
      snippet:
        "Official docs show core integration pathways and merchant operations support.",
      type: "docs",
    },
    {
      title: "Paytm Merchant Product Updates",
      url: "https://paytm.com/blog/payments/",
      published_at: "2025-01-30",
      snippet:
        "Recent updates reinforce merchant acceptance and payment ecosystem continuity.",
      type: "blog",
    },
    {
      title: "Paytm for Business Overview",
      url: "https://business.paytm.com/",
      published_at: "2025-01-08",
      snippet:
        "Business overview presents a broad merchant-first narrative across payment use cases.",
      type: "company",
    },
  ],
  phonepe: [
    {
      title: "PhonePe Business Solutions",
      url: "https://www.phonepe.com/business-solutions/",
      published_at: "2025-01-20",
      snippet:
        "PhonePe business pages position strong merchant distribution and digital payment familiarity.",
      type: "company",
    },
    {
      title: "PhonePe Payment Gateway for Businesses",
      url: "https://www.phonepe.com/business-solutions/payment-gateway/",
      published_at: "2025-02-10",
      snippet:
        "Gateway positioning emphasizes reliability, checkout options, and merchant scalability.",
      type: "docs",
    },
    {
      title: "PhonePe Product Blog",
      url: "https://www.phonepe.com/blog/",
      published_at: "2025-01-26",
      snippet:
        "Blog updates reflect a high-frequency launch cycle and growth-focused merchant messaging.",
      type: "blog",
    },
    {
      title: "PhonePe Trust and Security",
      url: "https://www.phonepe.com/trust-and-safety/",
      published_at: "2025-02-01",
      snippet:
        "Trust messaging reinforces operational confidence for payment flows at scale.",
      type: "company",
    },
    {
      title: "PhonePe Merchant Offerings",
      url: "https://www.phonepe.com/business-solutions/online-payments/",
      published_at: "2025-02-14",
      snippet:
        "Merchant offerings highlight digital-first operations and wide acceptance behavior.",
      type: "company",
    },
  ],
};

const DEFAULT_DEMO_SET = [
  {
    title: "Demo Competitor Pricing",
    url: "https://demo.blostem.local/pricing",
    published_at: "2025-01-01",
    snippet: "Synthetic pricing signal for reliable hackathon demonstration behavior.",
    type: "pricing",
  },
  {
    title: "Demo Competitor Docs",
    url: "https://demo.blostem.local/docs",
    published_at: "2025-01-01",
    snippet: "Synthetic integration and product capability signal.",
    type: "docs",
  },
  {
    title: "Demo Competitor Positioning",
    url: "https://demo.blostem.local/positioning",
    published_at: "2025-01-01",
    snippet: "Synthetic positioning narrative for deterministic demo output.",
    type: "company",
  },
];

const DEMO_BLUEPRINTS = {
  razorpay: {
    threat_level: "HIGH",
    summary: "Strong checkout footprint. Margin pressure at scale.",
    approved_claims: [
      "Razorpay is often preferred for fast merchant onboarding and familiar checkout adoption.",
      "As payment volume scales, pricing sensitivity becomes a central evaluation factor.",
      "Developer-friendly docs can accelerate integration in early rollout phases.",
    ],
    competitive_signals: [
      {
        signal: "Strong onboarding narrative in official gateway + docs properties",
        so_what: "They can win initial comfort quickly unless cost trade-offs are surfaced early.",
        source_type: "docs",
      },
      {
        signal: "Pricing posture appears prominently in official materials",
        so_what: "Price framing becomes a decisive objection point in shortlist and negotiation.",
        source_type: "pricing",
      },
      {
        signal: "Frequent product narrative updates indicate active GTM motion",
        so_what: "Reps should avoid stale positioning and anchor on current decision criteria.",
        source_type: "blog",
      },
    ],
    attack_angles: [
      {
        angle: "Total payment cost predictability at scale",
        when_to_use: "Buyer expects higher payment volume in next 2-3 quarters",
        what_to_say: "Cheap now can become expensive when transaction mix expands.",
        close: "What fee behavior do you expect at 3x current volume?",
        source_type: "pricing",
      },
      {
        angle: "Operational control beyond initial integration speed",
        when_to_use: "Technical team has completed basic gateway setup",
        what_to_say: "Fast launch matters, but control and predictability matter more after launch.",
        close: "Who owns cost and incident outcomes post go-live?",
        source_type: "docs",
      },
      {
        angle: "Decision-proofing for procurement review",
        when_to_use: "Deal enters formal evaluation or governance review",
        what_to_say: "Procurement needs evidence-backed downside analysis, not comfort bias.",
        close: "What downside gets the CFO call if assumptions fail?",
        source_type: "company",
      },
    ],
    stage_profiles: {
      discovery: {
        enter_when: "Buyer is mapping payment volume growth and unit economics",
        win_by: "Reframing from onboarding speed to long-term payment economics",
        kill_question: "What breaks first if payment volume doubles next quarter?",
      },
      shortlist: {
        enter_when: "Buyer compares two to three viable vendors",
        win_by: "Quantifying predictable cost and operational downside",
        kill_question: "Which option is safest at 3x transaction complexity?",
      },
      negotiation: {
        enter_when: "Commercial terms and risk ownership are being finalized",
        win_by: "Anchoring commercial discussion to downside exposure",
        kill_question: "How is downside risk priced into this contract?",
      },
      contract: {
        enter_when: "Legal/procurement is validating final obligations",
        win_by: "Ensuring decision rationale is documented with evidence",
        kill_question: "Will this decision still look strong in a post-mortem review?",
      },
    },
  },
  paytm: {
    threat_level: "MEDIUM",
    summary: "Mass reach and trust. Enterprise nuance can vary.",
    approved_claims: [
      "Paytm's merchant familiarity can reduce switching friction in early-stage decisions.",
      "Brand recall can bias evaluation unless quantified operational criteria are introduced.",
      "Procurement-focused comparisons should isolate predictable cost and control outcomes.",
    ],
    competitive_signals: [
      {
        signal: "Strong merchant familiarity from large installed base narrative",
        so_what: "Buyers may default to known brand comfort without deep operational comparison.",
        source_type: "company",
      },
      {
        signal: "Pricing messaging is explicit in business-facing properties",
        so_what: "Commercial framing must include long-term fit, not only entry-point rates.",
        source_type: "pricing",
      },
      {
        signal: "Business docs show broad use-case coverage",
        so_what: "Differentiate on where operational precision matters for this account.",
        source_type: "docs",
      },
    ],
    attack_angles: [
      {
        angle: "Decision quality beyond brand familiarity",
        when_to_use: "Buyer repeatedly references market familiarity",
        what_to_say: "Comfort is useful, but costly mistakes come from untested assumptions.",
        close: "Which measurable outcome matters most after month six?",
        source_type: "company",
      },
      {
        angle: "Commercial precision under real transaction mix",
        when_to_use: "Buyer asks for pricing comparison",
        what_to_say: "Rate card visibility is step one; blended cost behavior is the real test.",
        close: "What transaction mix are you underwriting this decision on?",
        source_type: "pricing",
      },
      {
        angle: "Operational depth where edge cases decide outcomes",
        when_to_use: "Technical stakeholders are involved",
        what_to_say: "Coverage matters, but edge-case ownership protects revenue continuity.",
        close: "Who is accountable when failure modes appear at peak load?",
        source_type: "docs",
      },
    ],
    stage_profiles: {
      discovery: {
        enter_when: "Buyer is defining must-have vs nice-to-have criteria",
        win_by: "Introducing measurable criteria before brand familiarity locks the frame",
        kill_question: "Which KPI would prove this was the right decision in 90 days?",
      },
      shortlist: {
        enter_when: "Buyer requests side-by-side vendor comparison",
        win_by: "Forcing criteria-weighted evaluation across cost, risk, and control",
        kill_question: "Which option wins when weighted by downside cost?",
      },
      negotiation: {
        enter_when: "Commercial and legal terms are being aligned",
        win_by: "Linking price concessions to operational safeguards",
        kill_question: "What safeguards remain if headline pricing changes?",
      },
      contract: {
        enter_when: "Final sign-off stakeholders ask for confidence",
        win_by: "Demonstrating evidence-backed rationale over familiarity bias",
        kill_question: "Could this rationale survive CFO-level scrutiny next quarter?",
      },
    },
  },
  phonepe: {
    threat_level: "MEDIUM",
    summary: "Strong distribution momentum. Monetization trade-offs matter.",
    approved_claims: [
      "PhonePe's distribution momentum creates strong top-of-funnel familiarity with merchants.",
      "Buyer evaluation should separate awareness strength from long-term operating fit.",
      "Structured procurement framing improves decision quality in late-stage evaluation.",
    ],
    competitive_signals: [
      {
        signal: "Business-solution pages emphasize broad merchant reach",
        so_what: "They can win awareness quickly unless evaluation criteria are disciplined.",
        source_type: "company",
      },
      {
        signal: "Gateway narrative highlights reliability and scale",
        so_what: "Conversation should move from headline reliability to account-specific failure cost.",
        source_type: "docs",
      },
      {
        signal: "Frequent product communication indicates active market motion",
        so_what: "Reps should keep differentiation updated and evidence-backed.",
        source_type: "blog",
      },
    ],
    attack_angles: [
      {
        angle: "Awareness vs fit distinction",
        when_to_use: "Buyer equates market visibility with best long-term choice",
        what_to_say: "Visibility lowers evaluation effort, but fit drives long-term economics.",
        close: "Which workflow risk matters most after quarter one?",
        source_type: "company",
      },
      {
        angle: "Reliability in account-specific edge scenarios",
        when_to_use: "Technical and operations stakeholders join review",
        what_to_say: "Generic reliability claims are not equal to your specific failure profile.",
        close: "Which edge case would be most expensive to mishandle?",
        source_type: "docs",
      },
      {
        angle: "Late-stage procurement defensibility",
        when_to_use: "Deal enters procurement or legal controls",
        what_to_say: "Evidence-backed downside framing de-risks final sign-off.",
        close: "How will this choice be defended in a post-incident review?",
        source_type: "blog",
      },
    ],
    stage_profiles: {
      discovery: {
        enter_when: "Buyer is mapping problem and success criteria",
        win_by: "Separating awareness from measurable success outcomes",
        kill_question: "What measurable outcome defines success after rollout?",
      },
      shortlist: {
        enter_when: "Buyer has shortlisted viable alternatives",
        win_by: "Pressure-testing each option against cost of failure",
        kill_question: "Which option contains the biggest hidden downside?",
      },
      negotiation: {
        enter_when: "Commercial scope and obligations are negotiated",
        win_by: "Linking commitments to operational accountability",
        kill_question: "Who owns downside if projected assumptions miss?",
      },
      contract: {
        enter_when: "Final legal and procurement checks are underway",
        win_by: "Providing concise evidence chain for executive sign-off",
        kill_question: "Can this decision be defended with evidence in six months?",
      },
    },
  },
};

export function getDemoSources(competitor, query = "") {
  const key = keyFor(competitor);
  const selected = DEMO_DATA[key] || DEFAULT_DEMO_SET;

  // Add query-aware synthetic note so generation still feels contextual.
  if (!query) return selected;
  return [
    ...selected,
    {
      title: "Demo Query Context",
      url: "https://demo.blostem.local/query-context",
      published_at: "2025-01-01",
      snippet: `Synthetic context seeded for query: ${String(query).slice(0, 120)}`,
      type: "notes",
    },
  ];
}

export function listDemoCompetitors() {
  return Object.keys(DEMO_DATA);
}

export function getDemoBlueprint(competitor, dealStage = "discovery") {
  const key = keyFor(competitor);
  const fallback = {
    threat_level: "MEDIUM",
    summary: "Strong first impression. Economics decide later.",
    approved_claims: [
      "Demo mode uses curated evidence-first claims.",
      "Prioritize measurable downside in vendor comparison.",
      "Anchor decision on operating fit, not familiarity alone.",
    ],
    competitive_signals: [
      {
        signal: "Curated evidence set loaded for deterministic demo output",
        so_what: "Demo narratives remain stable across reruns.",
        source_type: "docs",
      },
    ],
    attack_angles: [
      {
        angle: "Evidence-first procurement framing",
        when_to_use: "Buyer asks for direct comparison",
        what_to_say: "Choose the option with strongest downside-proof logic.",
        close: "Which option is safest under growth pressure?",
        source_type: "docs",
      },
    ],
    stage_profiles: {
      discovery: {
        enter_when: "Criteria are still open",
        win_by: "Define measurable success early",
        kill_question: "What fails first if volume doubles?",
      },
    },
  };

  const blueprint = DEMO_BLUEPRINTS[key] || fallback;
  const stage = String(dealStage || "discovery").toLowerCase();
  const stageProfile = blueprint.stage_profiles?.[stage] || blueprint.stage_profiles?.discovery || null;
  return { ...blueprint, stage_profile: stageProfile };
}
