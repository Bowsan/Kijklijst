// Low-key identiteit: een unieke code, lokaal bewaard, zonder account of wachtwoord.

const ID_KEY = 'opdebank.userId';
const BLIND_KEY = 'opdebank.blind';
const THEME_KEY = 'opdebank.theme';

export type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  // Standaard lichte modus; alleen wie zelf 'donker' koos, houdt donker.
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

// Pas het thema toe op het document (CSS leest dit via [data-theme]).
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // Laat de browser-chrome (statusbalk) meekleuren met het thema.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f5f7' : '#0f1115');
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

export function logout(): void {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(BLIND_KEY);
}

// Stabiele kleur per gebruiker, afgeleid van zijn code (voor de initiaal-avatar).
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 60% 55%)`;
}
