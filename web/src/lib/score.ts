// Kleurschaal voor cijfers, ook gebruikt door de cijfer-pil op de kaart:
// 1–3 donkerrood · 4–5 rood · 6 lichter rood/oranje · 7 lichtgroen ·
// 8 groen · 9 geelgroen · 10 goud (met shimmer via de .gold-klasse).
const ANCHORS: { v: number; c: [number, number, number] }[] = [
  { v: 1, c: [127, 29, 29] },   // donkerrood
  { v: 3, c: [127, 29, 29] },
  { v: 4, c: [220, 47, 47] },   // rood
  { v: 5, c: [220, 47, 47] },
  { v: 6, c: [232, 112, 61] },  // lichter rood/oranje
  { v: 7, c: [103, 178, 111] }, // lichtgroen
  { v: 8, c: [31, 157, 91] },   // groen
  { v: 9, c: [148, 168, 33] },  // geelgroen
  { v: 10, c: [212, 160, 23] }, // goud
];

/** Kleur bij een cijfer (halve cijfers interpoleren tussen de ankers). */
export function scoreColor(score: number): string {
  const v = Math.max(1, Math.min(10, score));
  for (let i = 1; i < ANCHORS.length; i++) {
    if (v <= ANCHORS[i].v) {
      const a = ANCHORS[i - 1], b = ANCHORS[i];
      const t = (v - a.v) / (b.v - a.v);
      const c = a.c.map((ch, j) => Math.round(ch + (b.c[j] - ch) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return `rgb(${ANCHORS[ANCHORS.length - 1].c.join(', ')})`;
}

/** Een (afgeronde) 10 is goud en krijgt de shimmer-animatie. */
export function isGoldScore(score: number): boolean {
  return score >= 9.95;
}
