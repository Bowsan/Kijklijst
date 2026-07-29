// "@naam" in een prikbordbericht herkennen, zodat de genoemde vriend een
// seintje krijgt. Bewust op de server: hier bepalen we wie er een melding
// krijgt, en dat mag niet afhangen van wat de client meestuurt.

export interface MentionHit {
  /** Positie van de '@'. */
  start: number;
  /** Positie net na de naam. */
  end: number;
  userId: string;
}

const isWoordteken = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** Naam plus voornaam als aanspreekvormen: "@Anne Marie" én "@Anne" werken. */
function kandidaten(profiles: { id: string; name: string }[]): { naam: string; id: string }[] {
  const uit: { naam: string; id: string }[] = [];
  for (const p of profiles) {
    const heel = (p.name || '').trim();
    if (!heel) continue;
    uit.push({ naam: heel, id: p.id });
    const voor = heel.split(/\s+/)[0];
    if (voor && voor.toLowerCase() !== heel.toLowerCase()) uit.push({ naam: voor, id: p.id });
  }
  // Langste eerst: "@Anne Marie" wint van "@Anne".
  return uit.sort((a, b) => b.naam.length - a.naam.length);
}

/**
 * Zoekt "@naam"-vermeldingen in `text`. Geeft per vermelding de positie en het
 * gebruikers-id. Dezelfde persoon twee keer noemen levert twee treffers op —
 * ontdubbelen doet de aanroeper (zie `mentionedUserIds`).
 */
export function findMentions(
  text: string,
  profiles: { id: string; name: string }[],
): MentionHit[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const lijst = kandidaten(profiles);
  const hits: MentionHit[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    // Geen '@' midden in een woord (e-mailadressen e.d.).
    if (isWoordteken(text[i - 1])) continue;

    for (const k of lijst) {
      const naald = k.naam.toLowerCase();
      if (!lower.startsWith(naald, i + 1)) continue;
      const eind = i + 1 + naald.length;
      // De naam moet als geheel eindigen, niet midden in een langer woord.
      if (isWoordteken(text[eind])) continue;
      hits.push({ start: i, end: eind, userId: k.id });
      i = eind - 1; // voorbij deze vermelding verder zoeken
      break;
    }
  }
  return hits;
}

/** De unieke gebruikers die in de tekst genoemd worden, zonder de schrijver zelf. */
export function mentionedUserIds(
  text: string,
  profiles: { id: string; name: string }[],
  auteur: string,
): string[] {
  const ids = new Set<string>();
  for (const h of findMentions(text, profiles)) {
    if (h.userId !== auteur) ids.add(h.userId);
  }
  return [...ids];
}
