import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { db, getSnapshot } from './db.js';
import { searchTv, getTvDetails } from './tmdb.js';
import { addClient, broadcast } from './events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' })); // ruimte voor kleine avatar-afbeeldingen

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
      (tmdb_id, name, year, poster_path, genres, seasons, episode_count, runtime, providers, overview, cast, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    d.tmdb_id, d.name, d.year, d.poster_path,
    JSON.stringify(d.genres), JSON.stringify(d.seasons), d.episode_count, d.runtime,
    JSON.stringify(d.providers), d.overview, JSON.stringify(d.cast), addedBy, Date.now()
  );
  return db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(tmdbId);
}

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
    avatar: avatar || null,
    color: color || null,
    services: JSON.stringify(Array.isArray(services) ? services : []),
    updated_at: Date.now(),
  });

  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(uid);
  broadcast('profile', profile);
  res.json({ ok: true });
});

// ---------- Beoordeling (per cijfer opgeslagen) ----------
app.post('/api/rating', async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });

  const { tmdb_id, score, status, note, service, seasons } = req.body || {};
  if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id vereist' });

  try {
    const isNew = !db.prepare('SELECT 1 FROM ratings WHERE title_id = ? AND user_id = ?').get(tmdb_id, uid);
    await ensureTitle(Number(tmdb_id), uid);

    const prev: any = db.prepare('SELECT * FROM ratings WHERE title_id = ? AND user_id = ?').get(tmdb_id, uid);

    db.prepare(
      `INSERT INTO ratings (title_id, user_id, score, status, note, service, seasons, updated_at)
       VALUES (@title_id, @user_id, @score, @status, @note, @service, COALESCE(@seasons, '[]'), @updated_at)
       ON CONFLICT(title_id, user_id) DO UPDATE SET
         score=COALESCE(@score, score),
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
      updated_at: Date.now(),
    });

    // Activiteit loggen bij betekenisvolle wijzigingen.
    if (typeof score === 'number' && (!prev || prev.score !== score)) {
      logActivity('rating', uid, Number(tmdb_id), { score });
    } else if (isNew) {
      logActivity('added', uid, Number(tmdb_id), { status: status ?? null });
    }

    const snapshot = getSnapshot();
    broadcast('state', snapshot);
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
    broadcast('state', getSnapshot());
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
  broadcast('state', getSnapshot());
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
  broadcast('state', getSnapshot());
  res.json({ ok: true });
});

app.delete('/api/follow/:followee', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('DELETE FROM follows WHERE follower = ? AND followee = ?').run(uid, req.params.followee);
  broadcast('state', getSnapshot());
  res.json({ ok: true });
});

// Aanrader wegklikken (privé bij de ontvanger).
app.post('/api/recommendation/:id/dismiss', (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'geen identiteit' });
  db.prepare('UPDATE recommendations SET dismissed = 1 WHERE id = ? AND to_user = ?').run(req.params.id, uid);
  broadcast('state', getSnapshot());
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
  broadcast('state', getSnapshot());
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

app.listen(PORT, () => {
  console.log(`Op de Bank server luistert op poort ${PORT}`);
  if (!process.env.TMDB_API_KEY) {
    console.warn('LET OP: TMDB_API_KEY ontbreekt — zoeken en details werken pas met een sleutel.');
  }
});
