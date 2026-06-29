import { useState } from 'react';
import type { Snapshot, Title } from '../lib/types';
import { STATUS_ORDER, STATUS_LABELS, POSTER_BASE } from '../lib/types';
import { saveRating, type RatingUpdate } from '../lib/api';
import { groupAverage, myRating, ratingsFor, profileById, guessService } from '../lib/compute';
import Avatar from './Avatar';

interface Props {
  snap: Snapshot;
  title: Title;
  userId: string;
  blind: boolean;
  onRecommend: (title: Title) => void;
  onChange: () => void;
  toast: (msg: string) => void;
  initialExpanded?: boolean;
}

export default function TitleCard({ snap, title, userId, blind, onRecommend, onChange, toast, initialExpanded = false }: Props) {
  const mine = myRating(snap, title.tmdb_id, userId);
  const avg = groupAverage(snap, title.tmdb_id);
  const others = ratingsFor(snap, title.tmdb_id).filter((r) => r.user_id !== userId);
  const me = profileById(snap, userId);
  const hideGroup = blind && mine?.score == null;
  const [expanded, setExpanded] = useState(initialExpanded);
  const [note, setNote] = useState(mine?.note || '');
  const [serviceInput, setServiceInput] = useState(mine?.service || '');

  const update = async (patch: Omit<RatingUpdate, 'tmdb_id'>) => {
    try {
      await saveRating({ tmdb_id: title.tmdb_id, ...patch });
      onChange();
    } catch (e: any) {
      toast(e.message || 'Opslaan mislukt');
    }
  };

  const watchedSeasons = mine?.seasons || [];
  const toggleSeason = (n: number) => {
    const isMax = watchedSeasons.includes(n);
    const next = isMax && Math.max(...watchedSeasons) === n
      ? Array.from({ length: n - 1 }, (_, i) => i + 1)
      : Array.from({ length: n }, (_, i) => i + 1);
    update({ seasons: next });
  };

  const currentService = guessService(title, me, mine?.service || null);

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
          {mine?.score != null
            ? <span className="badge-score sel" style={{ minWidth: 28, textAlign: 'center' }}>{mine.score}</span>
            : mine?.status
              ? <span className="chip" style={{ fontSize: 12 }}>{STATUS_LABELS[mine.status]}</span>
              : null}
          {!hideGroup && avg != null && (
            <div className="avg">
              <span className="num">{avg.toFixed(1)}</span>
              <span className="lbl">groep</span>
            </div>
          )}
          {others.length > 0 && (
            <span className="muted" style={{ fontSize: 12 }}>👥 {others.length}</span>
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

          {/* Wie kijkt / vindt wat */}
          {!hideGroup && others.length > 0 && (
            <div className="watchers">
              {others.map((r) => {
                const p = profileById(snap, r.user_id);
                const maxSeason = r.seasons?.length ? Math.max(...r.seasons) : 0;
                return (
                  <div className="watcher" key={r.user_id}>
                    <Avatar profile={p} id={r.user_id} size="sm" />
                    {r.score != null && <span className="badge-score">{r.score}</span>}
                    {maxSeason > 0 && <span>S{maxSeason}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Streamingdienst */}
          {title.providers.length > 0 ? (
            <select
              value={mine?.service || ''}
              onChange={(e) => update({ service: e.target.value })}
              style={{ marginTop: 4 }}
            >
              <option value="">{currentService ? `${currentService} (gok)` : 'Dienst…'}</option>
              {title.providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input
              placeholder="Streamingdienst (optioneel)"
              value={serviceInput}
              onChange={(e) => setServiceInput(e.target.value)}
              onBlur={() => serviceInput !== (mine?.service || '') && update({ service: serviceInput })}
              style={{ marginTop: 4 }}
            />
          )}

          {/* Acties */}
          <div className="actions">
            <button className="btn ghost" onClick={() => onRecommend(title)}>💌 Raad aan</button>
          </div>

          {/* Notitie + overview + cast */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {title.overview && <p className="note">{title.overview}</p>}
            <input
              placeholder="Korte indruk in één zin (optioneel)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (mine?.note || '') && update({ note })}
            />
            {title.cast.length > 0 && <p className="title-sub">Met {title.cast.slice(0, 4).join(', ')}</p>}
          </div>
        </>
      )}
    </div>
  );
}
