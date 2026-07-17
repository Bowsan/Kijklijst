// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { CountUp } from './widgets';

// Regressie voor "statistieken staan op 0": op iOS in spaarstand (of een tab
// die op de achtergrond laadt) vuurt requestAnimationFrame soms nooit — de
// teller moet dan alsnog op de eindwaarde uitkomen.
describe('CountUp', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('toont de eindwaarde ook als requestAnimationFrame nooit vuurt', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { container } = render(<span><CountUp value={220} /></span>);
    expect(container.textContent).toBe('0');
    act(() => { vi.advanceTimersByTime(1300); });
    expect(container.textContent).toBe('220');
  });

  it('telt met een werkende animatie gewoon op naar de eindwaarde', () => {
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb((now += 100)), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const { container } = render(<span><CountUp value={42} /></span>);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.textContent).toBe('42');
  });

  it('respecteert decimalen en suffix', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { container } = render(<span><CountUp value={7.5} decimals={1} suffix="u" /></span>);
    act(() => { vi.advanceTimersByTime(1300); });
    expect(container.textContent).toBe('7.5u');
  });
});
