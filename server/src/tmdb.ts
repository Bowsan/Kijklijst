import { canonicalProviders } from './providers.js';

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
  for (const kind of ['flatrate', 'free', 'ads'] as const) {
    for (const p of nlProviders?.[kind] || []) providerSet.set(p.provider_id, p.provider_name);
  }
  const providers = canonicalProviders([...providerSet.values()]);

  const cast = (data.aggregate_credits?.cast || [])
    .slice(0, 8)
    .map((c: any) => c.name);

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
    imdb_id: data.external_ids?.imdb_id || null,
    status: data.status || null,
  };
}
