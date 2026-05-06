// Citation and claim trace logic (unique differentiator)
// Enhanced with market context and dynamic opportunity scoring

// Knowledge base for market-aware rebuttals
const MARKET_REBUTTALS = {
  // Pricing/cost claims
  'price|cost|expensive|affordable': [
    'Shift from sticker price to predictable total cost.',
    'Ask how pricing changes as volume and exceptions grow.',
    'Use public pricing evidence to clarify the real commercial tradeoff.',
  ],
  // Speed/reliability claims
  'fast|speed|slow|latency|quick|slow': [
    'Treat speed as table stakes; test reliability under edge cases.',
    'Ask what happens during spikes, refunds, and settlement exceptions.',
    'Move the buyer from speed claims to operational proof.',
  ],
  // Security/compliance claims
  'secure|safe|compliant|compliance|rbi|regulation': [
    'Make compliance an evaluated buying criterion, not a brochure claim.',
    'Ask for audit, escalation, and exception-handling proof.',
    'Separate regulatory posture from day-to-day operating confidence.',
  ],
  // Integration/developer experience
  'integration|api|developer|easy|simple|onboard': [
    'Fast integration is useful; workflow flexibility wins complex deals.',
    'Ask which non-standard flows must work on day one.',
    'Use docs evidence to compare implementation depth, not slogans.',
  ],
  // Customer support/experience
  'support|service|customer|experience': [
    'Support quality matters most when exceptions hit revenue.',
    'Ask who owns escalation when payments or settlements break.',
    'Turn sentiment evidence into an operational-risk conversation.',
  ],
  // Scale/growth/market share
  'scale|grow|growth|market|users|merchants': [
    'Scale creates comfort; fit determines switching risk.',
    'Ask where their scale helps your exact merchant workflow.',
    'Move from market reach to buyer-specific operating fit.',
  ],
  // Product features
  'feature|launch|product|bnpl|loan': [
    'A launch is not proof of fit; ask for adoption evidence.',
    'Separate product breadth from the buyer’s critical workflow.',
    'Use launch evidence to test focus and implementation maturity.',
  ]
};

// Opportunity matrix: contextualize by competitor
const OPPORTUNITY_MATRIX = {
  razorpay: [
    { category: 'Commercial', text: 'Pricing predictability for scaling merchants', weight: 0.95 },
    { category: 'Workflow', text: 'Complex payment workflows beyond standard checkout', weight: 0.88 },
    { category: 'Go-to-Market', text: 'Regional onboarding and support depth', weight: 0.82 },
    { category: 'Proof', text: 'Evidence-backed comparison of implementation burden', weight: 0.79 },
  ],
  paytm: [
    { category: 'Trust', text: 'Merchant confidence, compliance, and operating continuity', weight: 0.93 },
    { category: 'Enterprise', text: 'B2B workflow depth versus broad consumer ecosystem', weight: 0.90 },
    { category: 'Commercial', text: 'Pricing clarity and settlement operations', weight: 0.86 },
    { category: 'Proof', text: 'Public evidence around merchant support quality', weight: 0.85 },
  ],
  phonepe: [
    { category: 'Market', text: 'Merchant workflow fit beyond UPI familiarity', weight: 0.91 },
    { category: 'Enterprise', text: 'API, payout, and exception handling proof', weight: 0.89 },
    { category: 'Commercial', text: 'Monetization and total-cost clarity', weight: 0.84 },
    { category: 'Operations', text: 'Support quality for complex merchant cases', weight: 0.80 },
  ],
  default: [
    { category: 'Market Expansion', text: 'Geographic or vertical expansion', weight: 0.75 },
    { category: 'Product', text: 'Adjacent product lines or feature depth', weight: 0.70 },
    { category: 'Go-to-Market', text: 'Alternative distribution or partnership models', weight: 0.65 },
    { category: 'Retention', text: 'Enhanced customer success and support', weight: 0.60 },
  ]
};

function getRebuttal(claim) {
  // Find best matching rebuttal category
  for (const [keywords, rebuttals] of Object.entries(MARKET_REBUTTALS)) {
    if (keywords.split('|').some(k => claim.toLowerCase().includes(k))) {
      return rebuttals[Math.floor(Math.random() * rebuttals.length)];
    }
  }
  return 'Acknowledge strength; differentiate on our unique value proposition.';
}

