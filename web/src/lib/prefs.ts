// Onthouden van de filter- en sorteerkeuzes op het lijstscherm (tussen bezoeken).
// De statustab valt hier bewust buiten: die springt bij openen terug naar "Alles".

export type SortKey = 'date' | 'name' | 'rating';
export type SortDir = 'asc' | 'desc';

export interface ListPrefs {
  friend: string;       // '' = Iedereen
  services: string[];
  genres: string[];
  sortKey: SortKey;
  sortDir: SortDir;
}

const KEY = 'opdebank.listPrefs';

export const DEFAULT_PREFS: ListPrefs = {
  friend: '',
  services: [],
  genres: [],
  sortKey: 'date',
  sortDir: 'desc',
};

export function loadPrefs(): ListPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    return {
      friend: typeof p.friend === 'string' ? p.friend : '',
      services: Array.isArray(p.services) ? p.services : [],
      genres: Array.isArray(p.genres) ? p.genres : [],
      sortKey: p.sortKey === 'name' || p.sortKey === 'rating' ? p.sortKey : 'date',
      sortDir: p.sortDir === 'asc' ? 'asc' : 'desc',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: ListPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* opslag vol of geblokkeerd — niet erg */
  }
}
