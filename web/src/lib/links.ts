// Externe links die we op meerdere plekken opbouwen.

/** IMDb-zoekpagina voor een serie op naam + jaar. */
export function imdbSearchUrl(name: string, year: number | null | undefined): string {
  const q = encodeURIComponent(`${name} ${year || ''}`.trim());
  return `https://www.imdb.com/find/?q=${q}&s=tt&ttype=tv`;
}

/** Directe IMDb-pagina als we het imdb_id kennen, anders de zoekpagina. */
export function imdbUrlFor(
  imdbId: string | null | undefined,
  name: string,
  year: number | null | undefined,
): string {
  return imdbId ? `https://www.imdb.com/title/${imdbId}/` : imdbSearchUrl(name, year);
}
