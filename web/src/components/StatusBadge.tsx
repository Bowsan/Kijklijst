import type { Status } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';

// Kleuren per status — gelijk aan de "Verdeling lijst" op het dashboard.
export const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  watching: { bg: 'rgba(255,92,124,0.16)', fg: 'var(--accent)' },
  finished: { bg: 'rgba(76,205,141,0.16)', fg: 'var(--good)' },
  want: { bg: 'rgba(255,209,102,0.18)', fg: 'var(--warn)' },
  dropped: { bg: 'rgba(154,163,178,0.16)', fg: 'var(--muted)' },
};

/** Gekleurd statuslabel zodat je in één oogopslag ziet hoe een serie op jouw lijst staat. */
export default function StatusBadge({ status, score }: { status: Status; score?: number | null }) {
  const c = STATUS_COLORS[status];
  const label = status === 'finished' && score != null ? `✅ ${score}` : STATUS_LABELS[status];
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
