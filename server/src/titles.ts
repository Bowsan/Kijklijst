// Titelbeheer: aanmaken vanuit TMDb, verversen, en de achtergrond-backfills.
import { db, parseJson, metaGetNumber, metaSetNumber } from './db.js';
import { getTvDetails, getImdbId } from './tmdb.js';
import { broadcast } from './events.js';
import { sendPushTo } from './push.js';
import { logActivity, listersOf } from './helpers.js';
import { nieuwsteUitgezondenSeizoen, seizoenMelding } from './seasons.js';

// Zorg dat een titel in de database staat (haalt details bij TMDb indien nodig).
export async function ensureTitle(tmdbId: number, addedBy: string | null): Promise<any> {
  const existing = db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(tmdbId);
  if (existing) return existing;

  const d = await getTvDetails(tmdbId);
  db.prepare(
    `INSERT INTO titles
      (tmdb_id, name, year, first_air_date, poster_path, genres, seasons, episode_count, runtime, providers, overview, cast, cast_meta, creators, imdb_id, tmdb_status, refreshed_at, announced_season, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    d.tmdb_id, d.name, d.year, d.first_air_date, d.poster_path,
    JSON.stringify(d.genres), JSON.stringify(d.seasons), d.episode_count, d.runtime,
    JSON.stringify(d.providers), d.overview, JSON.stringify(d.cast), JSON.stringify(d.cast_meta), JSON.stringify(d.creators), d.imdb_id, d.status, Date.now(),
    // De stand meteen vastleggen: een serie die je nu toevoegt heeft geen
    // "nieuw seizoen", ook niet als er net een seizoen uit is.
    nieuwsteUitgezondenSeizoen(d.seasons),
    addedBy, Date.now()
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
  const now = Date.now();
  // Alleen seizoenen die echt zijn begonnen tellen mee, en we vergelijken met
  // wat we al gemeld hebben — niet met de vorige momentopname. Zie seasons.ts.
  const { melden, gemeldNu } = seizoenMelding(
    existing.announced_season, parseJson<any[]>(existing.seasons, []), d.seasons, now,
  );
  const gainedSeason = melden != null;

  db.prepare(
    `UPDATE titles SET
       name=?, year=?, first_air_date=COALESCE(?, first_air_date), poster_path=?, genres=?, seasons=?, episode_count=?, runtime=?,
       providers=?, overview=?, cast=?, cast_meta=?, creators=?, imdb_id=COALESCE(?, imdb_id), tmdb_status=?,
       refreshed_at=?, new_season_at=?, announced_season=?
     WHERE tmdb_id=?`
  ).run(
    d.name, d.year, d.first_air_date, d.poster_path,
    JSON.stringify(d.genres), JSON.stringify(d.seasons), d.episode_count, d.runtime,
    JSON.stringify(d.providers), d.overview, JSON.stringify(d.cast), JSON.stringify(d.cast_meta), JSON.stringify(d.creators), d.imdb_id, d.status,
    now, gainedSeason ? now : existing.new_season_at ?? null, gemeldNu,
    tmdbId,
  );
  storeServiceLogos(d.provider_logos);

  if (melden != null) {
    // Systeem-event (geen gebruiker) — verschijnt in de activiteitenlog.
    logActivity('new_season', '', tmdbId, { to: melden });
    sendPushTo(listersOf(tmdbId), {
      title: 'Op de Bank',
      body: `🎉 ${d.name} heeft een nieuw seizoen (seizoen ${melden})`,
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
  let failed = 0;
  for (const r of rows) {
    try {
      const res = await fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(r.imdb_id)}&apikey=${key}`);
      const d: any = await res.json();
      if (d?.Error) throw new Error(String(d.Error));
      const { rating, votes } = parseOmdbRating(d);
      // Ook een misser krijgt een tijdstempel, anders blijft dezelfde titel de limiet opeten.
      upd.run(rating, votes, Date.now(), r.tmdb_id);
      if (rating != null) filled++;
      if (filled > 0 && filled % 25 === 0) broadcast('state', 1);
    } catch (e: any) {
      // Eerste fout loggen zodat een kapotte sleutel/limiet zichtbaar is in de serverlog.
      if (failed === 0) console.warn(`OMDb-fout bij ${r.imdb_id}: ${e?.message || e}`);
      failed++;
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  if (filled) broadcast('state', 1);
  console.log(`IMDb-cijfers klaar: ${filled} bijgewerkt${failed ? `, ${failed} mislukt` : ''}.`);
}

