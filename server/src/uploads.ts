import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db } from './db.js';

// Geüploade afbeeldingen (avatars, covers) horen niet als base64 in de database:
// ze maken elke snapshot zwaar. We schrijven ze als bestand op het data-volume
// en bewaren alleen het pad ("/uploads/…"). De migratie hieronder zet bestaande
// data-URI's eenmalig om — de originele rij wordt pas bijgewerkt nadat het
// bestand succesvol is geschreven, zodat er nooit data verloren gaat.

export function uploadsDir(): string {
  const dbPath = process.env.DATABASE_PATH || './data/opdebank.sqlite';
  const dir = join(dirname(dbPath), 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Schrijf een data-URI naar een bestand en geef het publieke pad terug.
 *  Geen (geldige) data-URI? Dan komt de invoer ongewijzigd terug. */
export function storeDataUri(input: string | null | undefined, prefix: string): string | null {
  if (!input) return input ?? null;
  const m = input.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/s);
  if (!m) return input;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) return input;
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const name = `${prefix}-${hash}.${ext}`;
  writeFileSync(join(uploadsDir(), name), buf);
  return `/uploads/${name}`;
}

/** Eenmalig bestaande base64-afbeeldingen in de database omzetten naar bestanden. */
export function migrateDataUrisToFiles(): void {
  let moved = 0;

  const profiles = db.prepare("SELECT id, avatar FROM profiles WHERE avatar LIKE 'data:image/%'").all() as any[];
  for (const p of profiles) {
    try {
      const path = storeDataUri(p.avatar, 'avatar');
      if (path && path.startsWith('/uploads/')) {
        db.prepare('UPDATE profiles SET avatar = ? WHERE id = ?').run(path, p.id);
        moved++;
      }
    } catch { /* avatar blijft als data-URI staan — geen dataverlies */ }
  }

  const titles = db.prepare("SELECT tmdb_id, poster_path FROM titles WHERE poster_path LIKE 'data:image/%'").all() as any[];
  for (const t of titles) {
    try {
      const path = storeDataUri(t.poster_path, 'poster');
      if (path && path.startsWith('/uploads/')) {
        db.prepare('UPDATE titles SET poster_path = ? WHERE tmdb_id = ?').run(path, t.tmdb_id);
        moved++;
      }
    } catch { /* cover blijft als data-URI staan */ }
  }

  if (moved) console.log(`Uploads-migratie: ${moved} afbeelding(en) naar bestanden verplaatst.`);
}
