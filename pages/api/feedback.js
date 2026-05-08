import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'feedback.json');
let writeQueue = Promise.resolve();

async function ensureDataFile() {
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.promises.access(FILE_PATH, fs.constants.F_OK);
    } catch (e) {
      await fs.promises.writeFile(FILE_PATH, '[]', 'utf8');
    }
  } catch (e) {
    console.error('Failed to ensure data file', e);
    throw e;
  }
}

async function readAll() {
  await ensureDataFile();
  const raw = await fs.promises.readFile(FILE_PATH, 'utf8');
  try {
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

async function writeAll(list) {
  await ensureDataFile();
  const tempPath = `${FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(list || [], null, 2), 'utf8');
  await fs.promises.rename(tempPath, FILE_PATH);
}

async function appendFeedback(item) {
  writeQueue = writeQueue.catch(() => []).then(async () => {
    const all = await readAll();
    all.unshift(item);
    if (all.length > 1000) all.length = 1000;
    await writeAll(all);
    return all;
  });
  return writeQueue;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const all = await readAll();
      // return newest first
      all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.status(200).json(all);
    } catch (e) {
      console.error(e);
      return res.status(500).send('Failed to load feedback');
    }
  }

  if (req.method === 'POST') {
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== 'object') return res.status(400).send('Invalid payload');
      const allowed = {
        id: incoming.id || `fb_${Date.now()}`,
        competitor: incoming.competitor || incoming.competitor || 'unknown',
        outcome: incoming.outcome || 'helpful',
        scope: incoming.scope || 'battlecard',
        target: incoming.target || 'overall',
        note: incoming.note || '',
        createdAt: incoming.createdAt || new Date().toISOString(),
      };
      const all = await appendFeedback(allowed);
      return res.status(200).json(all);
    } catch (e) {
      console.error(e);
      return res.status(500).send('Failed to persist feedback');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).end('Method Not Allowed');
}
