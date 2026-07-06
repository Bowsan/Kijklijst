import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db } from './db.js';

// Web push zonder handmatige setup: het VAPID-sleutelpaar wordt bij de eerste
// start gegenereerd en op het data-volume bewaard, zodat abonnementen geldig
// blijven over herstarts en deploys heen.

let keys: { publicKey: string; privateKey: string } | null = null;

function keyFile(): string {
  const dbPath = process.env.DATABASE_PATH || './data/opdebank.sqlite';
  return join(dirname(dbPath), 'vapid.json');
}

export function initPush(): void {
  try {
    const file = keyFile();
    if (existsSync(file)) {
      keys = JSON.parse(readFileSync(file, 'utf8'));
    } else {
      keys = webpush.generateVAPIDKeys();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(keys));
      console.log('VAPID-sleutels gegenereerd voor web push.');
    }
    webpush.setVapidDetails('mailto:opdebank@derwort.nl', keys!.publicKey, keys!.privateKey);
  } catch (e: any) {
    console.warn('Web push niet beschikbaar:', e?.message || e);
    keys = null;
  }
}

export function pushPublicKey(): string | null {
  return keys?.publicKey ?? null;
}

export function saveSubscription(userId: string, sub: any): void {
  if (!sub?.endpoint) throw new Error('ongeldig abonnement');
  db.prepare(
    `INSERT INTO push_subs (endpoint, user_id, subscription, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription = excluded.subscription`
  ).run(sub.endpoint, userId, JSON.stringify(sub), Date.now());
}

export function removeSubscription(endpoint: string): void {
  db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint);
}

export interface PushPayload { title: string; body: string; url?: string }

/** Stuur een melding naar alle apparaten van de opgegeven gebruikers.
 *  Vervallen abonnementen (410/404) worden stilletjes opgeruimd. */
export function sendPushTo(userIds: string[], payload: PushPayload): void {
  if (!keys || userIds.length === 0) return;
  const unique = [...new Set(userIds)];
  const rows = db
    .prepare(`SELECT endpoint, subscription FROM push_subs WHERE user_id IN (${unique.map(() => '?').join(',')})`)
    .all(...unique) as { endpoint: string; subscription: string }[];

  const body = JSON.stringify(payload);
  for (const row of rows) {
    let sub: any;
    try { sub = JSON.parse(row.subscription); } catch { continue; }
    webpush.sendNotification(sub, body).catch((err: any) => {
      if (err?.statusCode === 404 || err?.statusCode === 410) removeSubscription(row.endpoint);
    });
  }
}
