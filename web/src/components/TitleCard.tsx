import { useState } from 'react';
import type { Snapshot, Title } from '../lib/types';
import { STATUS_ORDER, STATUS_LABELS, POSTER_BASE } from '../lib/types';
import { saveRating, toggleReaction, type RatingUpdate } from '../lib/api';
import { groupAverage, myRating, ratingsFor, profileById, guessService } from '../lib/compute';
import Avatar from './Avatar';

const EMOJIS = ['😍', '😂', '😢', '🔥', '👀', '😴'];

interface Props {
  snap: Snapshot;
  title: Title;
  userId: string;
  blind: boolean;
  onRecommend: (title: Title) => void;
  onChange: () => void;
  toast: (msg: string) => void;
}

export default function TitleCard({ snap, title, userId, blind, onRecommend, onChange, toast }: Props) {
  const mine = myRating(snap, title.tmdb_id, userId);
  const avg = groupAverage(snap, title.tmdb_id);
  const others = ratingsFor(snap, title.tmdb_id).filter((r) => r.user_id !== userId);
  const me = profileById(snap, userId);
  const hideGroup = blind && mine?.score == null;
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(mine?.note || '');

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
    // Aanklikken vult 1..n; nogmaals klikken op het hoogste haalt het er weer af.
    const next = isMax && Math.max(...watchedSeasons) === n
      ? Array.from({ length: n - 1 }, (_, i) => i + 1)
      : Array.from({ length: n }, (_, i) => i + 1);
    update({ seasons: next });
  };

  const currentService = guessService(title, me, mine?.service || null);
  const myReactions = new Set(snap.reactions.filter((r) => r.title_id === title.tmdb_id && r.user_id === userId).map((r) => r.emoji));
  const reactionCounts = snap.reactions
    .filter((r) => r.title_id === title.tmdb_id)
    .reduce<Record<string, number>>((acc, r) => ((acc[r.emoji] = (acc[r.emoji] || 0) + 1), acc), {});

  return (
    <div className="card title-card">
      <div className="title-head">
        {title.poster_path
          ? <img className="poster" src={POSTER_BASE + title.poster_path} alt="" loading="lazy" />
          : <div className="poster" />}
        <div className="title-meta">
          <h3>{title.name}</h3>
          <div className="title-sub">
            {title.year || '—'}
            {title.seasons.length ? ` · ${title.seasons.length} seizoen${title.seasons.length > 1 ? 'en' : ''}` : ''}
            {currentService ? ` · ${currentService}` : ''}
          </div>
          <div className="genres">
            {title.genres.slice(0, 3).map((g) => <span className="chip" key={g}>{g}</span>)}
          </div>
        </div>
        {!hideGroup && avg != null && (
          <div className="avg">
            <span className="num">{avg.toFixed(1)}</span>
            <span className="lbl">groep</span>
          </div>
        )}
      </div>

      {/* Cijferknoppen */}
      <div className="scores">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={mine?.score === n ? 'sel' : ''}
            onClick={() => update({ score: n, status: mine?.status || 'finished' })}
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
              S{s.season_number}
            </button>
          ))}
        </div>
      )}

      {/* Wie kijkt / vindt wat, met seizoensvoortgang */}
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

      {/* Reacties */}
      <div className="reactions">
        {EMOJIS.map((e) => {
          const count = reactionCounts[e] || 0;
          if (count === 0 && !expanded) return null;
          return (
            <button
              key={e}
              className={myReactions.has(e) ? 'on' : ''}
              onClick={async () => { await toggleReaction(title.tmdb_id, e); onChange(); }}
            >
              {e}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
        {!expanded && <button onClick={() => setExpanded(true)}>＋</button>}
      </div>

      {/* Acties */}
      <div className="actions">
        <button className="btn ghost" onClick={() => onRecommend(title)}>💌 Raad aan</button>
        <button className="btn ghost" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Minder' : 'Meer'}</button>
      </div>

      {/* Uitgeklapt: notitie + dienst overschrijven */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {title.overview && <p className="note">{title.overview}</p>}
          <input
            placeholder="Korte indruk in één zin (optioneel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (mine?.note || '') && update({ note })}
          />
          {title.providers.length > 0 && (
            <label className="muted" style={{ fontSize: 12 }}>
              Waar je keek
              <select
                value={mine?.service || ''}
                onChange={(e) => update({ service: e.target.value })}
                style={{ marginTop: 4 }}
              >
                <option value="">{currentService ? `${currentService} (gok)` : 'Onbekend'}</option>
                {title.providers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )}
          {title.cast.length > 0 && <p className="title-sub">Met {title.cast.slice(0, 4).join(', ')}</p>}
        </div>
      )}
    </div>
  );
}
