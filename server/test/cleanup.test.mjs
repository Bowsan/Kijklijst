// Opruimen van "nieuw seizoen"-markeringen tegen een echte database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'opruim-'));
process.env.DATABASE_PATH = join(scratch, 'db.sqlite');

const { db } = await import('../dist/db.js');
const { opschonenValseNieuweSeizoenen } = await import('../dist/cleanup.js');

const nu = Date.now();
const dagen = (n) => new Date(nu - n * 24 * 3600 * 1000).toISOString().slice(0, 10);
const s = (n, datum) => ({
  season_number: n, episode_count: 8, name: `S${n}`,
  air_year: datum ? Number(datum.slice(0, 4)) : null, air_date: datum,
});

const zetTitel = db.prepare(`INSERT INTO titles
  (tmdb_id, name, year, poster_path, genres, seasons, episode_count, runtime, providers, overview, cast, added_by, created_at, new_season_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const zetLog = db.prepare('INSERT INTO activity (id, type, user_id, title_id, meta, created_at) VALUES (?,?,?,?,?,?)');

// 1) Alleen aangekondigd: seizoen 3 liep vorig jaar, seizoen 4 heeft nog geen datum.
zetTitel.run(1, 'Aangekondigd', 2022, null, '[]',
  JSON.stringify([s(1, dagen(1200)), s(2, dagen(800)), s(3, dagen(330)), s(4, null)]),
  24, 50, '[]', '', '[]', 'u1', nu, nu - 1000);
zetLog.run('a1', 'new_season', '', 1, '{}', nu - 900);
// Een oudere, terechte melding bij dezelfde serie moet blijven staan.
zetLog.run('a0', 'new_season', '', 1, '{}', nu - 400 * 24 * 3600 * 1000);

// 2) Echt nieuw seizoen: begon een maand geleden, vlak voor de markering.
zetTitel.run(2, 'Echt nieuw', 2022, null, '[]',
  JSON.stringify([s(1, dagen(700)), s(2, dagen(30))]),
  16, 50, '[]', '', '[]', 'u1', nu, nu - 1000);
zetLog.run('b1', 'new_season', '', 2, '{}', nu - 900);

// 3) Handmatig toegevoegde serie zonder datums: laten staan, we weten het niet.
zetTitel.run(-3, 'Handmatig', null, null, '[]',
  JSON.stringify([{ season_number: 1, episode_count: 0, name: 'Seizoen 1', air_year: null }]),
  null, null, '[]', '', '[]', 'u1', nu, nu - 1000);

// 4) Zonder markering: niet aanraken.
zetTitel.run(4, 'Rustig', 2020, null, '[]', JSON.stringify([s(1, dagen(2000))]),
  8, 50, '[]', '', '[]', 'u1', nu, null);

const vlagVan = (id) => db.prepare('SELECT new_season_at FROM titles WHERE tmdb_id = ?').get(id).new_season_at;
const logsVan = (id) => db.prepare("SELECT id FROM activity WHERE type = 'new_season' AND title_id = ?").all(id).map((r) => r.id);

test('ruimt alleen de onterechte markeringen op', () => {
  const aantal = opschonenValseNieuweSeizoenen(nu);
  assert.equal(aantal, 1);
  assert.equal(vlagVan(1), null, 'aangekondigd seizoen: markering hoort weg');
  assert.notEqual(vlagVan(2), null, 'echt nieuw seizoen: markering hoort te blijven');
  assert.notEqual(vlagVan(-3), null, 'handmatige serie: niet aanraken');
  assert.equal(vlagVan(4), null);
});

test('haalt de bijbehorende logregel weg, maar niet de oudere melding', () => {
  assert.deepEqual(logsVan(1), ['a0']);
  assert.deepEqual(logsVan(2), ['b1']);
});

test('een tweede keer draaien verandert niets meer', () => {
  assert.equal(opschonenValseNieuweSeizoenen(nu), 0);
});

test('series en beoordelingen blijven volledig intact', () => {
  const namen = db.prepare('SELECT name FROM titles ORDER BY tmdb_id').all().map((r) => r.name);
  assert.deepEqual(namen, ['Handmatig', 'Aangekondigd', 'Echt nieuw', 'Rustig']);
});

test.after(() => rmSync(scratch, { recursive: true, force: true }));
