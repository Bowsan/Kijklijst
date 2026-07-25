import express from 'express';
import { randomUUID } from 'node:crypto';
import { db, getSnapshot, parseJson } from '../db.js';
import { searchTv, getTvDetails, getImdbId, getNewTv, findTvIdByImdb, discoverByPeople, getRecommendations } from '../tmdb.js';
import { tvmazeByImdb, type EnrichData } from '../tvmaze.js';
import { addClient, broadcast } from '../events.js';
import { storeDataUri } from '../uploads.js';
import { pushPublicKey, saveSubscription, removeSubscription, sendPushTo } from '../push.js';
import { logActivity, nameOf, titleNameOf, listersOf } from '../helpers.js';
import { ensureTitle, refreshTitle, refreshTitles, refreshImdbRatings, attachImdbRatings } from '../titles.js';
import { userId } from '../http.js';

const router = express.Router();

// ---------- Serie handmatig toevoegen (niet in TMDb te vinden) ----------
router.post('/api/title/manual', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { name, service, seasons } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'naam vereist' });
  }
  const cleanName = name.trim().slice(0, 200);

  // Negatief id, zodat een handmatige titel nooit botst met een echte TMDb-id (die positief is).
  let id = -Date.now();
  while (db.prepare('SELECT 1 FROM titles WHERE tmdb_id = ?').get(id)) id--;

  const providers = service && typeof service === 'string' && service.trim() ? [service.trim()] : [];

  // Aantal seizoenen dat de gebruiker opgeeft (1–100), zodat hij seizoenen kan aanvinken.
  const seasonCount = Math.max(0, Math.min(100, Math.floor(Number(seasons) || 0)));
  const seasonsArr = Array.from({ length: seasonCount }, (_, i) => ({
    season_number: i + 1,
    episode_count: 0,
    name: `Seizoen ${i + 1}`,
    air_year: null,
  }));

  db.prepare(
    `INSERT INTO titles
      (tmdb_id, name, year, poster_path, genres, seasons, episode_count, runtime, providers, overview, cast, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, cleanName, null, null,
    '[]', JSON.stringify(seasonsArr), null, null,
    JSON.stringify(providers), null, '[]', uid, Date.now()
  );

  broadcast('state', 1);
  res.json({ ok: true, tmdb_id: id });
});

// Haal een IMDb-id ("tt1234567") uit een link of losse tekst.
function parseImdbId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const m = input.match(/tt\d{6,}/i);
  return m ? m[0].toLowerCase() : null;
}

// Een handmatige titel (negatief id) omzetten naar het echte TMDb-id, inclusief
// alle beoordelingen, berichten, tips en logregels. Bestaat het TMDb-id al in de
// lijst, dan voegen we samen (bestaande beoordelingen op de echte titel winnen).
// Alles in één transactie: bij een fout blijft de oude situatie intact.
function promoteToTmdbId(oldId: number, newId: number, uid: string): number | null {
  if (oldId >= 0 || db.prepare('SELECT 1 FROM titles WHERE tmdb_id = ?').get(oldId) == null) return null;
  const run = db.transaction(() => {
    const targetExists = db.prepare('SELECT 1 FROM titles WHERE tmdb_id = ?').get(newId);
    if (targetExists) {
      // Samenvoegen: verplaats wat kan, bewaar bestaande rijen op de echte titel.
      db.prepare('UPDATE OR IGNORE ratings SET title_id = ? WHERE title_id = ?').run(newId, oldId);
      db.prepare('DELETE FROM ratings WHERE title_id = ?').run(oldId);
      db.prepare('UPDATE OR IGNORE reactions SET title_id = ? WHERE title_id = ?').run(newId, oldId);
      db.prepare('DELETE FROM reactions WHERE title_id = ?').run(oldId);
      db.prepare('DELETE FROM titles WHERE tmdb_id = ?').run(oldId);
    } else {
      // Hernoemen: de titelrij krijgt het echte id; details vult de refresh daarna.
      db.prepare('UPDATE titles SET tmdb_id = ? WHERE tmdb_id = ?').run(newId, oldId);
      db.prepare('UPDATE ratings SET title_id = ? WHERE title_id = ?').run(newId, oldId);
      db.prepare('UPDATE reactions SET title_id = ? WHERE title_id = ?').run(newId, oldId);
    }
    db.prepare('UPDATE recommendations SET title_id = ? WHERE title_id = ?').run(newId, oldId);
    db.prepare('UPDATE comments SET title_id = ? WHERE title_id = ?').run(newId, oldId);
    db.prepare('UPDATE activity SET title_id = ? WHERE title_id = ?').run(newId, oldId);
    logActivity('promoted', uid, newId, { from: oldId });
  });
  try { run(); return newId; }
  catch (e: any) { console.warn('Promotie mislukt:', e?.message || e); return null; }
}

// Serie-info aanvullen bij een (meestal handmatige) titel via een IMDb-id.
// Probeert eerst TMDb (op IMDb-id) en daarna TVmaze — nuttig als TMDb 'm niet kent.
router.post('/api/title/:id/enrich', async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const titleId = Number(req.params.id);
  const existing: any = db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(titleId);
  if (!existing) return res.status(404).json({ error: 'serie niet gevonden' });

  const imdb = parseImdbId(req.body?.imdb);
  if (!imdb) return res.status(400).json({ error: 'geen geldige IMDb-link of -id' });

  let data: EnrichData | null = null;
  let source: string | null = null;

  // 1) TMDb heeft de serie misschien tóch — opzoeken op IMDb-id.
  // Een handmatige titel (negatief id) promoveren we dan naar het échte TMDb-id,
  // zodat hij voortaan meedraait in de automatische seizoen-updates.
  try {
    if (process.env.TMDB_API_KEY) {
      const tmdbId = await findTvIdByImdb(imdb);
      if (tmdbId && titleId < 0) {
        const newId = promoteToTmdbId(titleId, tmdbId, uid);
        if (newId) {
          await refreshTitle(newId).catch(() => {});
          broadcast('state', 1);
          return res.json({ found: true, source: 'TMDb', tmdb_id: newId });
        }
      }
      if (tmdbId) {
        const d = await getTvDetails(tmdbId);
        data = {
          name: d.name, year: d.year, poster_path: d.poster_path, genres: d.genres,
          seasons: d.seasons, episode_count: d.episode_count, overview: d.overview,
        };
        source = 'TMDb';
      }
    }
  } catch { /* val terug op TVmaze */ }

  // 2) Anders TVmaze proberen (geen sleutel nodig).
  if (!data) {
    try {
      data = await tvmazeByImdb(imdb);
      if (data) source = 'TVmaze';
    } catch { /* niets gevonden */ }
  }

  if (!data) return res.json({ found: false });

  db.prepare(
    `UPDATE titles SET
       name = ?, year = ?, poster_path = COALESCE(?, poster_path),
       genres = ?, seasons = ?, episode_count = COALESCE(?, episode_count),
       overview = ?, imdb_id = ?
     WHERE tmdb_id = ?`
  ).run(
    data.name || existing.name,
    data.year ?? existing.year,
    data.poster_path,
    JSON.stringify(data.genres || []),
    JSON.stringify(data.seasons?.length ? data.seasons : parseJson(existing.seasons, [])),
    data.episode_count,
    data.overview || existing.overview,
    imdb,
    titleId,
  );

  broadcast('state', 1);
  res.json({ found: true, source });
});

// Serie-info handmatig invullen (jaar, genres, cover) als geen enkele bron iets vindt.
router.post('/api/title/:id/meta', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const titleId = Number(req.params.id);
  const existing: any = db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(titleId);
  if (!existing) return res.status(404).json({ error: 'serie niet gevonden' });

  const { year, genres, poster, overview } = req.body || {};
  const yearVal = year === '' || year == null ? null : Math.max(1900, Math.min(2100, Math.floor(Number(year)) || 0)) || null;
  const genreArr = Array.isArray(genres)
    ? genres
    : typeof genres === 'string'
      ? genres.split(',').map((g: string) => g.trim()).filter(Boolean)
      : parseJson(existing.genres, []);
  // Alleen een geüploade cover (data-URI, direct als bestand opgeslagen) of URL accepteren.
  const posterVal = typeof poster === 'string' && poster.length < 400000 && (poster.startsWith('data:image/') || poster.startsWith('http'))
    ? storeDataUri(poster, 'poster')
    : existing.poster_path;

  db.prepare('UPDATE titles SET year = ?, genres = ?, poster_path = ?, overview = ? WHERE tmdb_id = ?')
    .run(
      yearVal,
      JSON.stringify(genreArr),
      posterVal,
      typeof overview === 'string' ? overview.slice(0, 2000) : existing.overview,
      titleId,
    );

  broadcast('state', 1);
  res.json({ ok: true });
});

router.post('/api/refresh-titles', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  if (!process.env.TMDB_API_KEY) return res.status(503).json({ error: 'TMDb-sleutel ontbreekt' });
  const rows = db.prepare('SELECT tmdb_id FROM titles WHERE tmdb_id > 0').all() as { tmdb_id: number }[];
  refreshTitles(rows, 'Handmatige refresh').catch((e) => console.warn('Refresh mislukt:', e?.message || e));
  // Ook de IMDb-cijfers meenemen, zodat de knop in Profiel alles ineens ververst.
  refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e));
  res.json({ ok: true, count: rows.length });
});

export default router;
