import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalProvider, canonicalProviders } from './providers.js';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/opdebank.sqlite';

mkdirSync(dirname(DATABASE_PATH), { recursive: true });

export const db = new Database(DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    avatar      TEXT,
    color       TEXT,
    services    TEXT NOT NULL DEFAULT '[]',
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS titles (
    tmdb_id        INTEGER PRIMARY KEY,
    name           TEXT NOT NULL,
    year           INTEGER,
    poster_path    TEXT,
    genres         TEXT NOT NULL DEFAULT '[]',
    seasons        TEXT NOT NULL DEFAULT '[]',
    episode_count  INTEGER,
    runtime        INTEGER,
    providers      TEXT NOT NULL DEFAULT '[]',
    overview       TEXT,
    cast           TEXT NOT NULL DEFAULT '[]',
    imdb_id        TEXT,
    tmdb_status    TEXT,
    refreshed_at   INTEGER,
    new_season_at  INTEGER,
    added_by       TEXT,
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ratings (
    title_id    INTEGER NOT NULL,
    user_id     TEXT NOT NULL,
    score       INTEGER,
    status      TEXT,
    note        TEXT,
    service     TEXT,
    seasons     TEXT NOT NULL DEFAULT '[]',
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (title_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id          TEXT PRIMARY KEY,
    from_user   TEXT NOT NULL,
    to_user     TEXT NOT NULL,
    title_id    INTEGER NOT NULL,
    note        TEXT,
    dismissed   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reactions (
    title_id    INTEGER NOT NULL,
    user_id     TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (title_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS activity (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    title_id    INTEGER,
    meta        TEXT NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower    TEXT NOT NULL,
    followee    TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (follower, followee)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    title_id    INTEGER NOT NULL,
    user_id     TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`);

// Kolommen toevoegen aan bestaande databases (idempotent).
function addTitleColumns(): void {
  const cols = db.prepare('PRAGMA table_info(titles)').all() as any[];
  const names = new Set(cols.map((c) => c.name));
  const add = (name: string, type: string) => {
    if (!names.has(name)) db.exec(`ALTER TABLE titles ADD COLUMN ${name} ${type}`);
  };
  add('imdb_id', 'TEXT');
  add('tmdb_status', 'TEXT');
  add('refreshed_at', 'INTEGER');
  add('new_season_at', 'INTEGER');
}
addTitleColumns();

// Nieuwe kolommen op profiles toevoegen zonder bestaande data te verliezen.
function addProfileColumns(): void {
  const cols = db.prepare('PRAGMA table_info(profiles)').all() as any[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('hidden')) db.exec('ALTER TABLE profiles ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
}
addProfileColumns();

// Bestaande titels en beoordelingen normaliseren naar samengevoegde dienstnamen
// (idempotent: al-genormaliseerde namen blijven gelijk).
function normalizeStoredProviders(): void {
  const tx = db.transaction(() => {
    const titles = db.prepare('SELECT tmdb_id, providers FROM titles').all() as any[];
    const updTitle = db.prepare('UPDATE titles SET providers = ? WHERE tmdb_id = ?');
    for (const t of titles) {
      const next = JSON.stringify(canonicalProviders(parseJson<string[]>(t.providers, [])));
      if (next !== t.providers) updTitle.run(next, t.tmdb_id);
    }
    const ratings = db.prepare('SELECT rowid, service FROM ratings WHERE service IS NOT NULL').all() as any[];
    const updRating = db.prepare('UPDATE ratings SET service = ? WHERE rowid = ?');
    for (const r of ratings) {
      const c = canonicalProvider(r.service);
      if (c !== r.service) updRating.run(c, r.rowid);
    }
    // Ook de diensten in profielen samenvoegen (bijv. "Max" → "HBO Max").
    const profiles = db.prepare('SELECT id, services FROM profiles').all() as any[];
    const updProfile = db.prepare('UPDATE profiles SET services = ? WHERE id = ?');
    for (const p of profiles) {
      const next = JSON.stringify(canonicalProviders(parseJson<string[]>(p.services, [])));
      if (next !== p.services) updProfile.run(next, p.id);
    }
  });
  tx();
}
normalizeStoredProviders();

// Profielen met dezelfde naam (hoofdletterongevoelig) samenvoegen tot één account.
// Idempotent: na samenvoegen bestaat er per naam nog maar één profiel.
function mergeDuplicateProfiles(): void {
  const profiles = db.prepare('SELECT id, name, updated_at FROM profiles').all() as any[];
  const groups = new Map<string, any[]>();
  for (const p of profiles) {
    const key = (p.name || '').trim().toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const ratingCount = db.prepare('SELECT COUNT(*) AS n FROM ratings WHERE user_id = ?');
  const merge = db.transaction((keep: string, dup: string) => {
    // Beoordelingen/reacties: bij botsing (dezelfde titel) blijft die van het hoofdaccount staan.
    db.prepare('UPDATE OR IGNORE ratings SET user_id = ? WHERE user_id = ?').run(keep, dup);
    db.prepare('DELETE FROM ratings WHERE user_id = ?').run(dup);
    db.prepare('UPDATE OR IGNORE reactions SET user_id = ? WHERE user_id = ?').run(keep, dup);
    db.prepare('DELETE FROM reactions WHERE user_id = ?').run(dup);
    // Volg-relaties verleggen en eventuele zelf-volgrelaties opruimen.
    db.prepare('UPDATE OR IGNORE follows SET follower = ? WHERE follower = ?').run(keep, dup);
    db.prepare('UPDATE OR IGNORE follows SET followee = ? WHERE followee = ?').run(keep, dup);
    db.prepare('DELETE FROM follows WHERE follower = ? OR followee = ?').run(dup, dup);
    db.prepare('DELETE FROM follows WHERE follower = followee').run();
    // Aanraders en activiteit verleggen.
    db.prepare('UPDATE recommendations SET from_user = ? WHERE from_user = ?').run(keep, dup);
    db.prepare('UPDATE recommendations SET to_user = ? WHERE to_user = ?').run(keep, dup);
    db.prepare('DELETE FROM recommendations WHERE from_user = to_user').run();
    db.prepare('UPDATE activity SET user_id = ? WHERE user_id = ?').run(keep, dup);
    db.prepare('DELETE FROM profiles WHERE id = ?').run(dup);
  });

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Houd het account met de meeste beoordelingen aan; bij gelijkspel de oudste.
    group.sort((a, b) => {
      const na = (ratingCount.get(a.id) as any).n;
      const nb = (ratingCount.get(b.id) as any).n;
      return nb - na || a.updated_at - b.updated_at;
    });
    const keep = group[0].id;
    for (let i = 1; i < group.length; i++) merge(keep, group[i].id);
  }
}
mergeDuplicateProfiles();

// Bestaande korte indrukken (note bij een rating) omzetten naar berichten op
// het prikbord en de note daarna leegmaken. Idempotent: na omzetten is note leeg.
function migrateNotesToComments(): void {
  const tx = db.transaction(() => {
    const rows = db.prepare("SELECT title_id, user_id, note, updated_at FROM ratings WHERE note IS NOT NULL AND trim(note) <> ''").all() as any[];
    const insert = db.prepare('INSERT INTO comments (id, title_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)');
    const clear = db.prepare('UPDATE ratings SET note = NULL WHERE title_id = ? AND user_id = ?');
    for (const r of rows) {
      insert.run(randomUUID(), r.title_id, r.user_id, String(r.note).trim(), r.updated_at);
      clear.run(r.title_id, r.user_id);
    }
  });
  tx();
}
migrateNotesToComments();

export interface Snapshot {
  profiles: any[];
  titles: any[];
  ratings: any[];
  recommendations: any[];
  reactions: any[];
  activity: any[];
  follows: any[];
  comments: any[];
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getSnapshot(): Snapshot {
  const profiles = db.prepare('SELECT * FROM profiles').all().map((p: any) => ({
    ...p,
    services: parseJson(p.services, []),
    hidden: !!p.hidden,
  }));

  const titles = db.prepare('SELECT * FROM titles').all().map((t: any) => ({
    ...t,
    genres: parseJson(t.genres, []),
    seasons: parseJson(t.seasons, []),
    providers: parseJson(t.providers, []),
    cast: parseJson(t.cast, []),
  }));

  const ratings = db.prepare('SELECT * FROM ratings').all().map((r: any) => ({
    ...r,
    seasons: parseJson(r.seasons, []),
  }));

  const recommendations = db.prepare('SELECT * FROM recommendations').all().map((r: any) => ({
    ...r,
    dismissed: !!r.dismissed,
  }));

  const reactions = db.prepare('SELECT * FROM reactions').all();

  const activity = db
    .prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 60')
    .all()
    .map((a: any) => ({ ...a, meta: parseJson(a.meta, {}) }));

  const follows = db.prepare('SELECT * FROM follows').all();

  const comments = db.prepare('SELECT * FROM comments ORDER BY created_at ASC').all();

  return { profiles, titles, ratings, recommendations, reactions, activity, follows, comments };
}

export { parseJson };
