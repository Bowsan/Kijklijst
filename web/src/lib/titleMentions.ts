// Serietitels herkennen in vrije tekst (prikbordberichten, chats), zodat je ze
// kunt aantikken. Puur tekstwerk — de opmaak gebeurt in de component.

export interface Mention {
  /** Startpositie in de oorspronkelijke tekst. */
  start: number;
  /** Positie net na de titel. */
  end: number;
  /** De tmdb_id van de herkende serie. */
  tmdbId: number;
}

/** Titels korter dan dit laten we met rust: "24" of "Kort" zouden anders in
 *  gewone zinnen oplichten. Liever een gemiste link dan een verkeerde. */
const MIN_LENGTE = 4;

// Een letter/cijfer vlak voor of na de titel betekent dat het onderdeel is van
// een groter woord ("Darkness" mag niet matchen op "Dark").
const isWoordteken = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Zoekt titels in `text`. Langere titels gaan voor, zodat "The Good Fight" niet
 * half als "The Good Wife" wordt gemarkeerd. Overlappende treffers vallen af.
 */
export function findTitleMentions(
  text: string,
  titles: { tmdb_id: number; name: string }[],
): Mention[] {
  if (!text) return [];
  const lower = text.toLowerCase();

  const kandidaten = titles
    .filter((t) => t.name && t.name.trim().length >= MIN_LENGTE)
    // Langste eerst: die wint bij overlap.
    .sort((a, b) => b.name.length - a.name.length);

  const gevonden: Mention[] = [];
  const bezet = new Array(text.length).fill(false);

  for (const t of kandidaten) {
    const naald = t.name.trim().toLowerCase();
    let from = 0;
    for (;;) {
      const i = lower.indexOf(naald, from);
      if (i === -1) break;
      const eind = i + naald.length;
      from = i + 1;

      // Alleen als hele woordgroep, en niet bovenop een eerdere treffer.
      if (isWoordteken(text[i - 1]) || isWoordteken(text[eind])) continue;
      let vrij = true;
      for (let k = i; k < eind; k++) if (bezet[k]) { vrij = false; break; }
      if (!vrij) continue;

      for (let k = i; k < eind; k++) bezet[k] = true;
      gevonden.push({ start: i, end: eind, tmdbId: t.tmdb_id });
    }
  }

  return gevonden.sort((a, b) => a.start - b.start);
}