function getOpportunities(competitor, confidence) {
  const key = (competitor || '').toLowerCase().replace(/\s+/g, '');
  const opps = OPPORTUNITY_MATRIX[key] || OPPORTUNITY_MATRIX.default;
  
  // Rank by confidence and weight
  const weighted = opps.map(o => ({
    ...o,
    score: o.weight * (confidence || 0.7)
  })).sort((a, b) => b.score - a.score);
  
  return weighted.slice(0, 3); // Top 3 opportunities
}

function formatSourceMeta(source = {}) {
  const date = source.published_at || source.date || source.retrieved_at || 'n.d.';
  const type = (source.type || 'source').toUpperCase();
  return `${type} · ${date}`;
}

export function formatCitation(source, index) {
  return `[${index}] ${source.title} — ${source.url} (${source.published_at || source.date || source.retrieved_at || "n.d."})`;
}

export function generateClaimTrace(claim, source, confidence, competitor = null, supportingSources = []) {
  // Claim Trace: unique differentiator with market-aware rebuttals
  const rebuttal = getRebuttal(claim);
  const topOpps = getOpportunities(competitor, confidence);
  const primaryOpp = topOpps[0]?.text || 'Market expansion into new segments';
  const linkedSources = [source, ...supportingSources].filter(Boolean);
  const primarySource = linkedSources[0] || source || {};
  const supportingSourceMeta = linkedSources.slice(1).map((item) => ({
    title: item.title || 'Source',
    url: item.url || '',
    meta: formatSourceMeta(item),
  }));
  const evidenceStatus = linkedSources.length === 0 ? 'unsupported' : linkedSources.length === 1 ? 'single-source' : 'multi-source';
  // Map numeric confidence to human-friendly evidence tier
  const evidenceTier = (confidence || 0) >= 0.75 ? 'Verified' : (confidence || 0) >= 0.45 ? 'Inferred' : 'Hypothesis';

  return {
    claim,
    confidence: Math.min((confidence || 0.7) + 0.05, 1.0),
    evidence_tier: evidenceTier,
    source: primarySource?.url || '',
    source_title: primarySource?.title || 'Source',
    source_date: primarySource?.published_at || primarySource?.date || primarySource?.retrieved_at || 'n.d.',
    source_type: (primarySource?.type || 'source').toUpperCase(),
    source_meta: formatSourceMeta(primarySource),
    source_url: primarySource?.url || '',
    source_ids: linkedSources.map((item) => item.id).filter(Boolean),
    evidence: primarySource?.snippet || claim,
    evidence_snippets: linkedSources.map((item) => item?.snippet).filter(Boolean),
    rebuttal,
    opportunity: primaryOpp,
    topOpportunities: topOpps, // For advanced UI rendering
    supporting_sources: supportingSourceMeta,
    evidence_status: evidenceStatus,
    inference_note:
      linkedSources.length > 1
        ? 'Derived from multiple linked sources and ranking logic.'
        : linkedSources.length === 1
          ? 'Derived from one linked source and confidence weighting.'
          : 'No linked source was available for this claim.'
  };
}

export function citationsToMarkdown(traces) {
  let md = '## Claims & Evidence (Claim Trace)\n\n';
  traces.forEach((t, i) => {
    md += `### Claim ${i + 1}: ${t.claim}\n`;
    md += `- **Confidence:** ${(t.confidence * 100).toFixed(0)}%\n`;
    md += `- **Source:** ${t.source_title || t.source || 'Source'}\n`;
    md += `- **Source meta:** ${t.source_meta || `${t.source_type || 'SOURCE'} · ${t.source_date || 'n.d.'}`}\n`;
    if (t.source_url) {
      md += `- **Source URL:** ${t.source_url}\n`;
    }
    md += `- **Evidence status:** ${t.evidence_status || 'unknown'}\n`;
    md += `- **Evidence:** > ${t.evidence}\n`;
    if (t.inference_note) {
      md += `- **Inference:** ${t.inference_note}\n`;
    }
    md += `- **AE Rebuttal:** ${t.rebuttal}\n`;
    md += `- **Market Opportunity:** ${t.opportunity}\n`;
    if (t.topOpportunities && t.topOpportunities.length > 1) {
      md += `  - *Also consider:* ${t.topOpportunities.slice(1).map(o => o.text).join(', ')}\n`;
    }
    if (t.supporting_sources && t.supporting_sources.length > 0) {
      md += `- **Supporting sources:** ${t.supporting_sources.map((s) => `${s.title} (${s.meta})`).join('; ')}\n`;
    }
    md += `\n`;
  });
  return md;
}
