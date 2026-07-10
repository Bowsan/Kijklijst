import { useEffect, useState, type CSSProperties } from 'react';
import { scoreColor, isGoldScore } from '../lib/score';

interface Props {
  value: number | null;
  onCommit: (score: number) => void;
  onClear: () => void;
}

// Regenboog over de rating-zone (cijfer n = n·10% van de balk), volgens de
// schaal in lib/score.ts: donkerrood → rood → rood/oranje → lichtgroen →
// groen → geelgroen → goud.
const RAINBOW = 'linear-gradient(90deg, #7f1d1d 10%, #7f1d1d 30%, #dc2f2f 40%, #dc2f2f 50%, #e8703d 60%, #67b26f 70%, #1f9d5b 80%, #94a821 90%, #d4a017 100%)';

/**
 * Cijfer geven met een slider. Sleep 'm helemaal naar links (onder de 1) en
 * de balk wordt blauw + transparant: "Weet ik nog niet" (cijfer gewist).
 * Daarboven een cijfer van 1 t/m 10 in halve stappen, met een balk die
 * meekleurt; een 10 is goud en krijgt een shimmer.
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
        <span
          className={set && isGoldScore(pos) ? 'ss-value gold' : 'ss-value'}
          style={set && isGoldScore(pos) ? undefined : { color: set ? color : 'var(--info)', opacity: set ? 1 : 0.6 }}
        >{label}</span>
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
