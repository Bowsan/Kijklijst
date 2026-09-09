import { describe, it, expect } from 'vitest';
import { airedSeasons, latestAiredSeason } from './seasons';
import type { Season, Title } from './types';

const nu = Date.parse('2026-09-09T12:00:00Z');

function titel(seasons: Season[]): Title {
  return { tmdb_id: 1, name: 'Serie', seasons } as Title;
}
const nummers = (seasons: Season[]) =>
  airedSeasons(titel(seasons), nu).map((s) => s.season_number);

const seizoen = (n: number, over: Partial<Season> = {}): Season => ({
  season_number: n, episode_count: 8, name: `S${n}`, air_year: null, air_date: null, ...over,
});

describe('airedSeasons', () => {
  it('laat een aangekondigd seizoen zonder datum weg', () => {
    expect(nummers([
      seizoen(1, { air_year: 2023, air_date: '2023-04-20' }),
      seizoen(2, { air_year: 2025, air_date: '2025-10-16' }),
      seizoen(3), // verlengd, nog geen datum bekend
    ])).toEqual([1, 2]);
  });

  it('laat een seizoen met een datum in de toekomst weg', () => {
    expect(nummers([
      seizoen(1, { air_year: 2026, air_date: '2026-01-05' }),
      seizoen(2, { air_year: 2026, air_date: '2026-12-01' }),
    ])).toEqual([1]);
  });

  it('valt terug op het jaartal als er geen losse datum is', () => {
    expect(nummers([
      seizoen(1, { air_year: 2024 }),
      seizoen(2, { air_year: 2027 }),
    ])).toEqual([1]);
  });

  it('telt alles mee als we van geen enkel seizoen een datum kennen', () => {
    // Handmatig toegevoegde series: alleen een aantal seizoenen, verder niets.
    expect(nummers([seizoen(1), seizoen(2)])).toEqual([1, 2]);
  });
});

describe('latestAiredSeason', () => {
  it('geeft het hoogste seizoen dat al liep', () => {
    const t = titel([
      seizoen(1, { air_year: 2022, air_date: '2022-01-01' }),
      seizoen(2, { air_year: 2024, air_date: '2024-01-01' }),
      seizoen(3),
    ]);
    expect(latestAiredSeason(t, nu)).toBe(2);
  });

  it('geeft null als er nog niets is uitgezonden', () => {
    expect(latestAiredSeason(titel([seizoen(1, { air_year: 2030, air_date: '2030-01-01' })]), nu)).toBeNull();
    expect(latestAiredSeason(titel([]), nu)).toBeNull();
  });
});
