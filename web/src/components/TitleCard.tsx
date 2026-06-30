import { useState } from 'react';
import type { Snapshot, Title, Status } from '../lib/types';
import { STATUS_ORDER, STATUS_LABELS, POSTER_BASE } from '../lib/types';
import { saveRating, removeRating, addComment, removeComment, type RatingUpdate } from '../lib/api';
import { groupAverage, myRating, profileById, guessService, visibleUserIds } from '../lib/compute';
import { NL_SERVICES } from '../lib/services';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';

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
  // Alleen de vrienden die je volgt (niet jijzelf) die deze serie op hun lijst hebben.
  const visible = new Set(visibleUserIds(snap, userId));
  const others = snap.ratings.filter(
    (r) => r.title_id === title.tmdb_id && r.user_id !== userId && visible.has(r.user_id),
  );
  const me = profileById(snap, userId);
  const addedBy = title.added_by ? profileById(snap, title.added_by) : undefined;
  const hideGroup = blind && mine?.score == null;
  const sentRecs = snap.recommendations.filter((r) => r.from_user === userId && r.title_id === title.tmdb_id);
  const totalRecCount = snap.recommendations.filter((r) => r.title_id === title.tmdb_id).length;
  // Alle aanraders die voor mij bestemd zijn (ook al weggedrukt), met een persoonlijk bericht.
  const receivedNotes = snap.recommendations.filter(
    (r) => r.to_user === userId && r.title_id === title.tmdb_id && r.note
  );

  // Welke gekleurde statusbadge hoort bij jouw beoordeling (cijfer impliceert 'gezien').
  const myBadge: Status | null = mine?.status ?? (mine?.score != null ? 'finished' : null);

  const initService = mine?.service || '';
  const initIsCustom = !!initService && !title.providers.includes(initService);

  const [expanded, setExpanded] = useState(initialExpanded);
  const [serviceMode, setServiceMode] = useState<'select' | 'custom'>(initIsCustom ? 'custom' : 'select');
  const [serviceInput, setServiceInput] = useState(initService);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [commentText, setCommentText] = useState('');

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
          ? <img className="poster" src={POSTER_BASE + title.poster_path} alt="" loading="lazy" />
          : <div className="poster" />}
        <div className="title-meta">
          <h3>{title.name}</h3>
          <div className="title-sub">
            {title.year || '—'}
            {title.seasons.length ? ` · ${title.seasons.length} sz` : ''}
            {currentService ? ` · ${currentService}` : ''}
          </div>
          <div className="genres">
            {title.genres.slice(0, 2).map((g) => <span className="chip" key={g}>{g}</span>)}
          </div>
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
          {others.length > 0 && (
            <span className="muted" style={{ fontSize: 12 }}>👥 {others.length}</span>
          )}
          {totalRecCount > 0 && (
            <span className="muted" style={{ fontSize: 12 }}>💌 {totalRecCount}</span>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Cijferknoppen */}
          <div className="scores">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={mine?.score === n ? 'sel' : ''}
                onClick={() => update({ score: n, status: 'finished' })}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="status-row">
            {STATUS_ORDER.map((s) => (
              <button key={s} className={mine?.status === s ? 'sel' : ''} onClick={() => update({ status: s })}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Seizoenen */}
          {title.seasons.length > 0 && (
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
          )}

          {/* Wat je vrienden ervan vinden: cijfer of status per vriend */}
          {!hideGroup && others.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Wat je vrienden ervan vinden</div>
              <div className="watchers">
                {others.map((r) => {
                const p = profileById(snap, r.user_id);
                const maxSeason = r.seasons?.length ? Math.max(...r.seasons) : 0;
                return (
                  <div className="watcher" key={r.user_id} title={p?.name}>
                    <Avatar profile={p} id={r.user_id} size="sm" />
                    <span>{p?.name?.split(' ')[0] || '—'}</span>
                    {r.score != null
                      ? <span className="badge-score">{r.score}</span>
                      : r.status
                        ? <span className="chip" style={{ fontSize: 11 }}>{STATUS_LABELS[r.status]}</span>
                        : null}
                    {maxSeason > 0 && <span>S{maxSeason}</span>}
                  </div>
                );
              })}
              </div>
            </>
          )}

          {/* Wie heeft de serie toegevoegd + wanneer jij het toevoegde */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {addedBy && (
              <span className="muted" style={{ fontSize: 12 }}>
                ➕ Toegevoegd door {title.added_by === userId ? 'jou' : addedBy.name}
              </span>
            )}
            {mine && (
              <span className="muted" style={{ fontSize: 12 }}>
                📅 {fmtDate(mine.updated_at)}
              </span>
            )}
          </div>

          {/* Aanraders die jij verstuurde */}
          {sentRecs.length > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>
              💌 Jij raadde dit aan{' '}
              {sentRecs.map((r, i) => {
                const p = profileById(snap, r.to_user);
                return (
                  <span key={r.id}>
                    {i > 0 && ', '}
                    {p?.name?.split(' ')[0] || '—'}
                  </span>
                );
              })}
            </div>
          )}

          {/* Persoonlijke berichten van aanraders — blijven zichtbaar ook na wegklikken */}
          {receivedNotes.map((r) => {
            const from = profileById(snap, r.from_user);
            return (
              <div key={r.id} style={{ background: 'rgba(255,92,124,0.08)', border: '1px solid rgba(255,92,124,0.25)', borderRadius: 10, padding: '8px 10px', fontSize: 13 }}>
                <span className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                  💌 {from?.name || 'Iemand'} schreef:
                </span>
                "{r.note}"
              </div>
            );
          })}

          {/* Streamingdienst */}
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
            style={{ marginTop: 4 }}
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
              style={{ marginTop: 4 }}
            />
          )}

          {/* Acties */}
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

          {/* Overview + cast */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {title.overview && <p className="note">{title.overview}</p>}
            {title.cast.length > 0 && <p className="title-sub">Met {title.cast.slice(0, 4).join(', ')}</p>}
          </div>

          {/* Prikbord: berichten van jou en je vrienden */}
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
        </>
      )}
    </div>
  );
}
