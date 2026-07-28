// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SearchOverlay from './SearchOverlay';
import type { Snapshot } from '../lib/types';

const snap = {
  profiles: [], titles: [], ratings: [], recommendations: [],
  reactions: [], activity: [], follows: [], comments: [],
} as unknown as Snapshot;

const basis = {
  snap,
  userId: 'user-me',
  searchQuery: 'Severance',
  myMatches: [],
  addableResults: [],
  onOpenExisting: () => {},
  onAdd: () => {},
  onManualAdd: () => {},
};

describe('SearchOverlay', () => {
  it('meldt het als het zoeken zelf mislukte — niet als "niet gevonden"', () => {
    const { container } = render(<SearchOverlay {...basis} searchError="TMDb 429: te veel verzoeken" />);
    const tekst = container.textContent || '';
    expect(tekst).toContain('Zoeken lukt nu even niet');
    // De reden helpt bij het uitzoeken, dus die hoort erbij te staan.
    expect(tekst).toContain('TMDb 429');
    // En juist NIET de indruk wekken dat de serie niet bestaat.
    expect(tekst).not.toContain('Geen series gevonden');
  });

  it('zegt "geen series gevonden" als het zoeken wél lukte maar niets opleverde', () => {
    const { container } = render(<SearchOverlay {...basis} searchError={null} />);
    const tekst = container.textContent || '';
    expect(tekst).toContain('Geen series gevonden');
    expect(tekst).not.toContain('Zoeken lukt nu even niet');
  });
});
