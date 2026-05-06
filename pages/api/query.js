import { generateBattlecard } from '../../lib/generateBattlecard';

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
  if (req.method !== 'POST') return res.status(405).end();
  const { competitor, dealStage, feedbackSummary, refreshToken, retrievalMode } = req.body || {};
  if (!competitor) return res.status(400).json({ error: 'Missing competitor name' });

  try {
    const start = Date.now();
    let card;
    let deadlineFallback = false;
    try {
      card = await withDeadline(
        generateBattlecard(competitor, { dealStage, feedbackSummary, refreshToken, retrievalMode }),
        API_DEADLINE_MS
      );
    } catch (error) {
      if (!String(error?.message || error).includes('deadline')) throw error;
      deadlineFallback = true;
      card = await generateBattlecard(competitor, {
        dealStage,
        feedbackSummary,
        refreshToken,
        retrievalMode: 'demo',
      });
    }
    const elapsed = Date.now() - start;
    res.status(200).json({
      ...card,
      competitor,
      pipeline: {
        ...card.pipeline,
        metrics: {
          ...(card.pipeline?.metrics || {}),
          elapsed_ms: elapsed,
          deadline_ms: API_DEADLINE_MS,
          deadline_fallback: deadlineFallback,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}
