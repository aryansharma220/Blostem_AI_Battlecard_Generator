// Firecrawl-first web scraping for live competitive intelligence.
// Uses Firecrawl for search/scrape and falls back to curated public seed sources when needed.

import Firecrawl from '@mendable/firecrawl-js';
import { retrieveRelevantSources } from './rag.js';
import { inferSourceAuthority, inferSourceFreshness, isHighQualitySource, isLowQualitySource } from './sourcePolicy.js';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const firecrawl = FIRECRAWL_API_KEY ? new Firecrawl({ apiKey: FIRECRAWL_API_KEY }) : null;

function inferType(raw = {}) {
  const text = `${raw.title || ''} ${raw.url || ''} ${raw.snippet || raw.content || ''}`.toLowerCase();
  if (raw.type) return raw.type;
  if (/pricing|price|mdr|fee/.test(text)) return 'pricing';
  if (/docs|api|developer|reference/.test(text)) return 'docs';
  if (/g2|review|trustpilot|reddit/.test(text)) return 'reviews';
  if (/blog|launch|announcement/.test(text)) return 'blog';
  if (/linkedin|social/.test(text)) return 'social';
  if (/news|funding|forbes|techcrunch|times/.test(text)) return 'news';
  return 'company';
}

function scoreScrapedSource(source) {
  let score = 0.35;
  const url = String(source.url || '').toLowerCase();
  const sourceName = String(source.source || '').toLowerCase();
  const freshness = source.freshness || inferSourceFreshness(source.date || source.published_at || source.publishedAt || '');

  if (url.includes('techcrunch') || sourceName.includes('techcrunch')) score += 0.3;
  if (url.includes('crunchbase') || sourceName.includes('crunchbase')) score += 0.25;
  if (url.includes('forbes') || sourceName.includes('forbes')) score += 0.25;
  if (url.includes('bloomberg') || sourceName.includes('bloomberg')) score += 0.25;
  if (url.includes('g2.com') || sourceName.includes('g2')) score += 0.15;
  if (url.includes('linkedin') || sourceName.includes('linkedin')) score += 0.1;
  if (url.includes('medium') || sourceName.includes('medium')) score += 0.1;
  if (freshness === 'recent') score += 0.15;
  if (freshness === 'stale') score -= 0.05;
  if (freshness === 'unknown') score -= 0.08;
  if (isLowQualitySource(source.url)) score -= 0.3;
  if (isHighQualitySource(source.url)) score += 0.1;
  if (source.category === 'funding') score += 0.1;
  if (source.category === 'product-launch') score += 0.08;

  return Math.min(Math.max(score, 0), 1);
}

function normalizeDocument(raw, provider, index, competitor = '') {
  const metadata = raw?.metadata || {};
  const url = raw?.url || raw?.link || metadata?.sourceURL || metadata?.url || '';
  const title = raw?.title || metadata?.title || metadata?.sourceTitle || `Source ${index + 1}`;
  const snippet = raw?.markdown || raw?.content || raw?.description || raw?.excerpt || raw?.text || '';
  const publishedAt = raw?.published_at || raw?.publishedAt || raw?.date || metadata?.publishedAt || metadata?.publishedTime || '';
  const category = raw?.category || inferType({ title, url, snippet, type: raw?.type });

  const normalized = {
    id: raw?.id || `src_${index + 1}`,
    title,
    url,
    snippet: String(snippet).slice(0, 500),
    published_at: publishedAt,
    retrieved_at: new Date().toISOString(),
    type: inferType({ title, url, snippet, type: raw?.type }),
    category,
    authority: inferSourceAuthority(url, competitor),
    freshness: inferSourceFreshness(publishedAt),
    provider,
    credibility_score: 0,
    raw_metadata: metadata,
  };

  normalized.credibility_score = scoreScrapedSource(normalized);
  return normalized;
}

function deduplicateNormalizedSources(sources = []) {
  const seen = new Set();
  const deduped = [];

  sources.forEach((source) => {
    const key = (source.url || `${source.title}`).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(source);
  });

  return deduped.map((source, index) => ({ ...source, id: `src_${index + 1}` }));
}

async function firecrawlCrawl(siteUrl, limit = 50, competitor = '') {
  if (!firecrawl || !siteUrl) return [];
  try {
    const response = await firecrawl.crawl(siteUrl, { 
      limit,
      scrapeOptions: { formats: ['markdown'] }
    });
    const items = response?.data || response?.documents || response?.results || [];
    return items.map((item, index) => normalizeDocument(item, 'firecrawl-crawl', index, competitor));
  } catch (error) {
    console.warn(`Firecrawl crawl failed for ${siteUrl}:`, error?.message || error);
    return [];
  }
}

