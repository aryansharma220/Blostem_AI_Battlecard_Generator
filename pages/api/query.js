import { generateBattlecard } from '../../lib/generateBattlecard';
import { normalizeAndValidateCompetitorInput } from '../../lib/competitorInput';

const API_DEADLINE_MS = 55000;

function withDeadline(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Pipeline deadline exceeded after ${ms}ms`)), ms);
    }),
  ]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const { competitor, feedbackSummary, refreshToken, retrievalMode } = req.body || {};
  const normalized = normalizeAndValidateCompetitorInput(competitor);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.reason || 'Invalid competitor name' });
    return;
  }
  const canonicalCompetitor = normalized.competitor;

  try {
    const start = Date.now();
    let card;
    try {
      card = await withDeadline(
        generateBattlecard(canonicalCompetitor, { feedbackSummary, refreshToken, retrievalMode }),
        API_DEADLINE_MS
      );
    } catch (error) {
      if (!String(error?.message || error).includes('deadline')) throw error;
      console.warn(`[api/query] Live generation timed out for ${canonicalCompetitor}; returning error instead of demo fallback.`);
      res.status(504).json({
        error: `Live generation timed out after ${API_DEADLINE_MS}ms. Demo fallback is disabled. Please retry or inspect retrieval latency.`,
        competitor: canonicalCompetitor,
        timeout_ms: API_DEADLINE_MS,
      });
      return;
    }
    const elapsed = Date.now() - start;
    res.status(200).json({
      ...card,
      competitor: canonicalCompetitor,
      input_correction: normalized.correctedFrom
        ? { from: normalized.correctedFrom, to: canonicalCompetitor }
        : null,
      pipeline: {
        ...card.pipeline,
        metrics: {
          ...(card.pipeline?.metrics || {}),
          elapsed_ms: elapsed,
          deadline_ms: API_DEADLINE_MS,
          deadline_fallback: false,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}
