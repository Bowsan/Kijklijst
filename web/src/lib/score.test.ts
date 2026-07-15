import { describe, it, expect } from 'vitest';
import { scoreColor, isGoldScore } from './score';

describe('scoreColor', () => {
  it('volgt de afgesproken kleurschaal per band', () => {
    expect(scoreColor(1)).toBe('rgb(127, 29, 29)');   // donkerrood
    expect(scoreColor(3)).toBe('rgb(127, 29, 29)');   // nog steeds donkerrood
    expect(scoreColor(4)).toBe('rgb(220, 47, 47)');   // rood
    expect(scoreColor(5)).toBe('rgb(220, 47, 47)');
    expect(scoreColor(6)).toBe('rgb(232, 112, 61)');  // lichter rood/oranje
    expect(scoreColor(7)).toBe('rgb(103, 178, 111)'); // lichtgroen
    expect(scoreColor(8)).toBe('rgb(31, 157, 91)');   // groen
    expect(scoreColor(9)).toBe('rgb(148, 168, 33)');  // geelgroen
    expect(scoreColor(10)).toBe('rgb(212, 160, 23)'); // goud
  });

  it('interpoleert halve cijfers tussen de ankers', () => {
    // 8,5 ligt precies tussen groen (31,157,91) en geelgroen (148,168,33).
    expect(scoreColor(8.5)).toBe('rgb(90, 163, 62)');
  });

  it('klemt waarden buiten 1-10 vast', () => {
    expect(scoreColor(0)).toBe(scoreColor(1));
    expect(scoreColor(12)).toBe(scoreColor(10));
  });
});

describe('isGoldScore', () => {
  it('alleen een (afgeronde) 10 is goud', () => {
    expect(isGoldScore(10)).toBe(true);
    expect(isGoldScore(9.95)).toBe(true);
    expect(isGoldScore(9.5)).toBe(false);
    expect(isGoldScore(9)).toBe(false);
  });
});
