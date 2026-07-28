import { describe, it, expect } from 'vitest';
import { findTitleMentions } from './titleMentions';

const titels = [
  { tmdb_id: 1, name: 'Severance' },
  { tmdb_id: 2, name: 'Dark' },
  { tmdb_id: 3, name: 'The Good Fight' },
  { tmdb_id: 4, name: 'The Good Wife' },
  { tmdb_id: 5, name: '24' },
];

const namen = (tekst: string) =>
  findTitleMentions(tekst, titels).map((m) => tekst.slice(m.start, m.end));

describe('findTitleMentions', () => {
  it('herkent een titel midden in een zin', () => {
    const t = 'Ik kijk nu Severance en het is goed.';
    expect(namen(t)).toEqual(['Severance']);
  });

  it('herkent ongeacht hoofdletters', () => {
    expect(namen('heb je SEVERANCE al gezien?')).toEqual(['SEVERANCE']);
  });

  it('matcht alleen hele woorden, niet stukken van een woord', () => {
    // "Darkness" bevat "Dark", maar is een ander woord.
    expect(namen('Het was Darkness troef')).toEqual([]);
    expect(namen('Ik kijk Dark')).toEqual(['Dark']);
  });

  it('kiest de langste titel bij overlap', () => {
    // "The Good Fight" bevat niet letterlijk "The Good Wife", maar beide
    // beginnen gelijk; de volledige titel moet winnen.
    expect(namen('gisteren The Good Fight gekeken')).toEqual(['The Good Fight']);
  });

  it('slaat hele korte titels over om valse treffers te voorkomen', () => {
    // "24" zou anders in elke datum of elk getal oplichten.
    expect(namen('we keken 24 afleveringen')).toEqual([]);
  });

  it('vindt meerdere titels in één bericht, op volgorde', () => {
    const t = 'Eerst Dark, daarna Severance';
    expect(namen(t)).toEqual(['Dark', 'Severance']);
  });

  it('geeft niets terug bij lege tekst of zonder treffer', () => {
    expect(findTitleMentions('', titels)).toEqual([]);
    expect(namen('gewoon een berichtje')).toEqual([]);
  });

  it('levert posities die exact op de titel vallen', () => {
    const t = 'zie Severance!';
    const [m] = findTitleMentions(t, titels);
    expect(t.slice(m.start, m.end)).toBe('Severance');
    expect(m.tmdbId).toBe(1);
  });
});
