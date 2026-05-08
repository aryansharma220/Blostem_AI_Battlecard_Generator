export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { markdown, competitor, format, result, battlecard, pipeline } = req.body || {};
  if (!markdown && !battlecard && !result) return res.status(400).json({ error: 'Missing export content' });

  const outNameBase = `${(competitor || 'battlecard').replace(/[^a-z0-9_-]/gi,'_')}-${Date.now()}`;
  const requestedFormat = (format || req.query.format || 'pdf').toLowerCase();

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const sanitizeHtml = (html = '') => String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/\s(href|src)=["']javascript:[^"']*["']/gi, '');

  const escapeAttr = (value = '') => escapeHtml(value).replace(/\n/g, ' ');

  const asList = (items = [], fallback = 'None') => {
    if (!Array.isArray(items) || !items.length) return `<p>${escapeHtml(fallback)}</p>`;
    return `<ul>${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`;
  };

  const section = (title, body) => `<section class="card"><h2>${escapeHtml(title)}</h2>${body}</section>`;

  const renderClaimList = (items = [], renderer) => {
    if (!Array.isArray(items) || !items.length) return '<p>None</p>';
    return `<div class="grid">${items.map((item) => `<article class="tile">${renderer(item)}</article>`).join('')}</div>`;
  };

  const fullPayload = result || { battlecard, pipeline };
  const bc = fullPayload.battlecard || battlecard || {};
  const pipe = fullPayload.pipeline || pipeline || {};

  const buildReportMarkdown = () => {
    const lines = [];
    lines.push(`# ${competitor || bc.competitor || 'Battlecard'} Full Report`);
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Threat level: ${bc.ae_quick_verdict?.threat_level || bc.threat_level || 'MEDIUM'}`);
    lines.push(`Confidence: ${bc.ae_quick_verdict?.confidence || 'Directional'}`);
    lines.push('');
    lines.push('## Quick Verdict');
    lines.push(bc.ae_quick_verdict?.summary || bc.summary || 'No summary available.');
    lines.push('');
    lines.push('## Procurement Risk');
    if (bc.procurement_risk_dashboard) {
      lines.push(`Level: ${bc.procurement_risk_dashboard.risk_level || 'UNKNOWN'}`);
      lines.push(`Score: ${bc.procurement_risk_dashboard.risk_score ?? 0}`);
      lines.push(`Why: ${bc.procurement_risk_dashboard.why || 'n/a'}`);
      lines.push(`Question: ${bc.procurement_risk_dashboard.procurement_question || 'n/a'}`);
    }
    lines.push('');
    lines.push('## Competitive Signals');
    (bc.competitive_signals || []).forEach((signal, index) => {
      lines.push(`${index + 1}. ${signal.signal || 'Signal'}`);
      if (signal.so_what) lines.push(`   So what: ${signal.so_what}`);
      if (signal.confidence) lines.push(`   Confidence: ${signal.confidence}`);
      if (signal.evidence_ids?.length) lines.push(`   Evidence: ${signal.evidence_ids.join(', ')}`);
    });
    lines.push('');
    lines.push('## Verification Angles');
    (bc.attack_angles || []).forEach((angle, index) => {
      lines.push(`${index + 1}. ${angle.angle || 'Angle'}`);
      if (angle.when_to_use) lines.push(`   When to use: ${angle.when_to_use}`);
      if (angle.what_to_say) lines.push(`   Verify: ${angle.what_to_say}`);
      if (angle.close || angle.closing_question) lines.push(`   Buyer question: ${angle.close || angle.closing_question}`);
      if (angle.evidence_ids?.length) lines.push(`   Evidence: ${angle.evidence_ids.join(', ')}`);
    });
    lines.push('');
    lines.push('## Buyer Verification Cues');
    (bc.evidence_cards || []).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.claim || 'Cue'}`);
      if (item.buyer_question) lines.push(`   Question: ${item.buyer_question}`);
      if (item.ae_action) lines.push(`   Action: ${item.ae_action}`);
      if (item.verification_path) lines.push(`   Path: ${item.verification_path}`);
    });
    lines.push('');
    lines.push('## Verification Sequence');
    (bc.verification_sequence || []).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.stage_phase || item.moment || 'Step'}`);
      if (item.pain_point) lines.push(`   Buyer condition: ${item.pain_point}`);
      if (item.verification_question) lines.push(`   Verify: ${item.verification_question}`);
      if (item.listen_for) lines.push(`   Listen for: ${item.listen_for}`);
    });
    lines.push('');
    lines.push('## How to Win This Deal');
    if (bc.how_to_win) {
      lines.push(`DO NOT: ${bc.how_to_win.do_not || 'n/a'}`);
      lines.push(`ENTER WHEN: ${bc.how_to_win.enter_when || 'n/a'}`);
      lines.push(`WIN BY: ${bc.how_to_win.win_by || 'n/a'}`);
      lines.push(`KILL QUESTION: ${bc.how_to_win.kill_question || 'n/a'}`);
    }
    lines.push('');
    lines.push('## Evidence Review');
    if (bc.evidence_panel?.external_use_label) {
      lines.push(`External use: ${bc.evidence_panel.external_use_label} (${bc.evidence_panel.external_use_meaning || ''})`);
    }
    if (bc.evidence_panel?.traceability) {
      lines.push(`Traceability: ${bc.evidence_panel.traceability}`);
    }
    (pipe.claim_traces || []).forEach((trace, index) => {
      lines.push(`${index + 1}. ${trace.claim || 'Claim'}`);
      if (trace.source_title) lines.push(`   Source: ${trace.source_title}`);
      if (trace.evidence_status) lines.push(`   Status: ${trace.evidence_status}`);
      if (trace.ae_action) lines.push(`   AE usage: ${trace.ae_action}`);
      if (trace.buyer_question) lines.push(`   Buyer question: ${trace.buyer_question}`);
    });
    lines.push('');
    lines.push('## Source Quality Review');
    if (bc.source_quality_review?.summary) lines.push(bc.source_quality_review.summary);
    (bc.source_quality_review?.best_sources || []).forEach((source, index) => {
      lines.push(`${index + 1}. ${source.title} (${source.tier})`);
      lines.push(`   ${source.reason}`);
      lines.push(`   External use: ${source.external_use}`);
    });
    lines.push('');
    lines.push('## Hidden Signals');
    (bc.hidden_signals || []).forEach((signal, index) => {
      lines.push(`${index + 1}. ${signal.insight}`);
      if (signal.implication) lines.push(`   Implication: ${signal.implication}`);
      if (signal.tactical_leverage) lines.push(`   Leverage: ${signal.tactical_leverage}`);
    });
    lines.push('');
    lines.push('## Recent Moves');
    (bc.recent_moves || []).forEach((move, index) => {
      lines.push(`${index + 1}. ${move.move || 'Move'}`);
      if (move.implication) lines.push(`   Implication: ${move.implication}`);
    });
    lines.push('');
    lines.push('## Customer Sentiment');
    (bc.customer_sentiment || []).forEach((theme, index) => {
      lines.push(`${index + 1}. ${theme.theme || 'Theme'}`);
      if (theme.evidence) lines.push(`   Evidence: ${theme.evidence}`);
      if (theme.ae_move) lines.push(`   Ask: ${theme.ae_move}`);
    });
    lines.push('');
    lines.push('## Where They Win');
    (bc.where_they_win || []).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.point || 'Point'}`);
      if (item.why_it_matters) lines.push(`   Why it matters: ${item.why_it_matters}`);
    });
    lines.push('');
    lines.push('## Where They Are Vulnerable');
    (bc.where_vulnerable || []).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.point || 'Point'}`);
      if (item.ae_question) lines.push(`   Ask: ${item.ae_question}`);
      if (item.why_it_matters) lines.push(`   Why it matters: ${item.why_it_matters}`);
    });
    lines.push('');
    lines.push('## Compare vs Us');
    (bc.compare_vs_us?.where_we_win || []).forEach((item, index) => {
      lines.push(`${index + 1}. Us: ${item}`);
    });
    (bc.compare_vs_us?.where_we_lose || []).forEach((item, index) => {
      lines.push(`${index + 1}. Them: ${item}`);
    });
    lines.push('');
    lines.push('## Sources');
    (pipe.sources || []).forEach((source, index) => {
      lines.push(`${index + 1}. ${source.title || 'Source'} - ${source.url || ''}`);
    });
    return lines.join('\n');
  };

  if (requestedFormat === 'pdf') {
    try {
      const marked = (await import('marked')).marked || (await import('marked'));
      const puppeteer = await import('puppeteer');
      const pdfMarkdown = result || battlecard ? buildReportMarkdown() : markdown;
      const renderedMarkdown = marked.parse ? marked.parse(pdfMarkdown) : marked(pdfMarkdown);
      const safeMarkdownHtml = sanitizeHtml(renderedMarkdown);

      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(competitor || 'Battlecard')}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color: #0f172a; margin: 0; padding: 0; background: #ffffff; }
  article { max-width: 920px; margin: 0 auto; padding: 24px; }
  h1, h2, h3 { color: #0f172a; break-after: avoid; }
  h1 { font-size: 28px; margin-bottom: 6px; }
  h2 { margin-top: 26px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  p, li { line-height: 1.55; }
  ul { padding-left: 20px; }
  pre, code { background:#f8fafc; padding:8px; border-radius:6px; white-space: pre-wrap; }
  img { max-width:100%; }
  .card { break-inside: avoid; }
  .grid { display: block; }
  .tile { margin-bottom: 12px; }
</style>
</head>
<body>
<article>
${safeMarkdownHtml}
</article>
</body>
</html>`;

      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
      await browser.close();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${outNameBase}.pdf"`);
      return res.status(200).send(pdfBuffer);
    } catch (err) {
      console.error('PDF export failed, falling back to markdown:', err?.message || err);
      // fallback to markdown
    }
  }

  // Default markdown export: return the full structured report when available.
  const exportMarkdown = result || battlecard ? buildReportMarkdown() : markdown;
  const filename = `${outNameBase}.md`;
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(exportMarkdown);
}
