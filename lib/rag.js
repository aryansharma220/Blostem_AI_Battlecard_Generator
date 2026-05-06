// Lightweight local retrieval fallback.
// Live competitive intelligence should come from lib/retrieval.js providers first.

import { embed } from './llm.js';

class VectorStore {
  constructor() {
    this.docs = []; // { id, text, embedding, metadata }
    this.embeddingCache = {}; // text -> transparent lexical vector
  }

  // Generate a simple embedding from text (for demo)
  async getEmbedding(text) {
    if (this.embeddingCache[text]) return this.embeddingCache[text];
    
    try {
      const embedding = await embed(text);
      if (embedding && embedding.length > 0) {
        this.embeddingCache[text] = embedding;
        return embedding;
      }
    } catch (e) {
      // Fall through to empty vector.
    }

    const vec = Array.from({ length: 384 }, () => 0);
    this.embeddingCache[text] = vec;
    return vec;
  }

  // Add document to store
  async addDocument(id, text, metadata = {}) {
    const embedding = await this.getEmbedding(text);
    this.docs.push({ id, text, embedding, metadata });
  }

  // Batch add documents
  async addDocuments(docs) {
    for (const { id, text, metadata } of docs) {
      await this.addDocument(id, text, metadata);
    }
  }

  // Cosine similarity between two vectors
  cosineSimilarity(a, b) {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;
    const dotProduct = a.reduce((sum, av, i) => sum + av * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, av) => sum + av * av, 0));
    const magB = Math.sqrt(b.reduce((sum, bv) => sum + bv * bv, 0));
    return magA > 0 && magB > 0 ? dotProduct / (magA * magB) : 0;
  }

  // Search for k most similar documents
  async search(query, k = 5) {
    const queryEmbedding = await this.getEmbedding(query);
    const scored = this.docs.map(doc => ({
      ...doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding)
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }

  // Clear store
  clear() {
    this.docs = [];
    this.embeddingCache = {};
  }
}

// Global store instance
let globalStore = null;

export function initVectorStore() {
  if (!globalStore) globalStore = new VectorStore();
  return globalStore;
}

export function getVectorStore() {
  if (!globalStore) globalStore = new VectorStore();
  return globalStore;
}

// Curated public seed sources used only when live providers return too little.
const PUBLIC_SEED_SOURCE_DATA = {
  razorpay: [
    { id: 'rp-1', text: 'Razorpay publishes payment gateway pricing and fee details for merchants.', metadata: { source: 'Razorpay Pricing', url: 'https://razorpay.com/pricing/', category: 'pricing' } },
    { id: 'rp-2', text: 'Razorpay documentation highlights payment gateway APIs, integrations, settlements, refunds, and payouts.', metadata: { source: 'Razorpay Docs', url: 'https://razorpay.com/docs/', category: 'docs' } },
    { id: 'rp-3', text: 'Razorpay blog and press pages publish product updates and company announcements.', metadata: { source: 'Razorpay Blog', url: 'https://razorpay.com/blog/', category: 'blog' } },
  ],
  paytm: [
    { id: 'pt-1', text: 'Paytm for Business publishes merchant payment products and pricing information.', metadata: { source: 'Paytm for Business', url: 'https://business.paytm.com/', category: 'company' } },
    { id: 'pt-2', text: 'Paytm blog and investor communications publish launches, operating updates, and company announcements.', metadata: { source: 'Paytm Blog', url: 'https://paytm.com/blog/', category: 'blog' } },
    { id: 'pt-3', text: 'Public Paytm merchant reviews can indicate sentiment around reach, support, reliability, and operations.', metadata: { source: 'Public reviews', url: 'https://www.g2.com/search?query=Paytm', category: 'reviews' } },
  ],
  phonepe: [
    { id: 'pp-1', text: 'PhonePe Business Solutions describes merchant payments, gateway capabilities, and business products.', metadata: { source: 'PhonePe Business', url: 'https://www.phonepe.com/business-solutions/', category: 'company' } },
    { id: 'pp-2', text: 'PhonePe blog publishes company and product updates relevant to merchant positioning.', metadata: { source: 'PhonePe Blog', url: 'https://www.phonepe.com/blog/', category: 'blog' } },
    { id: 'pp-3', text: 'PhonePe payment gateway pages describe checkout, payment acceptance, and merchant workflows.', metadata: { source: 'PhonePe Gateway', url: 'https://www.phonepe.com/business-solutions/payment-gateway/', category: 'docs' } },
  ]
};

export async function loadCompetitorSources(competitor) {
  const store = getVectorStore();
  store.clear();

  const normalized = (competitor || '').toLowerCase();
  const sources = PUBLIC_SEED_SOURCE_DATA[normalized] || [];

  await store.addDocuments(sources);
  return store;
}

export async function retrieveRelevantSources(competitor, query, k = 5) {
  const store = await loadCompetitorSources(competitor);
  const results = await store.search(query, k);
  return results.map(r => ({
    title: r.metadata.source || 'Unknown Source',
    url: r.metadata.url || "",
    content: r.text,
    date: r.metadata.date || 'N/A',
    relevance: (r.score * 100).toFixed(1),
    category: r.metadata.category || 'general'
  }));
}
