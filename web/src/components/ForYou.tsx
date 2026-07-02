import { useEffect, useState } from 'react';
import type { Snapshot, Title, SearchResult } from '../lib/types';
import { POSTER_BASE } from '../lib/types';
import {
  ratedCount, computedRecommendations, incomingRecommendations, MIN_RATINGS_FOR_PROFILE,
  newSeasonForYou, myRating,
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

  // Jouw wishlist krijgt een eigen lijst; die series horen niet bij de tips.
  const wishlist = snap.titles
    .filter((t) => myRating(snap, t.tmdb_id, userId)?.status === 'want')
    .sort((a, b) => (myRating(snap, b.tmdb_id, userId)?.updated_at ?? 0) - (myRating(snap, a.tmdb_id, userId)?.updated_at ?? 0));
  const wishlistIds = new Set(wishlist.map((t) => t.tmdb_id));
  const freshComputed = computed.filter((c) => !wishlistIds.has(c.title.tmdb_id));

  const dismiss = async (id: string) => {
    await dismissRecommendation(id);
    onChange();
  };

  return (
    <div className="page">
      {/* 1. Nieuw seizoen van een serie die je 7+ gaf */}
      {newSeasons.length > 0 && (
        <>
          <h2>Nieuw seizoen</h2>
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
          <h2>Aanraders van vrienden</h2>
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

      {/* Berekende tips op basis van je smaak + groepscijfers (zonder cijfers per serie) */}
      {ready && freshComputed.length > 0 && (
        <>
          <h2>Misschien iets voor jou?</h2>
          <p className="muted" style={{ fontSize: 13, margin: '-4px 4px 12px' }}>
            Hoog gewaardeerde series in jouw groep en passend genre.
          </p>
          {freshComputed.map(({ title }) => (
            <div key={title.tmdb_id} style={{ marginBottom: 16 }}>
              <TitleCard snap={snap} title={title} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
            </div>
          ))}
        </>
      )}

      {/* Jouw wishlist — series die je zelf al apart hebt gezet */}
      {wishlist.length > 0 && (
        <>
          <h2>Jouw Wishlist</h2>
          {wishlist.map((title) => (
            <div key={title.tmdb_id} style={{ marginBottom: 16 }}>
              <TitleCard snap={snap} title={title} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
            </div>
          ))}
        </>
      )}

      {/* Ontdek — de nieuwste series bij TMDb die nog niet in de app staan */}
      {newest.length > 0 && (
        <>
          <h2>Nieuw bij TMDb</h2>
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

      {ready && freshComputed.length === 0 && wishlist.length === 0 && incoming.length === 0 && newSeasons.length === 0 && newest.length === 0 && (
        <p className="muted center" style={{ padding: 30 }}>Nog geen tips — voeg meer series toe of laat vrienden cijfers geven.</p>
      )}
    </div>
  );
}
