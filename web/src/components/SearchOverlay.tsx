import type { ReactNode } from 'react';
import type { Snapshot, Title, SearchResult, Status } from '../lib/types';
import { posterUrl } from '../lib/types';
import { myRating } from '../lib/compute';
import StatusBadge from './StatusBadge';

/** Eén regel in de zoekresultaten: posterminiatuur, naam + jaar, en rechts een
 *  vrije "staart" (statusbadge of een toevoeg-chip). */
function SuggestionRow({ poster, name, sub, onClick, children }: {
  poster: string | null | undefined;
  name: ReactNode;
  sub: ReactNode;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button className="suggestion" onClick={onClick}>
      {poster ? <img src={posterUrl(poster, 'small')} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="s-name">{name}</div>
        <div className="title-sub">{sub}</div>
      </div>
      {children}
    </button>
  );
}

interface Props {
  snap: Snapshot;
  userId: string;
  searchQuery: string;
  /** Series die al op je eigen lijst staan (voorkomt dubbel toevoegen). */
  myMatches: Title[];
  /** TMDb-treffers die nog niet op je lijst staan. */
  addableResults: SearchResult[];
  onOpenExisting: (tmdbId: number) => void;
  onAdd: (tmdbId: number) => void;
  onManualAdd: () => void;
}

/** Het zoekscherm van de lijst: al-op-je-lijst, toe te voegen TMDb-treffers en
 *  als laatste altijd de mogelijkheid om handmatig toe te voegen. */
export default function SearchOverlay({
  snap, userId, searchQuery, myMatches, addableResults, onOpenExisting, onAdd, onManualAdd,
}: Props) {
  return (
    <div className="page" style={{ paddingBottom: 'calc(84px + var(--safe-bottom) + var(--kb-inset, 0px))' }}>
      {/* Al op je lijst — zodat je dubbel toevoegen voorkomt */}
      {myMatches.length > 0 && (
        <>
          <div className="lsp-label" style={{ marginTop: 4 }}>Al op je lijst:</div>
          {myMatches.map((t) => {
            const r = myRating(snap, t.tmdb_id, userId);
            const badge: Status | null = r?.status ?? null;
            return (
              <SuggestionRow
                key={t.tmdb_id}
                poster={t.poster_path}
                name={t.name}
                sub={t.year || '—'}
                onClick={() => onOpenExisting(t.tmdb_id)}
              >
                {(badge || r?.score != null) && <StatusBadge status={badge} score={r?.score ?? null} />}
              </SuggestionRow>
            );
          })}
        </>
      )}

      {/* Toevoegen — TMDb-suggesties die nog niet op je lijst staan */}
      <div className="lsp-label" style={{ marginTop: myMatches.length > 0 ? 16 : 4 }}>
        {myMatches.length > 0 ? 'Andere series toevoegen:' : 'Toevoegen:'}
      </div>
      {addableResults.map((r) => (
        <SuggestionRow
          key={r.tmdb_id}
          poster={r.poster_path}
          name={r.name}
          sub={r.year || '—'}
          onClick={() => onAdd(r.tmdb_id)}
        >
          <span className="chip" style={{ flexShrink: 0, color: 'var(--accent)', borderColor: 'var(--accent)' }}>+ Toevoegen</span>
        </SuggestionRow>
      ))}
      <button className="suggestion" onClick={onManualAdd}>
        <div className="poster" style={{ width: 36, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>➕</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="s-name">"{searchQuery}" handmatig toevoegen</div>
          <div className="title-sub">Niet gevonden? Voeg de serie zelf toe.</div>
        </div>
      </button>
    </div>
  );
}
