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

// ---------- Beoordeling (per cijfer opgeslagen) ----------
router.post('/api/rating', async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { tmdb_id, score, status, note, service, seasons, clearScore, watchNote } = req.body || {};
  if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id vereist' });

  try {
    const isNew = !db.prepare('SELECT 1 FROM ratings WHERE title_id = ? AND user_id = ?').get(tmdb_id, uid);
    await ensureTitle(Number(tmdb_id), uid);

    const prev: any = db.prepare('SELECT * FROM ratings WHERE title_id = ? AND user_id = ?').get(tmdb_id, uid);

    db.prepare(
      `INSERT INTO ratings (title_id, user_id, score, status, note, service, seasons, watch_note, created_at, updated_at)
       VALUES (@title_id, @user_id, @score, @status, @note, @service, COALESCE(@seasons, '[]'), @watch_note, @updated_at, @updated_at)
       ON CONFLICT(title_id, user_id) DO UPDATE SET
         score=CASE WHEN @clear_score = 1 THEN NULL ELSE COALESCE(@score, score) END,
         status=COALESCE(@status, status),
         note=COALESCE(@note, note),
         service=COALESCE(@service, service),
         seasons=COALESCE(@seasons, seasons),
         watch_note=COALESCE(@watch_note, watch_note),
         updated_at=@updated_at`
    ).run({
      title_id: Number(tmdb_id),
      user_id: uid,
      score: typeof score === 'number' ? score : null,
      status: status ?? null,
      note: note ?? null,
      service: service ?? null,
      seasons: seasons !== undefined ? JSON.stringify(seasons) : null,
      // Leeg = wissen ('' is niet NULL, dus COALESCE overschrijft); undefined = ongemoeid laten.
      watch_note: watchNote !== undefined ? String(watchNote) : null,
      clear_score: clearScore ? 1 : 0,
      updated_at: Date.now(),
    });

    // Activiteit loggen bij betekenisvolle wijzigingen.
    if (typeof score === 'number' && (!prev || prev.score !== score)) {
      logActivity('rating', uid, Number(tmdb_id), { score });
    } else if (isNew) {
      logActivity('added', uid, Number(tmdb_id), { status: status ?? null });
    }

    broadcast('state', 1);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

router.delete('/api/rating/:tmdb_id', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('DELETE FROM ratings WHERE title_id = ? AND user_id = ?').run(Number(req.params.tmdb_id), uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

export default router;
