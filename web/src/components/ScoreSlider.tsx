import { useEffect, useState, type CSSProperties } from 'react';

interface Props {
  value: number | null;
  onCommit: (score: number) => void;
  onClear: () => void;
}

// Kleurschaal: 1 = rood, 5 = oranje, 7 = groen, 9–10 = goud/geel.
const STOPS: { p: number; c: [number, number, number] }[] = [
  { p: 0, c: [229, 72, 77] },     // rood (1)
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

// Regenboog over de rating-zone: 1 = 10% van de balk … 10 = 100%.
const RAINBOW = 'linear-gradient(90deg, #e5484d 10%, #ff9f1c 50%, #22b06e 70%, #f5c518 100%)';

/**
 * Cijfer geven met een slider. Sleep 'm helemaal naar links (onder de 1) en
 * de balk wordt blauw + transparant: "Weet ik nog niet" (cijfer gewist).
 * Daarboven een cijfer van 1 t/m 10 in halve stappen, met een balk die
 * meekleurt (rood → oranje → groen → goud).
 */
export default function ScoreSlider({ value, onCommit, onClear }: Props) {
  const [pos, setPos] = useState<number>(value ?? 0);
  useEffect(() => setPos(value ?? 0), [value]);

  const set = pos >= 1; // onder de 1 = "weet ik nog niet"
  const label = set ? (Number.isInteger(pos) ? String(pos) : pos.toFixed(1)) : '–';
  const color = scoreColor(pos);
  const posPct = (pos / 10) * 100;

  const commit = () => { if (pos >= 1) onCommit(pos); else onClear(); };

  const trackBg = set
    ? `linear-gradient(90deg, transparent ${posPct}%, var(--surface-2) ${posPct}%), ${RAINBOW}`
    : 'linear-gradient(90deg, var(--info), var(--info))';

  const style = {
    '--track-bg': trackBg,
    '--thumb': set ? color : 'var(--info)',
  } as CSSProperties;

  return (
    <div className="score-slider">
      <div className="ss-top">
        <span className="ss-value" style={{ color: set ? color : 'var(--info)', opacity: set ? 1 : 0.6 }}>{label}</span>
        <span className="ss-hint muted">{set ? 'jouw cijfer' : 'Weet ik nog niet · sleep voor een cijfer'}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={pos}
        aria-label="Jouw cijfer voor deze serie"
        aria-valuetext={set ? `${label} van de 10` : 'Nog geen cijfer'}
        className={set ? '' : 'unset'}
        style={style}
        onChange={(e) => setPos(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <div className="ss-scale">
        <span>1</span><span>5</span><span>10</span>
      </div>
    </div>
  );
}
