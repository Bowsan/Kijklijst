// De seizoenronde: wie is er aan de beurt, en blijft hij lopen?
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'ronde-'));
process.env.DATABASE_PATH = join(scratch, 'db.sqlite');

const { db, metaSetNumber } = await import('../dist/db.js');
const { teVerversenTitels, rondeNodig, laatsteRonde, MAX_PER_RONDE, RONDE_INTERVAL } = await import('../dist/titles.js');
const { vulGemeldeSeizoenen } = await import('../dist/cleanup.js');

const nu = Date.parse('2026-10-10T12:00:00Z');
const uur = 3600 * 1000;
const dag = 24 * uur;

const zet = db.prepare(`INSERT INTO titles
  (tmdb_id, name, year, poster_path, genres, seasons, episode_count, runtime, providers, overview, cast, added_by, created_at, tmdb_status, refreshed_at)
  VALUES (?,?,?,?,?,'[]',?,?,?,?,?,?,?,?,?)`);
const titel = (id, naam, status, refreshed) =>
  zet.run(id, naam, 2020, null, '[]', 8, 50, '[]', '', '[]', 'u1', nu, status, refreshed);

titel(1, 'Lopend, lang niet gezien', 'Returning Series', nu - 3 * dag);
titel(2, 'Lopend, net gezien', 'Returning Series', nu - 2 * uur);
titel(3, 'Afgelopen, gisteren gezien', 'Ended', nu - dag - uur);
titel(4, 'Afgelopen, maand niet gezien', 'Ended', nu - 30 * dag);
titel(5, 'Nog nooit ververst', null, null);
titel(6, 'Status onbekend, oud', null, nu - 5 * dag);
titel(-7, 'Handmatig toegevoegd', null, null); // negatief id: niet bij TMDb te halen

test('lopende series dagelijks, net ververste series niet', () => {
  const beurt = teVerversenTitels(nu);
  assert.ok(beurt.includes(1), 'lopende serie van 3 dagen oud hoort erbij');
  assert.ok(!beurt.includes(2), 'serie van 2 uur oud is recent genoeg');
  assert.ok(beurt.includes(6), 'onbekende status telt als lopend');
});

test('ook een afgelopen serie komt aan de beurt, alleen minder vaak', () => {
  // Dit is de blinde vlek die er eerder was: "Ended" werd nooit meer bekeken,
  // dus een verlenging viel nooit op.
  const beurt = teVerversenTitels(nu);
  assert.ok(!beurt.includes(3), 'een dag oud is voor een afgelopen serie te vers');
  assert.ok(beurt.includes(4), 'na twee weken moet ook een afgelopen serie langs');
});

test('nooit ververste series gaan voor, handmatige series blijven buiten', () => {
  const beurt = teVerversenTitels(nu);
  assert.equal(beurt[0], 5, 'nog nooit ververst hoort vooraan te staan');
  assert.ok(!beurt.includes(-7), 'een handmatige serie valt niet bij TMDb op te halen');
});

test('een ronde pakt nooit meer dan het maximum', () => {
  for (let i = 0; i < MAX_PER_RONDE + 20; i++) titel(100 + i, `Serie ${i}`, 'Returning Series', nu - 9 * dag);
  const beurt = teVerversenTitels(nu);
  assert.equal(beurt.length, MAX_PER_RONDE);
  // Langst niet nagekeken eerst, zodat niets blijft liggen.
  assert.equal(beurt[0], 5);
});

test('de ronde is aan de beurt als hij nog nooit liep', () => {
  assert.equal(laatsteRonde(), null);
  assert.equal(rondeNodig(nu), true);
});

test('net gelopen: niet opnieuw; te lang geleden: wel', () => {
  metaSetNumber('season_sweep_at', nu - uur);
  assert.equal(rondeNodig(nu), false);
  assert.equal(laatsteRonde(), nu - uur);
  metaSetNumber('season_sweep_at', nu - RONDE_INTERVAL - 1000);
  assert.equal(rondeNodig(nu), true);
});

test('de stand wordt eenmalig vastgelegd en daarna niet meer aangeraakt', () => {
  const eerste = vulGemeldeSeizoenen(nu);
  assert.ok(eerste > 0, 'eerste keer vult alle lege standen');
  assert.equal(vulGemeldeSeizoenen(nu), 0, 'tweede keer valt er niets te vullen');
  const leeg = db.prepare('SELECT COUNT(*) c FROM titles WHERE announced_season IS NULL').get().c;
  assert.equal(leeg, 0);
});

test.after(() => rmSync(scratch, { recursive: true, force: true }));
