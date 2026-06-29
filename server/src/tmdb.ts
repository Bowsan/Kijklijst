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
}

export async function getTvDetails(id: number): Promise<TitleDetails> {
  const data = await tmdb(`/tv/${id}`, {
    append_to_response: 'watch/providers,aggregate_credits',
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
  const providers = [...providerSet.values()];

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
  };
}
