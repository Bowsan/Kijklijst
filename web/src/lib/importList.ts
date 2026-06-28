// Parseert een geplakte lijst: één serie per regel, met achter de titel een optioneel cijfer.
// Het laatste losse getal van 1 t/m 10 is het cijfer; de rest is de titel.
// Zo blijven titels met een getal erin, zoals "1899", heel.

export interface ParsedLine {
  title: string;
  score: number | null;
  raw: string;
}

export function parseImport(text: string): ParsedLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((raw) => {
      // Verwijder eventuele scheidingstekens aan het eind (komma, dubbele punt, streepje).
      const cleaned = raw.replace(/[,:;\-–]+\s*$/, '').trim();
      const tokens = cleaned.split(/\s+/);
      const last = tokens[tokens.length - 1];

      // Cijfer = laatste token dat een geheel getal 1..10 is, mits er nog een titel overblijft.
      const num = Number(last.replace(/[,.:;\-–]/g, ''));
      if (tokens.length > 1 && Number.isInteger(num) && num >= 1 && num <= 10) {
        const title = tokens.slice(0, -1).join(' ').replace(/[,:;\-–]+\s*$/, '').trim();
        return { title, score: num, raw };
      }
      return { title: cleaned, score: null, raw };
    })
    .filter((p) => p.title.length > 0);
}
