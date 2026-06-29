import { useEffect, useRef, useState } from 'react';
import { searchTmdb } from '../lib/api';
import type { SearchResult } from '../lib/types';
import { POSTER_SMALL } from '../lib/types';

interface Props {
  onPick: (result: SearchResult) => void;
  onManualAdd?: (query: string) => void;
  placeholder?: string;
}

export default function SearchBox({ onPick, onManualAdd, placeholder }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await searchTmdb(q, ctrl.signal);
        setResults(r);
        setOpen(true);
      } catch {
        /* afgebroken of mislukt */
      }
    }, 250); // debounce zodat suggesties soepel binnenkomen
    return () => clearTimeout(t);
  }, [q]);

  const canManual = !!onManualAdd && q.trim().length >= 2;

  return (
    <div className="search-wrap">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => (results.length || canManual) && setOpen(true)}
        placeholder={placeholder || 'Zoek een serie…'}
        autoComplete="off"
      />
      {open && (results.length > 0 || canManual) && (
        <div className="suggestions">
          {results.map((r) => (
            <button
              key={r.tmdb_id}
              className="suggestion"
              onClick={() => {
                onPick(r);
                setQ('');
                setResults([]);
                setOpen(false);
              }}
            >
              {r.poster_path ? <img src={POSTER_SMALL + r.poster_path} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
              <div>
                <div className="s-name">{r.name}</div>
                <div className="title-sub">{r.year || '—'}</div>
              </div>
            </button>
          ))}
          {canManual && (
            <button
              className="suggestion"
              onClick={() => {
                onManualAdd!(q.trim());
                setQ('');
                setResults([]);
                setOpen(false);
              }}
            >
              <div className="poster" style={{ width: 36, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>➕</div>
              <div>
                <div className="s-name">"{q.trim()}" handmatig toevoegen</div>
                <div className="title-sub">Niet gevonden? Voeg de serie zelf toe.</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
