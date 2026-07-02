import { useEffect, useState } from 'react';
import type { Snapshot, Title, SearchResult } from '../lib/types';
import { POSTER_BASE } from '../lib/types';
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

// Menselijke uitleg waarom een berekende tip in de lijst staat — als losse regel,
// niet als een zwaar kadertje.
function ComputedReason({ groupAvg, reasonGenres }: { groupAvg: number; reasonGenres: string[] }) {
  return (
    <div className="rec-reason">
      <span className="ric">✨</span>
      <span>
        Hoog gewaardeerd in de groep <b>(gem. {groupAvg.toFixed(1)})</b>
        {reasonGenres.length > 0 && (
          <> en past bij je smaak voor <b>{reasonGenres.slice(0, 2).join(' & ').toLowerCase()}</b></>
        )}
      </span>
    </div>
  );
}

// Ontdek-kaart voor een nog niet toegevoegde TMDb-serie: poster, omschrijving,
// IMDb-link en een knop om 'm op de wishlist te zetten.
function DiscoverCard({ item, onAdd }: { item: SearchResult; onAdd: (tmdbId: number) => void }) {
  const [open, setOpen] = useState(false);
  const imdbUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(`${item.name} ${item.year || ''}`.trim())}&s=tt&ttype=tv`;
  return (
    <div className="card discover-card">
      <div className="title-head">
        {item.poster_path
          ? <img className="poster" src={POSTER_BASE + item.poster_path} alt="" loading="lazy" />
          : <div className="poster" />}
        <div className="title-meta">
          <h3>{item.name}</h3>
          <div className="title-sub">{item.year || '—'}</div>
          {item.overview
            ? (
              <p
                className={`dc-overview${open ? '' : ' clamp'}`}
                onClick={() => setOpen((o) => !o)}
                title={open ? 'Inklappen' : 'Lees meer'}
              >
                {item.overview}
              </p>
            )
            : <p className="dc-overview empty-note">Nog geen omschrijving beschikbaar.</p>}
        </div>
      </div>
      <div className="dc-actions">
        <a className="imdb-link" href={imdbUrl} target="_blank" rel="noopener noreferrer">
          <span className="imdb-badge">IMDb</span> Bekijk op IMDb ↗
        </a>
        <button className="btn primary dc-add" onClick={() => onAdd(item.tmdb_id)}>+ Toevoegen</button>
      </div>
    </div>
  );
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
          <h2>1. Nieuw seizoen</h2>
          {newSeasons.map((title) => (
            <div key={title.tmdb_id} style={{ marginBottom: 16 }}>
              <div className="rec-reason">
                <span className="ric">🎉</span>
                <span>Er is een nieuw seizoen van <b>{title.name}</b> — jij vond 'm goed!</span>
              </div>
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
              <div className="rec-reason">
                <span className="ric">💌</span>
                <span><b>{from?.name || 'Iemand'}</b> raadt jou aan{rec.note ? `: "${rec.note}"` : ''}</span>
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
              <ComputedReason groupAvg={groupAvg} reasonGenres={reasonGenres} />
              <TitleCard snap={snap} title={title} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
            </div>
          ))}
        </>
      )}

      {/* 4. Ontdek — de nieuwste series bij TMDb die nog niet in de app staan */}
      {newest.length > 0 && (
        <>
          <h2>4. Nieuw bij TMDb</h2>
          <p className="muted" style={{ fontSize: 13, margin: '-4px 4px 12px' }}>
            De nieuwste series — nog niet op jullie lijst. Tik op de tekst voor de hele omschrijving.
          </p>
          {newest.map((r) => (
            <div key={r.tmdb_id} style={{ marginBottom: 16 }}>
              <DiscoverCard item={r} onAdd={onAdd} />
            </div>
          ))}
        </>
      )}

      {ready && computed.length === 0 && incoming.length === 0 && newSeasons.length === 0 && newest.length === 0 && (
        <p className="muted center" style={{ padding: 30 }}>Nog geen tips — voeg meer series toe of laat vrienden cijfers geven.</p>
      )}
    </div>
  );
}
