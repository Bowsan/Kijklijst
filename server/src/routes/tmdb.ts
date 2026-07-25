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

// ---------- TMDb proxy ----------
router.get('/api/tmdb/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    res.json(await searchTv(q));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// De nieuwste series (ontdek-sectie in "Voor jou").
router.get('/api/tmdb/new', async (_req, res) => {
  try {
    res.json(await attachImdbRatings(await getNewTv()));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// Series (TMDb-breed) met favoriete acteurs/makers — voor "Van jouw favorieten".
router.get('/api/tmdb/people', async (req, res) => {
  if (!process.env.TMDB_API_KEY) return res.json([]);
  const parse = (v: unknown) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  try {
    res.json(await attachImdbRatings(await discoverByPeople(parse(req.query.actors), parse(req.query.creators))));
  } catch {
    res.json([]); // tips zijn nice-to-have: liever leeg dan een fout
  }
});

// "Als je dit leuk vindt…" — TMDb-aanbevelingen per serie, 7 dagen gecachet.
router.get('/api/similar', async (req, res) => {
  const id = Number(req.query.tmdb_id);
  if (!Number.isFinite(id) || id <= 0) return res.json({ results: [] });
  const cached = db.prepare('SELECT data, updated_at FROM similar_cache WHERE tmdb_id = ?').get(id) as any;
  if (cached && Date.now() - cached.updated_at < 7 * 24 * 3600 * 1000) {
    // IMDb-cijfers erbij (uit de eigen cache, geen extra TMDb-call nodig).
    return res.json({ results: await attachImdbRatings(JSON.parse(cached.data)) });
  }
  if (!process.env.TMDB_API_KEY) return res.json({ results: [] });
  try {
    const results = await attachImdbRatings(await getRecommendations(id));
    db.prepare('INSERT INTO similar_cache (tmdb_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(tmdb_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .run(id, JSON.stringify(results), Date.now());
    res.json({ results });
  } catch {
    // TMDb-hapering: liever een verouderde cache (of leeg) dan een fout.
    res.json({ results: cached ? await attachImdbRatings(JSON.parse(cached.data)) : [] });
  }
});

router.get('/api/tmdb/tv/:id', async (req, res) => {
  try {
    res.json(await getTvDetails(Number(req.params.id)));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
