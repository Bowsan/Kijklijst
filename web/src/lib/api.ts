import { getUserId } from './identity';
import type { Snapshot, SearchResult, Title, Status, Message } from './types';

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

// De nieuwste series ophalen bij TMDb (voor de ontdek-sectie in "Voor jou").
export async function discoverNewTv(): Promise<SearchResult[]> {
  const res = await fetch('/api/tmdb/new', { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

/** "Als je dit leuk vindt…" — aanbevelingen bij één serie (server cachet). */
export async function fetchSimilar(tmdbId: number): Promise<SearchResult[]> {
  const res = await fetch(`/api/similar?tmdb_id=${tmdbId}`, { headers: headers() });
  if (!res.ok) return [];
  return (await res.json()).results ?? [];
}

export interface SuggestPerson {
  name: string;
  photo: string | null;
}

export interface PersonSuggestion {
  tmdb_id: number;
  name: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  actors: SuggestPerson[];
  creators: SuggestPerson[];
  popularity: number;
  vote?: number | null;
  vote_count?: number | null;
  imdb?: number | null;
}

// Series (TMDb-breed) met jouw favoriete acteurs/makers, voor "Van jouw favorieten".
export async function discoverByPeople(actors: string[], creators: string[]): Promise<PersonSuggestion[]> {
  if (actors.length === 0 && creators.length === 0) return [];
  const qs = new URLSearchParams({ actors: actors.join(','), creators: creators.join(',') });
  const res = await fetch(`/api/tmdb/people?${qs}`, { headers: headers() });
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
  /** Kort persoonlijk notitieregeltje (simpele modus). '' wist de notitie. */
  watchNote?: string;
}

export const saveRating = (u: RatingUpdate) => post('/api/rating', u);
// Cijfer wissen ("weet ik nog niet"), zonder de rest van de beoordeling te raken.
export const clearRatingScore = (tmdb_id: number) => post('/api/rating', { tmdb_id, clearScore: true });
export async function removeRating(tmdbId: number): Promise<any> {
  const res = await fetch(`/api/rating/${tmdbId}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
export const saveProfile = (p: { name: string; avatar?: string | null; color?: string | null; services?: string[] }) =>
  post('/api/profile', p);
export const identify = (name: string): Promise<{ id: string | null }> => post('/api/identify', { name });
export const sendRecommendation = (r: { to_user: string; tmdb_id: number; note?: string }) =>
  post('/api/recommendation', r);
export const dismissRecommendation = (id: string) => post(`/api/recommendation/${id}/dismiss`, {});
export const respondRecommendation = (id: string, response: 'thanks' | 'meh' | null) =>
  post(`/api/recommendation/${id}/respond`, { response });

// ---- Berichten (privé, dus niet in de gedeelde snapshot) ----
export async function fetchMessages(): Promise<Message[]> {
  const res = await fetch('/api/messages', { headers: headers() });
  if (!res.ok) return [];
  return (await res.json()).messages ?? [];
}
export const sendMessage = (to_user: string, text: string) => post('/api/message', { to_user, text });
export const markMessagesRead = (with_user: string) => post('/api/messages/read', { with_user });
// Eigen tip terugtrekken of de opmerking erbij aanpassen.
export async function withdrawRecommendation(id: string): Promise<any> {
  const res = await fetch(`/api/recommendation/${id}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
export const setRecommendationNote = (id: string, note: string) => post(`/api/recommendation/${id}/note`, { note });
export const toggleReaction = (tmdb_id: number, emoji: string) => post('/api/reaction', { tmdb_id, emoji });
export const createManualTitle = (name: string, service?: string, seasons?: number): Promise<{ tmdb_id: number }> =>
  post('/api/title/manual', { name, service, seasons });
// Serie-info aanvullen via een IMDb-link (TMDb → TVmaze).
export const enrichTitle = (id: number, imdb: string): Promise<{ found: boolean; source?: string }> =>
  post(`/api/title/${id}/enrich`, { imdb });
// Serie-info handmatig invullen (jaar, genres, cover, omschrijving).
export const setTitleMeta = (id: number, meta: { year?: number | null; genres?: string; poster?: string; overview?: string }) =>
  post(`/api/title/${id}/meta`, meta);
// Serie-info handmatig bijwerken bij TMDb (op de achtergrond).
export const refreshTitles = (): Promise<{ ok: boolean; count: number }> => post('/api/refresh-titles', {});
export const addComment = (tmdb_id: number, text: string) => post('/api/comment', { tmdb_id, text });
// Emoji-reactie op een prikbordbericht (aan/uit).
export const toggleCommentReaction = (id: string, emoji: string) => post(`/api/comment/${id}/reaction`, { emoji });

// ---- Web push: aan/uit per apparaat ----
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function enablePush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const res = await fetch('/api/push/pubkey', { headers: headers() });
  if (!res.ok) return false;
  const { key } = await res.json();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  await post('/api/push/subscribe', { subscription: sub.toJSON() });
  return true;
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

export async function isPushEnabled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}
export async function removeComment(id: string): Promise<any> {
  const res = await fetch(`/api/comment/${id}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
// Een profiel verbergen of weer tonen in de volglijst.
export const setProfileHidden = (id: string, hidden: boolean) => post(`/api/profile/${id}/hidden`, { hidden });
export const followUser = (followee: string) => post('/api/follow', { followee });
export async function unfollowUser(followee: string): Promise<any> {
  const res = await fetch(`/api/follow/${followee}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

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
