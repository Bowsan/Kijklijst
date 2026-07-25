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

// ---------- Web push ----------
router.get('/api/push/pubkey', (_req, res) => {
  const key = pushPublicKey();
  if (!key) return res.status(503).json({ error: 'push niet beschikbaar' });
  res.json({ key });
});

router.post('/api/push/subscribe', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  try {
    saveSubscription(uid, req.body?.subscription);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/push/unsubscribe', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const endpoint = req.body?.endpoint;
  if (typeof endpoint === 'string') removeSubscription(endpoint);
  res.json({ ok: true });
});

export default router;
