import { useEffect, useState, type CSSProperties } from 'react';

interface Props {
  value: number | null;
  onCommit: (score: number) => void;
}

// Kleurschaal: 1 = rood, 5 = oranje, 7 = groen, 9–10 = goud/geel.
const STOPS: { p: number; c: [number, number, number] }[] = [
  { p: 0, c: [229, 72, 77] },     // rood
  { p: 0.44, c: [255, 159, 28] }, // oranje (≈ 5)
  { p: 0.667, c: [34, 176, 110] },// groen (≈ 7)
  { p: 1, c: [245, 197, 24] },    // goud (10)
];

function scoreColor(v: number): string {
  const f = Math.max(0, Math.min(1, (v - 1) / 9));
  for (let i = 1; i < STOPS.length; i++) {
    if (f <= STOPS[i].p) {
      const a = STOPS[i - 1], b = STOPS[i];
      const t = (f - a.p) / (b.p - a.p);
      const c = a.c.map((ch, j) => Math.round(ch + (b.c[j] - ch) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1].c.join(', ')})`;
}

// De volle kleurschaal, gebruikt als vulling van de balk.
const RAINBOW = 'linear-gradient(90deg, #e5484d 0%, #ff9f1c 44%, #22b06e 66.7%, #f5c518 100%)';

/**
 * Cijfer geven met een slider van 1 t/m 10 in halve stappen (7,5 / 8,5 …).
 * De balk verkleurt mee met het cijfer (rood → oranje → groen → goud).
 * Tik ergens op de balk om 'm daar neer te zetten, of sleep 'm.
 */
export default function ScoreSlider({ value, onCommit }: Props) {
  const [local, setLocal] = useState<number | null>(value);
  useEffect(() => setLocal(value), [value]);

  const set = local != null;
  const shown = local ?? 7;
  const pct = ((shown - 1) / 9) * 100;
  const label = set ? (Number.isInteger(local!) ? String(local) : local!.toFixed(1)) : '–';
  const color = scoreColor(shown);

  const commit = () => { if (local != null) onCommit(local); };

  // Gevulde regenboog tot aan de thumb, daarna grijs.
  const trackBg = set
    ? `linear-gradient(90deg, transparent ${pct}%, var(--surface-2) ${pct}%), ${RAINBOW}`
    : 'var(--surface-2)';

  const style = {
    '--track-bg': trackBg,
    '--thumb': set ? color : 'var(--muted)',
  } as CSSProperties;

  return (
    <div className="score-slider">
      <div className="ss-top">
        <span className="ss-value" style={{ color: set ? color : 'var(--muted)', opacity: set ? 1 : 0.5 }}>{label}</span>
        <span className="ss-hint muted">{set ? 'jouw cijfer' : 'tik of sleep om een cijfer te geven'}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={shown}
        aria-label="Cijfer"
        style={style}
        onPointerDown={() => { if (local == null) setLocal(shown); }}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <div className="ss-scale">
        <span>1</span><span>5</span><span>10</span>
      </div>
    </div>
  );
}
