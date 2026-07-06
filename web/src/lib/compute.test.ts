import { describe, it, expect } from 'vitest';
import type { Snapshot, Title, Rating, Profile, Recommendation, Comment } from './types';
import {
  selectTitles, computedRecommendations, newSeasonForYou, hasUnseenNewSeason,
  suggestedProfiles, inactiveFollowableProfiles, hiddenProfiles,
  sentRecommendations, unseenCommentCount, tasteProfile, groupAverage,
  NEW_SEASON_WINDOW,
} from './compute';

// ---- kleine fabriekjes voor testdata ----

function title(tmdb_id: number, over: Partial<Title> = {}): Title {
  return {
    tmdb_id, name: `Serie ${tmdb_id}`, year: 2022, poster_path: null,
    genres: [], seasons: [], episode_count: 0, runtime: 45, providers: [],
    overview: '', cast: [], added_by: 'u1', created_at: 1,
    ...over,
  } as Title;
}

function seasons(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    season_number: i + 1, episode_count: 8, name: `S${i + 1}`, air_year: 2020 + i,
  }));
}

function rating(title_id: number, user_id: string, over: Partial<Rating> = {}): Rating {
  return { title_id, user_id, score: null, status: null, note: null, service: null, seasons: [], updated_at: 1, ...over } as Rating;
}

function profile(id: string, over: Partial<Profile> = {}): Profile {
  return { id, name: id, avatar: null, color: null, services: [], updated_at: 1, ...over };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    profiles: [], titles: [], ratings: [], recommendations: [],
    reactions: [], activity: [], follows: [], comments: [],
    ...over,
  } as Snapshot;
}

// ---- selectTitles ----

describe('selectTitles', () => {
  const t1 = title(1, { genres: ['Drama'], seasons: seasons(3) });
  const t2 = title(2, { genres: ['Komedie'], seasons: seasons(1) });

  it('filtert op status van de gekozen persoon', () => {
    const s = snap({
      titles: [t1, t2],
      ratings: [
        rating(1, 'me', { status: 'watching' }),
        rating(2, 'me', { status: 'finished', seasons: [1] }),
      ],
    });
    expect(selectTitles(s, 'me', { status: 'watching', friend: 'me', services: [], genres: [], name: '' }).map((t) => t.tmdb_id)).toEqual([1]);
    expect(selectTitles(s, 'me', { status: 'all', friend: 'me', services: [], genres: [], name: '' })).toHaveLength(2);
  });

  it("'notdone' = gezien maar nog niet alle seizoenen afgevinkt", () => {
    const s = snap({
      titles: [t1, t2],
      ratings: [
        rating(1, 'me', { status: 'finished', seasons: [1] }),   // 1/3 → nog afkijken
        rating(2, 'me', { status: 'finished', seasons: [1] }),   // 1/1 → af
      ],
    });
    const got = selectTitles(s, 'me', { status: 'notdone', friend: 'me', services: [], genres: [], name: '' });
    expect(got.map((t) => t.tmdb_id)).toEqual([1]);
  });

  it("'' als vriend betekent jij + gevolgde vrienden, niet iedereen", () => {
    const s = snap({
      titles: [t1, t2],
      ratings: [rating(1, 'friend', { status: 'watching' }), rating(2, 'stranger', { status: 'watching' })],
      follows: [{ follower: 'me', followee: 'friend', created_at: 1 }],
    });
    const got = selectTitles(s, 'me', { status: 'all', friend: '', services: [], genres: [], name: '' });
    expect(got.map((t) => t.tmdb_id)).toEqual([1]);
  });

  it('filtert op genre en naam', () => {
    const s = snap({ titles: [t1, t2], ratings: [rating(1, 'me', {}), rating(2, 'me', {})] });
    expect(selectTitles(s, 'me', { status: 'all', friend: 'me', services: [], genres: ['Drama'], name: '' }).map((t) => t.tmdb_id)).toEqual([1]);
    expect(selectTitles(s, 'me', { status: 'all', friend: 'me', services: [], genres: [], name: 'serie 2' }).map((t) => t.tmdb_id)).toEqual([2]);
  });
});

// ---- aanbevelingen ----

describe('computedRecommendations', () => {
  it('slaat series over die je zelf al een cijfer gaf en geeft reden-genres terug', () => {
    // 2× drama met cijfers → smaakprofiel bevat Drama.
    const mine = [1, 2].map((id) => title(id, { genres: ['Drama'] }));
    const tip = title(10, { genres: ['Drama', 'Misdaad'] });
    const rated = title(11, { genres: ['Drama'] });
    const s = snap({
      titles: [...mine, tip, rated],
      ratings: [
        rating(1, 'me', { score: 8 }), rating(2, 'me', { score: 7 }),
        rating(10, 'friend', { score: 9 }),
        rating(11, 'friend', { score: 9 }), rating(11, 'me', { score: 6 }),
      ],
    });
    const got = computedRecommendations(s, 'me');
    const ids = got.map((x) => x.title.tmdb_id);
    expect(ids).toContain(10);
    expect(ids).not.toContain(11); // al zelf beoordeeld
    const tipRec = got.find((x) => x.title.tmdb_id === 10)!;
    expect(tipRec.groupAvg).toBe(9);
    expect(tipRec.reasonGenres).toEqual(['Drama']); // Misdaad zit niet in het profiel
  });
});

