// Wanneer melden we een nieuw seizoen? Deze regels bepalen of een alert komt,
// en zijn de reden dat we de gemelde stand in de database bijhouden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seizoenMelding, nieuwsteUitgezondenSeizoen } from '../dist/seasons.js';

const s = (n, datum) => ({
  season_number: n, episode_count: 8, name: `S${n}`,
  air_year: datum ? Number(datum.slice(0, 4)) : null, air_date: datum,
});

const vorigJaar = '2025-10-16';
const straks = '2026-11-01';
const zojuist = '2026-10-01';
const nu = Date.parse('2026-10-10T12:00:00Z');
const naAanvang = Date.parse('2026-11-02T12:00:00Z');

test('nieuwsteUitgezondenSeizoen slaat een seizoen over dat nog moet beginnen', () => {
  assert.equal(nieuwsteUitgezondenSeizoen([s(1, vorigJaar), s(2, straks)], nu), 1);
  assert.equal(nieuwsteUitgezondenSeizoen([s(1, vorigJaar), s(2, straks)], naAanvang), 2);
  assert.equal(nieuwsteUitgezondenSeizoen([], nu), 0);
});

// Dit is het geval dat eerder stilletjes misging: TMDb zet seizoen 2 al in de
// lijst voordat het begint. Op de dag dat het echt begint verandert de lijst
// niet meer, dus een vergelijking tussen twee momentopnamen ziet geen verschil
// en er kwam nooit een melding.
test('meldt een seizoen dat al in de lijst stond maar nu pas begonnen is', () => {
  const lijst = [s(1, vorigJaar), s(2, straks)];
  // Vandaag: seizoen 2 loopt nog niet, we hebben seizoen 1 gemeld.
  assert.deepEqual(seizoenMelding(1, lijst, lijst, nu), { melden: null, gemeldNu: 1 });
  // Na de startdatum, zonder dat TMDb iets veranderde: nú moet de melding komen.
  assert.deepEqual(seizoenMelding(1, lijst, lijst, naAanvang), { melden: 2, gemeldNu: 2 });
});

test('meldt niet twee keer voor hetzelfde seizoen', () => {
  const lijst = [s(1, vorigJaar), s(2, zojuist)];
  assert.deepEqual(seizoenMelding(2, lijst, lijst, nu), { melden: null, gemeldNu: 2 });
});

test('meldt een seizoen dat TMDb er pas bij zet als het al loopt', () => {
  const oud = [s(1, vorigJaar)];
  const vers = [s(1, vorigJaar), s(2, zojuist)];
  assert.deepEqual(seizoenMelding(1, oud, vers, nu), { melden: 2, gemeldNu: 2 });
});

test('eerste keer zonder vastgelegde stand: alleen vastleggen, niet melden', () => {
  // Zo voorkomen we dat de eerste ronde na deze wijziging alles tegelijk meldt.
  const lijst = [s(1, vorigJaar), s(2, zojuist), s(3, straks)];
  assert.deepEqual(seizoenMelding(null, lijst, lijst, nu), { melden: null, gemeldNu: 2 });
});

test('een aangekondigd seizoen levert nooit meteen een melding op', () => {
  const oud = [s(1, vorigJaar)];
  const vers = [s(1, vorigJaar), s(2, straks)]; // net aangekondigd
  assert.deepEqual(seizoenMelding(1, oud, vers, nu), { melden: null, gemeldNu: 1 });
});

test('verdwijnt een seizoen bij TMDb, dan zakt de gemelde stand niet', () => {
  // Anders zou dezelfde serie later een tweede melding voor seizoen 2 krijgen.
  assert.deepEqual(seizoenMelding(2, [s(1, vorigJaar)], [s(1, vorigJaar)], nu), { melden: null, gemeldNu: 2 });
});
