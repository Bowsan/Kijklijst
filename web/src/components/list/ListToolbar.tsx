import { useState, type ReactNode } from 'react';
import type { SortKey, SortDir } from '../../lib/prefs';
import { SORT_OPTIONS, sortLabel } from '../../lib/listOptions';

/** Eén actief filter als wegklikbare chip. */
export interface FilterChip {
  key: string;
  label: ReactNode;
  onRemove: () => void;
}

interface Props {
  /** Regel 1 — zoeken binnen de lijst. */
  search: string;
  onSearch: (v: string) => void;
  /** Naam van de actieve statustab, voor de placeholder ("Zoek in Gezien"). */
  searchScope: string;
  activeFilterCount: number;
  onOpenFilters: () => void;
  compact: boolean;
  onToggleCompact: () => void;
  /** Regel 2 — actieve filters en sorteren. */
  chips: FilterChip[];
  onClearAll: () => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onPickSort: (key: SortKey, dir: SortDir) => void;
}

/** De werkbalk boven de lijst: regel 1 = zoeken + filter-/compactknop,
 *  regel 2 = actieve filterchips links en de sorteerkeuze rechts. */
export default function ListToolbar({
  search, onSearch, searchScope, activeFilterCount, onOpenFilters, compact, onToggleCompact,
  chips, onClearAll, sortKey, sortDir, onPickSort,
}: Props) {
  // Het sorteermenu is puur lokale werkbalk-state.
  const [showSortMenu, setShowSortMenu] = useState(false);

  return (
    <div className="action-bar">
      {/* Regel 1: zoekbalk vult de breedte, ronde knoppen rechts */}
      <div className="ab-search-row">
        <div className="ab-search">
          <svg className="ab-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`Zoek in ${searchScope}`}
            aria-label={`Zoek in ${searchScope}`}
          />
          {search && (
            <button className="ab-search-clear" aria-label="Zoekterm wissen" onClick={() => onSearch('')}>✕</button>
          )}
        </div>
        <button
          className={`ab-filter ${activeFilterCount > 0 ? 'on' : ''}`}
          aria-label={activeFilterCount > 0 ? `Filters (${activeFilterCount} actief)` : 'Filters'}
          title="Filters"
          onClick={onOpenFilters}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="8" x2="21" y2="8" />
            <line x1="3" y1="16" x2="21" y2="16" />
            <circle cx="9" cy="8" r="2.4" />
            <circle cx="15" cy="16" r="2.4" />
          </svg>
        </button>
        <button
          className={`ab-compact ${compact ? 'on' : ''}`}
          aria-pressed={compact}
          aria-label={compact ? 'Volledige weergave' : 'Compacte weergave'}
          title={compact ? 'Volledige weergave' : 'Compacte weergave'}
          onClick={onToggleCompact}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="3.6" cy="6" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="3.6" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="3.6" cy="18" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {/* Regel 2: filterchips (wrappen over meerdere regels) links, sorteren rechts */}
      <div className="ab-sort-row">
        {chips.length > 0 ? (
          <div className="ab-chips-wrap">
            <div className="ab-chips">
              {chips.map((c) => (
                <button key={c.key} className="active-chip" onClick={c.onRemove}>{c.label} ✕</button>
              ))}
              {chips.length >= 2 && (
                <button className="ab-clear-all" onClick={onClearAll}>Wis alles</button>
              )}
            </div>
          </div>
        ) : (
          <div className="ab-chips-spacer" />
        )}
        <div className="ab-sort">
          <button className="sort-btn" onClick={() => setShowSortMenu((v) => !v)} aria-haspopup="listbox" aria-expanded={showSortMenu}>
            {sortLabel(sortKey)}
            <svg className="sort-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showSortMenu && (
            <>
              <div className="popover-backdrop" onClick={() => setShowSortMenu(false)} />
              <div className="sort-menu">
                {SORT_OPTIONS.map((o) => {
                  const active = sortKey === o.key;
                  return (
                    <button
                      key={o.label}
                      className={active ? 'active' : ''}
                      onClick={() => { onPickSort(o.key, o.dir); setShowSortMenu(false); }}
                    >
                      {o.label}
                      {active && <span style={{ float: 'right' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
