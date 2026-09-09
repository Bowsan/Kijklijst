// Unit tests voor "welke seizoenen zijn er al echt?".
import test from 'node:test';
import assert from 'node:assert/strict';
import { uitgezondenSeizoenen } from '../dist/seasons.js';

const nu = Date.parse('2026-09-09T12:00:00Z');
const nummers = (lijst) => uitgezondenSeizoenen(lijst, nu).map((s) => s.season_number);

test('een aangekondigd seizoen zonder datum telt niet mee', () => {
  const lijst = [
    { season_number: 1, air_year: 2023, air_date: '2023-04-20' },
    { season_number: 2, air_year: 2025, air_date: '2025-10-16' },
    { season_number: 3, air_year: null, air_date: null }, // verlengd, nog geen datum
  ];
  assert.deepEqual(nummers(lijst), [1, 2]);
});

test('een seizoen met een datum in de toekomst telt niet mee', () => {
  const lijst = [
    { season_number: 1, air_year: 2025, air_date: '2025-01-05' },
    { season_number: 2, air_year: 2026, air_date: '2026-12-01' },
  ];
  assert.deepEqual(nummers(lijst), [1]);
});

test('een seizoen dat vandaag begint telt wel mee', () => {
  const lijst = [{ season_number: 1, air_year: 2026, air_date: '2026-09-09' }];
  assert.deepEqual(nummers(lijst), [1]);
});

test('zonder losse datum valt het terug op het jaartal', () => {
  const lijst = [
    { season_number: 1, air_year: 2024, air_date: null },
    { season_number: 2, air_year: 2027, air_date: null },
  ];
  assert.deepEqual(nummers(lijst), [1]);
});

test('weten we van geen enkel seizoen een datum, dan tellen ze allemaal', () => {
  // Handmatig toegevoegde series: de gebruiker geeft alleen het aantal op.
  const lijst = [
    { season_number: 1, air_year: null, air_date: null },
    { season_number: 2, air_year: null, air_date: null },
  ];
  assert.deepEqual(nummers(lijst), [1, 2]);
});

test('een lege lijst blijft leeg', () => {
  assert.deepEqual(nummers([]), []);
});

// ---- opruimen van markeringen die de oude detectie zette ----

import { nieuwSeizoenVervallen } from '../dist/seasons.js';

const vlag = Date.parse('2026-08-01T00:00:00Z');

test('vervallen: de vlag ging aan terwijl er al lang niets nieuws liep', () => {
  // Seizoen 3 liep in oktober 2025; de vlag van augustus 2026 hoort bij de
  // aankondiging van seizoen 4 en is dus onterecht.
  const lijst = [
    { season_number: 1, air_year: 2023, air_date: '2023-04-20' },
    { season_number: 2, air_year: 2024, air_date: '2024-10-31' },
    { season_number: 3, air_year: 2025, air_date: '2025-10-16' },
    { season_number: 4, air_year: null, air_date: null },
  ];
  assert.equal(nieuwSeizoenVervallen(lijst, vlag, nu), true);
});

test('blijft staan: het nieuwste seizoen begon vlak voor de vlag', () => {
  const lijst = [
    { season_number: 1, air_year: 2023, air_date: '2023-04-20' },
    { season_number: 2, air_year: 2026, air_date: '2026-07-20' },
  ];
  assert.equal(nieuwSeizoenVervallen(lijst, vlag, nu), false);
});

test('vervallen: er is nog helemaal niets uitgezonden', () => {
  // De datum is bekend en ligt in de toekomst — er valt niets te zien.
  const lijst = [{ season_number: 1, air_year: 2027, air_date: '2027-01-10' }];
  assert.equal(nieuwSeizoenVervallen(lijst, vlag, nu), true);
});

test('zonder losse datum beslist het jaartal', () => {
  // Nieuwste seizoen uit een eerder jaar dan de vlag → onterecht.
  assert.equal(nieuwSeizoenVervallen([{ season_number: 1, air_year: 2025, air_date: null }], vlag, nu), true);
  // Zelfde jaar → laten staan.
  assert.equal(nieuwSeizoenVervallen([{ season_number: 1, air_year: 2026, air_date: null }], vlag, nu), false);
});

test('zonder enige datumkennis blijft de vlag met rust', () => {
  // Handmatig toegevoegde serie: we kunnen er niets zinnigs over zeggen.
  const lijst = [{ season_number: 1 }, { season_number: 2 }];
  assert.equal(nieuwSeizoenVervallen(lijst, vlag, nu), false);
});

test('zonder vlag valt er niets op te ruimen', () => {
  assert.equal(nieuwSeizoenVervallen([{ season_number: 1, air_year: 2020 }], null, nu), false);
});
