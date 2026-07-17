import { useEffect, useState } from 'react';
import type { Snapshot, Title, SearchResult } from '../lib/types';
import { posterUrl, PERSON_IMG } from '../lib/types';
import {
  ratedCount, computedRecommendations, incomingRecommendations, MIN_RATINGS_FOR_PROFILE,
  newSeasonForYou, myRating, sharedFavoriteActor, favoriteSuggestions,
  favoriteActors, favoriteCreators,
} from '../lib/compute';
import { dismissRecommendation, respondRecommendation, discoverNewTv, discoverByPeople, type PersonSuggestion, type SuggestPerson } from '../lib/api';
import TitleCard from './TitleCard';
import PosterFallback from './PosterFallback';

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
  const [posterFailed, setPosterFailed] = useState(false);
  const imdbUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(`${item.name} ${item.year || ''}`.trim())}&s=tt&ttype=tv`;
  return (
    <div className="card discover-card">
      <div className="title-head">
        {item.poster_path && !posterFailed
          ? <img className="poster" src={posterUrl(item.poster_path)} alt="" loading="lazy" onError={() => setPosterFailed(true)} />
          : <PosterFallback name={item.name} />}
        <div className="title-meta">
          <h3>{item.name}</h3>
          <div className="title-sub">
            {item.year || '—'}
            {item.providers && item.providers.length > 0 && ` · ${item.providers.join(', ')}`}
          </div>
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

/** Chip met portretfoto (of initiaal) voor een favoriete acteur/maker. */
function PersonChip({ person, kind }: { person: SuggestPerson; kind: 'actor' | 'creator' }) {
  return (
    <span className="person-chip" title={kind === 'creator' ? `Gemaakt door jouw favoriet ${person.name}` : `Met jouw favoriet ${person.name}`}>
      {person.photo
        ? <img src={PERSON_IMG + person.photo} alt="" loading="lazy" />
        : <span className="person-chip-badge">{person.name.trim().charAt(0)}</span>}
      {kind === 'creator' ? '🎬' : '🎭'} {person.name}
    </span>
  );
}

/** Tip-kaart voor "Van jouw favorieten": zelfde opzet als de ontdek-kaart,
    plus de favoriete acteurs/makers als reden. */
function FavSuggestCard({ row, onAdd }: {
  row: { tmdb_id: number; name: string; year: number | null; poster_path: string | null; overview: string; actors: SuggestPerson[]; creators: SuggestPerson[] };
  onAdd: (tmdbId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const imdbUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(`${row.name} ${row.year || ''}`.trim())}&s=tt&ttype=tv`;
  return (
    <div className="card discover-card">
      <div className="title-head">
        {row.poster_path && !posterFailed
          ? <img className="poster" src={posterUrl(row.poster_path)} alt="" loading="lazy" onError={() => setPosterFailed(true)} />
          : <PosterFallback name={row.name} />}
        <div className="title-meta">
          <h3>{row.name}</h3>
          <div className="title-sub">{row.year || '—'}</div>
          <div className="fav-people">
            {row.creators.map((p) => <PersonChip key={`c-${p.name}`} person={p} kind="creator" />)}
            {row.actors.map((p) => <PersonChip key={`a-${p.name}`} person={p} kind="actor" />)}
          </div>
          {row.overview
            ? (
              <p
                className={`dc-overview${open ? '' : ' clamp'}`}
                onClick={() => setOpen((o) => !o)}
                title={open ? 'Inklappen' : 'Lees meer'}
              >
                {row.overview}
              </p>
            )
            : <p className="dc-overview empty-note">Nog geen omschrijving beschikbaar.</p>}
        </div>
      </div>
      <div className="dc-actions">
        <a className="imdb-link" href={imdbUrl} target="_blank" rel="noopener noreferrer">
          <span className="imdb-badge">IMDb</span> Bekijk op IMDb ↗
        </a>
        <button className="btn primary dc-add" onClick={() => onAdd(row.tmdb_id)}>+ Toevoegen</button>
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

  // Top 5 op basis van je favoriete acteurs en makers (combinatie scoort het hoogst).
  // Eerst kandidaten uit de eigen groepslijst; is dat er weinig (bijv. omdat je
  // alles al beoordeeld hebt), dan vullen we aan met TMDb-series van je favorieten.
  const favSuggests = ready ? favoriteSuggestions(snap, userId, 5) : [];
  const favActorNames = ready
    ? favoriteActors(snap, userId, 12).filter((a) => a.avg >= 7).slice(0, 3).map((a) => a.name)
    : [];
  const favCreatorNames = ready
    ? favoriteCreators(snap, userId, 12).filter((c) => c.avg >= 7).slice(0, 3).map((c) => c.name)
    : [];
  const [peopleTips, setPeopleTips] = useState<PersonSuggestion[]>([]);
  useEffect(() => {
    let alive = true;
    discoverByPeople(favActorNames, favCreatorNames)
      .then((r) => { if (alive) setPeopleTips(r); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favActorNames.join(','), favCreatorNames.join(',')]);

  const favRows = [
    ...favSuggests.map(({ title, actors, creators }) => ({
      tmdb_id: title.tmdb_id,
      name: title.name,
      year: title.year,
      poster_path: title.poster_path,
      overview: title.overview || '',
      // Foto's van de personen komen uit de metadata van de serie zelf.
      actors: actors.map((n) => ({ name: n, photo: title.cast_meta?.find((c) => c.name === n)?.photo ?? null })),
      creators: creators.map((n) => ({ name: n, photo: title.creators?.find((c) => c.name === n)?.photo ?? null })),
    })),
    ...peopleTips
      .filter((p) => !snap.titles.some((t) => t.tmdb_id === p.tmdb_id))
      .map((p) => ({ tmdb_id: p.tmdb_id, name: p.name, year: p.year, poster_path: p.poster_path, overview: p.overview, actors: p.actors, creators: p.creators })),
  ].slice(0, 5);

  const dismiss = async (id: string) => {
    await dismissRecommendation(id);
    onChange();
  };

  // Snelle reactie op een tip; nogmaals tikken haalt de reactie weer weg.
  const respond = async (id: string, current: string | null | undefined, r: 'thanks' | 'meh') => {
    try {
      await respondRecommendation(id, current === r ? null : r);
      onChange();
      if (current !== r) toast('Reactie verstuurd 💬');
    } catch (e: any) {
      toast(e.message || 'Reageren mislukt');
    }
  };

  return (
    <div className="page">
      {/* 1. Nieuw seizoen van een serie die je 7+ gaf */}
      {newSeasons.length > 0 && (
        <>
          <h2>Nieuw seizoen</h2>
          {newSeasons.map((title) => {
            const score = myRating(snap, title.tmdb_id, userId)?.score;
            return (
              <div key={title.tmdb_id} style={{ marginBottom: 16 }}>
                <div className="rec-reason">
                  <span className="ric">🎉</span>
                  <span>Er is een nieuw seizoen van <b>{title.name}</b>{score != null && score >= 7 ? " — jij vond 'm goed!" : ''}</span>
                </div>
                <TitleCard snap={snap} title={title} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
              </div>
            );
          })}
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
              {/* Laat de afzender snel weten wat je ervan vindt. */}
              <div className="tip-respond">
                <button className={rec.response === 'thanks' ? 'sel' : ''} onClick={() => respond(rec.id, rec.response, 'thanks')}>
                  👍 Thanks, ziet er leuk uit!
                </button>
                <button className={rec.response === 'meh' ? 'sel' : ''} onClick={() => respond(rec.id, rec.response, 'meh')}>
                  😐 Mwah, niet echt iets voor mij
                </button>
              </div>
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

      {/* Top 5 met jouw favoriete acteurs en makers — nog niet op je lijst */}
      {favRows.length > 0 && (
        <>
          <h2>Van jouw favorieten</h2>
          <p className="muted" style={{ fontSize: 13, margin: '-4px 4px 12px' }}>
            Series die je nog niet kent, met jouw favoriete acteurs of van jouw favoriete makers.
          </p>
          {favRows.map((row) => (
            <div key={row.tmdb_id} style={{ marginBottom: 16 }}>
              <FavSuggestCard row={row} onAdd={onAdd} />
            </div>
          ))}
        </>
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
              <TitleCard
                snap={snap} title={title} userId={userId} blind={blind}
                showFriendScores
                reasonActor={sharedFavoriteActor(snap, userId, title)}
                onRecommend={onRecommend} onChange={onChange} toast={toast}
              />
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
