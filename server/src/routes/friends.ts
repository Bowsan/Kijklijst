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

// ---------- Vrienden volgen ----------
router.post('/api/follow', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { followee } = req.body || {};
  if (!followee || typeof followee !== 'string' || followee === uid) {
    return res.status(400).json({ error: 'ongeldige vriend' });
  }
  // Alleen bestaande profielen kunnen gevolgd worden.
  const exists = db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(followee);
  if (!exists) return res.status(404).json({ error: 'profiel niet gevonden' });

  db.prepare('INSERT OR IGNORE INTO follows (follower, followee, created_at) VALUES (?, ?, ?)')
    .run(uid, followee, Date.now());
  broadcast('state', 1);
  res.json({ ok: true });
});

router.delete('/api/follow/:followee', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('DELETE FROM follows WHERE follower = ? AND followee = ?').run(uid, req.params.followee);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Een profiel verbergen of weer tonen in de volglijst (niet-destructief).
router.post('/api/profile/:id/hidden', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const exists = db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'profiel niet gevonden' });
  const hidden = req.body?.hidden ? 1 : 0;
  db.prepare('UPDATE profiles SET hidden = ? WHERE id = ?').run(hidden, req.params.id);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Reactie van de ontvanger op een tip: "thanks" of "meh" (of null = wissen).

export default router;
