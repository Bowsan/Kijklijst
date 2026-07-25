// Vaste keuzelijsten van het lijstscherm: statustabs en sorteeropties.
import type { SortKey, SortDir } from './prefs';

/** De vier tabs boven de lijst. */
export type StatusTab = 'all' | 'want' | 'watching' | 'finished';
/** Statustab plus de twee overloop-filters uit het filterpaneel. */
export type StatusValue = StatusTab | 'dropped' | 'notdone';

export const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'Alles' },
  { key: 'want', label: 'Wishlist' },
  { key: 'watching', label: 'Mee bezig' },
  { key: 'finished', label: 'Gezien' },
];

// Eén optie per sleutel; de richting togglet door dezelfde optie opnieuw te
// kiezen (het pijltje toont welke kant op). De `dir` is de standaardrichting.
export const SORT_OPTIONS: { key: SortKey; label: string; dir: SortDir }[] = [
  { key: 'name', label: 'Alfabetisch', dir: 'asc' },
  { key: 'date', label: 'Gewijzigd', dir: 'desc' },
  { key: 'release', label: 'Uitgave', dir: 'desc' },
  { key: 'rating', label: 'Rating', dir: 'desc' },
  { key: 'imdb', label: 'IMDb Rating', dir: 'desc' },
];

export function sortLabel(key: SortKey): string {
  return SORT_OPTIONS.find((o) => o.key === key)?.label ?? 'Gewijzigd';
}

/** Naam van de actieve statustab, voor de zoek-placeholder ("Zoek in Gezien"). */
export function statusTabLabel(status: StatusValue): string {
  return STATUS_TABS.find((s) => s.key === status)?.label ?? 'deze lijst';
}
