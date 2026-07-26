// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribe, STILTE_MAX, WAAKINTERVAL } from './live';

// Namaak-EventSource: we sturen zelf events en kunnen zien of er (opnieuw)
// verbonden wordt.
class FakeES {
  static CLOSED = 2;
  static OPEN = 1;
  static instances: FakeES[] = [];
  readyState = FakeES.OPEN;
  onerror: (() => void) | null = null;
  private luisteraars = new Map<string, (() => void)[]>();
  constructor(public url: string) { FakeES.instances.push(this); }
  addEventListener(type: string, fn: () => void) {
    this.luisteraars.set(type, [...(this.luisteraars.get(type) ?? []), fn]);
  }
  close() { this.readyState = FakeES.CLOSED; }
  stuur(type: string) { for (const fn of this.luisteraars.get(type) ?? []) fn(); }
}

let klok = 0;
const now = () => klok;
const zetZichtbaar = (v: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });

beforeEach(() => {
  klok = 0;
  FakeES.instances = [];
  zetZichtbaar('visible');
  vi.stubGlobal('EventSource', FakeES as unknown as typeof EventSource);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('subscribe (live bijwerken)', () => {
  it('verbindt meteen bij starten', () => {
    const stop = subscribe(() => {}, { now });
    expect(FakeES.instances).toHaveLength(1);
    stop();
  });

  it('ververst zodra de app weer in beeld komt', () => {
    const onChange = vi.fn();
    const stop = subscribe(onChange, { now });
    expect(onChange).not.toHaveBeenCalled();

    // App naar de achtergrond: verbinding wordt losgelaten.
    zetZichtbaar('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(FakeES.instances[0].readyState).toBe(FakeES.CLOSED);

    // Terug in beeld: meteen nieuwe gegevens én een nieuwe verbinding.
    klok += 30_000;
    zetZichtbaar('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(FakeES.instances).toHaveLength(2);
    stop();
  });

  it('ververst bij terugkeer uit de bfcache (pageshow)', () => {
    const onChange = vi.fn();
    const stop = subscribe(onChange, { now });
    klok += 30_000;
    window.dispatchEvent(new Event('pageshow'));
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('bundelt verversingen die vlak na elkaar komen', () => {
    const onChange = vi.fn();
    const stop = subscribe(onChange, { now });
    FakeES.instances[0].stuur('state');
    FakeES.instances[0].stuur('state');
    FakeES.instances[0].stuur('state');
    expect(onChange).toHaveBeenCalledTimes(1);

    klok += 2_000; // voorbij het bundelvenster
    FakeES.instances[0].stuur('state');
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('merkt een stilgevallen stream op en verbindt opnieuw', () => {
    const onChange = vi.fn();
    const stop = subscribe(onChange, { now });

    // Ruim binnen de tijd: hartslag komt binnen, dus niets aan de hand.
    klok += 30_000;
    FakeES.instances[0].stuur('ping');
    vi.advanceTimersByTime(WAAKINTERVAL);
    expect(FakeES.instances).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();

    // Daarna valt de stream stil: geen hartslag meer.
    klok += STILTE_MAX + 1_000;
    vi.advanceTimersByTime(WAAKINTERVAL);
    expect(FakeES.instances).toHaveLength(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('laat de waakhond met rust zolang de app in de achtergrond staat', () => {
    const onChange = vi.fn();
    const stop = subscribe(onChange, { now });
    zetZichtbaar('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    klok += STILTE_MAX * 3;
    vi.advanceTimersByTime(WAAKINTERVAL * 3);
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('ruimt alles op na afmelden', () => {
    const onChange = vi.fn();
    const stop = subscribe(onChange, { now });
    stop();

    klok += STILTE_MAX * 2;
    vi.advanceTimersByTime(WAAKINTERVAL * 2);
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onChange).not.toHaveBeenCalled();
    expect(FakeES.instances).toHaveLength(1);
  });
});
