import { useMemo } from 'react';
import type { Snapshot } from '../../lib/types';
import { followingProfiles, visibleUserIds, titleById, profileById } from '../../lib/compute';
import Thumb from '../Thumb';
import { BarRow, GenreStat, TitleRow, SvcLabel, useSvcLogos, type NavOpts } from './widgets';

interface Props {
  snap: Snapshot;
  userId: string;
  onNavigate: (opts: NavOpts) => void;
}

/** "In de groep": populairste series, meest aangeraden, en genre-/dienstverdeling
    over jou + je gevolgde vrienden. */
export default function GroupCards({ snap, userId, onNavigate }: Props) {
  const visible = useMemo(() => new Set(visibleUserIds(snap, userId)), [snap, userId]);
  const svcLogos = useSvcLogos(snap);

  const groupTitleStats = useMemo(() => {
    return snap.titles
      .map((t) => {
        const raters = snap.ratings.filter((r) => r.title_id === t.tmdb_id && visible.has(r.user_id));
        const groupScores = raters.filter((r) => r.score != null).map((r) => r.score as number);
        return {
          title: t,
          listCount: raters.length,
          avg: groupScores.length ? groupScores.reduce((a, b) => a + b, 0) / groupScores.length : null,
        };
      })
      .filter((x) => x.listCount >= 2)
      .sort((a, b) => b.listCount - a.listCount || (b.avg ?? 0) - (a.avg ?? 0))
      .slice(0, 8);
  }, [snap, visible]);

  const groupGenreCounts = useMemo(() => {
    // Per genre: aantal beoordelingen + de drie best gewaardeerde series (groepsgemiddelde).
    const counts = new Map<string, number>();
    for (const r of snap.ratings) {
      if (!visible.has(r.user_id)) continue;
      const t = titleById(snap, r.title_id);
      if (!t) continue;
      for (const g of t.genres) counts.set(g, (counts.get(g) || 0) + 1);
    }
    // Groepsgemiddelde per titel, één keer berekend.
    const titleAvg = new Map<number, number>();
    for (const t of snap.titles) {
      const scores = snap.ratings.filter((r) => r.title_id === t.tmdb_id && visible.has(r.user_id) && r.score != null).map((r) => r.score as number);
      if (scores.length) titleAvg.set(t.tmdb_id, scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    return [...counts.entries()]
      .map(([genre, count]) => ({
        genre,
        count,
        top: snap.titles
          .filter((t) => t.genres.includes(genre) && titleAvg.has(t.tmdb_id))
          .sort((a, b) => (titleAvg.get(b.tmdb_id)! - titleAvg.get(a.tmdb_id)!))
          .slice(0, 3),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [snap, visible]);

  const groupServiceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of snap.ratings) {
      if (!visible.has(r.user_id) || r.score == null) continue;
      const t = titleById(snap, r.title_id);
      if (!t) continue;
      const p = profileById(snap, r.user_id);
      // Opgegeven dienst wint; anders de eerste provider die bij het profiel past.
      const svc = r.service || (t.providers.find((pv) => p?.services?.includes(pv)) ?? t.providers[0]);
      if (svc) counts.set(svc, (counts.get(svc) || 0) + (t.seasons.length || 1));
    }
    return [...counts.entries()]
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [snap, visible]);

  const mostRecommended = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of snap.recommendations) counts.set(r.title_id, (counts.get(r.title_id) || 0) + 1);
    return [...counts.entries()]
      .map(([title_id, count]) => ({ title: titleById(snap, title_id), count }))
      .filter((x): x is { title: NonNullable<ReturnType<typeof titleById>>; count: number } => x.title != null)
      .filter((x) => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [snap]);

  const maxGroupGenre = groupGenreCounts.length ? Math.max(...groupGenreCounts.map((g) => g.count)) : 1;
  const maxGroupService = groupServiceCounts.length ? Math.max(...groupServiceCounts.map((s) => s.count)) : 1;

  const hasFriends = followingProfiles(snap, userId).length > 0;
  if (!hasFriends || (groupTitleStats.length === 0 && groupGenreCounts.length === 0 && mostRecommended.length === 0)) {
    return null;
  }

  return (
    <>
      <h2 className="dash-h2"><span className="h2-ico">🌍</span>In de groep</h2>

      {groupTitleStats.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">Populairste series</div>
          <div className="poster-strip">
            {groupTitleStats.map(({ title, listCount, avg }) => (
              <button key={title.tmdb_id} className="pstrip-item" onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}>
                <div className="pstrip-poster">
                  <Thumb path={title.poster_path} name={title.name} w={76} h={114} />
                  {avg != null && <span className="pstrip-score">{avg.toFixed(1)}</span>}
                </div>
                <div className="pstrip-name">{title.name}</div>
                <div className="pstrip-sub">👥 {listCount}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {mostRecommended.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">Meest aangeraden</div>
          {mostRecommended.map(({ title, count }) => (
            <TitleRow
              key={title.tmdb_id}
              title={title}
              onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}
              right={<span className="chip" style={{ flexShrink: 0 }}>💌 {count}×</span>}
            />
          ))}
        </div>
      )}

      {groupGenreCounts.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">Populaire genres</div>
          {groupGenreCounts.map((g) => (
            <GenreStat
              key={g.genre}
              genre={g.genre}
              count={g.count}
              avg={null}
              max={maxGroupGenre}
              titles={g.top}
              color="var(--warn)"
              onGenre={() => onNavigate({ status: 'all', genre: g.genre })}
              onTitle={(id) => onNavigate({ status: 'all', titleId: id })}
            />
          ))}
        </div>
      )}

      {groupServiceCounts.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title with-unit">Populaire diensten<span className="col-unit">seizoenen</span></div>
          {groupServiceCounts.map((s) => (
            <BarRow
              key={s.service}
              label={<SvcLabel name={s.service} svcLogos={svcLogos} />}
              value={s.count} max={maxGroupService} val={<b>{s.count}</b>} color="var(--accent-2)"
              onClick={() => onNavigate({ status: 'all', service: s.service })}
            />
          ))}
        </div>
      )}
    </>
  );
}
