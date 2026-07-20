import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { db, getSnapshot, parseJson } from './db.js';
import { searchTv, getTvDetails, getImdbId, getNewTv, findTvIdByImdb, discoverByPeople, getRecommendations } from './tmdb.js';
import { tvmazeByImdb, type EnrichData } from './tvmaze.js';
import { addClient, broadcast } from './events.js';
import { scheduleBackups } from './backup.js';
import { uploadsDir, storeDataUri, migrateDataUrisToFiles } from './uploads.js';
import { initPush, pushPublicKey, saveSubscription, removeSubscription, sendPushTo } from './push.js';
import { logActivity, nameOf, titleNameOf, listersOf } from './helpers.js';
import { ensureTitle, refreshTitle, refreshTitles, backfillImdbIds, backfillCastMeta, backfillFirstAirDates, refreshOngoingTitles, refreshImdbRatings, attachImdbRatings } from './titles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

// Vangnet: een vergeten .catch() of een fout in een timer mag de server niet
// stilletjes slopen — loggen en doordraaien (de data staat veilig in SQLite).
process.on('unhandledRejection', (reason) => {
  console.error('Onafgehandelde promise-fout:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Onverwachte fout:', err);
});

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' })); // ruimte voor kleine avatar-afbeeldingen

// Geüploade avatars en covers (bestanden op het data-volume).
app.use('/uploads', express.static(uploadsDir(), { maxAge: '30d', immutable: true }));

// Eenvoudige identiteit: de client stuurt zijn lokale code mee.
function userId(req: express.Request): string | null {
  const id = req.header('x-user-id');
  return id && id.length > 0 ? id : null;
}

// ---------- Health ----------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    tmdb: !!process.env.TMDB_API_KEY,
    omdb: !!process.env.OMDB_API_KEY,
    // Hoeveel titels hebben al een IMDb-cijfer? Handig om de OMDb-job te volgen.
    imdb_ratings: (db.prepare('SELECT COUNT(*) c FROM titles WHERE imdb_rating IS NOT NULL').get() as any).c,
  });
});

