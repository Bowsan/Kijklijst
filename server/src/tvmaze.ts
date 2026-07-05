// TVmaze: gratis, open tv-database zonder API-sleutel. Handig voor series die
// TMDb niet kent maar die wél op IMDb (en dus vaak op TVmaze) staan.

const API = 'https://api.tvmaze.com';

export interface EnrichData {
  name: string;
  year: number | null;
  poster_path: string | null; // volledige URL bij TVmaze
  genres: string[];
  seasons: { season_number: number; episode_count: number; name: string; air_year: number | null }[];
  episode_count: number | null;
  overview: string;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Een serie opzoeken op IMDb-ID en normaliseren naar onze velden.
export async function tvmazeByImdb(imdbId: string): Promise<EnrichData | null> {
  const res = await fetch(`${API}/lookup/shows?imdb=${encodeURIComponent(imdbId)}`, {
    headers: { accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TVmaze ${res.status}`);
  const show = await res.json();
  if (!show || !show.id) return null;

  // Seizoenen apart ophalen voor nette seizoen-/afleveringsinfo.
  let seasons: EnrichData['seasons'] = [];
  try {
    const sres = await fetch(`${API}/shows/${show.id}/seasons`, { headers: { accept: 'application/json' } });
    if (sres.ok) {
      const arr = (await sres.json()) as any[];
      seasons = arr
        .filter((s) => s.number != null)
        .map((s) => ({
          season_number: s.number,
          episode_count: s.episodeOrder || 0,
          name: s.name || `Seizoen ${s.number}`,
          air_year: s.premiereDate ? Number(s.premiereDate.slice(0, 4)) : null,
        }));
    }
  } catch {
    /* seizoenen zijn optioneel */
  }

  const episode_count = seasons.reduce((sum, s) => sum + (s.episode_count || 0), 0) || null;

  return {
    name: show.name,
    year: show.premiered ? Number(show.premiered.slice(0, 4)) : null,
    poster_path: show.image?.original || show.image?.medium || null,
    genres: Array.isArray(show.genres) ? show.genres : [],
    seasons,
    episode_count,
    overview: stripHtml(show.summary),
  };
}
