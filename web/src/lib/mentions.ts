// "@naam" in vrije tekst herkennen, om de vermelding aanklikbaar te maken.
// Let op: wie er een mélding krijgt bepaalt de server (server/src/mentions.ts) —
// dit hier is puur voor de weergave. Wijk je hier af, dan ziet het er anders
// uit dan wie er bericht kreeg; houd de regels dus gelijk.

export interface MentionHit {
  start: number;
  end: number;
  userId: string;
}

const isWoordteken = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

function kandidaten(profiles: { id: string; name: string }[]) {
  const uit: { naam: string; id: string }[] = [];
  for (const p of profiles) {
    const heel = (p.name || '').trim();
    if (!heel) continue;
    uit.push({ naam: heel, id: p.id });
    const voor = heel.split(/\s+/)[0];
    if (voor && voor.toLowerCase() !== heel.toLowerCase()) uit.push({ naam: voor, id: p.id });
  }
  return uit.sort((a, b) => b.naam.length - a.naam.length);
}

/** Zoekt "@naam"-vermeldingen; langste naam wint, geen match midden in een woord. */
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
    if (isWoordteken(text[i - 1])) continue;
    for (const k of lijst) {
      const naald = k.naam.toLowerCase();
      if (!lower.startsWith(naald, i + 1)) continue;
      const eind = i + 1 + naald.length;
      if (isWoordteken(text[eind])) continue;
      hits.push({ start: i, end: eind, userId: k.id });
      i = eind - 1;
      break;
    }
  }
  return hits;
}

/**
 * Het stukje naam dat je op dit moment achter een '@' aan het typen bent, voor
 * het keuzelijstje tijdens het schrijven. `null` als de cursor niet in een
 * vermelding staat.
 */
export function mentionBezig(text: string, cursor: number): { start: number; term: string } | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '@') {
      if (isWoordteken(text[i - 1])) return null;
      const term = text.slice(i + 1, cursor);
      // Eén woord (plus eventueel een spatie voor "Anne Marie"), niet een hele zin.
      if (/^[\p{L}\p{N}]*(\s[\p{L}\p{N}]*)?$/u.test(term)) return { start: i, term };
      return null;
    }
    // Nieuwe regel of een tweede spatie: dan zijn we de vermelding voorbij.
    if (ch === '\n') return null;
  }
  return null;
}
