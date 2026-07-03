import type { Snapshot, Title, Rating, Profile } from './types';
import { NL_SERVICES } from './services';

export const MIN_RATINGS_FOR_PROFILE = 5;

/**
 * De volledige lijst streamingdiensten — één gedeelde bron voor het profiel én
 * de filter, zodat ze altijd gelijk zijn. De bekende NL-diensten eerst, daarna
 * eventuele extra diensten die daadwerkelijk in gebruik zijn.
 */
export function serviceOptions(snap: Snapshot): string[] {
  const seen = new Set<string>(NL_SERVICES);
  const extras: string[] = [];
  const add = (s: string | null | undefined) => {
    if (s && !seen.has(s)) { seen.add(s); extras.push(s); }
  };
  snap.titles.forEach((t) => t.providers.forEach(add));
  snap.ratings.forEach((r) => add(r.service));
  snap.profiles.forEach((p) => p.services.forEach(add));
  return [...NL_SERVICES, ...extras];
}

/** Id's van de mensen die deze gebruiker volgt. */
export function followingIds(snap: Snapshot, userId: string): string[] {
  return snap.follows.filter((f) => f.follower === userId).map((f) => f.followee);
}

/** Profielen van de vrienden die deze gebruiker volgt. */
export function followingProfiles(snap: Snapshot, userId: string): Profile[] {
  const ids = new Set(followingIds(snap, userId));
  return snap.profiles.filter((p) => ids.has(p.id));
}

/** Volgt deze gebruiker het opgegeven profiel? */
export function isFollowing(snap: Snapshot, userId: string, otherId: string): boolean {
  return snap.follows.some((f) => f.follower === userId && f.followee === otherId);
}

/** Andere profielen die je nog niet volgt (om toe te voegen).
 *  Lege accounts (nog geen enkele beoordeling) en handmatig verborgen accounts
 *  tonen we niet, zodat per ongeluk aangemaakte of niet meer gebruikte profielen
 *  niet in de lijst blijven staan. Zodra een leeg account z'n eerste serie
 *  beoordeelt, verschijnt het vanzelf weer. */
export function suggestedProfiles(snap: Snapshot, userId: string): Profile[] {
  const following = new Set(followingIds(snap, userId));
  const active = new Set(snap.ratings.map((r) => r.user_id));
  return snap.profiles.filter(
    (p) => p.id !== userId && !following.has(p.id) && active.has(p.id) && !p.hidden,
  );
}

/** Handmatig verborgen accounts (om ze weer te kunnen tonen). */
export function hiddenProfiles(snap: Snapshot, userId: string): Profile[] {
  return snap.profiles.filter((p) => p.id !== userId && p.hidden);
}

/** Jij + de vrienden die je volgt — bepaalt wat er in "Alles" verschijnt. */
export function visibleUserIds(snap: Snapshot, userId: string): string[] {
  return [userId, ...followingIds(snap, userId)];
}

// 'notdone' = "nog afkijken": gemarkeerd als gezien, maar nog niet alle seizoenen afgevinkt.
export type StatusValue = 'all' | 'want' | 'watching' | 'finished' | 'dropped' | 'notdone';

export interface ListFilters {
  status: StatusValue;
  friend: string; // '' = Iedereen (jij + gevolgde vrienden)
  services: string[];
  genres: string[];
  name: string;
}

/** Voldoet een beoordeling (van deze persoon, voor deze titel) aan de statusfilter? */
function matchesStatus(r: Rating, t: Title, status: StatusValue): boolean {
  if (status === 'all') return true;
  if (status === 'notdone') {
    if (r.status !== 'finished') return false;
    const total = t.seasons.length;
    if (total === 0) return false;
    const watched = (r.seasons || []).filter((n) => t.seasons.some((s) => s.season_number === n)).length;
    return watched < total;
  }
  return r.status === status;
}

/**
 * De serie-selectie voor het lijstscherm: status × wiens-lijst × dienst × genre × naam.
 * Puur (geen sortering), zodat we 'm ook voor de live "Toon N series"-teller kunnen hergebruiken.
 */
export function selectTitles(snap: Snapshot, userId: string, f: ListFilters): Title[] {
  const personIds = f.friend ? [f.friend] : visibleUserIds(snap, userId);
  const personSet = new Set(personIds);

  let list = snap.titles.filter((t) =>
    snap.ratings.some((r) => r.title_id === t.tmdb_id && personSet.has(r.user_id) && matchesStatus(r, t, f.status)),
  );

  if (f.genres.length) list = list.filter((t) => f.genres.some((g) => t.genres.includes(g)));

  if (f.services.length) {
    const me = profileById(snap, userId);
    list = list.filter((t) => {
      const svc = guessService(t, me, myRating(snap, t.tmdb_id, userId)?.service || null);
      return svc != null && f.services.includes(svc);
    });
  }

  const q = f.name.trim().toLowerCase();
  if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));

  return list;
}