async function firecrawlSearch(query, limit = 6, competitor = '') {
  if (!firecrawl) return [];
  try {
    const response = await firecrawl.search(query, { limit });
    const items = response?.data || response?.results || response?.documents || response?.links || [];
    return items.map((item, index) => normalizeDocument(item, 'firecrawl-search', index, competitor));
  } catch (error) {
    console.warn(`Firecrawl search failed for "${query}":`, error?.message || error);
    return [];
  }
}

async function firecrawlScrape(url, competitor = '') {
  if (!firecrawl || !url) return null;
  try {
    const doc = await firecrawl.scrape(url, { formats: ['markdown'] });
    return normalizeDocument(doc, 'firecrawl-scrape', 0, competitor);
  } catch (error) {
    console.warn(`Firecrawl scrape failed for ${url}:`, error?.message || error);
    return null;
  }
}

function inferCompetitorWebsite(competitor) {
  const clean = String(competitor || '').trim().toLowerCase();
  const known = {
    razorpay: 'https://razorpay.com',
    paytm: 'https://business.paytm.com',
    phonepe: 'https://www.phonepe.com',
    'm2p fintech': 'https://m2pfintech.com',
    m2p: 'https://m2pfintech.com',
  };
  if (known[clean]) return known[clean];
  const domain = clean.replace(/\s+/g, '');
  return `https://${domain}.com`;
}

function buildRagQuery(competitor, query) {
  return `${competitor} ${query || ''}`.trim();
}

async function fetchRagFallback(competitor, query) {
  try {
    const ragSources = await retrieveRelevantSources(competitor, buildRagQuery(competitor, query), 5);
    return ragSources.map((item, index) => normalizeDocument({
      id: `rag_${index + 1}`,
      title: item.title,
      url: item.url,
      content: item.content,
      date: item.date,
      category: item.category,
      raw_metadata: { relevance: item.relevance },
    }, 'rag', index));
  } catch (error) {
    console.warn('RAG fallback failed:', error?.message || error);
    return [];
  }
}

async function scrapeViaFirecrawl(competitor) {
  // Crawl-based discovery: directly crawl the competitor's website for all pages
  const siteUrl = inferCompetitorWebsite(competitor);
  const crawlResults = await firecrawlCrawl(siteUrl, 50, competitor).catch(() => []);

  // If crawl yields results, use them; otherwise fall back to search-based discovery
  if (crawlResults.length > 0) {
    return deduplicateNormalizedSources(crawlResults);
  }

  // Fallback: search-based discovery if crawl fails or site inaccessible
  const searchQueries = [
    `${competitor} pricing docs product launch`,
    `${competitor} reviews customer sentiment`,
    `${competitor} company news announcement`,
  ];
  const searchBatches = await Promise.all(
    searchQueries.map((query) => firecrawlSearch(query, 6, competitor).catch(() => []))
  );
  const searchResults = deduplicateNormalizedSources(searchBatches.flat());

  const scrapeTargets = Array.from(
    new Set(
      searchResults
        .map((item) => item.url)
        .filter(Boolean)
        .slice(0, 8)
    )
  );

  const scraped = await Promise.all(
    scrapeTargets.map((url) => firecrawlScrape(url, competitor).catch(() => null))
  );

  return deduplicateNormalizedSources([
    ...searchResults,
    ...scraped.filter(Boolean),
  ]);
}

// Unified scraper: Firecrawl first, then public seed fallback.
export async function scrapeCompetitor(competitor) {
  const liveResults = firecrawl ? await scrapeViaFirecrawl(competitor).catch(() => []) : [];
  const ragResults = liveResults.length ? [] : await fetchRagFallback(competitor, `${competitor} latest news pricing docs reviews`).catch(() => []);

  const allResults = deduplicateNormalizedSources([
    ...liveResults,
    ...ragResults,
  ]);

  return allResults
    .sort((a, b) => b.credibility_score - a.credibility_score)
    .slice(0, 10)
    .map((item, index) => ({
      ...item,
      id: `src_${index + 1}`,
    }));
}

// Batch scrape multiple competitors.
export async function scrapeMultiple(competitors) {
  const results = {};
  for (const competitor of competitors) {
    results[competitor] = await scrapeCompetitor(competitor);
  }
  return results;
}

export { scoreScrapedSource };
