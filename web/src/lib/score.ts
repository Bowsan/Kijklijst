// Kleurschaal voor cijfers (1 t/m 10), ook gebruikt door de cijfer-pil op de
// kaart: van donkerrood (1) via oranje/geel (5-6) naar groen (7-9) en
// blauwgroen (10). De 10 krijgt daarbovenop een gouden shimmer-rand
// via de .gold-klasse.
const ANCHORS: { v: number; c: [number, number, number] }[] = [
  { v: 1, c: [139, 0, 0] },     // #8B0000
  { v: 2, c: [165, 42, 42] },   // #A52A2A
  { v: 3, c: [229, 57, 53] },   // #E53935
  { v: 4, c: [244, 81, 30] },   // #F4511E
  { v: 5, c: [251, 140, 0] },   // #FB8C00
  { v: 6, c: [249, 168, 37] },  // #F9A825
  { v: 7, c: [124, 179, 66] },  // #7CB342
  { v: 8, c: [67, 160, 71] },   // #43A047
  { v: 9, c: [46, 125, 50] },   // #2E7D32
  { v: 10, c: [0, 122, 124] },  // #007A7C
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

/** Een (afgeronde) 10 krijgt de gouden shimmer-rand. */
export function isGoldScore(score: number): boolean {
  return score >= 9.95;
}
