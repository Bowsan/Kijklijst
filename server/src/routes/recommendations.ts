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

// ---------- Persoonlijke aanrader ----------
router.post('/api/recommendation', async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { to_user, tmdb_id, note } = req.body || {};
  if (!to_user || !tmdb_id) return res.status(400).json({ error: 'to_user en tmdb_id vereist' });

  try {
    await ensureTitle(Number(tmdb_id), uid);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO recommendations (id, from_user, to_user, title_id, note, dismissed, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).run(id, uid, to_user, Number(tmdb_id), note || null, Date.now());

    logActivity('recommend', uid, Number(tmdb_id), { to_user });
    broadcast('state', 1);
    sendPushTo([to_user], {
      title: 'Op de Bank',
      body: `💌 ${nameOf(uid)} raadt je ${titleNameOf(Number(tmdb_id))} aan`,
    });
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// Rating verwijderen (alleen voor de eigen gebruiker).

router.post('/api/recommendation/:id/respond', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const { response } = req.body || {};
  if (response !== null && response !== 'thanks' && response !== 'meh') {
    return res.status(400).json({ error: 'onbekende reactie' });
  }
  const rec: any = db.prepare('SELECT * FROM recommendations WHERE id = ? AND to_user = ?').get(req.params.id, uid);
  if (!rec) return res.status(404).json({ error: 'tip niet gevonden' });
  db.prepare('UPDATE recommendations SET response = ? WHERE id = ?').run(response, rec.id);
  broadcast('state', 1);
  if (response) {
    const text = response === 'thanks' ? 'Thanks, ziet er leuk uit!' : 'Mwah, niet echt iets voor mij.';
    sendPushTo([rec.from_user], {
      title: 'Op de Bank',
      body: `💬 ${nameOf(uid)} over je tip ${titleNameOf(rec.title_id)}: ${text}`,
    });
  }
  res.json({ ok: true });
});

router.post('/api/recommendation/:id/dismiss', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('UPDATE recommendations SET dismissed = 1 WHERE id = ? AND to_user = ?').run(req.params.id, uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Je eigen tip terugtrekken (alleen de afzender).
router.delete('/api/recommendation/:id', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('DELETE FROM recommendations WHERE id = ? AND from_user = ?').run(req.params.id, uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Opmerking bij je eigen tip toevoegen of aanpassen (alleen de afzender).
router.post('/api/recommendation/:id/note', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
  db.prepare('UPDATE recommendations SET note = ? WHERE id = ? AND from_user = ?')
    .run(note || null, req.params.id, uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

export default router;
