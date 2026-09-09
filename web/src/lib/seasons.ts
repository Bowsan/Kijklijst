// Welke seizoenen zijn er écht al: TMDb zet een verlengd seizoen vaak al in de
// lijst zodra het is aangekondigd, maanden voordat de eerste aflevering komt.
// Zo'n seizoen kan niemand gezien hebben, dus het telt niet mee bij "nieuw
// seizoen", bij de seizoenteller en bij de knopjes "seizoenen gezien".
//
// Deze regels staan bewust gelijk aan server/src/seasons.ts — wijkt de ene af,
// dan meldt de server iets anders dan de app laat zien.

import type { Season, Title } from './types';

/** Weten we van deze serie überhaupt uitzenddatums? Zo niet (handmatig
 *  toegevoegde series) dan tellen alle seizoenen gewoon mee. */
function kentDatums(seasons: Season[]): boolean {
  return seasons.some((s) => !!s.air_date || s.air_year != null);
}

/** Is dit seizoen al begonnen? */
function seizoenUit(s: Season, nu: number, datumsBekend: boolean): boolean {
  if (s.air_date) {
    const t = Date.parse(s.air_date);
    if (!Number.isNaN(t)) return t <= nu;
  }
  // Zonder losse datum is het jaartal het beste dat we hebben.
  if (s.air_year != null) return s.air_year <= new Date(nu).getFullYear();
  return !datumsBekend;
}

/** De seizoenen van deze serie die al zijn uitgezonden. */
export function airedSeasons(title: Title, nu = Date.now()): Season[] {
  const datumsBekend = kentDatums(title.seasons);
  return title.seasons.filter((s) => seizoenUit(s, nu, datumsBekend));
}

/** Het hoogste seizoensnummer dat al is uitgezonden (null als er nog niets is). */
export function latestAiredSeason(title: Title, nu = Date.now()): number | null {
  const uit = airedSeasons(title, nu);
  return uit.length ? Math.max(...uit.map((s) => s.season_number)) : null;
}