// Hoe lang een pas-verschenen seizoen als "nieuw" telt (voor badge & Voor jou).
export const NEW_SEASON_WINDOW = 90 * 24 * 3600 * 1000;

/** Hoeveel van de seizoenen van deze titel heeft de gebruiker afgevinkt. */
export function watchedSeasonCount(title: Title, rating: Rating | undefined): number {
  return (rating?.seasons || []).filter((n) => title.seasons.some((s) => s.season_number === n)).length;
}

/** Kwam er recent een nieuw seizoen bij dat de gebruiker nog niet zag? */
export function hasUnseenNewSeason(snap: Snapshot, title: Title, userId: string): boolean {
  if (!title.new_season_at || Date.now() - title.new_season_at > NEW_SEASON_WINDOW) return false;
  const r = myRating(snap, title.tmdb_id, userId);
  if (!r) return false;
  return watchedSeasonCount(title, r) < title.seasons.length;
}

/** Series met een nieuw seizoen die je 7 of hoger gaf — voor de "Voor jou"-pagina. */
export function newSeasonForYou(snap: Snapshot, userId: string): Title[] {
  return snap.titles
    .filter((t) => {
      if (!t.new_season_at || Date.now() - t.new_season_at > NEW_SEASON_WINDOW) return false;
      const r = myRating(snap, t.tmdb_id, userId);
      if (!r || r.score == null || r.score < 7) return false;
      return watchedSeasonCount(t, r) < t.seasons.length;
    })
    .sort((a, b) => (b.new_season_at ?? 0) - (a.new_season_at ?? 0));
}

/** Series die een vriend (of jij) op dit moment kijkt. */
export function watchingTitles(snap: Snapshot, userId: string): Title[] {
  return snap.ratings
    .filter((r) => r.user_id === userId && r.status === 'watching')
    .map((r) => titleById(snap, r.title_id))
    .filter((t): t is Title => t != null);
}

/** De volledige kijklijst van een gebruiker (alles wat hij toevoegde of beoordeelde). */
export function listedTitles(snap: Snapshot, userId: string): { title: Title; rating: Rating }[] {
  return snap.ratings
    .filter((r) => r.user_id === userId)
    .map((r) => ({ title: titleById(snap, r.title_id), rating: r }))
    .filter((x): x is { title: Title; rating: Rating } => x.title != null)
    .sort((a, b) =>
      (b.rating.score ?? -1) - (a.rating.score ?? -1) ||
      b.rating.updated_at - a.rating.updated_at);
}

