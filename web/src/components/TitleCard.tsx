import { useState } from 'react';
import type { Snapshot, Title, Status } from '../lib/types';
import { STATUS_ORDER, STATUS_LABELS, posterUrl } from '../lib/types';
import { saveRating, removeRating, addComment, removeComment, clearRatingScore, type RatingUpdate } from '../lib/api';
import { groupAverage, myRating, profileById, guessService, visibleUserIds, followingProfiles, hasUnseenNewSeason } from '../lib/compute';
import { NL_SERVICES } from '../lib/services';
import Avatar from './Avatar';
import StatusBadge, { STATUS_COLORS } from './StatusBadge';
import ScoreSlider from './ScoreSlider';
import EnrichSheet from './EnrichSheet';
import PosterFallback from './PosterFallback';

// Leesbare statuswoorden voor de vrienden-status-lijst.
const FRIEND_STATUS_TEXT: Record<Status, string> = {
  watching: 'Mee bezig',
  finished: 'Afgekeken',
  want: 'Wishlist',
  dropped: 'Afgehaakt',
};

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  return `${date} ${time}`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  snap: Snapshot;
  title: Title;
  userId: string;
  blind: boolean;
  showGroupScore?: boolean;
  onRecommend: (title: Title) => void;
  onChange: () => void;
  toast: (msg: string) => void;
  initialExpanded?: boolean;
}

