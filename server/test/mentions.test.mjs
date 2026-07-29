// Unit tests voor het herkennen van "@naam" in prikbordberichten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findMentions, mentionedUserIds } from '../dist/mentions.js';

const profielen = [
  { id: 'u-bowie', name: 'Bowie' },
  { id: 'u-anna', name: 'Anna' },
  { id: 'u-annemarie', name: 'Anne Marie' },
];

const genoemd = (t) => findMentions(t, profielen).map((h) => h.userId);

test('herkent een vermelding midden in een zin', () => {
  assert.deepEqual(genoemd('Kijk jij dit ook @Anna?'), ['u-anna']);
});

test('is niet kieskeurig over hoofdletters', () => {
  assert.deepEqual(genoemd('hey @BOWIE'), ['u-bowie']);
});

test('kiest de langste naam bij overlap', () => {
  // "@Anne Marie" mag niet als "@Anne" (voornaam van Anne Marie) eindigen.
  const hits = findMentions('dag @Anne Marie', profielen);
  assert.deepEqual(hits.map((h) => h.userId), ['u-annemarie']);
  assert.equal('dag @Anne Marie'.slice(hits[0].start, hits[0].end), '@Anne Marie');
});

test('een voornaam alleen werkt ook', () => {
  assert.deepEqual(genoemd('@Anne wat vond jij?'), ['u-annemarie']);
});

test('negeert een @ midden in een woord (e-mailadres)', () => {
  assert.deepEqual(genoemd('mail me op bowie@anna.nl'), []);
});

test('matcht geen naam die deel is van een langer woord', () => {
  assert.deepEqual(genoemd('@Annabel is iemand anders'), []);
});

test('meerdere mensen in één bericht', () => {
  assert.deepEqual(genoemd('@Bowie en @Anna moeten dit zien'), ['u-bowie', 'u-anna']);
});

test('onbekende naam levert niets op', () => {
  assert.deepEqual(genoemd('@Niemand hallo'), []);
});

test('mentionedUserIds ontdubbelt en laat de schrijver zelf weg', () => {
  const ids = mentionedUserIds('@Anna @Anna en @Bowie', profielen, 'u-bowie');
  assert.deepEqual(ids, ['u-anna']);
});

test('lege of ongeldige invoer breekt niet', () => {
  assert.deepEqual(findMentions('', profielen), []);
  assert.deepEqual(findMentions('geen apenstaartje hier', profielen), []);
  assert.deepEqual(findMentions('@', profielen), []);
});
