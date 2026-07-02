import { useEffect, useState } from 'react';
import type { Snapshot, Title, SearchResult } from '../lib/types';
import { POSTER_SMALL } from '../lib/types';
import {
  ratedCount, computedRecommendations, incomingRecommendations, MIN_RATINGS_FOR_PROFILE,
  newSeasonForYou,
} from '../lib/compute';
import { dismissRecommendation, discoverNewTv } from '../lib/api';
import TitleCard from './TitleCard';

interface Props {
  snap: Snapshot;
  userId: string;
  blind: boolean;
  onRecommend: (t: Title) => void;
  onAdd: (tmdbId: number) => void;
  onChange: () => void;
  toast: (m: string) => void;
}

// Korte, menselijke uitleg waarom een berekende tip in de lijst staat.
function computedReason(groupAvg: number, reasonGenres: string[]): string {
  const base = `Hoog gewaardeerd in de groep (gem. ${groupAvg.toFixed(1)})`;
  if (reasonGenres.length === 0) return base;
  return `${base} en past bij je smaak voor ${reasonGenres.slice(0, 2).join(' & ').toLowerCase()}`;
}

export default function ForYou({ snap, userId, blind, onRecommend, onAdd, onChange, toast }: Props) {
  const count = ratedCount(snap, userId);
  const incoming = incomingRecommendations(snap, userId);
  const newSeasons = newSeasonForYou(snap, userId);
  const ready = count >= MIN_RATINGS_FOR_PROFILE;
  const computed = ready ? computedRecommendations(snap, userId) : [];

  const [discover, setDiscover] = useState<SearchResult[]>([]);
  useEffect(() => {
    let alive = true;
    discoverNewTv().then((r) => { if (alive) setDiscover(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Alleen series tonen die nog niet in de app staan.
  const known = new Set(snap.titles.map((t) => t.tmdb_id));
  const newest = discover.filter((r) => !known.has(r.tmdb_id)).slice(0, 5);

  const dismiss = async (id: string) => {
    await dismissRecommendation(id);
    onChange();
  };

  return (
    <div className="page">
      {/* 1. Nieuw seizoen van een serie die je 7+ gaf */}
      {newSeasons.length > 0 && (
        <>
          <h2>🎉 1. Nieuw seizoen</h2>
          {newSeasons.map((title) => (
            <div key={title.tmdb_id} style={{ marginBottom: 16 }}>
              <div className="pill-recommend">Er is een nieuw seizoen van <b>{title.name}</b> — jij vond 'm goed!</div>
              <TitleCard snap={snap} title={title} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
            </div>
          ))}
        </>
      )}

      {/* 2. Persoonlijke aanraders van vrienden — altijd, ook onder de 5 */}
      {incoming.length > 0 && (
        <>
          <h2>2. Aanraders van vrienden</h2>
          {incoming.map(({ rec, from, title }) => (
            <div key={rec.id} style={{ marginBottom: 16 }}>
              <div className="pill-recommend">
                <b>{from?.name || 'Iemand'}</b> raadt jou aan{rec.note ? `: "${rec.note}"` : ''}
              </div>
              <TitleCard snap={snap} title={title!} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
              <button
                className="btn ghost"
                style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 2px', marginTop: 2 }}
                onClick={() => dismiss(rec.id)}
              >
                Verwijder deze aanrader
              </button>
            </div>
          ))}
        </>
      )}

      {!ready && (
        <div className="empty">
          <div className="big">⭐</div>
          <p>Je hebt <b>{count}</b> van de {MIN_RATINGS_FOR_PROFILE} series beoordeeld.</p>
          <p className="muted">Geef nog {MIN_RATINGS_FOR_PROFILE - count} cijfer{MIN_RATINGS_FOR_PROFILE - count === 1 ? '' : 's'} en je persoonlijke tips gaan vanzelf branden.</p>
        </div>
      )}

      {/* 3. Berekende tips op basis van je smaak + groepscijfers */}
      {ready && computed.length > 0 && (
        <>
          <h2>3. Misschien iets voor jou</h2>
          {computed.map(({ title, groupAvg, reasonGenres }) => (
            <div key={title.tmdb_id} style={{ marginBottom: 16 }}>
              <div className="pill-recommend">{computedReason(groupAvg, reasonGenres)}</div>
              <TitleCard snap={snap} title={title} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
            </div>
          ))}
        </>
      )}

      {/* 4. Ontdek — de nieuwste series bij TMDb die nog niet in de app staan */}
      {newest.length > 0 && (
        <>
          <h2>✨ Nieuw bij TMDb</h2>
          <p className="muted" style={{ fontSize: 13, margin: '-4px 4px 10px' }}>
            De nieuwste series — nog niet op jullie lijst.
          </p>
          {newest.map((r) => (
            <button key={r.tmdb_id} className="suggestion" onClick={() => onAdd(r.tmdb_id)}>
              {r.poster_path ? <img src={POSTER_SMALL + r.poster_path} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s-name">{r.name}</div>
                <div className="title-sub">{r.year || '—'}</div>
              </div>
              <span className="chip" style={{ flexShrink: 0, color: 'var(--accent)', borderColor: 'var(--accent)' }}>+ Toevoegen</span>
            </button>
          ))}
        </>
      )}

      {ready && computed.length === 0 && incoming.length === 0 && newSeasons.length === 0 && newest.length === 0 && (
        <p className="muted center" style={{ padding: 30 }}>Nog geen tips — voeg meer series toe of laat vrienden cijfers geven.</p>
      )}
    </div>
  );
}
