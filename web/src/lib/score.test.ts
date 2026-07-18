import { describe, it, expect } from 'vitest';
import { scoreColor, isGoldScore } from './score';

describe('scoreColor', () => {
  it('volgt de afgesproken kleurenschaal per cijfer', () => {
    expect(scoreColor(1)).toBe('rgb(139, 0, 0)');     // #8B0000
    expect(scoreColor(2)).toBe('rgb(165, 42, 42)');   // #A52A2A
    expect(scoreColor(3)).toBe('rgb(229, 57, 53)');   // #E53935
    expect(scoreColor(4)).toBe('rgb(244, 81, 30)');   // #F4511E
    expect(scoreColor(5)).toBe('rgb(251, 140, 0)');   // #FB8C00
    expect(scoreColor(6)).toBe('rgb(249, 168, 37)');  // #F9A825
    expect(scoreColor(7)).toBe('rgb(124, 179, 66)');  // #7CB342
    expect(scoreColor(8)).toBe('rgb(67, 160, 71)');   // #43A047
    expect(scoreColor(9)).toBe('rgb(46, 125, 50)');   // #2E7D32
    expect(scoreColor(10)).toBe('rgb(0, 122, 124)');  // #007A7C
  });

  it('interpoleert halve cijfers tussen de ankers', () => {
    // 8,5 ligt precies tussen 8 (67,160,71) en 9 (46,125,50).
    expect(scoreColor(8.5)).toBe('rgb(57, 143, 61)');
  });

  it('klemt waarden buiten 1-10 vast', () => {
    expect(scoreColor(0)).toBe(scoreColor(1));
    expect(scoreColor(12)).toBe(scoreColor(10));
  });
});

describe('isGoldScore', () => {
  it('alleen een (afgeronde) 10 krijgt de gouden rand', () => {
    expect(isGoldScore(10)).toBe(true);
    expect(isGoldScore(9.95)).toBe(true);
    expect(isGoldScore(9.5)).toBe(false);
    expect(isGoldScore(9)).toBe(false);
  });
});
