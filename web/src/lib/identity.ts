// Low-key identiteit: een unieke code, lokaal bewaard, zonder account of wachtwoord.

const ID_KEY = 'opdebank.userId';
const BLIND_KEY = 'opdebank.blind';

export function getUserId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getBlind(): boolean {
  return localStorage.getItem(BLIND_KEY) === '1';
}

export function setBlind(value: boolean): void {
  localStorage.setItem(BLIND_KEY, value ? '1' : '0');
}

// Stabiele kleur per gebruiker, afgeleid van zijn code (voor de initiaal-avatar).
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 60% 55%)`;
}
