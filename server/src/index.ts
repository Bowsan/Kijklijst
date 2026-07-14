import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { db, getSnapshot, parseJson } from './db.js';
import { searchTv, getTvDetails, getImdbId, getNewTv, findTvIdByImdb } from './tmdb.js';
import { tvmazeByImdb, type EnrichData } from './tvmaze.js';
import { addClient, broadcast } from './events.js';
import { scheduleBackups } from './backup.js';
import { uploadsDir, storeDataUri, migrateDataUrisToFiles } from './uploads.js';
import { initPush, pushPublicKey, saveSubscription, removeSubscription, sendPushTo } from './push.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

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

function logActivity(type: string, user_id: string, title_id: number | null, meta: object = {}): void {
  db.prepare(
    'INSERT INTO activity (id, type, user_id, title_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), type, user_id, title_id, JSON.stringify(meta), Date.now());
}

// Hulpjes voor pushmeldingen: naam opzoeken + wie een serie op de lijst heeft.
function nameOf(uid: string): string {
  const p: any = db.prepare('SELECT name FROM profiles WHERE id = ?').get(uid);
  return p?.name || 'Iemand';
}
function titleNameOf(tmdbId: number): string {
  const t: any = db.prepare('SELECT name FROM titles WHERE tmdb_id = ?').get(tmdbId);
  return t?.name || 'een serie';
}
function listersOf(tmdbId: number): string[] {
  return (db.prepare('SELECT user_id FROM ratings WHERE title_id = ?').all(tmdbId) as any[]).map((r) => r.user_id);
}

// ---------- Health ----------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, tmdb: !!process.env.TMDB_API_KEY });
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
    res.json(await getNewTv());
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/tmdb/tv/:id', async (req, res) => {
  try {
    res.json(await getTvDetails(Number(req.params.id)));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// Zorg dat een titel in de database staat (haalt details bij TMDb indien nodig).
async function ensureTitle(tmdbId: number, addedBy: string | null): Promise<any> {
  const existing = db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(tmdbId);
  if (existing) return existing;

  const d = await getTvDetails(tmdbId);
  db.prepare(
    `INSERT INTO titles
      (tmdb_id, name, year, poster_path, genres, seasons, episode_count, runtime, providers, overview, cast, cast_meta, creators, imdb_id, tmdb_status, refreshed_at, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    d.tmdb_id, d.name, d.year, d.poster_path,
    JSON.stringify(d.genres), JSON.stringify(d.seasons), d.episode_count, d.runtime,
    JSON.stringify(d.providers), d.overview, JSON.stringify(d.cast), JSON.stringify(d.cast_meta), JSON.stringify(d.creators), d.imdb_id, d.status, Date.now(), addedBy, Date.now()
  );
  storeServiceLogos(d.provider_logos);
  return db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(tmdbId);
}

// Dienstlogo's (TMDb-paden) bijhouden zodra we ze tegenkomen bij details/refresh.
function storeServiceLogos(logos: { name: string; logo: string }[]): void {
  if (!logos?.length) return;
  const up = db.prepare('INSERT INTO service_logos (name, logo_path, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET logo_path = excluded.logo_path, updated_at = excluded.updated_at');
  for (const l of logos) up.run(l.name, l.logo, Date.now());
}

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
      `INSERT INTO ratings (title_id, user_id, score, status, note, service, seasons, updated_at)
       VALUES (@title_id, @user_id, @score, @status, @note, @service, COALESCE(@seasons, '[]'), @updated_at)
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

// ---------- Statische frontend serveren ----------
const webDist = join(__dirname, '..', 'public');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

// Eenmalig de IMDb-id's bijwerken voor bestaande TMDb-titels die er nog geen hebben.
// Draait op de achtergrond, met een rustige pauze tussen de TMDb-aanroepen.
async function backfillImdbIds(): Promise<void> {
  if (!process.env.TMDB_API_KEY) return;
  const rows = db
    .prepare('SELECT tmdb_id FROM titles WHERE imdb_id IS NULL AND tmdb_id > 0')
    .all() as { tmdb_id: number }[];
  if (!rows.length) return;

  console.log(`IMDb-backfill gestart voor ${rows.length} titel(s)…`);
  const upd = db.prepare('UPDATE titles SET imdb_id = ? WHERE tmdb_id = ?');
  let filled = 0;
  for (const r of rows) {
    try {
      const imdb = await getImdbId(r.tmdb_id);
      if (imdb) {
        upd.run(imdb, r.tmdb_id);
        filled++;
        // Tussentijds de clients bijwerken zodat links geleidelijk verschijnen.
        if (filled % 25 === 0) broadcast('state', 1);
      }
    } catch {
      /* titel overslaan bij een fout */
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  if (filled) broadcast('state', 1);
  console.log(`IMDb-backfill klaar: ${filled} van ${rows.length} bijgewerkt.`);
}

const ONGOING = new Set(['Returning Series', 'In Production', 'Planned', 'Pilot']);

// Eén serie verversen bij TMDb. Werkt de info bij en detecteert een nieuw seizoen.
async function refreshTitle(tmdbId: number): Promise<boolean> {
  const existing: any = db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(tmdbId);
  if (!existing) return false;

  const d = await getTvDetails(tmdbId);
  const oldSeasons = parseJson<any[]>(existing.seasons, []);
  const gainedSeason = d.seasons.length > oldSeasons.length;
  const now = Date.now();

  db.prepare(
    `UPDATE titles SET
       name=?, year=?, poster_path=?, genres=?, seasons=?, episode_count=?, runtime=?,
       providers=?, overview=?, cast=?, cast_meta=?, creators=?, imdb_id=COALESCE(?, imdb_id), tmdb_status=?,
       refreshed_at=?, new_season_at=?
     WHERE tmdb_id=?`
  ).run(
    d.name, d.year, d.poster_path,
    JSON.stringify(d.genres), JSON.stringify(d.seasons), d.episode_count, d.runtime,
    JSON.stringify(d.providers), d.overview, JSON.stringify(d.cast), JSON.stringify(d.cast_meta), JSON.stringify(d.creators), d.imdb_id, d.status,
    now, gainedSeason ? now : existing.new_season_at ?? null,
    tmdbId,
  );
  storeServiceLogos(d.provider_logos);

  if (gainedSeason) {
    // Systeem-event (geen gebruiker) — verschijnt in de activiteitenlog.
    logActivity('new_season', '', tmdbId, { from: oldSeasons.length, to: d.seasons.length });
    sendPushTo(listersOf(tmdbId), {
      title: 'Op de Bank',
      body: `🎉 ${d.name} heeft een nieuw seizoen (seizoen ${d.seasons.length})`,
    });
  }
  return gainedSeason;
}

// Ververs een set titels op de achtergrond, rustig getimed.
async function refreshTitles(rows: { tmdb_id: number }[], label: string): Promise<void> {
  if (!process.env.TMDB_API_KEY || !rows.length) return;
  console.log(`${label}: ${rows.length} titel(s) verversen…`);
  let changed = 0;
  for (const r of rows) {
    try {
      if (await refreshTitle(r.tmdb_id)) changed++;
    } catch { /* titel overslaan bij fout */ }
    await new Promise((res) => setTimeout(res, 300));
  }
  broadcast('state', 1);
  console.log(`${label} klaar: ${changed} met een nieuw seizoen.`);
}

// Eenmalig cast-foto's en makers aanvullen voor titels die die info nog missen
// (vult onderweg ook de dienstlogo's).
async function backfillCastMeta(): Promise<void> {
  if (!process.env.TMDB_API_KEY) return;
  const rows = db
    .prepare('SELECT tmdb_id FROM titles WHERE (cast_meta IS NULL OR creators IS NULL) AND tmdb_id > 0')
    .all() as { tmdb_id: number }[];
  if (rows.length) await refreshTitles(rows, 'Cast/makers-backfill');
}

// Automatisch: alleen nog-lopende (of nog onbekende) series, hooguit 1×/dag.
async function refreshOngoingTitles(): Promise<void> {
  if (!process.env.TMDB_API_KEY) return;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const rows = (db.prepare('SELECT tmdb_id, tmdb_status, refreshed_at FROM titles WHERE tmdb_id > 0').all() as any[])
    .filter((t) => {
      if (t.refreshed_at == null) return true; // nog nooit ververst
      if (t.refreshed_at > dayAgo) return false; // recent genoeg
      return t.tmdb_status == null || ONGOING.has(t.tmdb_status); // alleen lopende
    })
    .map((t) => ({ tmdb_id: t.tmdb_id }));
  await refreshTitles(rows, 'Auto-refresh lopende series');
}

// Handmatig (vanuit profiel): alle echte TMDb-titels geforceerd verversen.
app.post('/api/refresh-titles', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  if (!process.env.TMDB_API_KEY) return res.status(503).json({ error: 'TMDb-sleutel ontbreekt' });
  const rows = db.prepare('SELECT tmdb_id FROM titles WHERE tmdb_id > 0').all() as { tmdb_id: number }[];
  refreshTitles(rows, 'Handmatige refresh').catch((e) => console.warn('Refresh mislukt:', e?.message || e));
  res.json({ ok: true, count: rows.length });
});

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
  backfillImdbIds()
    .catch((e) => console.warn('IMDb-backfill mislukt:', e?.message || e))
    .finally(() => backfillCastMeta().catch((e) => console.warn('Cast-backfill mislukt:', e?.message || e)));
  refreshOngoingTitles().catch((e) => console.warn('Auto-refresh mislukt:', e?.message || e));
  // Daarna elke 12 uur opnieuw de lopende series checken.
  setInterval(() => {
    refreshOngoingTitles().catch((e) => console.warn('Auto-refresh mislukt:', e?.message || e));
  }, 12 * 3600 * 1000);
});
