import { describe, it, expect } from 'vitest';
import { genreEmoji } from './genres';

describe('genreEmoji', () => {
  it('herkent NL- en EN-genrenamen', () => {
    expect(genreEmoji('Drama')).toBe('🎭');
    expect(genreEmoji('Misdaad')).toBe('🕵️');
    expect(genreEmoji('Crime')).toBe('🕵️');
    expect(genreEmoji('Mysterie')).toBe('🔍');
    expect(genreEmoji('Sci-Fi & Fantasy')).toBe('🚀');
    expect(genreEmoji('Actie & Avontuur')).toBe('💥');
    expect(genreEmoji('Komedie')).toBe('😄');
    expect(genreEmoji('Oorlog & Politiek')).toBe('⚔️');
  });

  it('valt terug op een neutraal filmstrip-icoon bij onbekend genre', () => {
    expect(genreEmoji('Iets Onbekends')).toBe('🎞️');
  });
});
