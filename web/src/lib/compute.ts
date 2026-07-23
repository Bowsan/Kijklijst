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
function followingIds(snap: Snapshot, userId: string): string[] {
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

/** Nog niet gevolgde, niet-verborgen accounts zónder beoordelingen.
 *  Normaal verborgen in "Mensen om te volgen", maar oproepbaar via "Toon alle accounts". */
export function inactiveFollowableProfiles(snap: Snapshot, userId: string): Profile[] {
  const following = new Set(followingIds(snap, userId));
  const active = new Set(snap.ratings.map((r) => r.user_id));
  return snap.profiles.filter(
    (p) => p.id !== userId && !following.has(p.id) && !p.hidden && !active.has(p.id),
  );
}

/** Handmatig verborgen accounts (om ze weer te kunnen tonen). */
export function hiddenProfiles(snap: Snapshot, userId: string): Profile[] {
  return snap.profiles.filter((p) => p.id !== userId && p.hidden);
}

export type TipStatus = 'wishlist' | 'watching' | 'finished' | 'dropped' | 'dismissed' | 'pending';

/** Alle tips die JIJ aan vrienden gaf, met de status van de ontvanger erbij. */
export function sentRecommendations(snap: Snapshot, userId: string) {
  return snap.recommendations
    .filter((rec) => rec.from_user === userId)
    .map((rec) => {
      const to = profileById(snap, rec.to_user);
      const title = titleById(snap, rec.title_id);
      const r = myRating(snap, rec.title_id, rec.to_user);
      let status: TipStatus;
      if (r?.status === 'want') status = 'wishlist';
      else if (r?.status === 'watching') status = 'watching';
      else if (r?.status === 'finished' || r?.score != null) status = 'finished';
      else if (r?.status === 'dropped') status = 'dropped';
      else if (rec.dismissed) status = 'dismissed';
      else status = 'pending';
      return { rec, to, title, status };
    })
    .filter((x) => x.title && x.to)
    .sort((a, b) => b.rec.created_at - a.rec.created_at);
}

/** Berichten van anderen bij series die op JOUW lijst staan. */
export function commentsOnMyList(snap: Snapshot, userId: string) {
  const mine = new Set(snap.ratings.filter((r) => r.user_id === userId).map((r) => r.title_id));
  return snap.comments.filter((c) => c.user_id !== userId && mine.has(c.title_id));
}

/** Aantal nog niet geziene berichten (nieuwer dan wanneer je de log opende). */
export function unseenCommentCount(snap: Snapshot, userId: string, since: number): number {
  return commentsOnMyList(snap, userId).filter((c) => c.created_at > since).length;
}

/** Alles wat het bolletje op de bel laat branden: berichten bij jouw series,
 *  tips die je kreeg en nieuwe seizoenen van series op je lijst — voor zover
 *  nieuwer dan je laatste bezoek aan de meldingen. */
export function unseenNotificationCount(snap: Snapshot, userId: string, since: number): number {
  const mine = new Set(snap.ratings.filter((r) => r.user_id === userId).map((r) => r.title_id));
  const comments = unseenCommentCount(snap, userId, since);
  const tips = snap.recommendations.filter(
    (r) => r.to_user === userId && !r.dismissed && r.created_at > since,
  ).length;
  const newSeasons = snap.activity.filter(
    (a) => a.type === 'new_season' && a.title_id != null && mine.has(a.title_id) && a.created_at > since,
  ).length;
  return comments + tips + newSeasons;
}

/** Jij + de vrienden die je volgt — bepaalt wat er in "Alles" verschijnt. */
export function visibleUserIds(snap: Snapshot, userId: string): string[] {
  return [userId, ...followingIds(snap, userId)];
}

/** Cijfers van de vrienden die je volgt voor één titel (voor snelle inline-weergave). */
export function friendScoresFor(snap: Snapshot, userId: string, titleId: number): { profile: Profile; score: number }[] {
  const friendIds = new Set(followingIds(snap, userId));
  return snap.ratings
    .filter((r) => r.title_id === titleId && r.score != null && friendIds.has(r.user_id))
    .map((r) => ({ profile: profileById(snap, r.user_id)!, score: r.score as number }))
    .filter((x) => x.profile)
    .sort((a, b) => b.score - a.score);
}

// 'notdone' = "nog afkijken": gemarkeerd als gezien, maar nog niet alle seizoenen afgevinkt.
export type StatusValue = 'all' | 'want' | 'watching' | 'finished' | 'dropped' | 'notdone';

export interface ListFilters {
  status: StatusValue;
  friend: string; // '' = Iedereen (jij + gevolgde vrienden)
  services: string[];
  genres: string[];
  name: string;
  /** Alleen series waarin deze acteur speelt (exacte naam uit de cast). */
  actor?: string;
  /** Alleen series van deze maker/bedenker (exacte naam uit creators). */
  creator?: string;
  /** Alleen series die (door de betrokken persoon) nog niet becijferd zijn (score == null). */
  noScore?: boolean;
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

  if (f.actor) list = list.filter((t) => t.cast.includes(f.actor!));

  if (f.creator) list = list.filter((t) => (t.creators ?? []).some((c) => c.name === f.creator));

  // "Zonder cijfer": alleen series waarvan de betrokken persoon (of iemand in de
  // scope bij "Iedereen") een beoordeling heeft die nog geen cijfer draagt.
  if (f.noScore) {
    list = list.filter((t) =>
      snap.ratings.some(
        (r) => r.title_id === t.tmdb_id && personSet.has(r.user_id) && matchesStatus(r, t, f.status) && r.score == null,
      ),
    );
  }

  if (f.services.length) {
    const me = profileById(snap, userId);
    list = list.filter((t) => {
      const svc = guessService(t, me, myRating(snap, t.tmdb_id, userId)?.service || null);
      return svc != null && f.services.includes(svc);
    });
  }

  // Zoeken binnen de lijst matcht op titel én op acteursnamen uit de cast.
  const q = f.name.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (t) => t.name.toLowerCase().includes(q) || t.cast.some((c) => c.toLowerCase().includes(q)),
    );
  }

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

