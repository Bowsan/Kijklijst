// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TitleCard from './TitleCard';
import type { Snapshot, Title, Rating, Profile } from '../lib/types';

// Regressie voor "Alles bij seizoenen reageert traag": de seizoenknopjes
// moeten optimistisch direct omschakelen, nog vóór de server heeft geantwoord.

const me: Profile = { id: 'user-me', name: 'Mika', avatar: null, color: null, services: [], updated_at: 1 };
const title: Title = {
  tmdb_id: 1, name: 'Testserie', year: 2024, poster_path: null,
  genres: ['Drama'],
  seasons: [
    { season_number: 1, episode_count: 8, name: 'S1' },
    { season_number: 2, episode_count: 8, name: 'S2' },
    { season_number: 3, episode_count: 8, name: 'S3' },
  ],
  episode_count: 24, runtime: 45, providers: [], overview: null, cast: [],
  added_by: 'user-me', created_at: 1,
};
const mine: Rating = { title_id: 1, user_id: 'user-me', score: null, status: 'watching', note: null, service: null, seasons: [], updated_at: 1 };
const snap: Snapshot = {
  profiles: [me], titles: [title], ratings: [mine], recommendations: [],
  reactions: [], activity: [], follows: [], comments: [], comment_reactions: [],
};

describe('TitleCard seizoenen', () => {
  beforeEach(() => {
    // Server die nooit antwoordt: de UI mag daar niet op wachten.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const renderCard = () => render(
    <TitleCard
      snap={snap} title={title} userId="user-me" blind={false}
      onRecommend={() => {}} onChange={() => {}} toast={() => {}}
      initialExpanded
    />,
  );

  it('zet "Alles" direct alle seizoenen aan, zonder op de server te wachten', () => {
    const { container } = renderCard();
    const alles = [...container.querySelectorAll('.seasons button')].find((b) => b.textContent === 'Alles')!;
    fireEvent.click(alles);
    const on = [...container.querySelectorAll('.seasons button.on')].map((b) => b.textContent);
    expect(on).toContain('Alles');
    expect(on.join(' ')).toMatch(/S1/);
    expect(on.join(' ')).toMatch(/S3/);
  });

  it('schakelt een los seizoen direct om', () => {
    const { container } = renderCard();
    const s2 = [...container.querySelectorAll('.seasons button')].find((b) => b.textContent?.startsWith('S2'))!;
    expect(s2.classList.contains('on')).toBe(false);
    fireEvent.click(s2);
    expect(s2.classList.contains('on')).toBe(true);
  });
});
