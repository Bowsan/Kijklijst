import type { CSSProperties, ReactNode } from 'react';

// CSS-variabelen voor het glijdende onderstreepje (aantal tabs + actieve index).
// index < 0 (geen actieve tab, bijv. bij een filterstatus) verbergt het streepje.
export const tabStyle = (count: number, index: number): CSSProperties =>
  ({ '--tab-count': count, '--tab-index': Math.max(0, index), '--tab-op': index < 0 ? 0 : 1 } as CSSProperties);

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  /** Extra class op de knop (bijv. `tab-badged` voor het ongelezen-bolletje). */
  className?: string;
}

/** De tabbalk die op de lijst, het dashboard en bij vrienden bovenaan pint,
 *  inclusief het glijdende onderstreepje. Puur presentatie. */
export default function TabStrip<K extends string>({ label, tabs, active, onSelect }: {
  /** Toegankelijkheidsnaam van de balk ("Kijkstatus", "Dashboard-secties", …). */
  label: string;
  tabs: TabItem<K>[];
  active: K;
  onSelect: (key: K) => void;
}) {
  const index = tabs.findIndex((t) => t.key === active);
  return (
    <div className="status-tabs" role="tablist" aria-label={label} style={tabStyle(tabs.length, index)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={[t.className, active === t.key ? 'sel' : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
