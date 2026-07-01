import { useEffect, useState } from 'react';

interface Props {
  value: number | null;
  onCommit: (score: number) => void;
}

/**
 * Cijfer geven met een slider van 1 t/m 10 in halve stappen (7,5 / 8,5 …).
 * Tik ergens op de balk om de slider daar meteen neer te zetten, of sleep 'm.
 * Tijdens het slepen updatet alleen de weergave; pas bij loslaten slaan we op.
 */
export default function ScoreSlider({ value, onCommit }: Props) {
  const [local, setLocal] = useState<number | null>(value);
  useEffect(() => setLocal(value), [value]);

  const shown = local ?? 7;
  const pct = ((shown - 1) / 9) * 100;
  const label = local != null ? (Number.isInteger(local) ? String(local) : local.toFixed(1)) : '–';

  const commit = () => { if (local != null) onCommit(local); };

  return (
    <div className="score-slider">
      <div className="ss-top">
        <span className="ss-value" style={local == null ? { opacity: 0.35 } : undefined}>{label}</span>
        <span className="ss-hint muted">{local == null ? 'Tik of sleep om een cijfer te geven' : 'jouw cijfer'}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={shown}
        aria-label="Cijfer"
        style={{ background: local == null ? 'var(--surface-2)' : `linear-gradient(90deg, var(--accent) ${pct}%, var(--surface-2) ${pct}%)` }}
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