// ---------- Realtime (SSE) ----------
app.get('/api/stream', (req, res) => {
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
app.get('/api/state', (_req, res) => {
  res.json(getSnapshot());
});

// ---------- TMDb proxy ----------
app.get('/api/tmdb/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    res.json(await searchTv(q));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// De nieuwste series (ontdek-sectie in "Voor jou").
app.get('/api/tmdb/new', async (_req, res) => {
  try {
    res.json(await attachImdbRatings(await getNewTv()));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// Series (TMDb-breed) met favoriete acteurs/makers — voor "Van jouw favorieten".
app.get('/api/tmdb/people', async (req, res) => {
  if (!process.env.TMDB_API_KEY) return res.json([]);
  const parse = (v: unknown) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  try {
    res.json(await attachImdbRatings(await discoverByPeople(parse(req.query.actors), parse(req.query.creators))));
  } catch {
    res.json([]); // tips zijn nice-to-have: liever leeg dan een fout
  }
});

// "Als je dit leuk vindt…" — TMDb-aanbevelingen per serie, 7 dagen gecachet.
app.get('/api/similar', async (req, res) => {
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

app.get('/api/tmdb/tv/:id', async (req, res) => {
  try {
    res.json(await getTvDetails(Number(req.params.id)));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ---------- Serie handmatig toevoegen (niet in TMDb te vinden) ----------
app.post('/api/title/manual', (req, res) => {
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
app.post('/api/title/:id/enrich', async (req, res) => {
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
app.post('/api/title/:id/meta', (req, res) => {
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

// ---------- Identiteit: bestaand account zoeken op naam ----------
// Zodat dezelfde persoon op een tweede apparaat hetzelfde account overneemt
// in plaats van een dubbel profiel met dezelfde naam te maken.
app.post('/api/identify', (req, res) => {
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
app.post('/api/profile', (req, res) => {
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

// ---------- Beoordeling (per cijfer opgeslagen) ----------
app.post('/api/rating', async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { tmdb_id, score, status, note, service, seasons, clearScore } = req.body || {};
  if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id vereist' });

  try {
    const isNew = !db.prepare('SELECT 1 FROM ratings WHERE title_id = ? AND user_id = ?').get(tmdb_id, uid);
    await ensureTitle(Number(tmdb_id), uid);

    const prev: any = db.prepare('SELECT * FROM ratings WHERE title_id = ? AND user_id = ?').get(tmdb_id, uid);

    db.prepare(
      `INSERT INTO ratings (title_id, user_id, score, status, note, service, seasons, created_at, updated_at)
       VALUES (@title_id, @user_id, @score, @status, @note, @service, COALESCE(@seasons, '[]'), @updated_at, @updated_at)
       ON CONFLICT(title_id, user_id) DO UPDATE SET
         score=CASE WHEN @clear_score = 1 THEN NULL ELSE COALESCE(@score, score) END,
         status=COALESCE(@status, status),
         note=COALESCE(@note, note),
         service=COALESCE(@service, service),
         seasons=COALESCE(@seasons, seasons),
         updated_at=@updated_at`
    ).run({
      title_id: Number(tmdb_id),
      user_id: uid,
      score: typeof score === 'number' ? score : null,
      status: status ?? null,
      note: note ?? null,
      service: service ?? null,
      seasons: seasons !== undefined ? JSON.stringify(seasons) : null,
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

// ---------- Persoonlijke aanrader ----------
app.post('/api/recommendation', async (req, res) => {
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
app.delete('/api/rating/:tmdb_id', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('DELETE FROM ratings WHERE title_id = ? AND user_id = ?').run(Number(req.params.tmdb_id), uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

// ---------- Prikbord per serie ----------
app.post('/api/comment', (req, res) => {
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

app.delete('/api/comment/:id', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  // Alleen je eigen bericht mag je weghalen.
  db.prepare('DELETE FROM comments WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  db.prepare('DELETE FROM comment_reactions WHERE comment_id = ?').run(req.params.id);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Emoji-reactie op een prikbordbericht (aan/uit per gebruiker).
app.post('/api/comment/:id/reaction', (req, res) => {
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

// ---------- Web push ----------
app.get('/api/push/pubkey', (_req, res) => {
  const key = pushPublicKey();
  if (!key) return res.status(503).json({ error: 'push niet beschikbaar' });
  res.json({ key });
});

app.post('/api/push/subscribe', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  try {
    saveSubscription(uid, req.body?.subscription);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/push/unsubscribe', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const endpoint = req.body?.endpoint;
  if (typeof endpoint === 'string') removeSubscription(endpoint);
  res.json({ ok: true });
});

// ---------- Vrienden volgen ----------
app.post('/api/follow', (req, res) => {
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

app.delete('/api/follow/:followee', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('DELETE FROM follows WHERE follower = ? AND followee = ?').run(uid, req.params.followee);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Een profiel verbergen of weer tonen in de volglijst (niet-destructief).
app.post('/api/profile/:id/hidden', (req, res) => {
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
app.post('/api/recommendation/:id/respond', (req, res) => {
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

// ---------- Berichten (1-op-1) ----------
// Bewust niet in de gedeelde snapshot: berichten zijn privé tussen twee mensen.
app.get('/api/messages', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const messages = db
    .prepare('SELECT * FROM messages WHERE from_user = ? OR to_user = ? ORDER BY created_at ASC LIMIT 1000')
    .all(uid, uid);
  res.json({ messages });
});

app.post('/api/message', (req, res) => {
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
app.post('/api/messages/read', (req, res) => {
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
app.post('/api/recommendation/:id/dismiss', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('UPDATE recommendations SET dismissed = 1 WHERE id = ? AND to_user = ?').run(req.params.id, uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Je eigen tip terugtrekken (alleen de afzender).
app.delete('/api/recommendation/:id', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('DELETE FROM recommendations WHERE id = ? AND from_user = ?').run(req.params.id, uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

// Opmerking bij je eigen tip toevoegen of aanpassen (alleen de afzender).
app.post('/api/recommendation/:id/note', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
  db.prepare('UPDATE recommendations SET note = ? WHERE id = ? AND from_user = ?')
    .run(note || null, req.params.id, uid);
  broadcast('state', 1);
  res.json({ ok: true });
});

// ---------- Emoji-reactie ----------
app.post('/api/reaction', (req, res) => {
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
app.post('/api/refresh-titles', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  if (!process.env.TMDB_API_KEY) return res.status(503).json({ error: 'TMDb-sleutel ontbreekt' });
  const rows = db.prepare('SELECT tmdb_id FROM titles WHERE tmdb_id > 0').all() as { tmdb_id: number }[];
  refreshTitles(rows, 'Handmatige refresh').catch((e) => console.warn('Refresh mislukt:', e?.message || e));
  // Ook de IMDb-cijfers meenemen, zodat de knop in Profiel alles ineens ververst.
  refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e));
  res.json({ ok: true, count: rows.length });
});

// ---------- Statische frontend serveren ----------
const webDist = join(__dirname, '..', 'public');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    // Een ontbrekende upload moet 404 geven, niet de app-schil (de service
    // worker zou die HTML anders als "afbeelding" cachen).
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Op de Bank server luistert op poort ${PORT}`);
  if (!process.env.TMDB_API_KEY) {
    console.warn('LET OP: TMDB_API_KEY ontbreekt — zoeken en details werken pas met een sleutel.');
  }
  // Dagelijkse back-up van de database (bewaart de laatste 14 dagen).
  scheduleBackups();
  // Web push initialiseren (VAPID-sleutels op het data-volume).
  initPush();
  // Bestaande base64-afbeeldingen eenmalig naar bestanden verplaatsen.
  try { migrateDataUrisToFiles(); } catch (e: any) { console.warn('Uploads-migratie mislukt:', e?.message || e); }
  // Niet awaiten: op de achtergrond laten lopen (na elkaar, rustig getimed).
  // IMDb-cijfers meteen ophalen voor titels die al een imdb_id hebben…
  refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e));
  backfillImdbIds()
    .catch((e) => console.warn('IMDb-backfill mislukt:', e?.message || e))
    .finally(() => backfillCastMeta().catch((e) => console.warn('Cast-backfill mislukt:', e?.message || e)))
    // Uitgavedatum aanvullen voor titels die die nog missen (sorteren op uitgave).
    .finally(() => backfillFirstAirDates().catch((e) => console.warn('Uitgavedatum-backfill mislukt:', e?.message || e)))
    // …en nogmaals na de id-backfill, voor titels die net een imdb_id kregen.
    .finally(() => refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e)));
  refreshOngoingTitles().catch((e) => console.warn('Auto-refresh mislukt:', e?.message || e));
  // Daarna elke 12 uur opnieuw de lopende series en IMDb-cijfers checken.
  setInterval(() => {
    refreshOngoingTitles().catch((e) => console.warn('Auto-refresh mislukt:', e?.message || e));
    refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e));
  }, 12 * 3600 * 1000);
});
