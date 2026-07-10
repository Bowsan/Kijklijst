import type { Status } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
import { scoreColor, isGoldScore } from '../lib/score';

// Kleuren per status — gelijk aan de "Verdeling lijst" op het dashboard.
export const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  watching: { bg: 'color-mix(in srgb, var(--info) 16%, transparent)', fg: 'var(--info)' },
  finished: { bg: 'rgba(76,205,141,0.16)', fg: 'var(--good)' },
  want: { bg: 'rgba(255,209,102,0.18)', fg: 'var(--warn)' },
  // Grauw-rood: herkenbaar als "gestopt", maar met weinig verzadiging.
  dropped: { bg: 'rgba(178,110,110,0.16)', fg: '#b47b7b' },
};

/** Wit vinkje-in-cirkel voor de gevulde cijfer-pil. */
export function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.6" stroke="#fff" strokeWidth="1.6" />
      <path d="M5.1 8.3l2 2 3.8-4.3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Gekleurd statuslabel zodat je in één oogopslag ziet hoe een serie op jouw lijst staat. */
export default function StatusBadge({ status, score }: { status: Status; score?: number | null }) {
  // Afgezien mét cijfer: gevulde pil met vinkje, in de kleur van het cijfer.
  if (status === 'finished' && score != null) {
    return (
      <span
        className={isGoldScore(score) ? 'score-pill gold' : 'score-pill'}
        style={{ background: scoreColor(score) }}
        title="Jouw cijfer"
      >
        <CheckIcon />
        {score}
      </span>
    );
  }
  const c = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  return (
    <span
      style={{
        background: c.bg, color: c.fg, fontWeight: 700, fontSize: 12,
        padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