export default function TitleCard({ snap, title, userId, blind, showGroupScore = false, onRecommend, onChange, toast, initialExpanded = false }: Props) {
  const mine = myRating(snap, title.tmdb_id, userId);
  const avg = groupAverage(snap, title.tmdb_id);
  // Alleen de gevolgde vrienden die deze serie óók op hun lijst hebben.
  const friends = followingProfiles(snap, userId).filter((p) =>
    snap.ratings.some((r) => r.title_id === title.tmdb_id && r.user_id === p.id),
  );
  // Directe IMDb-link als we het imdb_id kennen, anders een zoekresultaat op naam + jaar.
  const imdbUrl = title.imdb_id
    ? `https://www.imdb.com/title/${title.imdb_id}/`
    : `https://www.imdb.com/find/?q=${encodeURIComponent(`${title.name} ${title.year || ''}`.trim())}&s=tt&ttype=tv`;
  // Alleen de vrienden die je volgt (niet jijzelf) die deze serie op hun lijst hebben.
  const visible = new Set(visibleUserIds(snap, userId));
  const others = snap.ratings.filter(
    (r) => r.title_id === title.tmdb_id && r.user_id !== userId && visible.has(r.user_id),
  );
  const me = profileById(snap, userId);
  const addedBy = title.added_by ? profileById(snap, title.added_by) : undefined;
  const hideGroup = blind && mine?.score == null;
  const totalRecCount = snap.recommendations.filter((r) => r.title_id === title.tmdb_id).length;
  // Aanraders binnen je netwerk: per afzender (jij of een gevolgde vriend) aan wie ze het aanraadden.
  const recGroups = new Map<string, string[]>();
  for (const r of snap.recommendations) {
    if (r.title_id !== title.tmdb_id || !visible.has(r.from_user)) continue;
    const tos = recGroups.get(r.from_user) || [];
    if (!tos.includes(r.to_user)) tos.push(r.to_user);
    recGroups.set(r.from_user, tos);
  }
  // Alle aanraders die voor mij bestemd zijn (ook al weggedrukt), met een persoonlijk bericht.
  const receivedNotes = snap.recommendations.filter(
    (r) => r.to_user === userId && r.title_id === title.tmdb_id && r.note
  );

  // Welke gekleurde statusbadge hoort bij jouw beoordeling (cijfer impliceert 'gezien').
  const myBadge: Status | null = mine?.status ?? (mine?.score != null ? 'finished' : null);

  // Seizoen-voortgang voor de ingeklapte kaart: hoeveel van de N seizoenen zag je?
  const totalSeasons = title.seasons.length;
  const watchedSeasonCount = mine?.seasons?.filter((n) => title.seasons.some((s) => s.season_number === n)).length ?? 0;
  const seasonsChip = !!mine && totalSeasons > 1;
  const newSeason = hasUnseenNewSeason(snap, title, userId);

  const initService = mine?.service || '';
  // "Anders…" alleen als de dienst noch bij TMDb, noch bij de bekende NL-diensten hoort.
  const initIsCustom = !!initService && !title.providers.includes(initService) && !NL_SERVICES.includes(initService);

  const [expanded, setExpanded] = useState(initialExpanded);
  const [serviceMode, setServiceMode] = useState<'select' | 'custom'>(initIsCustom ? 'custom' : 'select');
  const [serviceInput, setServiceInput] = useState(initService);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showEnrich, setShowEnrich] = useState(false);

  // Berichten op het prikbord: alleen van jou + de vrienden die je volgt.
  const comments = snap.comments
    .filter((c) => c.title_id === title.tmdb_id && visible.has(c.user_id))
    .sort((a, b) => a.created_at - b.created_at);

  const update = async (patch: Omit<RatingUpdate, 'tmdb_id'>) => {
    try {
      await saveRating({ tmdb_id: title.tmdb_id, ...patch });
      onChange();
    } catch (e: any) {
      toast(e.message || 'Opslaan mislukt');
    }
  };

  const handleRemove = async () => {
    try {
      await removeRating(title.tmdb_id);
      onChange();
      toast('Uit je lijst gehaald');
    } catch (e: any) {
      toast(e.message || 'Verwijderen mislukt');
    }
  };

  const postComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    try {
      await addComment(title.tmdb_id, text);
      setCommentText('');
      onChange();
    } catch (e: any) {
      toast(e.message || 'Plaatsen mislukt');
    }
  };

  const deleteComment = async (id: string) => {
    try {
      await removeComment(id);
      onChange();
    } catch (e: any) {
      toast(e.message || 'Verwijderen mislukt');
    }
  };

  const watchedSeasons = mine?.seasons || [];
  const toggleSeason = (n: number) => {
    const next = watchedSeasons.includes(n)
      ? watchedSeasons.filter((s) => s !== n)
      : [...watchedSeasons, n].sort((a, b) => a - b);
    update({ seasons: next });
  };
  const toggleAllSeasons = () => {
    const all = title.seasons.map((s) => s.season_number);
    const allOn = all.every((n) => watchedSeasons.includes(n));
    update({ seasons: allOn ? [] : all });
  };

  const currentService = guessService(title, me, mine?.service || null);
  // De dienst-keuze toont altijd de bekende NL-diensten, plus wat TMDb voor deze serie kent.
  const serviceOptions = Array.from(new Set([...title.providers, ...NL_SERVICES]));

  return (
    <div className="card title-card">
      {/* Compact header — klikken klapt uit/in */}
      <div className="title-head" onClick={() => setExpanded((v) => !v)} style={{ cursor: 'pointer' }}>
        {title.poster_path
          ? <img className="poster" src={posterUrl(title.poster_path)} alt="" loading="lazy" />
          : <PosterFallback name={title.name} />}
        <div className="title-meta">
          <h3>{title.name}</h3>
          <div className="title-sub">
            {title.year || '—'}
            {currentService ? ` · ${currentService}` : ''}
          </div>
          {title.genres.length > 0 && (
            <div className="title-sub" style={{ marginTop: 2 }}>{title.genres.join(', ')}</div>
          )}
          {/* Uitgelijnde meta-rij: nieuw seizoen, seizoen-voortgang, kijkers en aanraders */}
          {(newSeason || seasonsChip || others.length > 0 || totalRecCount > 0) && (
            <div className="metarow">
              {newSeason && <span className="mchip newseason">🎉 Nieuw seizoen</span>}
              {seasonsChip && (
                // Groen als je alle seizoenen zag, anders lichtgrijs (nog niet af).
                <span className={`mchip${watchedSeasonCount >= totalSeasons ? ' seasons' : ''}`}>{watchedSeasonCount}/{totalSeasons} seizoen{totalSeasons === 1 ? '' : 'en'}</span>
              )}
              {others.length > 0 && <span className="mchip">👥 {others.length}</span>}
              {totalRecCount > 0 && <span className="mchip">💌 {totalRecCount}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {showGroupScore && !hideGroup && avg != null && (
            <div className="avg">
              <span className="num">{avg.toFixed(1)}</span>
              <span className="lbl">groep</span>
            </div>
          )}
          {/* Jouw status op deze serie — gekleurd zodat je het meteen ziet. */}
          {myBadge && <StatusBadge status={myBadge} score={mine?.score ?? null} />}
        </div>
      </div>

      {expanded && (
        <>
          {/* ── Sectie: Jouw beoordeling ── */}
          <section className="tc-section">
            <div className="tc-label">Jouw beoordeling</div>

            <ScoreSlider
              value={mine?.score ?? null}
              onCommit={(n) => update({ score: n, status: 'finished' })}
              onClear={async () => {
                try { await clearRatingScore(title.tmdb_id); onChange(); }
                catch (e: any) { toast(e.message || 'Wissen mislukt'); }
              }}
            />

            <div className="status-row">
              {STATUS_ORDER.map((s) => (
                <button key={s} className={mine?.status === s ? 'sel' : ''} onClick={() => update({ status: s })}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {title.seasons.length > 0 && (
              <div className="tc-field">
                <div className="tc-sublabel">Seizoenen gezien</div>
                <div className="seasons">
                  <button
                    className={title.seasons.every((s) => watchedSeasons.includes(s.season_number)) ? 'on' : ''}
                    onClick={toggleAllSeasons}
                    style={{ fontWeight: 700 }}
                  >
                    Alles
                  </button>
                  {title.seasons.map((s) => (
                    <button
                      key={s.season_number}
                      className={watchedSeasons.includes(s.season_number) ? 'on' : ''}
                      onClick={() => toggleSeason(s.season_number)}
                    >
                      S{s.season_number}{s.air_year ? ` ${s.air_year}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="tc-field">
              <div className="tc-sublabel">Waar kijk je dit?</div>
              <select
                value={serviceMode === 'custom' ? '__anders__' : (mine?.service || '')}
                onChange={(e) => {
                  if (e.target.value === '__anders__') {
                    setServiceMode('custom');
                  } else {
                    setServiceMode('select');
                    update({ service: e.target.value });
                  }
                }}
              >
                <option value="">{currentService ? `${currentService} (gok)` : 'Dienst…'}</option>
                {serviceOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                <option value="__anders__">Anders…</option>
              </select>
              {serviceMode === 'custom' && (
                <input
                  placeholder="Naam van de dienst"
                  value={serviceInput}
                  onChange={(e) => setServiceInput(e.target.value)}
                  onBlur={() => serviceInput !== (mine?.service || '') && update({ service: serviceInput })}
                />
              )}
            </div>

            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={() => onRecommend(title)}>💌 Raad aan</button>
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost" style={{ color: '#e55' }} onClick={handleRemove}>Verwijder</button>
                  <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Annuleer</button>
                </div>
              ) : (
                <button className="btn ghost" style={{ color: 'var(--muted)' }} title="Uit lijst verwijderen" onClick={() => setConfirmDelete(true)}>🗑️</button>
              )}
            </div>
          </section>

          {/* ── Sectie: Wat je vrienden ervan vinden ── */}
          {((!hideGroup && friends.length > 0) || recGroups.size > 0 || receivedNotes.length > 0) && (
            <section className="tc-section">
              <div className="tc-label">Wat je vrienden ervan vinden</div>

              {!hideGroup && friends.length > 0 && (
                <div className="friend-status-list">
                  {friends.map((p) => {
                    const r = snap.ratings.find((x) => x.title_id === title.tmdb_id && x.user_id === p.id);
                    const maxSeason = r?.seasons?.length ? Math.max(...r.seasons) : 0;
                    return (
                      <div className="friend-status-row" key={p.id}>
                        <Avatar profile={p} id={p.id} size="sm" />
                        <span className="fsr-name">{p.name?.split(' ')[0] || '—'}</span>
                        <span className="fsr-val">
                          {r?.status && (
                            <span style={{ color: STATUS_COLORS[r.status].fg, fontWeight: 600 }}>
                              {FRIEND_STATUS_TEXT[r.status]}
                            </span>
                          )}
                          {maxSeason > 0 && r?.status === 'watching' && (
                            <span className="muted" style={{ fontSize: 12 }}>S{maxSeason}</span>
                          )}
                          <span className={r?.score != null ? '' : 'muted'}>{r?.score != null ? r.score : '–'}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {[...recGroups.entries()].map(([from, tos]) => {
                const toNames = tos.map((t) => (t === userId ? 'jou' : (profileById(snap, t)?.name || 'iemand'))).join(', ');
                const phrase = from === userId
                  ? 'Jij hebt deze serie aangeraden aan'
                  : `${profileById(snap, from)?.name || 'Iemand'} heeft deze serie aangeraden aan`;
                return (
                  <div key={from} className="muted" style={{ fontSize: 12 }}>
                    💌 {phrase}: <span style={{ color: 'var(--text)' }}>{toNames}</span>
                  </div>
                );
              })}

              {receivedNotes.map((r) => {
                const from = profileById(snap, r.from_user);
                return (
                  <div key={r.id} className="rec-note">
                    <span className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                      💌 {from?.name || 'Iemand'} schreef:
                    </span>
                    "{r.note}"
                  </div>
                );
              })}
            </section>
          )}

          {/* ── Sectie: Over de serie ── */}
          <section className="tc-section">
            <div className="tc-label">Over de serie</div>
            {title.overview && <p className="note">{title.overview}</p>}
            {title.cast.length > 0 && <p className="title-sub">Met {title.cast.slice(0, 4).join(', ')}</p>}
            <a className="imdb-link" href={imdbUrl} target="_blank" rel="noopener noreferrer">
              <span className="imdb-badge">IMDb</span> Bekijk op IMDb ↗
            </a>
            {/* Handmatig toegevoegde serie (negatief id): info aanvullen via IMDb/TVmaze. */}
            {title.tmdb_id < 0 && (
              <button className="btn ghost" style={{ alignSelf: 'flex-start', color: 'var(--accent)', padding: '4px 0', fontSize: 13 }} onClick={() => setShowEnrich(true)}>
                🧩 Serie-info aanvullen
              </button>
            )}
            {(addedBy || mine) && (
              <div className="tc-meta">
                {addedBy && <>Toegevoegd door {title.added_by === userId ? 'jou' : addedBy.name}</>}
                {addedBy && mine && ' · '}
                {mine && <>op {fmtDate(mine.updated_at)}</>}
              </div>
            )}
          </section>

          {/* ── Sectie: Dit zeggen je vrienden ── */}
          <section className="tc-section">
            <div className="tc-label">Dit zeggen je vrienden</div>
            <div className="comments">
              {comments.map((c) => {
                const p = profileById(snap, c.user_id);
                return (
                  <div className="comment" key={c.id}>
                    <Avatar profile={p} id={c.user_id} size="sm" />
                    <div className="comment-body">
                      <div className="comment-name">
                        {c.user_id === userId ? 'Jij' : (p?.name || 'Onbekend')}
                        <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.6 }}>{fmtDateTime(c.created_at)}</span>
                      </div>
                      <div className="comment-text">{c.text}</div>
                    </div>
                    {c.user_id === userId && (
                      <button className="btn ghost comment-del" title="Bericht verwijderen" onClick={() => deleteComment(c.id)}>🗑️</button>
                    )}
                  </div>
                );
              })}
              <div className="comment-form">
                <input
                  placeholder="Schrijf een bericht…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && postComment()}
                />
                <button className="btn" disabled={!commentText.trim()} onClick={postComment}>Plaats</button>
              </div>
            </div>
          </section>
        </>
      )}

      {showEnrich && (
        <EnrichSheet title={title} onClose={() => setShowEnrich(false)} onChange={onChange} toast={toast} />
      )}
    </div>
  );
}
