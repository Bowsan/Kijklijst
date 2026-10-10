// Eenmalige opruiming bij het opstarten.
import { db, parseJson } from './db.js';
import { broadcast } from './events.js';
import { nieuwSeizoenVervallen, nieuwsteUitgezondenSeizoen, type SeizoenInfo } from './seasons.js';

/**
 * Haalt "nieuw seizoen"-markeringen weg die door de oude detectie zijn gezet
 * voor een seizoen dat alleen was aangekondigd. Zulke series bleven in "Voor
 * jou" staan zonder dat je er iets aan kon doen: het seizoen was nog nergens
 * te zien, dus afvinken kon niet.
 *
 * Alleen de vlag en de bijbehorende (onjuiste) regel in de activiteitenlog
 * gaan weg — beoordelingen, seizoenvinkjes en series blijven onaangeroerd.
 */
export function opschonenValseNieuweSeizoenen(nu = Date.now()): number {
  const rijen = db
    .prepare('SELECT tmdb_id, name, seasons, new_season_at FROM titles WHERE new_season_at IS NOT NULL')
    .all() as { tmdb_id: number; name: string; seasons: string; new_season_at: number }[];

  const wis = db.prepare('UPDATE titles SET new_season_at = NULL WHERE tmdb_id = ?');
  // De logregel is op hetzelfde moment weggeschreven als de vlag; een marge van
  // een minuut voorkomt dat we een oudere, terechte melding meenemen.
  const wisLog = db.prepare(
    "DELETE FROM activity WHERE type = 'new_season' AND title_id = ? AND created_at >= ?",
  );

  let opgeruimd = 0;
  const schoonmaak = db.transaction(() => {
    for (const r of rijen) {
      const seasons = parseJson<SeizoenInfo[]>(r.seasons, []);
      if (!nieuwSeizoenVervallen(seasons, r.new_season_at, nu)) continue;
      wis.run(r.tmdb_id);
      wisLog.run(r.tmdb_id, r.new_season_at - 60_000);
      opgeruimd++;
      console.log(`Onterechte "nieuw seizoen"-markering weggehaald: ${r.name}`);
    }
  });
  schoonmaak();

  if (opgeruimd > 0) broadcast('state', 1);
  return opgeruimd;
}

/**
 * Legt voor bestaande series vast welk seizoen al "gemeld" is: de hoogste die
 * nu loopt. Zonder dit beginpunt zou de eerste ronde na deze wijziging voor
 * elke serie een melding kunnen sturen. Vult alleen wat nog leeg is, dus een
 * tweede keer draaien verandert niets.
 */
export function vulGemeldeSeizoenen(nu = Date.now()): number {
  const rijen = db
    .prepare('SELECT tmdb_id, seasons FROM titles WHERE announced_season IS NULL')
    .all() as { tmdb_id: number; seasons: string }[];
  const zet = db.prepare('UPDATE titles SET announced_season = ? WHERE tmdb_id = ?');
  const vullen = db.transaction(() => {
    for (const r of rijen) {
      zet.run(nieuwsteUitgezondenSeizoen(parseJson<SeizoenInfo[]>(r.seasons, []), nu), r.tmdb_id);
    }
  });
  vullen();
  if (rijen.length > 0) console.log(`Seizoenstand vastgelegd voor ${rijen.length} serie(s).`);
  return rijen.length;
}
