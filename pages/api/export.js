export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { markdown, competitor, format } = req.body || {};
  if (!markdown) return res.status(400).json({ error: 'Missing markdown content' });

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

  if (requestedFormat === 'pdf') {
    try {
      const marked = (await import('marked')).marked || (await import('marked'));
      const puppeteer = await import('puppeteer');
      const renderedMarkdown = marked.parse ? marked.parse(markdown) : marked(markdown);
      const safeMarkdownHtml = sanitizeHtml(renderedMarkdown);

      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(competitor || 'Battlecard')}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color: #0f172a; padding: 24px; }
  article { max-width: 900px; margin: 0 auto; }
  h1, h2, h3 { color: #0f172a; }
  pre, code { background:#f8fafc; padding:8px; border-radius:6px; }
  img { max-width:100%; }
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

  // Default fallback: return markdown attachment
  const filename = `${outNameBase}.md`;
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(markdown);
}