describe('nieuw seizoen', () => {
  const now = Date.now();
  const fresh = title(1, { seasons: seasons(3), new_season_at: now - 1000 });
  const stale = title(2, { seasons: seasons(3), new_season_at: now - NEW_SEASON_WINDOW - 1000 });

  it('newSeasonForYou: alleen recente nieuwe seizoenen van series die je 7+ gaf', () => {
    const s = snap({
      titles: [fresh, stale],
      ratings: [
        rating(1, 'me', { score: 8, seasons: [1, 2] }),
        rating(2, 'me', { score: 9, seasons: [1] }),
      ],
    });
    expect(newSeasonForYou(s, 'me').map((t) => t.tmdb_id)).toEqual([1]);
  });

  it('newSeasonForYou: niet bij een te laag cijfer of alles al gezien', () => {
    const s = snap({
      titles: [fresh],
      ratings: [rating(1, 'me', { score: 6, seasons: [1] })],
    });
    expect(newSeasonForYou(s, 'me')).toHaveLength(0);
    const s2 = snap({ titles: [fresh], ratings: [rating(1, 'me', { score: 9, seasons: [1, 2, 3] })] });
    expect(newSeasonForYou(s2, 'me')).toHaveLength(0);
  });

  it('hasUnseenNewSeason geldt alleen voor series op je lijst', () => {
    const s = snap({ titles: [fresh], ratings: [] });
    expect(hasUnseenNewSeason(s, fresh, 'me')).toBe(false);
  });
});

// ---- vriendenlijsten ----

describe('profiel-suggesties', () => {
  const me = profile('me');
  const active = profile('active');
  const empty = profile('empty');
  const hidden = profile('hidden', { hidden: true });

  const base = snap({
    profiles: [me, active, empty, hidden],
    titles: [title(1)],
    ratings: [rating(1, 'active', { score: 8 }), rating(1, 'hidden', { score: 7 })],
  });

  it('toont alleen actieve, niet-verborgen, nog niet gevolgde accounts', () => {
    expect(suggestedProfiles(base, 'me').map((p) => p.id)).toEqual(['active']);
  });

  it('inactiveFollowableProfiles geeft de lege accounts (voor "Toon alle")', () => {
    expect(inactiveFollowableProfiles(base, 'me').map((p) => p.id)).toEqual(['empty']);
  });

  it('hiddenProfiles geeft de verborgen accounts', () => {
    expect(hiddenProfiles(base, 'me').map((p) => p.id)).toEqual(['hidden']);
  });

  it('wie je al volgt verschijnt niet meer als suggestie', () => {
    const s = { ...base, follows: [{ follower: 'me', followee: 'active', created_at: 1 }] };
    expect(suggestedProfiles(s, 'me')).toHaveLength(0);
  });
});

// ---- jouw tips ----

describe('sentRecommendations', () => {
  function rec(id: string, to_user: string, title_id: number, dismissed = false): Recommendation {
    return { id, from_user: 'me', to_user, title_id, note: null, dismissed, created_at: 1 };
  }

  it('leidt de juiste status af uit wat de ontvanger deed', () => {
    const s = snap({
      profiles: [profile('me'), profile('a'), profile('b'), profile('c'), profile('d')],
      titles: [title(1), title(2), title(3), title(4)],
      recommendations: [rec('r1', 'a', 1), rec('r2', 'b', 2, true), rec('r3', 'c', 3), rec('r4', 'd', 4)],
      ratings: [
        rating(1, 'a', { status: 'want' }),
        rating(4, 'd', { score: 8 }), // cijfer zonder status telt als gezien
      ],
    });
    const by = Object.fromEntries(sentRecommendations(s, 'me').map((x) => [x.rec.id, x.status]));
    expect(by).toEqual({ r1: 'wishlist', r2: 'dismissed', r3: 'pending', r4: 'finished' });
  });
});

// ---- meldingen ----

describe('unseenCommentCount', () => {
  function comment(id: string, title_id: number, user_id: string, created_at: number): Comment {
    return { id, title_id, user_id, text: 'hoi', created_at };
  }

  it('telt alleen berichten van anderen bij series op jouw lijst, nieuwer dan "gezien"', () => {
    const s = snap({
      titles: [title(1), title(2)],
      ratings: [rating(1, 'me', {})],
      comments: [
        comment('c1', 1, 'friend', 100), // telt
        comment('c2', 1, 'me', 100),     // eigen bericht telt niet
        comment('c3', 2, 'friend', 100), // niet op mijn lijst
        comment('c4', 1, 'friend', 10),  // al gezien
      ],
    });
    expect(unseenCommentCount(s, 'me', 50)).toBe(1);
    expect(unseenCommentCount(s, 'me', 0)).toBe(2);
  });
});

// ---- smaak & cijfers ----

describe('tasteProfile / groupAverage', () => {
  it('smaakprofiel vereist minstens 2 cijfers per genre', () => {
    const s = snap({
      titles: [title(1, { genres: ['Drama'] }), title(2, { genres: ['Drama'] }), title(3, { genres: ['Komedie'] })],
      ratings: [rating(1, 'me', { score: 8 }), rating(2, 'me', { score: 6 }), rating(3, 'me', { score: 9 })],
    });
    const got = tasteProfile(s, 'me');
    expect(got).toEqual([{ genre: 'Drama', avg: 7, count: 2 }]);
  });

  it('groupAverage negeert beoordelingen zonder cijfer', () => {
    const s = snap({
      titles: [title(1)],
      ratings: [rating(1, 'a', { score: 8 }), rating(1, 'b', { status: 'want' })],
    });
    expect(groupAverage(s, 1)).toBe(8);
  });
});
