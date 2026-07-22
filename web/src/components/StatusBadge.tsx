import type { Status } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
import { scoreColor, isGoldScore } from '../lib/score';
import { fmt1 } from '../lib/format';

// Kleuren per status — gelijk aan de "Verdeling lijst" op het dashboard.
export const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  watching: { bg: 'color-mix(in srgb, var(--info) 16%, transparent)', fg: 'var(--info)' },
  finished: { bg: 'rgba(76,205,141,0.16)', fg: 'var(--good)' },
  want: { bg: 'rgba(255,209,102,0.18)', fg: 'var(--warn)' },
  // Grauw-rood: herkenbaar als "gestopt", maar met weinig verzadiging.
  dropped: { bg: 'rgba(178,110,110,0.16)', fg: '#b47b7b' },
};

/** Vinkje-in-cirkel, in te kleuren (wit op de gevulde pil, groen op tinten). */
export function CheckIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.6" stroke={color} strokeWidth="1.6" />
      <path d="M5.1 8.3l2 2 3.8-4.3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Gekleurd statuslabel zodat je in één oogopslag ziet hoe een serie op jouw lijst staat. */
export default function StatusBadge({ status, score }: { status: Status | null; score?: number | null }) {
  // Mét cijfer: gevulde pil in de cijferkleur (status staat hier los van).
  if (score != null) {
    return (
      <span
        className={isGoldScore(score) ? 'score-pill gold' : 'score-pill'}
        style={{ background: scoreColor(score) }}
        title="Jouw cijfer"
      >
        <CheckIcon />
        {fmt1(score)}
      </span>
    );
  }
  if (!status) return null;
  const c = STATUS_COLORS[status];
  // Gezien zonder cijfer: alleen het vinkje, in stijl met de cijfer-pil.
  const label = status === 'finished' ? <CheckIcon color="var(--good)" /> : STATUS_LABELS[status];
  return (
    <span
      style={{
        background: c.bg, color: c.fg, fontWeight: 700, fontSize: 12,
        padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center',
      }}
      title={STATUS_LABELS[status]}
    >
      {label}
    </span>
  );
}
