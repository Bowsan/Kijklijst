import { useMemo, type ReactNode } from 'react';
import type { Snapshot, Title, Status } from '../lib/types';
import { posterUrl } from '../lib/types';
import {
  followingProfiles, watchingTitles, myRating,
  serviceStats, totalWatchHours, ratedCount,
  visibleUserIds, titleById, profileById,
} from '../lib/compute';
import Avatar from './Avatar';

interface NavOpts {
  status?: Status | 'all' | 'mine';
  genre?: string;
  service?: string;
  titleId?: number;
}

interface Props {
  snap: Snapshot;
  userId: string;
  onOpenProfile: (id: string) => void;
  onAdd: (tmdbId: number) => void;
  onGoFriends: () => void;
  onNavigate: (opts: NavOpts) => void;
}

function TitleRow({ title, right, onClick }: { title: Title; right?: ReactNode; onClick?: () => void }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'center', padding: '4px 0' }}>
      {title.poster_path
        ? <img src={posterUrl(title.poster_path, 'small')} alt="" style={{ width: 36, height: 54, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 36, height: 54, borderRadius: 4, background: 'var(--surface-2)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{title.name}</div>
        <div className="title-sub">{title.year || '—'}</div>
      </div>
      {right}
    </div>
  );
}

function BarRow({ label, value, max, val, color, onClick }: { label: string; value: number; max: number; val: string; color?: string; onClick?: () => void }) {
  return (
    <div className="bar-row" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color || 'var(--accent)' }} />
      </div>
      <div className="val">{val}</div>
    </div>
  );
}