/** Favoriete series van een gebruiker (hoogst beoordeeld). */
export function favoriteTitles(snap: Snapshot, userId: string, limit = 5): { title: Title; score: number }[] {
  return snap.ratings
    .filter((r) => r.user_id === userId && r.score != null)
    .map((r) => ({ title: titleById(snap, r.title_id), score: r.score as number }))
    .filter((x): x is { title: Title; score: number } => x.title != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function ratingsFor(snap: Snapshot, titleId: number): Rating[] {
  return snap.ratings.filter((r) => r.title_id === titleId && r.score != null);
}

export function groupAverage(snap: Snapshot, titleId: number): number | null {
  const scores = ratingsFor(snap, titleId).map((r) => r.score as number);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function myRating(snap: Snapshot, titleId: number, userId: string): Rating | undefined {
  return snap.ratings.find((r) => r.title_id === titleId && r.user_id === userId);
}

export function profileById(snap: Snapshot, id: string): Profile | undefined {
  return snap.profiles.find((p) => p.id === id);
}

export function titleById(snap: Snapshot, id: number): Title | undefined {
  return snap.titles.find((t) => t.tmdb_id === id);
}

/** Hoeveel series heeft deze gebruiker een cijfer gegeven. */
export function ratedCount(snap: Snapshot, userId: string): number {
  return snap.ratings.filter((r) => r.user_id === userId && r.score != null).length;
}

/** Geschatte kijkuren voor een gebruiker bij een titel, op basis van aangevinkte seizoenen. */
export function watchHours(title: Title, rating: Rating | undefined): number {
  if (!title.runtime || !rating || !rating.seasons?.length) return 0;
  const minutes = title.seasons
    .filter((s) => rating.seasons.includes(s.season_number))
    .reduce((sum, s) => sum + s.episode_count * (title.runtime || 0), 0);
  return minutes / 60;
}

export function totalWatchHours(snap: Snapshot, userId: string): number {
  let total = 0;
  for (const t of snap.titles) {
    const r = myRating(snap, t.tmdb_id, userId);
    total += watchHours(t, r);
  }
  return total;
}

/** Smaakprofiel: gemiddeld cijfer per genre voor deze gebruiker. */
export function tasteProfile(snap: Snapshot, userId: string): { genre: string; avg: number; count: number }[] {
  const byGenre = new Map<string, number[]>();
  for (const r of snap.ratings) {
    if (r.user_id !== userId || r.score == null) continue;
    const title = titleById(snap, r.title_id);
    if (!title) continue;
    for (const g of title.genres) {
      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g)!.push(r.score);
    }
  }
  return [...byGenre.entries()]
    .map(([genre, scores]) => ({
      genre,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }))
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.avg - a.avg);
}

/** Smaakgenoten: gebaseerd op het gemiddelde verschil in cijfers op gedeelde titels. */
export function tasteMates(snap: Snapshot, userId: string): { profile: Profile; match: number; shared: number }[] {
  const mine = snap.ratings.filter((r) => r.user_id === userId && r.score != null);
  const mineByTitle = new Map(mine.map((r) => [r.title_id, r.score as number]));

  const result: { profile: Profile; match: number; shared: number }[] = [];
  for (const other of snap.profiles) {
    if (other.id === userId) continue;
    const theirs = snap.ratings.filter((r) => r.user_id === other.id && r.score != null);
    let diff = 0;
    let shared = 0;
    for (const r of theirs) {
      if (mineByTitle.has(r.title_id)) {
        diff += Math.abs((r.score as number) - mineByTitle.get(r.title_id)!);
        shared++;
      }
    }
    if (shared === 0) continue;
    // Verschil van 0 = 100%, verschil van 9 (max) = 0%.
    const match = Math.round(Math.max(0, 100 - (diff / shared) * (100 / 9)));
    result.push({ profile: other, match, shared });
  }
  return result.sort((a, b) => b.match - a.match || b.shared - a.shared);
}

/** Berekende aanraders: hoge groepscijfers die passen bij je smaakprofiel, die je nog niet zag. */
export function computedRecommendations(
  snap: Snapshot,
  userId: string,
): { title: Title; groupAvg: number; score: number; reasonGenres: string[] }[] {
  const profile = tasteProfile(snap, userId);
  const genreScore = new Map(profile.map((g) => [g.genre, g.avg]));

  const result: { title: Title; groupAvg: number; score: number; reasonGenres: string[] }[] = [];
  for (const t of snap.titles) {
    if (myRating(snap, t.tmdb_id, userId)?.score != null) continue;
    const avg = groupAverage(snap, t.tmdb_id);
    if (avg == null) continue;

    // Genre-affiniteit: gemiddelde van jouw genre-cijfers voor de genres van deze titel.
    const reasonGenres = t.genres.filter((g) => genreScore.has(g));
    const affinities = reasonGenres.map((g) => genreScore.get(g)!);
    const affinity = affinities.length ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 6;

    // Combineer groepscijfer en persoonlijke affiniteit.
    const score = avg * 0.6 + affinity * 0.4;
    result.push({ title: t, groupAvg: avg, score, reasonGenres });
  }
  return result.sort((a, b) => b.score - a.score).slice(0, 12);
}

/** Persoonlijke aanraders die voor jou klaarstaan (niet weggeklikt, nog niet zelf beoordeeld). */
export function incomingRecommendations(snap: Snapshot, userId: string) {
  return snap.recommendations
    .filter((rec) => rec.to_user === userId && !rec.dismissed)
    .filter((rec) => myRating(snap, rec.title_id, userId)?.score == null)
    .map((rec) => ({
      rec,
      from: profileById(snap, rec.from_user),
      title: titleById(snap, rec.title_id),
    }))
    .filter((x) => x.title)
    .sort((a, b) => b.rec.created_at - a.rec.created_at);
}

/** Gok de streamingdienst waarop je een serie keek, op basis van je abonnementen. */
export function guessService(title: Title, profile: Profile | undefined, override: string | null): string | null {
  if (override) return override;
  if (!title.providers.length) return null;
  const subs = profile?.services || [];
  const match = title.providers.find((p) => subs.includes(p));
  if (match) return match;
  return title.providers[0]; // bij benadering een dienst die hem wel aanbiedt
}

/** Kijkstatistieken per streamingdienst voor een gebruiker. */
export function serviceStats(snap: Snapshot, userId: string): { service: string; count: number; hours: number }[] {
  const profile = profileById(snap, userId);
  const byService = new Map<string, { count: number; hours: number }>();
  for (const t of snap.titles) {
    const r = myRating(snap, t.tmdb_id, userId);
    if (!r || r.score == null) continue;
    const service = guessService(t, profile, r.service);
    if (!service) continue;
    if (!byService.has(service)) byService.set(service, { count: 0, hours: 0 });
    const entry = byService.get(service)!;
    entry.count++;
    entry.hours += watchHours(t, r);
  }
  return [...byService.entries()]
    .map(([service, v]) => ({ service, ...v }))
    .sort((a, b) => b.count - a.count);
}
