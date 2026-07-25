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

// ---------- Identiteit: bestaand account zoeken op naam ----------
// Zodat dezelfde persoon op een tweede apparaat hetzelfde account overneemt
// in plaats van een dubbel profiel met dezelfde naam te maken.
router.post('/api/identify', (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'naam vereist' });
  }
  const row: any = db
    .prepare('SELECT id FROM profiles WHERE lower(trim(name)) = lower(trim(?)) ORDER BY updated_at ASC LIMIT 1')
    .get(name);
  res.json({ id: row?.id ?? null });
});

// ---------- Profiel ----------
router.post('/api/profile', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { name, avatar, color, services } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'naam vereist' });

  db.prepare(
    `INSERT INTO profiles (id, name, avatar, color, services, updated_at)
     VALUES (@id, @name, @avatar, @color, @services, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       name=@name, avatar=@avatar, color=@color, services=@services, updated_at=@updated_at`
  ).run({
    id: uid,
    name: name.trim().slice(0, 40),
    // Base64-afbeelding meteen als bestand opslaan, niet in de database.
    avatar: storeDataUri(avatar || null, 'avatar'),
    color: color || null,
    services: JSON.stringify(Array.isArray(services) ? services : []),
    updated_at: Date.now(),
  });

  broadcast('profile', 1);
  res.json({ ok: true });
});

export default router;
