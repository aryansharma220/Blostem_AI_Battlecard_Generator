// Citation and claim trace logic (unique differentiator)
// Enhanced with market context and dynamic opportunity scoring

// Knowledge base for market-aware verification angles
const MARKET_REBUTTALS = {
  // Pricing/cost claims
  'price|cost|expensive|affordable': [
    'Shift from headline price to total cost under the buyer’s transaction mix.',
    'Ask how pricing changes as volume, exceptions, refunds, and settlements grow.',
    'Use public pricing evidence to show the real commercial tradeoff.',
  ],
  // Speed/reliability claims
  'fast|speed|slow|latency|quick|slow': [
    'Treat speed as table stakes; test reliability under spikes and edge cases.',
    'Ask what happens during spikes, refunds, retries, and settlement exceptions.',
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
    { category: 'Commercial', text: 'Pricing predictability as transaction mix expands', weight: 0.95 },
    { category: 'Workflow', text: 'Non-standard payment flows beyond checkout only', weight: 0.88 },
    { category: 'Operations', text: 'Support depth for reconciliation and settlement edge cases', weight: 0.82 },
    { category: 'Proof', text: 'Evidence-backed comparison of implementation burden', weight: 0.79 },
  ],
  paytm: [
    { category: 'Trust', text: 'Merchant confidence, compliance, and operating continuity', weight: 0.93 },
    { category: 'Enterprise', text: 'B2B workflow depth versus consumer ecosystem breadth', weight: 0.90 },
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

function getRebuttal(claim, competitorSignals = []) {
  // CHANGED: Ground rebuttal in actual competitor signal evidence
  // Previously: keyword matching → random generic rebuttal
  // Now: claim + signals → evidence-grounded rebuttal
  
  if (!competitorSignals || competitorSignals.length === 0) {
    return 'Acknowledge strength. Test it against your operational requirements.';
  }

  // Find signals most relevant to the claim
  const claimWords = claim.toLowerCase().split(' ').slice(0, 5); // First 5 words of claim
  const relevantSignals = competitorSignals.filter(sig => {
    const sigText = (sig.text || sig.theme || '').toLowerCase();
    return claimWords.some(word => sigText.includes(word) || word.length > 3);
  });

  if (relevantSignals.length === 0) {
    return 'Acknowledged. What operational evidence would validate this for your workflow?';
  }

  // Generate evidence-grounded rebuttal
  const topSignal = relevantSignals[0];
  const rebuttal_text = topSignal.text || topSignal.theme || 'our signals suggest a different operational reality';
  return `Acknowledged on the claim. Our signals show: "${rebuttal_text}". How does this affect your priorities?`;
}

function getOpportunities(competitor, confidence, competitorSignals = []) {
  // CHANGED: Derive opportunities from competitor signal analysis, not templates
  if (!competitorSignals || competitorSignals.length === 0) {
    // Fallback: generic opportunities when signals unavailable
    return [
      { category: 'Operational', text: 'Verify impact on your specific workflow.', weight: 0.8 },
      { category: 'Commercial', text: 'Clarify total cost under your scale.', weight: 0.75 },
      { category: 'Validation', text: 'Seek evidence-backed proof of claims.', weight: 0.7 },
    ];
  }

  // Extract signal themes to identify gaps and opportunities
  const signalThemes = competitorSignals.map(sig => sig.theme || sig.category || '').filter(Boolean);
  const opportunities = [];

  // Theme-derived opportunities (evidence-grounded)
  if (signalThemes.some(t => t.toLowerCase().includes('scaling') || t.toLowerCase().includes('growth'))) {
    opportunities.push({ category: 'Operational', text: 'Test scaling behavior under your exact volume profile.', weight: 0.9 });
  }
  if (signalThemes.some(t => t.toLowerCase().includes('support') || t.toLowerCase().includes('operational'))) {
    opportunities.push({ category: 'Operational', text: 'Verify support response during high-friction scenarios.', weight: 0.85 });
  }
  if (signalThemes.some(t => t.toLowerCase().includes('pricing') || t.toLowerCase().includes('commercial'))) {
    opportunities.push({ category: 'Commercial', text: 'Model total cost at your transaction scale.', weight: 0.82 });
  }
  if (signalThemes.some(t => t.toLowerCase().includes('compliance') || t.toLowerCase().includes('trust'))) {
    opportunities.push({ category: 'Risk', text: 'Request audit evidence for regulatory alignment.', weight: 0.80 });
  }

  // If no theme-specific opportunities, use confidence-weighted defaults
  if (opportunities.length === 0) {
    opportunities.push(
      { category: 'Proof', text: 'Ask for evidence validation of key claims.', weight: confidence || 0.7 },
      { category: 'Fit', text: 'Assess operational fit to your specific workflow.', weight: (confidence || 0.7) * 0.9 },
      { category: 'Risk', text: 'Probe switching risk and implementation burden.', weight: (confidence || 0.7) * 0.8 }
    );
  }

  // Rank by weight
  return opportunities.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

function formatSourceMeta(source = {}) {
  const date = source.published_at || source.date || source.retrieved_at || 'n.d.';
  const type = (source.type || 'source').toUpperCase();
  return `${type} · ${date}`;
}

export function formatCitation(source, index) {
  return `[${index}] ${source.title} — ${source.url} (${source.published_at || source.date || source.retrieved_at || "n.d."})`;
}

export function generateClaimTrace(claim, source, confidence, competitor = null, supportingSources = [], competitorSignals = []) {
  // Claim-to-source map with conservative AE usage guidance.
  const rebuttal = getRebuttal(claim, competitorSignals);
  const topOpps = getOpportunities(competitor, confidence, competitorSignals);
  const primaryOpp = topOpps[0]?.text || 'Operational validation of claims.';
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
    confidence: Math.min(confidence || 0.7, 1.0),
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
    ae_action: 'Use this to guide the next buyer question.',
    buyer_question: 'What should the buyer verify next?',
    topOpportunities: topOpps, // For advanced UI rendering
    supporting_sources: supportingSourceMeta,
    evidence_status: evidenceStatus,
    inference_note:
      linkedSources.length > 1
        ? 'Derived from multiple linked sources and ranking logic.'
        : linkedSources.length === 1
          ? 'Derived from one linked source and confidence weighting.'
          : 'No linked source was available for this claim.',
    rebuttal_method: competitorSignals && competitorSignals.length > 0 ? 'Evidence-informed from competitor signals.' : 'Generic operational framing (signals unavailable).',
    opportunity_method: competitorSignals && competitorSignals.length > 0 ? 'Derived from competitor signal theme analysis.' : 'Generic opportunity framework (signals unavailable).'
  };
}

export function citationsToMarkdown(traces) {
  let md = '## Claims & Evidence Review\n\n';
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
    if (t.ae_action) {
    md += `- **AE Usage:** ${t.ae_action}\n`;
    }
    if (t.buyer_question) {
      md += `- **Buyer Question:** ${t.buyer_question}\n`;
    }
    md += `- **Verification angle:** ${t.rebuttal}\n`;
    md += `- **Operational clue:** ${t.opportunity}\n`;
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
