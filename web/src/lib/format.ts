// Gedeelde formatteerhulpjes voor datums en getallen (NL-notatie).

/** Cijfer met één decimaal en een komma: 8.25 → "8,3". */
export function fmt1(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

/** Compact "hoe lang geleden": net / 5 min / 3 u / 2 d. */
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'net';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} u`;
  return `${Math.floor(h / 24)} d`;
}

/** Tijdstip vandaag ("14:32"), anders datum + tijd ("3 mrt 14:32"). */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  return `${date} ${time}`;
}

/** Volledige datum: "3 mrt 2026". */
export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ISO-datum ("YYYY-MM-DD") naar "3 mrt 2026"; leeg/ongeldig → null. */
export function fmtISODate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}
