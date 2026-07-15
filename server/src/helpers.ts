// Kleine gedeelde databasehulpjes voor routes en onderhoudstaken.
import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export function logActivity(type: string, user_id: string, title_id: number | null, meta: object = {}): void {
  db.prepare(
    'INSERT INTO activity (id, type, user_id, title_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), type, user_id, title_id, JSON.stringify(meta), Date.now());
}

// Hulpjes voor pushmeldingen: naam opzoeken + wie een serie op de lijst heeft.
export function nameOf(uid: string): string {
  const p: any = db.prepare('SELECT name FROM profiles WHERE id = ?').get(uid);
  return p?.name || 'Iemand';
}
export function titleNameOf(tmdbId: number): string {
  const t: any = db.prepare('SELECT name FROM titles WHERE tmdb_id = ?').get(tmdbId);
  return t?.name || 'een serie';
}
export function listersOf(tmdbId: number): string[] {
  return (db.prepare('SELECT user_id FROM ratings WHERE title_id = ?').all(tmdbId) as any[]).map((r) => r.user_id);
}
