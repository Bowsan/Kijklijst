import type { Snapshot, Title, Rating, Profile } from './types';

export const MIN_RATINGS_FOR_PROFILE = 5;

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

/** Andere profielen die je nog niet volgt (om toe te voegen). */
export function suggestedProfiles(snap: Snapshot, userId: string): Profile[] {
  const following = new Set(followingIds(snap, userId));
  return snap.profiles.filter((p) => p.id !== userId && !following.has(p.id));
}

/** Jij + de vrienden die je volgt — bepaalt wat er in "Alles" verschijnt. */
export function visibleUserIds(snap: Snapshot, userId: string): string[] {
  return [userId, ...followingIds(snap, userId)];
}

/** Series die een vriend (of jij) op dit moment kijkt. */
export function watchingTitles(snap: Snapshot, userId: string): Title[] {
  return snap.ratings
    .filter((r) => r.user_id === userId && r.status === 'watching')
    .map((r) => titleById(snap, r.title_id))
    .filter((t): t is Title => t != null);
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
export function computedRecommendations(snap: Snapshot, userId: string): { title: Title; groupAvg: number; score: number }[] {
  const profile = tasteProfile(snap, userId);
  const genreScore = new Map(profile.map((g) => [g.genre, g.avg]));

  const result: { title: Title; groupAvg: number; score: number }[] = [];
  for (const t of snap.titles) {
    if (myRating(snap, t.tmdb_id, userId)?.score != null) continue;
    const avg = groupAverage(snap, t.tmdb_id);
    if (avg == null) continue;

    // Genre-affiniteit: gemiddelde van jouw genre-cijfers voor de genres van deze titel.
    const affinities = t.genres.map((g) => genreScore.get(g)).filter((v): v is number => v != null);
    const affinity = affinities.length ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 6;

    // Combineer groepscijfer en persoonlijke affiniteit.
    const score = avg * 0.6 + affinity * 0.4;
    result.push({ title: t, groupAvg: avg, score });
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
