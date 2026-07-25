import express from 'express';
import { randomUUID } from 'node:crypto';
import { db, getSnapshot, parseJson } from '../db.js';
import { searchTv, getTvDetails, getImdbId, getNewTv, findTvIdByImdb, discoverByPeople, getRecommendations } from '../tmdb.js';
import { tvmazeByImdb, type EnrichData } from '../tvmaze.js';
import { addClient, broadcast } from '../events.js';
import { storeDataUri } from '../uploads.js';
import { pushPublicKey, saveSubscription, removeSubscription, sendPushTo } from '../push.js';
import { logActivity, nameOf, titleNameOf, listersOf } from '../helpers.js';
import { ensureTitle, refreshTitle, refreshTitles, attachImdbRatings } from '../titles.js';
import { userId } from '../http.js';

const router = express.Router();

// ---------- Health ----------
router.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    tmdb: !!process.env.TMDB_API_KEY,
    omdb: !!process.env.OMDB_API_KEY,
    // Hoeveel titels hebben al een IMDb-cijfer? Handig om de OMDb-job te volgen.
    imdb_ratings: (db.prepare('SELECT COUNT(*) c FROM titles WHERE imdb_rating IS NOT NULL').get() as any).c,
  });
});

// ---------- Realtime (SSE) ----------
router.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: hello\ndata: {}\n\n`);
  addClient(res);
});

// ---------- Volledige snapshot ----------
router.get('/api/state', (_req, res) => {
  res.json(getSnapshot());
});

export default router;