/** Series op jouw lijst met een recent nieuw seizoen dat je nog niet zag —
 *  voor de "Voor jou"-pagina. Hoogst beoordeelde eerst. */
export function newSeasonForYou(snap: Snapshot, userId: string): Title[] {
  return snap.titles
    .filter((t) => hasUnseenNewSeason(snap, t, userId))
    .sort((a, b) =>
      ((myRating(snap, b.tmdb_id, userId)?.score ?? -1) - (myRating(snap, a.tmdb_id, userId)?.score ?? -1)) ||
      ((b.new_season_at ?? 0) - (a.new_season_at ?? 0)));
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

function ratingsFor(snap: Snapshot, titleId: number): Rating[] {
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

export interface ImdbCompare {
  count: number;
  /** Gemiddeld jouw cijfer minus IMDb: >0 = milder, <0 = strenger dan de wereld. */
  avgDelta: number;
  /** Serie waar jij het meest bovengemiddeld enthousiast was (guilty pleasure). */
  guilty: { title: Title; mine: number; imdb: number; diff: number } | null;
  /** Serie die de wereld veel hoger vindt dan jij. */
  panned: { title: Title; mine: number; imdb: number; diff: number } | null;
}

/** Vergelijkt jouw cijfers met het IMDb-cijfer per serie (min. 3 met beide). */
export function imdbCompare(snap: Snapshot, userId: string): ImdbCompare | null {
  const pairs: { title: Title; mine: number; imdb: number; diff: number }[] = [];
  for (const r of snap.ratings) {
    if (r.user_id !== userId || r.score == null) continue;
    const t = titleById(snap, r.title_id);
    if (!t || t.imdb_rating == null) continue;
    pairs.push({ title: t, mine: r.score, imdb: t.imdb_rating, diff: r.score - t.imdb_rating });
  }
  if (pairs.length < 3) return null;
  const avgDelta = pairs.reduce((a, b) => a + b.diff, 0) / pairs.length;
  const guilty = pairs.reduce<typeof pairs[number] | null>((best, p) => (p.diff > (best?.diff ?? -Infinity) ? p : best), null);
  const panned = pairs.reduce<typeof pairs[number] | null>((best, p) => (p.diff < (best?.diff ?? Infinity) ? p : best), null);
  return {
    count: pairs.length,
    avgDelta,
    guilty: guilty && guilty.diff >= 1.5 ? guilty : null,
    panned: panned && panned.diff <= -1.5 ? panned : null,
  };
}

/** Hoeveel series heeft deze gebruiker een cijfer gegeven. */
export function ratedCount(snap: Snapshot, userId: string): number {
  return snap.ratings.filter((r) => r.user_id === userId && r.score != null).length;
}

/** Geschatte kijkuren voor een gebruiker bij een titel, op basis van aangevinkte seizoenen. */
function watchHours(title: Title, rating: Rating | undefined): number {
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

/** Totaal aantal seizoenen dat deze gebruiker als gezien markeerde. */
export function totalWatchedSeasons(snap: Snapshot, userId: string): number {
  let total = 0;
  for (const t of snap.titles) {
    total += watchedSeasonCount(t, myRating(snap, t.tmdb_id, userId));
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

/** Badge op de "Voor jou"-tab: alleen tips en nieuwe seizoenen die je nog
 *  niet zag sinds je de pagina voor het laatst opende. */
export function forYouBadgeCount(snap: Snapshot, userId: string, since: number): number {
  const tips = incomingRecommendations(snap, userId).filter((x) => x.rec.created_at > since).length;
  const seasons = newSeasonForYou(snap, userId).filter((t) => (t.new_season_at ?? 0) > since).length;
  return tips + seasons;
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

// ---------- "De Bank vergelijkt": sociale statistieken over de groep ----------

/** Cijfers van de zichtbare groep (jij + gevolgde vrienden) per titel. */
function groupScoresByTitle(snap: Snapshot, userId: string): Map<number, { user_id: string; score: number }[]> {
  const visible = new Set(visibleUserIds(snap, userId));
  const byTitle = new Map<number, { user_id: string; score: number }[]>();
  for (const r of snap.ratings) {
    if (r.score == null || !visible.has(r.user_id)) continue;
    if (!byTitle.has(r.title_id)) byTitle.set(r.title_id, []);
    byTitle.get(r.title_id)!.push({ user_id: r.user_id, score: r.score });
  }
  return byTitle;
}

/** De Jury: wie cijfert streng, wie mild? Gemiddelde afwijking t.o.v. de rest
 *  van de groep op gedeelde series (minstens 3 gedeelde titels per persoon). */
export function juryScores(snap: Snapshot, userId: string): { profile: Profile; delta: number; count: number }[] {
  const byTitle = groupScoresByTitle(snap, userId);
  const deltas = new Map<string, number[]>();
  for (const scores of byTitle.values()) {
    if (scores.length < 2) continue;
    const total = scores.reduce((a, s) => a + s.score, 0);
    for (const s of scores) {
      const othersAvg = (total - s.score) / (scores.length - 1);
      if (!deltas.has(s.user_id)) deltas.set(s.user_id, []);
      deltas.get(s.user_id)!.push(s.score - othersAvg);
    }
  }
  return [...deltas.entries()]
    .filter(([, d]) => d.length >= 3)
    .map(([id, d]) => ({
      profile: profileById(snap, id)!,
      delta: d.reduce((a, b) => a + b, 0) / d.length,
      count: d.length,
    }))
    .filter((x) => x.profile)
    .sort((a, b) => a.delta - b.delta); // strengste eerst
}

export interface DividedTitle {
  title: Title;
  low: { user: Profile; score: number };
  high: { user: Profile; score: number };
  spread: number;
  count: number;
}

/** Meest verdeelde serie (grootste kloof) en meest eensgezinde (kleinste, 3+ cijfers). */
export function groupDivision(snap: Snapshot, userId: string): { divided: DividedTitle | null; agreed: DividedTitle | null } {
  const byTitle = groupScoresByTitle(snap, userId);
  let divided: DividedTitle | null = null;
  let agreed: DividedTitle | null = null;
  for (const [titleId, scores] of byTitle) {
    if (scores.length < 2) continue;
    const t = titleById(snap, titleId);
    if (!t) continue;
    const sorted = [...scores].sort((a, b) => a.score - b.score);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    const loP = profileById(snap, lo.user_id);
    const hiP = profileById(snap, hi.user_id);
    if (!loP || !hiP) continue;
    const entry: DividedTitle = {
      title: t,
      low: { user: loP, score: lo.score },
      high: { user: hiP, score: hi.score },
      spread: hi.score - lo.score,
      count: scores.length,
    };
    if (entry.spread >= 2 && (!divided || entry.spread > divided.spread)) divided = entry;
    if (scores.length >= 3 && entry.spread <= 1 && (!agreed || entry.spread < agreed.spread)) agreed = entry;
  }
  return { divided, agreed };
}

export interface TasteOutlier { title: Title; mine: number; others: number }

/** Jouw smaak vs de groep: guilty pleasure (jij veel hoger) en het omgekeerde. */
export function tasteOutliers(snap: Snapshot, userId: string): { guilty: TasteOutlier | null; panned: TasteOutlier | null } {
  const byTitle = groupScoresByTitle(snap, userId);
  let guilty: TasteOutlier | null = null;
  let panned: TasteOutlier | null = null;
  let maxDiff = 1.5; // pas interessant vanaf 1,5 punt verschil
  let minDiff = -1.5;
  for (const [titleId, scores] of byTitle) {
    const mine = scores.find((s) => s.user_id === userId);
    const others = scores.filter((s) => s.user_id !== userId);
    if (!mine || others.length === 0) continue;
    const t = titleById(snap, titleId);
    if (!t) continue;
    const othersAvg = others.reduce((a, s) => a + s.score, 0) / others.length;
    const diff = mine.score - othersAvg;
    if (diff >= maxDiff) { maxDiff = diff; guilty = { title: t, mine: mine.score, others: othersAvg }; }
    if (diff <= minDiff) { minDiff = diff; panned = { title: t, mine: mine.score, others: othersAvg }; }
  }
  return { guilty, panned };
}

/** Blinde vlek: het genre dat je vrienden het vaakst kijken maar jij nog nooit probeerde. */
export function blindSpotGenre(snap: Snapshot, userId: string): { genre: string; count: number } | null {
  const myGenres = new Set<string>();
  for (const r of snap.ratings) {
    if (r.user_id !== userId) continue;
    const t = titleById(snap, r.title_id);
    t?.genres.forEach((g) => myGenres.add(g));
  }
  const friendIds = new Set(followingIds(snap, userId));
  const counts = new Map<string, number>();
  for (const r of snap.ratings) {
    if (!friendIds.has(r.user_id)) continue;
    const t = titleById(snap, r.title_id);
    if (!t) continue;
    for (const g of t.genres) {
      if (!myGenres.has(g)) counts.set(g, (counts.get(g) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 3 ? { genre: top[0], count: top[1] } : null;
}

/** Afmaker of afhaker: percentage afgekeken van alle afgeronde keuzes (gezien/afgehaakt). */
export function finisherStats(snap: Snapshot, userId: string): { profile: Profile; pct: number; finished: number; dropped: number }[] {
  const visible = visibleUserIds(snap, userId);
  const result: { profile: Profile; pct: number; finished: number; dropped: number }[] = [];
  for (const id of visible) {
    const p = profileById(snap, id);
    if (!p) continue;
    const mine = snap.ratings.filter((r) => r.user_id === id);
    const finished = mine.filter((r) => r.status === 'finished').length;
    const dropped = mine.filter((r) => r.status === 'dropped').length;
    if (finished + dropped < 3) continue; // te weinig om iets te zeggen
    result.push({ profile: p, pct: Math.round((finished / (finished + dropped)) * 100), finished, dropped });
  }
  return result.sort((a, b) => b.pct - a.pct);
}

/** De serie die het vaakst is afgehaakt in de groep (min. 2 afhakers). */
export function mostDroppedTitle(snap: Snapshot, userId: string): { title: Title; dropped: number; total: number } | null {
  const visible = new Set(visibleUserIds(snap, userId));
  const counts = new Map<number, { dropped: number; total: number }>();
  for (const r of snap.ratings) {
    if (!visible.has(r.user_id) || (r.status !== 'dropped' && r.status !== 'finished')) continue;
    const e = counts.get(r.title_id) ?? { dropped: 0, total: 0 };
    e.total++;
    if (r.status === 'dropped') e.dropped++;
    counts.set(r.title_id, e);
  }
  let best: { title: Title; dropped: number; total: number } | null = null;
  for (const [id, c] of counts) {
    if (c.dropped < 2) continue;
    const t = titleById(snap, id);
    if (!t) continue;
    // Meeste afhakers; bij gelijkspel de hoogste afhaakverhouding.
    if (!best || c.dropped > best.dropped || (c.dropped === best.dropped && c.dropped / c.total > best.dropped / best.total)) {
      best = { title: t, dropped: c.dropped, total: c.total };
    }
  }
  return best;
}

// Genres waar de "cast" geen acteurs zijn maar presentatoren/deelnemers
// (reality zoals SAS, talkshows, nieuws, documentaires) — die tellen niet
// mee voor je vaste cast.
const NON_ACTING_GENRES = new Set(['Reality', 'Talk', 'News', 'Documentaire', 'Documentary']);

/** Jouw vaste cast: échte acteurs die in meerdere series op je lijst spelen,
 *  met jouw gemiddelde cijfer voor die series. */
export function favoriteActors(snap: Snapshot, userId: string, limit = 5): { name: string; count: number; avg: number }[] {
  const byActor = new Map<string, number[]>();
  for (const r of snap.ratings) {
    if (r.user_id !== userId || r.score == null) continue;
    const t = titleById(snap, r.title_id);
    if (!t) continue;
    if (t.genres.some((g) => NON_ACTING_GENRES.has(g))) continue;
    for (const name of t.cast) {
      if (!byActor.has(name)) byActor.set(name, []);
      byActor.get(name)!.push(r.score);
    }
  }
  return [...byActor.entries()]
    .filter(([, scores]) => scores.length >= 2) // pas interessant vanaf 2 series
    .map(([name, scores]) => ({
      name,
      count: scores.length,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg)
    .slice(0, limit);
}

/** Beste seriemakers (bedenkers/producenten): makers van meerdere series die
 *  jij beoordeelde, gesorteerd op aantal series en gemiddeld cijfer. */
export function favoriteCreators(
  snap: Snapshot,
  userId: string,
  limit = 5,
): { name: string; photo: string | null; count: number; avg: number }[] {
  const byCreator = new Map<string, { photo: string | null; scores: number[] }>();
  for (const r of snap.ratings) {
    if (r.user_id !== userId || r.score == null) continue;
    const t = titleById(snap, r.title_id);
    if (!t) continue;
    for (const c of t.creators ?? []) {
      if (!byCreator.has(c.name)) byCreator.set(c.name, { photo: c.photo, scores: [] });
      const e = byCreator.get(c.name)!;
      if (!e.photo && c.photo) e.photo = c.photo;
      e.scores.push(r.score);
    }
  }
  return [...byCreator.entries()]
    .filter(([, e]) => e.scores.length >= 2) // pas interessant vanaf 2 series
    .map(([name, e]) => ({
      name,
      photo: e.photo,
      count: e.scores.length,
      avg: e.scores.reduce((a, b) => a + b, 0) / e.scores.length,
    }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg)
    .slice(0, limit);
}

/** Top-tips op basis van je favorieten: series die je nog niet kent waarin
 *  een favoriete acteur (gem. 7+) speelt of die een favoriete maker bedacht.
 *  Acteur én maker samen scoort het hoogst; makers wegen iets zwaarder. */
export function favoriteSuggestions(
  snap: Snapshot,
  userId: string,
  limit = 5,
): { title: Title; actors: string[]; creators: string[]; score: number }[] {
  const favActors = favoriteActors(snap, userId, 12).filter((a) => a.avg >= 7);
  const favCreators = favoriteCreators(snap, userId, 12).filter((c) => c.avg >= 7);
  if (favActors.length === 0 && favCreators.length === 0) return [];
  const actorAvg = new Map(favActors.map((a) => [a.name, a.avg]));
  const creatorAvg = new Map(favCreators.map((c) => [c.name, c.avg]));

  const out: { title: Title; actors: string[]; creators: string[]; score: number }[] = [];
  for (const t of snap.titles) {
    if (myRating(snap, t.tmdb_id, userId)) continue; // al op je lijst (welke status dan ook)
    const actors = t.cast.filter((n) => actorAvg.has(n));
    const creators = (t.creators ?? []).map((c) => c.name).filter((n) => creatorAvg.has(n));
    if (actors.length === 0 && creators.length === 0) continue;
    const score =
      actors.reduce((s, n) => s + (actorAvg.get(n) ?? 0), 0) +
      creators.reduce((s, n) => s + (creatorAvg.get(n) ?? 0) * 1.5, 0) +
      (actors.length > 0 && creators.length > 0 ? 5 : 0); // combi = de beste tip
    out.push({ title: t, actors, creators, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Speelt er een favoriete acteur van deze gebruiker mee in de titel? */
export function sharedFavoriteActor(snap: Snapshot, userId: string, title: Title): string | null {
  const favs = favoriteActors(snap, userId, 12).filter((a) => a.avg >= 7);
  return favs.find((a) => title.cast.includes(a.name))?.name ?? null;
}

/** "Jouw jaar in series": statistieken over de beoordelingen van dit kalenderjaar.
 *  Benadering: we gaan uit van het moment waarop je de beoordeling (laatst) bijwerkte. */
export function yearStats(snap: Snapshot, userId: string, year: number) {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const mine = snap.ratings.filter(
    (r) => r.user_id === userId && r.score != null && r.updated_at >= start && r.updated_at < end,
  );
  if (mine.length === 0) return null;

  let hours = 0;
  const genreCount = new Map<string, number>();
  const serviceScores = new Map<string, number[]>();
  let best: { title: Title; score: number } | null = null;
  let clash: { title: Title; friend: Profile; mine: number; theirs: number; diff: number } | null = null;

  const profile = profileById(snap, userId);
  const friendIds = new Set(followingIds(snap, userId));
  for (const r of mine) {
    const t = titleById(snap, r.title_id);
    if (!t) continue;
    hours += watchHours(t, r);
    for (const g of t.genres) genreCount.set(g, (genreCount.get(g) || 0) + 1);
    const svc = guessService(t, profile, r.service);
    if (svc) {
      if (!serviceScores.has(svc)) serviceScores.set(svc, []);
      serviceScores.get(svc)!.push(r.score as number);
    }
    if (!best || (r.score as number) > best.score) best = { title: t, score: r.score as number };
    // Grootste meningsverschil met een gevolgde vriend.
    for (const other of snap.ratings) {
      if (other.title_id !== r.title_id || other.score == null || !friendIds.has(other.user_id)) continue;
      const diff = Math.abs((r.score as number) - (other.score as number));
      if (!clash || diff > clash.diff) {
        const friend = profileById(snap, other.user_id);
        if (friend) clash = { title: t, friend, mine: r.score as number, theirs: other.score as number, diff };
      }
    }
  }

  const topGenre = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Beste streamingdienst: hoogste gemiddelde cijfer, met minimaal 3 series.
  const bestService = [...serviceScores.entries()]
    .filter(([, scores]) => scores.length >= 3)
    .map(([service, scores]) => ({
      service,
      count: scores.length,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count)[0] ?? null;

  return {
    count: mine.length,
    hours: Math.round(hours),
    topGenre,
    best,
    bestService,
    clash: clash && clash.diff >= 2 ? clash : null, // alleen tonen bij een echt verschil
  };
}

/** Kijkstatistieken per streamingdienst voor een gebruiker. */
export function serviceStats(snap: Snapshot, userId: string): { service: string; count: number; seasons: number; hours: number }[] {
  const profile = profileById(snap, userId);
  const byService = new Map<string, { count: number; seasons: number; hours: number }>();
  for (const t of snap.titles) {
    const r = myRating(snap, t.tmdb_id, userId);
    if (!r || r.score == null) continue;
    const service = guessService(t, profile, r.service);
    if (!service) continue;
    if (!byService.has(service)) byService.set(service, { count: 0, seasons: 0, hours: 0 });
    const entry = byService.get(service)!;
    entry.count++;
    entry.seasons += t.seasons.length || 1; // onbekend seizoen-aantal telt als 1
    entry.hours += watchHours(t, r);
  }
  return [...byService.entries()]
    .map(([service, v]) => ({ service, ...v }))
    .sort((a, b) => b.seasons - a.seasons || b.count - a.count);
}
