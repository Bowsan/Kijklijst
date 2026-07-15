import { describe, it, expect, vi, afterEach } from 'vitest';
import { fmt1, timeAgo, fmtDateTime } from './format';

afterEach(() => vi.useRealTimers());

describe('fmt1', () => {
  it('één decimaal met een komma', () => {
    expect(fmt1(8.25)).toBe('8,3');
    expect(fmt1(7)).toBe('7,0');
  });
});

describe('timeAgo', () => {
  it('kiest de juiste eenheid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
    const now = Date.now();
    expect(timeAgo(now - 30 * 1000)).toBe('net');
    expect(timeAgo(now - 5 * 60 * 1000)).toBe('5 min');
    expect(timeAgo(now - 3 * 3600 * 1000)).toBe('3 u');
    expect(timeAgo(now - 2 * 24 * 3600 * 1000)).toBe('2 d');
  });
});

describe('fmtDateTime', () => {
  it('vandaag alleen tijd, anders datum + tijd', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
    expect(fmtDateTime(new Date('2026-07-15T09:05:00').getTime())).toBe('09:05');
    expect(fmtDateTime(new Date('2026-03-03T14:30:00').getTime())).toMatch(/3 mrt.* 14:30/);
  });
});
