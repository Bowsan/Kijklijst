import { getUserId } from './identity';
import type { Snapshot, SearchResult, Title, Status } from './types';

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-user-id': getUserId(),
  };
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export async function fetchState(): Promise<Snapshot> {
  const res = await fetch('/api/state', { headers: headers() });
  if (!res.ok) throw new Error('kon lijst niet laden');
  return res.json();
}

export async function searchTmdb(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`, { signal, headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchTitleDetails(id: number): Promise<Title> {
  const res = await fetch(`/api/tmdb/tv/${id}`, { headers: headers() });
  if (!res.ok) throw new Error('kon details niet laden');
  return res.json();
}

export interface RatingUpdate {
  tmdb_id: number;
  score?: number;
  status?: Status;
  note?: string;
  service?: string;
  seasons?: number[];
}

export const saveRating = (u: RatingUpdate) => post('/api/rating', u);
export async function removeRating(tmdbId: number): Promise<any> {
  const res = await fetch(`/api/rating/${tmdbId}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
export const saveProfile = (p: { name: string; avatar?: string | null; color?: string | null; services?: string[] }) =>
  post('/api/profile', p);
export const sendRecommendation = (r: { to_user: string; tmdb_id: number; note?: string }) =>
  post('/api/recommendation', r);
export const dismissRecommendation = (id: string) => post(`/api/recommendation/${id}/dismiss`, {});
export const toggleReaction = (tmdb_id: number, emoji: string) => post('/api/reaction', { tmdb_id, emoji });

// Realtime: luister naar wijzigingen van anderen via Server-Sent Events.
export function subscribe(onChange: () => void): () => void {
  let es: EventSource | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;
    es = new EventSource('/api/stream');
    es.addEventListener('state', onChange);
    es.addEventListener('profile', onChange);
    es.onerror = () => {
      es?.close();
      if (!closed) setTimeout(connect, 3000);
    };
  };
  connect();

  return () => {
    closed = true;
    es?.close();
  };
}
