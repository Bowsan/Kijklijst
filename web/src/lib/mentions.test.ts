import { describe, it, expect } from 'vitest';
import { findMentions, mentionBezig } from './mentions';

const profielen = [
  { id: 'u-bowie', name: 'Bowie' },
  { id: 'u-anna', name: 'Anna' },
  { id: 'u-annemarie', name: 'Anne Marie' },
];

const ids = (t: string) => findMentions(t, profielen).map((h) => h.userId);

describe('findMentions (weergave)', () => {
  it('herkent een vermelding en geeft de juiste positie', () => {
    const t = 'Kijk jij dit ook @Anna?';
    const [h] = findMentions(t, profielen);
    expect(t.slice(h.start, h.end)).toBe('@Anna');
    expect(h.userId).toBe('u-anna');
  });

  it('kiest de langste naam bij overlap', () => {
    const t = 'dag @Anne Marie';
    const [h] = findMentions(t, profielen);
    expect(t.slice(h.start, h.end)).toBe('@Anne Marie');
  });

  it('negeert een @ midden in een woord (e-mailadres)', () => {
    expect(ids('mail bowie@anna.nl')).toEqual([]);
  });

  it('matcht geen naam die deel is van een langer woord', () => {
    expect(ids('@Annabel is iemand anders')).toEqual([]);
  });

  it('vindt meerdere vermeldingen', () => {
    expect(ids('@Bowie en @Anna')).toEqual(['u-bowie', 'u-anna']);
  });

  // Deze regels moeten gelijk blijven met server/src/mentions.ts, anders ziet
  // een vermelding er anders uit dan wie er bericht kreeg.
  it('gedraagt zich gelijk aan de serverkant voor de bekende gevallen', () => {
    expect(ids('hey @BOWIE')).toEqual(['u-bowie']);
    expect(ids('@Anne wat vond jij?')).toEqual(['u-annemarie']);
    expect(ids('@Niemand hallo')).toEqual([]);
  });
});

describe('mentionBezig (keuzelijstje tijdens typen)', () => {
  it('geeft de half getypte naam terug', () => {
    const t = 'kijk jij dit ook @An';
    expect(mentionBezig(t, t.length)).toEqual({ start: 17, term: 'An' });
  });

  it('werkt direct na de @, nog zonder letters', () => {
    const t = 'hoi @';
    expect(mentionBezig(t, t.length)).toEqual({ start: 4, term: '' });
  });

  it('staat één spatie toe, voor namen als "Anne Marie"', () => {
    const t = 'hoi @Anne Ma';
    expect(mentionBezig(t, t.length)).toEqual({ start: 4, term: 'Anne Ma' });
  });

  it('stopt zodra het een hele zin wordt', () => {
    expect(mentionBezig('hoi @Anne Marie wat vind jij', 28)).toBeNull();
  });

  it('geeft niets buiten een vermelding', () => {
    expect(mentionBezig('gewoon tekst', 12)).toBeNull();
    expect(mentionBezig('mail bowie@anna.nl', 18)).toBeNull();
  });
});
