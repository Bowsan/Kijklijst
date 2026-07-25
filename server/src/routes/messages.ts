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

// ---------- Berichten (1-op-1) ----------
// Bewust niet in de gedeelde snapshot: berichten zijn privé tussen twee mensen.
router.get('/api/messages', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const messages = db
    .prepare('SELECT * FROM messages WHERE from_user = ? OR to_user = ? ORDER BY created_at ASC LIMIT 1000')
    .all(uid, uid);
  res.json({ messages });
});

router.post('/api/message', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const { to_user, text } = req.body || {};
  const clean = typeof text === 'string' ? text.trim().slice(0, 1000) : '';
  if (!to_user || !clean) return res.status(400).json({ error: 'to_user en tekst vereist' });
  if (to_user === uid) return res.status(400).json({ error: 'geen berichten aan jezelf' });
  if (!db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(to_user)) {
    return res.status(404).json({ error: 'ontvanger niet gevonden' });
  }
  const id = randomUUID();
  db.prepare('INSERT INTO messages (id, from_user, to_user, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, uid, to_user, clean, Date.now());
  broadcast('state', 1);
  sendPushTo([to_user], { title: 'Op de Bank', body: `💬 ${nameOf(uid)}: ${clean.slice(0, 120)}` });
  res.json({ ok: true, id });
});

// Alles van één afzender als gelezen markeren (bij het openen van het gesprek).
router.post('/api/messages/read', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const { with_user } = req.body || {};
  if (!with_user) return res.status(400).json({ error: 'with_user vereist' });
  db.prepare('UPDATE messages SET read_at = ? WHERE to_user = ? AND from_user = ? AND read_at IS NULL')
    .run(Date.now(), uid, with_user);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Aanrader wegklikken (privé bij de ontvanger).

export default router;
