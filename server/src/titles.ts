// Titelbeheer: aanmaken vanuit TMDb, verversen, en de achtergrond-backfills.
import { db, parseJson } from './db.js';
import { getTvDetails, getImdbId } from './tmdb.js';
import { broadcast } from './events.js';
import { sendPushTo } from './push.js';
import { logActivity, listersOf } from './helpers.js';

// Zorg dat een titel in de database staat (haalt details bij TMDb indien nodig).
export async function ensureTitle(tmdbId: number, addedBy: string | null): Promise<any> {
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
export function storeServiceLogos(logos: { name: string; logo: string }[]): void {
  if (!logos?.length) return;
  const up = db.prepare('INSERT INTO service_logos (name, logo_path, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET logo_path = excluded.logo_path, updated_at = excluded.updated_at');
  for (const l of logos) up.run(l.name, l.logo, Date.now());
}

// Eenmalig de IMDb-id's bijwerken voor bestaande TMDb-titels die er nog geen hebben.
// Draait op de achtergrond, met een rustige pauze tussen de TMDb-aanroepen.
export async function backfillImdbIds(): Promise<void> {
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
export async function refreshTitle(tmdbId: number): Promise<boolean> {
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
export async function refreshTitles(rows: { tmdb_id: number }[], label: string): Promise<void> {
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

// OMDb-antwoord naar nette getallen ("8.4"/"123,456"; "N/A" → null).
export function parseOmdbRating(d: any): { rating: number | null; votes: number | null } {
  const rating = Number.parseFloat(d?.imdbRating);
  const votes = Number.parseInt(String(d?.imdbVotes ?? '').replace(/,/g, ''), 10);
  return {
    rating: Number.isFinite(rating) ? rating : null,
    votes: Number.isFinite(votes) ? votes : null,
  };
}

// IMDb-cijfers via OMDb verversen voor titels met een imdb_id (cache 7 dagen).
// Rustig getimed en gemaximeerd per run i.v.m. de gratis daglimiet van OMDb.
export async function refreshImdbRatings(): Promise<void> {
  const key = process.env.OMDB_API_KEY;
  if (!key) return;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const rows = db
    .prepare('SELECT tmdb_id, imdb_id FROM titles WHERE imdb_id IS NOT NULL AND (imdb_rating_at IS NULL OR imdb_rating_at < ?) LIMIT 150')
    .all(weekAgo) as { tmdb_id: number; imdb_id: string }[];
  if (!rows.length) return;

  console.log(`IMDb-cijfers verversen voor ${rows.length} titel(s)…`);
  const upd = db.prepare('UPDATE titles SET imdb_rating = ?, imdb_votes = ?, imdb_rating_at = ? WHERE tmdb_id = ?');
  let filled = 0;
  for (const r of rows) {
    try {
      const res = await fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(r.imdb_id)}&apikey=${key}`);
      const d: any = await res.json();
      const { rating, votes } = parseOmdbRating(d);
      // Ook een misser krijgt een tijdstempel, anders blijft dezelfde titel de limiet opeten.
      upd.run(rating, votes, Date.now(), r.tmdb_id);
      if (rating != null) filled++;
      if (filled > 0 && filled % 25 === 0) broadcast('state', 1);
    } catch { /* titel overslaan bij fout */ }
    await new Promise((res) => setTimeout(res, 300));
  }
  if (filled) broadcast('state', 1);
  console.log(`IMDb-cijfers klaar: ${filled} bijgewerkt.`);
}

// Eenmalig cast-foto's en makers aanvullen voor titels die die info nog missen
// (vult onderweg ook de dienstlogo's).
export async function backfillCastMeta(): Promise<void> {
  if (!process.env.TMDB_API_KEY) return;
  const rows = db
    .prepare('SELECT tmdb_id FROM titles WHERE (cast_meta IS NULL OR creators IS NULL) AND tmdb_id > 0')
    .all() as { tmdb_id: number }[];
  if (rows.length) await refreshTitles(rows, 'Cast/makers-backfill');
}

// Automatisch: alleen nog-lopende (of nog onbekende) series, hooguit 1×/dag.
export async function refreshOngoingTitles(): Promise<void> {
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
