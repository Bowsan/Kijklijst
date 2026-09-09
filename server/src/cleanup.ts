// Eenmalige opruiming bij het opstarten.
import { db, parseJson } from './db.js';
import { broadcast } from './events.js';
import { nieuwSeizoenVervallen, type SeizoenInfo } from './seasons.js';

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
