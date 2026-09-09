// Welke seizoenen zijn er écht al: TMDb zet een verlengd seizoen vaak al in de
// lijst zodra het is aangekondigd, maanden voordat de eerste aflevering komt.
// Zo'n seizoen kan niemand gezien hebben, dus het mag geen "nieuw seizoen"-
// melding opleveren.
//
// Deze regels staan bewust gelijk aan web/src/lib/seasons.ts — wijkt de ene af,
// dan meldt de server iets anders dan de app laat zien.

export interface SeizoenInfo {
  season_number: number;
  air_year?: number | null;
  air_date?: string | null;
}

/** Weten we van deze serie überhaupt uitzenddatums? Zo niet (handmatig
 *  toegevoegde series) dan tellen alle seizoenen gewoon mee. */
function kentDatums(seasons: SeizoenInfo[]): boolean {
  return seasons.some((s) => !!s.air_date || s.air_year != null);
}

/** Is dit seizoen al begonnen? */
export function seizoenUit(s: SeizoenInfo, nu: number, datumsBekend: boolean): boolean {
  if (s.air_date) {
    const t = Date.parse(s.air_date);
    if (!Number.isNaN(t)) return t <= nu;
  }
  // Zonder losse datum is het jaartal het beste dat we hebben.
  if (s.air_year != null) return s.air_year <= new Date(nu).getFullYear();
  return !datumsBekend;
}

/** De seizoenen die al zijn uitgezonden. */
export function uitgezondenSeizoenen<T extends SeizoenInfo>(seasons: T[], nu = Date.now()): T[] {
  const datumsBekend = kentDatums(seasons);
  return seasons.filter((s) => seizoenUit(s, nu, datumsBekend));
}