export default function Dashboard({ snap, userId, onOpenProfile, onAdd, onGoFriends, onNavigate }: Props) {
  const myWatching = watchingTitles(snap, userId);
  const friends = followingProfiles(snap, userId);
  const friendsWatching = friends
    .map((p) => ({ profile: p, titles: watchingTitles(snap, p.id) }))
    .filter((fw) => fw.titles.length > 0);

  // --- Mijn statistieken ---
  const myRatings = snap.ratings.filter((r) => r.user_id === userId);
  const totalCount = myRatings.length;
  const finishedCount = myRatings.filter((r) => r.status === 'finished').length;
  const watchingCount = myRatings.filter((r) => r.status === 'watching').length;
  const wantCount = myRatings.filter((r) => r.status === 'want').length;
  const droppedCount = myRatings.filter((r) => r.status === 'dropped').length;
  const scoredCount = ratedCount(snap, userId);
  const scores = myRatings.filter((r) => r.score != null).map((r) => r.score as number);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const hours = totalWatchHours(snap, userId);

  // Genre stats: count per genre across all my listed titles
  const myGenreCounts = useMemo(() => {
    const counts = new Map<string, { count: number; scores: number[] }>();
    for (const r of myRatings) {
      const t = titleById(snap, r.title_id);
      if (!t) continue;
      for (const g of t.genres) {
        if (!counts.has(g)) counts.set(g, { count: 0, scores: [] });
        const entry = counts.get(g)!;
        entry.count++;
        if (r.score != null) entry.scores.push(r.score);
      }
    }
    return [...counts.entries()]
      .map(([genre, { count, scores: gs }]) => ({
        genre,
        count,
        avg: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [snap, userId]);

  const myServices = useMemo(() => serviceStats(snap, userId).slice(0, 6), [snap, userId]);
  const maxGenreCount = myGenreCounts.length ? Math.max(...myGenreCounts.map((g) => g.count)) : 1;
  const maxServiceCount = myServices.length ? Math.max(...myServices.map((s) => s.count)) : 1;

  // --- Groepsstatistieken ---
  const visible = useMemo(() => new Set(visibleUserIds(snap, userId)), [snap, userId]);

  const groupTitleStats = useMemo(() => {
    return snap.titles
      .map((t) => {
        const raters = snap.ratings.filter((r) => r.title_id === t.tmdb_id && visible.has(r.user_id));
        const groupScores = raters.filter((r) => r.score != null).map((r) => r.score as number);
        return {
          title: t,
          // Hoeveel mensen 'm op de lijst hebben + hoeveel daarvan een cijfer gaven.
          listCount: raters.length,
          scoreCount: groupScores.length,
          avg: groupScores.length ? groupScores.reduce((a, b) => a + b, 0) / groupScores.length : null,
        };
      })
      .filter((x) => x.listCount >= 2)
      .sort((a, b) => b.listCount - a.listCount || (b.avg ?? 0) - (a.avg ?? 0))
      .slice(0, 5);
  }, [snap, userId, visible]);

  const groupGenreCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of snap.ratings) {
      if (!visible.has(r.user_id)) continue;
      const t = titleById(snap, r.title_id);
      if (!t) continue;
      for (const g of t.genres) counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [snap, userId, visible]);

  // Diensten in de groep
  const groupServiceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of snap.ratings) {
      if (!visible.has(r.user_id) || r.score == null) continue;
      const t = titleById(snap, r.title_id);
      if (!t) continue;
      const p = profileById(snap, r.user_id);
      const svc = r.service || (t.providers.find((pv) => p?.services?.includes(pv)) ?? t.providers[0]);
      if (svc) counts.set(svc, (counts.get(svc) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [snap, userId, visible]);

  // Meest aangeraden series in de groep
  const mostRecommended = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of snap.recommendations) counts.set(r.title_id, (counts.get(r.title_id) || 0) + 1);
    return [...counts.entries()]
      .map(([title_id, count]) => ({ title: titleById(snap, title_id), count }))
      .filter((x): x is { title: NonNullable<ReturnType<typeof titleById>>; count: number } => x.title != null)
      // Alleen series die minstens 2x zijn aangeraden; maximaal 5 tonen.
      .filter((x) => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [snap]);

  const maxGroupGenre = groupGenreCounts.length ? Math.max(...groupGenreCounts.map((g) => g.count)) : 1;
  const maxGroupService = groupServiceCounts.length ? Math.max(...groupServiceCounts.map((s) => s.count)) : 1;

  const hasGroupData = friends.length > 0;

  return (
    <div className="page">
      <h2>Nu aan het kijken</h2>
      {myWatching.length === 0 ? (
        <p className="muted" style={{ margin: '0 4px 8px' }}>Je hebt nog niets als "Mee bezig" gemarkeerd.</p>
      ) : (
        <div className="card">
          {myWatching.map((t) => (
            <TitleRow key={t.tmdb_id} title={t} onClick={() => onNavigate({ status: 'mine', titleId: t.tmdb_id })} />
          ))}
        </div>
      )}

      <h2>Mijn vrienden kijken</h2>
      {friends.length === 0 ? (
        <div className="empty">
          <div className="big">👥</div>
          <p>Je volgt nog geen vrienden.</p>
          <button className="btn" style={{ marginTop: 8 }} onClick={onGoFriends}>Vrienden toevoegen</button>
        </div>
      ) : friendsWatching.length === 0 ? (
        <p className="muted" style={{ margin: '0 4px' }}>Je vrienden kijken op dit moment niets.</p>
      ) : (
        friendsWatching.map(({ profile, titles }) => (
          <div key={profile.id} className="card" style={{ marginBottom: 8 }}>
            <div className="row" style={{ gap: 8, marginBottom: 6, cursor: 'pointer' }} onClick={() => onOpenProfile(profile.id)}>
              <Avatar profile={profile} size="sm" />
              <span style={{ fontWeight: 600 }}>{profile.name}</span>
            </div>
            {titles.map((t) => {
              const haveIt = !!myRating(snap, t.tmdb_id, userId);
              return (
                <TitleRow
                  key={t.tmdb_id}
                  title={t}
                  onClick={() => onNavigate({ status: 'all', titleId: t.tmdb_id })}
                  right={haveIt
                    ? <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>op je lijst</span>
                    : <button className="btn ghost" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => onAdd(t.tmdb_id)} title="Aan mijn lijst toevoegen">+</button>}
                />
              );
            })}
          </div>
        ))
      )}

      {/* ---- Mijn statistieken ---- */}
      {totalCount > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Mijn statistieken</h2>

          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <div className="stat-box" style={{ cursor: 'pointer' }} onClick={() => onNavigate({ status: 'mine' })}>
              <div className="v">{totalCount}</div>
              <div className="k">Series op lijst</div>
            </div>
            <div className="stat-box">
              <div className="v">{avgScore != null ? avgScore.toFixed(1) : '—'}</div>
              <div className="k">Gemiddeld cijfer</div>
            </div>
            <div className="stat-box" style={{ cursor: 'pointer' }} onClick={() => onNavigate({ status: 'finished' })}>
              <div className="v">{finishedCount}</div>
              <div className="k">✅ Afgezien</div>
            </div>
            <div className="stat-box">
              <div className="v">{hours > 0 ? `${Math.round(hours)}u` : scoredCount > 0 ? '—' : '—'}</div>
              <div className="k">Kijkuren (schat)</div>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Verdeling lijst</div>
            {([
              { label: 'Mee bezig', count: watchingCount, color: 'var(--accent)', status: 'watching' as Status },
              { label: '✅ Afgezien', count: finishedCount, color: 'var(--good)', status: 'finished' as Status },
              { label: 'Wishlist', count: wantCount, color: 'var(--warn)', status: 'want' as Status },
              { label: 'Afgehaakt', count: droppedCount, color: 'var(--muted)', status: 'dropped' as Status },
            ]).filter((s) => s.count > 0).map((s) => (
              <BarRow key={s.label} label={s.label} value={s.count} max={totalCount} val={`${s.count}`} color={s.color} onClick={() => onNavigate({ status: s.status })} />
            ))}
          </div>

          {myGenreCounts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Mijn genres</div>
              {myGenreCounts.map((g) => (
                <BarRow
                  key={g.genre}
                  label={g.genre}
                  value={g.count}
                  max={maxGenreCount}
                  val={g.avg != null ? `${g.count}x · ${g.avg.toFixed(1)}` : `${g.count}x`}
                  color="var(--accent)"
                  onClick={() => onNavigate({ status: 'mine', genre: g.genre })}
                />
              ))}
            </div>
          )}

          {myServices.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Streamingdiensten</div>
              {myServices.map((s) => (
                <BarRow
                  key={s.service}
                  label={s.service}
                  value={s.count}
                  max={maxServiceCount}
                  val={`${s.count} serie${s.count !== 1 ? 's' : ''}`}
                  color="var(--good)"
                  onClick={() => onNavigate({ status: 'mine', service: s.service })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- Groepsstatistieken ---- */}
      {hasGroupData && (groupTitleStats.length > 0 || groupGenreCounts.length > 0 || mostRecommended.length > 0) && (
        <>
          <h2 style={{ marginTop: 24 }}>In de groep</h2>

          {mostRecommended.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Meest aangeraden</div>
              {mostRecommended.map(({ title, count }, i) => (
                <div className="row spread" key={title.tmdb_id} style={{ padding: '5px 0', borderBottom: i < mostRecommended.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }} onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}>
                  <span style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{title.name}</span>
                  <span className="chip" style={{ flexShrink: 0 }}>💌 {count}x</span>
                </div>
              ))}
            </div>
          )}

          {groupTitleStats.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Populairste series</div>
              {groupTitleStats.map(({ title, listCount, scoreCount, avg }) => (
                <div className="row spread" key={title.tmdb_id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}>
                  <span style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{title.name}</span>
                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                    {avg != null && (
                      <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }} title={`${scoreCount} cijfer${scoreCount !== 1 ? 's' : ''}`}>
                        {avg.toFixed(1)}
                      </span>
                    )}
                    <span className="chip" title="Aantal personen met deze serie op de lijst">👥 {listCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {groupGenreCounts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Populaire genres</div>
              {groupGenreCounts.map((g) => (
                <BarRow key={g.genre} label={g.genre} value={g.count} max={maxGroupGenre} val={`${g.count}x`} color="var(--warn)" onClick={() => onNavigate({ status: 'all', genre: g.genre })} />
              ))}
            </div>
          )}

          {groupServiceCounts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Populaire diensten</div>
              {groupServiceCounts.map((s) => (
                <BarRow key={s.service} label={s.service} value={s.count} max={maxGroupService} val={`${s.count}x`} color="var(--accent-2)" onClick={() => onNavigate({ status: 'all', service: s.service })} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
