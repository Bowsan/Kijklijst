// Low-key identiteit: een unieke code, lokaal bewaard, zonder account of wachtwoord.

const ID_KEY = 'opdebank.userId';
const BLIND_KEY = 'opdebank.blind';
const THEME_KEY = 'opdebank.theme';
const SEEN_KEY = 'opdebank.activitySeen';

// Wanneer je de log/notificaties voor het laatst opende — bepaalt het bolletje.
export function getActivitySeen(): number {
  return Number(localStorage.getItem(SEEN_KEY) || 0);
}
export function setActivitySeen(ts: number): void {
  localStorage.setItem(SEEN_KEY, String(ts));
}

// Wanneer je de "Voor jou"-pagina voor het laatst opende — bepaalt de tab-badge.
const FORYOU_SEEN_KEY = 'opdebank.forYouSeen';
export function getForYouSeen(): number {
  return Number(localStorage.getItem(FORYOU_SEEN_KEY) || 0);
}
export function setForYouSeen(ts: number): void {
  localStorage.setItem(FORYOU_SEEN_KEY, String(ts));
}

export type Theme = 'dark' | 'light' | 'system';

export function getTheme(): Theme {
  // Standaard lichte modus; 'system' volgt het apparaat.
  const v = localStorage.getItem(THEME_KEY);
  return v === 'dark' || v === 'system' ? v : 'light';
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

/** Vertaal de keuze naar wat er daadwerkelijk getoond wordt. */
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Pas het thema toe op het document (CSS leest dit via [data-theme]).
export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  // Laat de browser-chrome (statusbalk) meekleuren met het thema.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f4f5f7' : '#0f1115');
}

// Bij 'system': live meeschakelen als het apparaat van licht/donker wisselt.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getTheme() === 'system') applyTheme('system');
  });
}

export function getUserId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

// Het lokale account overschrijven met een bestaand account-id (bijv. bij
// inloggen op een tweede apparaat met dezelfde naam).
export function setUserId(id: string): void {
  localStorage.setItem(ID_KEY, id);
}

export function getBlind(): boolean {
  return localStorage.getItem(BLIND_KEY) === '1';
}

export function setBlind(value: boolean): void {
  localStorage.setItem(BLIND_KEY, value ? '1' : '0');
}

// Simpele modus: een kaal kijklijstje in plaats van de volledige app. Per apparaat.
const SIMPLE_KEY = 'opdebank.simpleMode';
export function getSimpleMode(): boolean {
  return localStorage.getItem(SIMPLE_KEY) === '1';
}
export function setSimpleMode(value: boolean): void {
  localStorage.setItem(SIMPLE_KEY, value ? '1' : '0');
}

export function logout(): void {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(BLIND_KEY);
  localStorage.removeItem(SIMPLE_KEY);
}

// Stabiele kleur per gebruiker, afgeleid van zijn code (voor de initiaal-avatar).
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 60% 55%)`;
}

// Onboarding één keer tonen: vlag per apparaat.
export const isOnboarded = () => localStorage.getItem('opdebank.onboarded') === '1';
export const setOnboarded = () => localStorage.setItem('opdebank.onboarded', '1');