// IMDb-cijfer voor één TMDb-id — ook voor series die nog niet op de lijst staan
// (voor de tips/ontdek-kaarten in "Voor jou"). Bronvolgorde: de titels-tabel,
// dan de cache, dan live via TMDb (imdb_id) + OMDb. 30 dagen cache.
export async function imdbForTmdb(tmdbId: number): Promise<{ rating: number | null; votes: number | null } | null> {
  const inTitles: any = db.prepare('SELECT imdb_rating, imdb_votes FROM titles WHERE tmdb_id = ? AND imdb_rating IS NOT NULL').get(tmdbId);
  if (inTitles) return { rating: inTitles.imdb_rating, votes: inTitles.imdb_votes };

  const cached: any = db.prepare('SELECT rating, votes, updated_at FROM imdb_by_tmdb WHERE tmdb_id = ?').get(tmdbId);
  if (cached && Date.now() - cached.updated_at < 30 * 24 * 3600 * 1000) {
    return { rating: cached.rating, votes: cached.votes };
  }
  const key = process.env.OMDB_API_KEY;
  if (!key) return cached ? { rating: cached.rating, votes: cached.votes } : null;

  const save = (rating: number | null, votes: number | null) =>
    db.prepare('INSERT OR REPLACE INTO imdb_by_tmdb (tmdb_id, rating, votes, updated_at) VALUES (?, ?, ?, ?)').run(tmdbId, rating, votes, Date.now());
  try {
    const imdb = await getImdbId(tmdbId);
    if (!imdb) { save(null, null); return null; }
    const res = await fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(imdb)}&apikey=${key}`);
    const d: any = await res.json();
    const { rating, votes } = parseOmdbRating(d);
    save(rating, votes);
    return { rating, votes };
  } catch {
    return cached ? { rating: cached.rating, votes: cached.votes } : null;
  }
}

// Een lijst tips/suggesties verrijken met hun IMDb-cijfer (parallel, best-effort).
export async function attachImdbRatings<T extends { tmdb_id: number; imdb?: number | null }>(rows: T[]): Promise<T[]> {
  await Promise.all(rows.map(async (r) => {
    const got = await imdbForTmdb(r.tmdb_id).catch(() => null);
    if (got?.rating != null) r.imdb = got.rating;
  }));
  return rows;
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

// Eenmalig de uitgavedatum aanvullen voor bestaande titels die die nog missen,
// zodat sorteren op uitgave meteen klopt (verversen vult first_air_date).
export async function backfillFirstAirDates(): Promise<void> {
  if (!process.env.TMDB_API_KEY) return;
  const rows = db
    .prepare('SELECT tmdb_id FROM titles WHERE first_air_date IS NULL AND tmdb_id > 0')
    .all() as { tmdb_id: number }[];
  if (rows.length) await refreshTitles(rows, 'Uitgavedatum-backfill');
}

// ---------- De seizoenronde ----------
//
// Nieuwe seizoenen komen alleen in de app als we TMDb blijven navragen. Drie
// dingen houden dat op de rails:
//  1. Lopende series gaan dagelijks langs.
//  2. Élke serie komt minstens eens per twee weken aan de beurt, ook een
//     "Ended" of "Canceled". Dat is bewust: die status klopt niet altijd en
//     series worden verlengd. Zonder deze trage baan zou zo'n serie nooit meer
//     bekeken worden en een nieuw seizoen dus nooit opvallen.
//  3. De ronde hangt niet aan de looptijd van het proces: hij wordt ook
//     gestart als iemand de app opent en de vorige ronde te lang geleden is.
//     Na een herstart of een periode zonder verkeer loopt hij dus gewoon bij.

/** Lopende series: dagelijks. */
const VERS_LOPEND = 24 * 3600 * 1000;
/** Alle series, wat de status ook is: minstens eens per twee weken. */
const VERS_ALLES = 14 * 24 * 3600 * 1000;
/** Hooguit zoveel titels per ronde — rustig aan tegenover TMDb. */
export const MAX_PER_RONDE = 60;
/** Hoe vaak de ronde hoort te lopen. */
export const RONDE_INTERVAL = 6 * 3600 * 1000;
const RONDE_SLEUTEL = 'season_sweep_at';

/** Welke titels zijn nu aan de beurt? Langst niet nagekeken eerst. */
export function teVerversenTitels(nu = Date.now()): number[] {
  return (db.prepare('SELECT tmdb_id, tmdb_status, refreshed_at FROM titles WHERE tmdb_id > 0').all() as any[])
    .filter((t) => {
      if (t.refreshed_at == null) return true; // nog nooit ververst
      const geleden = nu - t.refreshed_at;
      if (geleden >= VERS_ALLES) return true; // niets blijft eeuwig liggen
      if (geleden < VERS_LOPEND) return false; // recent genoeg
      return t.tmdb_status == null || ONGOING.has(t.tmdb_status);
    })
    .sort((a, b) => (a.refreshed_at ?? 0) - (b.refreshed_at ?? 0))
    .slice(0, MAX_PER_RONDE)
    .map((t) => t.tmdb_id);
}

/** Wanneer liep de laatste ronde? (null = nog nooit) */
export function laatsteRonde(): number | null {
  return metaGetNumber(RONDE_SLEUTEL);
}

/** Is de ronde alweer aan de beurt? */
export function rondeNodig(nu = Date.now()): boolean {
  return nu - (laatsteRonde() ?? 0) >= RONDE_INTERVAL;
}

let rondeBezig = false;

/** Eén ronde lopen. Overlapt nooit met zichzelf. */
export async function seizoenRonde(reden: string): Promise<void> {
  if (!process.env.TMDB_API_KEY || rondeBezig) return;
  rondeBezig = true;
  // Meteen afstempelen, zodat een tweede aanleiding niet dezelfde ronde herhaalt.
  metaSetNumber(RONDE_SLEUTEL, Date.now());
  try {
    await refreshTitles(teVerversenTitels().map((tmdb_id) => ({ tmdb_id })), `Seizoenronde (${reden})`);
  } finally {
    rondeBezig = false;
  }
}

/** Start de ronde alleen als hij aan de beurt is. Bedoeld voor als de app opent. */
export function rondeIndienNodig(reden: string): void {
  if (!rondeNodig()) return;
  void seizoenRonde(reden).catch((e: any) => console.warn('Seizoenronde mislukt:', e?.message || e));
}
