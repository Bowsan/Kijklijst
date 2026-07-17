// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import Thumb from './Thumb';

// Regressie voor "posters blijven leeg": één automatische nieuwe poging bij
// een laadfout, daarna de initiaal-placeholder — nooit een blanco vlak.
describe('Thumb', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('toont direct de placeholder zonder poster-pad', () => {
    const { container } = render(<Thumb path={null} name="Prison Break" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('P');
  });

  it('probeert één keer opnieuw en valt daarna terug op de placeholder', () => {
    const { container } = render(<Thumb path="/x.jpg" name="Sense8" />);
    const img1 = container.querySelector('img')!;
    expect(img1).not.toBeNull();

    // Eerste fout → na 1,2s een nieuwe poging (nieuw img-element).
    fireEvent.error(img1);
    act(() => { vi.advanceTimersByTime(1300); });
    const img2 = container.querySelector('img')!;
    expect(img2).not.toBeNull();

    // Tweede fout → initiaal-placeholder in plaats van een leeg vlak.
    fireEvent.error(img2);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('S');
  });
});
