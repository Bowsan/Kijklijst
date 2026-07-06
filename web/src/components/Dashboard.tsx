import { useMemo, type ReactNode } from 'react';
import type { Snapshot, Title, Status } from '../lib/types';
import { posterUrl } from '../lib/types';
import {
  followingProfiles, watchingTitles, myRating,
  serviceStats, totalWatchHours, ratedCount,
  visibleUserIds, titleById, profileById, yearStats,
  juryScores, groupDivision, tasteOutliers, blindSpotGenre, finisherStats,
} from '../lib/compute';
import type { Profile } from '../lib/types';
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
  const currentYear = new Date().getFullYear();
  const year = useMemo(() => yearStats(snap, userId, currentYear), [snap, userId, currentYear]);

  // --- De Bank vergelijkt: sociale statistieken ---
  const jury = useMemo(() => juryScores(snap, userId), [snap, userId]);
  const division = useMemo(() => groupDivision(snap, userId), [snap, userId]);
  const outliers = useMemo(() => tasteOutliers(snap, userId), [snap, userId]);
  const blindSpot = useMemo(() => blindSpotGenre(snap, userId), [snap, userId]);
  const finishers = useMemo(() => finisherStats(snap, userId), [snap, userId]);
  const nick = (p: Profile) => (p.id === userId ? 'Jij' : p.name);
  const hasCompare =
    jury.length >= 2 || division.divided != null || division.agreed != null ||
    outliers.guilty != null || outliers.panned != null || blindSpot != null || finishers.length >= 2;

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

          {year && (
            <div className="card year-card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>✨ Jouw {currentYear} in series</div>
              <div className="year-rows">
                <div>📺 <b>{year.count}</b> serie{year.count !== 1 ? 's' : ''} beoordeeld{year.hours > 0 && <> · zo'n <b>{year.hours} uur</b> gekeken</>}</div>
                {year.topGenre && <div>🏷️ Meest gekeken genre: <b>{year.topGenre}</b></div>}
                {year.best && <div>🏆 Hoogste cijfer: <b>{year.best.title.name}</b> ({year.best.score})</div>}
                {year.clash && (
                  <div>
                    ⚔️ Grootste meningsverschil: <b>{year.clash.title.name}</b> — jij gaf een {year.clash.mine}, {year.clash.friend.name} een {year.clash.theirs}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- De Bank vergelijkt: sociale inzichten uit de gedeelde cijfers ---- */}
      {hasCompare && (
        <>
          <h2 style={{ marginTop: 24 }}>De Bank vergelijkt</h2>

          {jury.length >= 2 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>🧑‍⚖️ De jury</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Wie cijfert streng, wie mild — vergeleken met de rest op dezelfde series.
              </div>
              {jury.map((j, i) => (
                <div className="row spread" key={j.profile.id} style={{ padding: '5px 0' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Avatar profile={j.profile} size="sm" />
                    <span style={{ fontSize: 14 }}>{nick(j.profile)}</span>
                    {i === 0 && <span className="jury-tag strict">strengste</span>}
                    {i === jury.length - 1 && <span className="jury-tag mild">mildste</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: j.delta <= 0 ? '#b47b7b' : 'var(--good)' }}>
                    {j.delta > 0 ? '+' : '−'}{Math.abs(j.delta).toFixed(1).replace('.', ',')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(division.divided || division.agreed) && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>⚔️ Verdeeld & eensgezind</div>
              <div className="year-rows">
                {division.divided && (
                  <div>
                    🔥 Meest verdeeld: <b>{division.divided.title.name}</b> — {nick(division.divided.low.user)} gaf een {division.divided.low.score}, {nick(division.divided.high.user)} een {division.divided.high.score}
                  </div>
                )}
                {division.agreed && (
                  <div>
                    🤝 Meest eensgezind: <b>{division.agreed.title.name}</b> — alle {division.agreed.count} cijfers hooguit {division.agreed.spread === 0 ? 'nul' : division.agreed.spread.toFixed(1).replace('.', ',')} punt uit elkaar
                  </div>
                )}
              </div>
            </div>
          )}

          {(outliers.guilty || outliers.panned || blindSpot) && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>🙈 Jouw smaak vs de groep</div>
              <div className="year-rows">
                {outliers.guilty && (
                  <div>
                    💖 Jouw guilty pleasure: <b>{outliers.guilty.title.name}</b> — jij gaf een {outliers.guilty.mine}, de rest gemiddeld {outliers.guilty.others.toFixed(1).replace('.', ',')}
                  </div>
                )}
                {outliers.panned && (
                  <div>
                    🥶 Alleen jij vond dit niks: <b>{outliers.panned.title.name}</b> — jij een {outliers.panned.mine}, de rest {outliers.panned.others.toFixed(1).replace('.', ',')}
                  </div>
                )}
                {blindSpot && (
                  <div>
                    🕳️ Blinde vlek: <b>{blindSpot.genre}</b> — je vrienden keken al {blindSpot.count} series in dit genre, jij nog geen één
                  </div>
                )}
              </div>
            </div>
          )}

          {finishers.length >= 2 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>🏁 Afmakers</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Hoeveel van de begonnen series kijkt iedereen ook echt af?
              </div>
              {finishers.map((f) => (
                <BarRow
                  key={f.profile.id}
                  label={nick(f.profile)}
                  value={f.pct}
                  max={100}
                  val={`${f.pct}% (${f.finished}/${f.finished + f.dropped})`}
                  color={f.pct >= 70 ? 'var(--good)' : f.pct >= 40 ? 'var(--warn)' : '#b47b7b'}
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
