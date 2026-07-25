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

// ---------- Prikbord per serie ----------
router.post('/api/comment', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { tmdb_id, text } = req.body || {};
  if (!tmdb_id || !text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'tmdb_id en tekst vereist' });
  }
  const id = randomUUID();
  db.prepare('INSERT INTO comments (id, title_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, Number(tmdb_id), uid, text.trim().slice(0, 1000), Date.now());
  broadcast('state', 1);
  // Pushmelding voor iedereen (behalve de schrijver) die deze serie op de lijst heeft.
  sendPushTo(
    listersOf(Number(tmdb_id)).filter((u) => u !== uid),
    { title: 'Op de Bank', body: `💬 Bericht van ${nameOf(uid)} bij ${titleNameOf(Number(tmdb_id))}` },
  );
  res.json({ ok: true, id });
});

router.delete('/api/comment/:id', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  // Alleen je eigen bericht mag je weghalen.
  db.prepare('DELETE FROM comments WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  db.prepare('DELETE FROM comment_reactions WHERE comment_id = ?').run(req.params.id);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Emoji-reactie op een prikbordbericht (aan/uit per gebruiker).
router.post('/api/comment/:id/reaction', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.slice(0, 8) : '';
  if (!emoji) return res.status(400).json({ error: 'emoji vereist' });
  const exists = db.prepare('SELECT 1 FROM comments WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'bericht niet gevonden' });

  const had = db.prepare('SELECT 1 FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?')
    .get(req.params.id, uid, emoji);
  if (had) {
    db.prepare('DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?')
      .run(req.params.id, uid, emoji);
  } else {
    db.prepare('INSERT INTO comment_reactions (comment_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)')
      .run(req.params.id, uid, emoji, Date.now());
  }
  broadcast('state', 1);
  res.json({ ok: true });
});

// ---------- Emoji-reactie ----------
router.post('/api/reaction', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { tmdb_id, emoji } = req.body || {};
  if (!tmdb_id || !emoji) return res.status(400).json({ error: 'tmdb_id en emoji vereist' });

  const exists = db.prepare('SELECT 1 FROM reactions WHERE title_id = ? AND user_id = ? AND emoji = ?').get(tmdb_id, uid, emoji);
  if (exists) {
    db.prepare('DELETE FROM reactions WHERE title_id = ? AND user_id = ? AND emoji = ?').run(tmdb_id, uid, emoji);
  } else {
    db.prepare('INSERT INTO reactions (title_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)').run(tmdb_id, uid, emoji, Date.now());
  }
  broadcast('state', 1);
  res.json({ ok: true });
});

// Handmatig (vanuit profiel): alle echte TMDb-titels geforceerd verversen.

export default router;
