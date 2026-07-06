import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db } from './db.js';

// Dagelijkse back-up van de SQLite-database, naast de database zelf (op het
// data-volume), zodat de lijsten en accounts een kapotte schrijf- of
// migratiefout overleven. We bewaren de laatste 14 dagen.
const KEEP_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

function backupDir(): string {
  const dbPath = process.env.DATABASE_PATH || './data/opdebank.sqlite';
  const dir = join(dirname(dbPath), 'backups');
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function runBackup(): Promise<void> {
  const dir = backupDir();
  const stamp = new Date().toISOString().slice(0, 10);
  const target = join(dir, `opdebank-${stamp}.sqlite`);

  // Al een back-up van vandaag? Dan niets doen (start + interval kunnen overlappen).
  try {
    if (statSync(target).size > 0) return;
  } catch { /* bestaat nog niet */ }

  await db.backup(target);
  console.log(`Back-up gemaakt: ${target}`);

  // Oude back-ups opruimen.
  const cutoff = Date.now() - KEEP_DAYS * DAY_MS;
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('opdebank-') || !f.endsWith('.sqlite')) continue;
    const full = join(dir, f);
    try {
      if (statSync(full).mtimeMs < cutoff) { unlinkSync(full); console.log(`Oude back-up opgeruimd: ${f}`); }
    } catch { /* overslaan */ }
  }
}

/** Start de dagelijkse back-up: meteen één keer, daarna elke 24 uur. */
export function scheduleBackups(): void {
  runBackup().catch((e) => console.warn('Back-up mislukt:', e?.message || e));
  setInterval(() => {
    runBackup().catch((e) => console.warn('Back-up mislukt:', e?.message || e));
  }, DAY_MS);
}
