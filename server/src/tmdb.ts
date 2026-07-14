import { canonicalProvider, canonicalProviders } from './providers.js';

const API = 'https://api.themoviedb.org/3';
const LANGUAGE = process.env.TMDB_LANGUAGE || 'nl-NL';
const REGION = process.env.TMDB_REGION || 'NL';

function apiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY ontbreekt op de server');
  return key;
}

async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(API + path);
  url.searchParams.set('api_key', apiKey());
  url.searchParams.set('language', LANGUAGE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`TMDb ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export interface SearchResult {
  tmdb_id: number;
  name: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  providers?: string[];
}

// De NL-streamingdiensten voor één serie ophalen (lichte losse call).
export async function getWatchProviders(id: number): Promise<string[]> {
  const data = await tmdb(`/tv/${id}/watch/providers`);
  const region = data.results?.[REGION];
  const set = new Map<number, string>();
  for (const kind of ['flatrate', 'free', 'ads'] as const) {
    for (const p of region?.[kind] || []) set.set(p.provider_id, p.provider_name);
  }
  return canonicalProviders([...set.values()]);
}

export async function searchTv(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const data = await tmdb('/search/tv', { query, include_adult: 'false' });
  return (data.results || [])
    // Series met poster bovenaan, maar series zónder poster niet meer weggooien —
    // anders missen minder bekende titels volledig uit de suggesties.
    .sort((a: any, b: any) => (b.poster_path ? 1 : 0) - (a.poster_path ? 1 : 0))
    .slice(0, 15)
    .map((r: any) => ({
      tmdb_id: r.id,
      name: r.name,
      year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
      poster_path: r.poster_path,
      overview: r.overview || '',
    }));
}

// De nieuwste series ontdekken (voor de "Voor jou" ontdek-sectie).
// We sorteren op eerste uitzenddatum aflopend, maar eisen een minimum aan stemmen
// zodat we geen obscure of lege inzendingen tonen.
export async function getNewTv(): Promise<SearchResult[]> {
  const today = new Date().toISOString().slice(0, 10);
  const data = await tmdb('/discover/tv', {
    sort_by: 'first_air_date.desc',
    include_adult: 'false',
    'first_air_date.lte': today,
    'vote_count.gte': '15',
    watch_region: REGION,
  });
  const results: SearchResult[] = (data.results || [])
    .filter((r: any) => r.first_air_date)
    .slice(0, 10)
    .map((r: any) => ({
      tmdb_id: r.id,
      name: r.name,
      year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
      poster_path: r.poster_path,
      overview: r.overview || '',
    }));

  // Per serie de NL-streamingdienst(en) erbij zoeken (parallel; fout = geen dienst).
  await Promise.all(
    results.map(async (r) => {
      try { r.providers = await getWatchProviders(r.tmdb_id); }
      catch { r.providers = []; }
    }),
  );
  return results;
}

// Genres die we niet als tip willen aanraden op basis van personen.
const SKIP_GENRE_IDS = new Set([10763 /* news */, 10764 /* reality */, 10767 /* talk */]);

export interface PersonSuggestion {
  tmdb_id: number;
  name: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  /** Favoriete acteurs die hierin spelen. */
  actors: string[];
  /** Favoriete makers die dit bedachten/maakten. */
  creators: string[];
  popularity: number;
}

// Cache per persoon (12 uur): zoeken + tv-credits zijn twee calls per naam.
const personCache = new Map<string, { at: number; shows: any[] }>();
const PERSON_TTL = 12 * 3600 * 1000;

async function personTvShows(name: string, kind: 'actor' | 'creator'): Promise<any[]> {
  const key = `${kind}:${name.toLowerCase()}`;
  const hit = personCache.get(key);
  if (hit && Date.now() - hit.at < PERSON_TTL) return hit.shows;

  const search = await tmdb('/search/person', { query: name, include_adult: 'false' });
  const person = (search.results || [])[0];
  if (!person) { personCache.set(key, { at: Date.now(), shows: [] }); return []; }

  const credits = await tmdb(`/person/${person.id}/tv_credits`);
  const raw = kind === 'actor' ? (credits.cast || []) : (credits.crew || []);
  const shows = raw.filter((s: any) =>
    (s.vote_count || 0) >= 10 &&
    !(s.genre_ids || []).some((g: number) => SKIP_GENRE_IDS.has(g)) &&
    // Voor makers alleen scheppende rollen, geen gastklusjes.
    (kind === 'actor' || /creator|executive producer|producer|writer|director/i.test(s.job || '')),
  );
  personCache.set(key, { at: Date.now(), shows });
  return shows;
}

/** Series (TMDb-breed) waarin favoriete acteurs spelen of van favoriete
 *  makers — voor de "Van jouw favorieten"-tips buiten de eigen groepslijst. */
export async function discoverByPeople(actors: string[], creators: string[]): Promise<PersonSuggestion[]> {
  const out = new Map<number, PersonSuggestion>();
  const add = (s: any, person: string, kind: 'actor' | 'creator') => {
    let e = out.get(s.id);
    if (!e) {
      e = {
        tmdb_id: s.id,
        name: s.name,
        year: s.first_air_date ? Number(s.first_air_date.slice(0, 4)) : null,
        poster_path: s.poster_path || null,
        overview: s.overview || '',
        actors: [],
        creators: [],
        popularity: s.popularity || 0,
      };
      out.set(s.id, e);
    }
    const list = kind === 'actor' ? e.actors : e.creators;
    if (!list.includes(person)) list.push(person);
  };

  for (const name of actors.slice(0, 3)) {
    try { for (const s of await personTvShows(name, 'actor')) add(s, name, 'actor'); }
    catch { /* persoon overslaan bij fout */ }
  }
  for (const name of creators.slice(0, 3)) {
    try { for (const s of await personTvShows(name, 'creator')) add(s, name, 'creator'); }
    catch { /* persoon overslaan bij fout */ }
  }

  // Meer redenen (acteur + maker) eerst, daarna populariteit.
  return [...out.values()]
    .sort((a, b) =>
      (b.actors.length + b.creators.length) - (a.actors.length + a.creators.length) ||
      b.popularity - a.popularity)
    .slice(0, 25);
}

export interface TitleDetails {
  tmdb_id: number;
  name: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
  seasons: { season_number: number; episode_count: number; name: string; air_year: number | null }[];
  episode_count: number;
  runtime: number | null;
  providers: string[];
  overview: string;
  cast: string[];
  /** Cast met portretfoto (TMDb-pad), voor visuele acteurslijsten. */
  cast_meta: { name: string; photo: string | null }[];
  /** Bedenkers/makers van de serie (TMDb created_by), met portretfoto. */
  creators: { name: string; photo: string | null }[];
  /** Logo's (TMDb-pad) van de gevonden streamingdiensten, op canonieke naam. */
  provider_logos: { name: string; logo: string }[];
  imdb_id: string | null;
  status: string | null;
}

// Een TMDb-serie opzoeken op IMDb-ID (voor series die de naam-zoekopdracht miste).
export async function findTvIdByImdb(imdbId: string): Promise<number | null> {
  const data = await tmdb(`/find/${imdbId}`, { external_source: 'imdb_id' });
  const tv = (data.tv_results || [])[0];
  return tv ? tv.id : null;
}

// Alleen het IMDb-id ophalen (lichte call, voor het bijwerken van bestaande titels).
export async function getImdbId(id: number): Promise<string | null> {
  const data = await tmdb(`/tv/${id}/external_ids`);
  return data.imdb_id || null;
}

export async function getTvDetails(id: number): Promise<TitleDetails> {
  const data = await tmdb(`/tv/${id}`, {
    append_to_response: 'watch/providers,aggregate_credits,external_ids',
  });

  const seasons = (data.seasons || [])
    .filter((s: any) => s.season_number >= 1) // specials (0) negeren
    .map((s: any) => ({
      season_number: s.season_number,
      episode_count: s.episode_count || 0,
      name: s.name,
      air_year: s.air_date ? Number(s.air_date.slice(0, 4)) : null,
    }));

  const episode_count = data.number_of_episodes
    || seasons.reduce((sum: number, s: any) => sum + s.episode_count, 0);

  const runtime = Array.isArray(data.episode_run_time) && data.episode_run_time.length
    ? data.episode_run_time[0]
    : null;

  const nlProviders = data['watch/providers']?.results?.[REGION];
  const providerSet = new Map<number, string>();
  const logoByName = new Map<string, string>();
  for (const kind of ['flatrate', 'free', 'ads'] as const) {
    for (const p of nlProviders?.[kind] || []) {
      providerSet.set(p.provider_id, p.provider_name);
      const canon = canonicalProvider(p.provider_name);
      if (canon && p.logo_path && !logoByName.has(canon)) logoByName.set(canon, p.logo_path);
    }
  }
  const providers = canonicalProviders([...providerSet.values()]);
  const provider_logos = [...logoByName.entries()].map(([name, logo]) => ({ name, logo }));

  const castRaw = (data.aggregate_credits?.cast || []).slice(0, 8);
  const cast = castRaw.map((c: any) => c.name);
  const cast_meta = castRaw.map((c: any) => ({ name: c.name, photo: c.profile_path || null }));
  const creators = (data.created_by || [])
    .slice(0, 6)
    .map((c: any) => ({ name: c.name, photo: c.profile_path || null }));

  return {
    tmdb_id: data.id,
    name: data.name,
    year: data.first_air_date ? Number(data.first_air_date.slice(0, 4)) : null,
    poster_path: data.poster_path,
    genres: (data.genres || []).map((g: any) => g.name),
    seasons,
    episode_count,
    runtime,
    providers,
    overview: data.overview || '',
    cast,
    cast_meta,
    creators,
    provider_logos,
    imdb_id: data.external_ids?.imdb_id || null,
    status: data.status || null,
  };
}
