import { useEffect, useRef, useState } from 'react';
import { searchTmdb } from '../lib/api';
import type { SearchResult } from '../lib/types';
import { POSTER_SMALL } from '../lib/types';

interface Props {
  /** De live filtertekst (gedeeld met de lijst erachter). */
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onAdd: (r: SearchResult) => void;
  onManualAdd: (query: string) => void;
  /** tmdb_id's die al op je lijst staan — die hoeven niet toegevoegd te worden. */
  inList: Set<number>;
}

/**
 * Eén balk die zoeken, filteren en toevoegen combineert: terwijl je typt filtert de
 * lijst erachter live op naam, en series die er nog niet in staan kun je hier toevoegen.
 */
export default function ListSearchBar({ value, onChange, onClose, onAdd, onManualAdd, inList }: Props) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        setResults(await searchTmdb(q, ctrl.signal));
      } catch {
        /* afgebroken of mislukt */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  const q = value.trim();
  // Alleen series die nog niet op je lijst staan zijn "toe te voegen".
  const addable = results.filter((r) => !inList.has(r.tmdb_id));

  return (
    <>
      {q.length >= 2 && (
        <div className="list-search-panel">
          <div className="lsp-label">Niet op je lijst — toevoegen:</div>
          {addable.map((r) => (
            <button key={r.tmdb_id} className="suggestion" onClick={() => onAdd(r)}>
              {r.poster_path ? <img src={POSTER_SMALL + r.poster_path} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s-name">{r.name}</div>
                <div className="title-sub">{r.year || '—'}</div>
              </div>
              <span className="chip" style={{ flexShrink: 0, color: 'var(--accent)', borderColor: 'var(--accent)' }}>+ Toevoegen</span>
            </button>
          ))}
          <button className="suggestion" onClick={() => onManualAdd(q)}>
            <div className="poster" style={{ width: 36, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>➕</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s-name">"{q}" handmatig toevoegen</div>
              <div className="title-sub">Niet gevonden? Voeg de serie zelf toe.</div>
            </div>
          </button>
        </div>
      )}
      <div className="fab-search-bar">
        <input
          autoFocus
          placeholder="Zoek in lijst of voeg toe…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button className="close" aria-label="Sluiten" onClick={onClose}>✕</button>
      </div>
    </>
  );
}
