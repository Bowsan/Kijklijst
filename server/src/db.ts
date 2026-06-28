import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
`);

export interface Snapshot {
  profiles: any[];
  titles: any[];
  ratings: any[];
  recommendations: any[];
  reactions: any[];
  activity: any[];
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

  return { profiles, titles, ratings, recommendations, reactions, activity };
}

export { parseJson };
