import { useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../lib/types';
import { PERSON_IMG, serviceLogoUrl } from '../lib/types';
import {
  followingProfiles, watchingTitles, myRating, serviceStats, totalWatchHours,
  ratedCount, titleById, profileById, visibleUserIds, yearStats,
  favoriteActors, favoriteCreators,
} from '../lib/compute';
import { fmt1, timeAgo } from '../lib/format';
import Thumb from './Thumb';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';
import {
  useReveal, useSvcLogos, CountUp, TitleRow, BarRow, GenreStat, TLink, IconRow, Donut,
  SvcLabel, type NavOpts, type DonutPart,
} from './dashboard/widgets';
import CompareCards from './dashboard/CompareCards';
import GroupCards from './dashboard/GroupCards';

interface Props {
  snap: Snapshot;
  userId: string;
  onOpenProfile: (id: string) => void;
  onAdd: (tmdbId: number) => void;
  onGoFriends: () => void;
  onNavigate: (opts: NavOpts) => void;
}

export default function Dashboard({ snap, userId, onOpenProfile, onAdd, onGoFriends, onNavigate }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  useReveal(pageRef);

  const myWatching = watchingTitles(snap, userId);
  const friends = followingProfiles(snap, userId);
  const friendsWatching = friends
    .map((p) => ({ profile: p, titles: watchingTitles(snap, p.id) }))
    .filter((fw) => fw.titles.length > 0);

  // Hoog gewaardeerde series van je vrienden die jij nog niet hebt — zodat een
  // nieuwe gebruiker (nog geen eigen lijst) meteen iets te ontdekken heeft.
  const friendPicks = useMemo(() => {
    const byTitle = new Map<number, { title: NonNullable<ReturnType<typeof titleById>>; best: number; fans: Set<string> }>();
    for (const p of friends) {
      for (const r of snap.ratings) {
        if (r.user_id !== p.id || r.score == null) continue;
        if (myRating(snap, r.title_id, userId)) continue; // al op mijn lijst
        const t = titleById(snap, r.title_id);
        if (!t) continue;
        const e = byTitle.get(t.tmdb_id) ?? { title: t, best: 0, fans: new Set<string>() };
        e.best = Math.max(e.best, r.score);
        e.fans.add(p.id);
        byTitle.set(t.tmdb_id, e);
      }
    }
    return [...byTitle.values()]
      .sort((a, b) => b.best - a.best || b.fans.size - a.fans.size)
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, userId, friends]);

  // --- Jouw statistieken ---
  const currentYear = new Date().getFullYear();
  const year = useMemo(() => yearStats(snap, userId, currentYear), [snap, userId, currentYear]);

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

  const myGenreCounts = useMemo(() => {
    const counts = new Map<string, { count: number; scores: number[]; best: { title: typeof snap.titles[number]; score: number } | null }>();
    for (const r of myRatings) {
      const t = titleById(snap, r.title_id);
      if (!t) continue;
      for (const g of t.genres) {
        if (!counts.has(g)) counts.set(g, { count: 0, scores: [], best: null });
        const entry = counts.get(g)!;
        entry.count++;
        if (r.score != null) {
          entry.scores.push(r.score);
          // Beste eigen serie in dit genre (hoogste cijfer).
          if (!entry.best || r.score > entry.best.score) entry.best = { title: t, score: r.score };
        }
      }
    }
    return [...counts.entries()]
      .map(([genre, { count, scores: gs, best }]) => ({
        genre,
        count,
        avg: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
        best,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, userId]);

  const myServices = useMemo(() => serviceStats(snap, userId).slice(0, 6), [snap, userId]);

  const myActorsAll = useMemo(() => favoriteActors(snap, userId, 15), [snap, userId]);
  const [castExpanded, setCastExpanded] = useState(false);
  const myActors = castExpanded ? myActorsAll : myActorsAll.slice(0, 5);
  // Portretfoto per acteur, uit de cast-metadata van welke serie dan ook.
  const actorPhotos = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of snap.titles) {
      for (const c of t.cast_meta ?? []) {
        if (c.photo && !m.has(c.name)) m.set(c.name, c.photo);
      }
    }
    return m;
  }, [snap]);

  const myCreatorsAll = useMemo(() => favoriteCreators(snap, userId, 15), [snap, userId]);
  const [makersExpanded, setMakersExpanded] = useState(false);
  const myCreators = makersExpanded ? myCreatorsAll : myCreatorsAll.slice(0, 5);

  const svcLogos = useSvcLogos(snap);
  const maxGenreCount = myGenreCounts.length ? Math.max(...myGenreCounts.map((g) => g.count)) : 1;
  const maxServiceCount = myServices.length ? Math.max(...myServices.map((s) => s.seasons)) : 1;

  const visible = useMemo(() => new Set(visibleUserIds(snap, userId)), [snap, userId]);
  const latestComments = useMemo(() => {
    return snap.comments
      .filter((c) => visible.has(c.user_id))
      .map((c) => ({ c, who: profileById(snap, c.user_id), title: titleById(snap, c.title_id) }))
      .filter((x) => x.who && x.title)
      .sort((a, b) => b.c.created_at - a.c.created_at)
      .slice(0, 4);
  }, [snap, visible]);

  const donutParts: DonutPart[] = ([
    { label: 'Afgezien', count: finishedCount, color: 'var(--good)', status: 'finished' },
    { label: 'Mee bezig', count: watchingCount, color: 'var(--info)', status: 'watching' },
    { label: 'Wishlist', count: wantCount, color: 'var(--warn)', status: 'want' },
    { label: 'Afgehaakt', count: droppedCount, color: '#b47b7b', status: 'dropped' },
  ] as DonutPart[]).filter((p) => p.count > 0);

  return (
    <div className="page dash" ref={pageRef}>
      <h2 className="dash-h2"><span className="h2-ico">📺</span>Jij kijkt nu naar</h2>
      {myWatching.length === 0 ? (
        <p className="muted" style={{ margin: '0 4px 8px' }}>Je hebt nog niets als "Mee bezig" gemarkeerd.</p>
      ) : (
        <div className="card">
          {myWatching.map((t) => (
            <TitleRow key={t.tmdb_id} title={t} onClick={() => onNavigate({ status: 'mine', titleId: t.tmdb_id })} />
          ))}
        </div>
      )}

      <h2 className="dash-h2"><span className="h2-ico">👥</span>Jouw vrienden kijken</h2>
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

      {/* Ontdek series van je vrienden — vooral waardevol als je zelf nog weinig
          op je lijst hebt en er dus verder weinig te zien valt. */}
      {friendPicks.length > 0 && (finishedCount + watchingCount < 3 || friendsWatching.length === 0) && (
        <>
          <h2 className="dash-h2"><span className="h2-ico">⭐</span>Toppers bij je vrienden</h2>
          <p className="muted" style={{ margin: '0 4px 8px', fontSize: 13 }}>
            Hoog gewaardeerd door de vrienden die je volgt — nog niet op jouw lijst.
          </p>
          <div className="card">
            {friendPicks.map(({ title, best }) => (
              <TitleRow
                key={title.tmdb_id}
                title={title}
                onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}
                right={
                  <span className="row" style={{ gap: 8, flexShrink: 0 }}>
                    <StatusBadge status={null} score={best} />
                    <button className="btn ghost" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); onAdd(title.tmdb_id); }} title="Aan mijn lijst toevoegen">+</button>
                  </span>
                }
              />
            ))}
          </div>
        </>
      )}

      {latestComments.length > 0 && (
        <>
          <h2 className="dash-h2"><span className="h2-ico">💬</span>Laatste berichten</h2>
          <div className="card">
            {latestComments.map(({ c, who, title }) => (
              <div key={c.id} className="feed-row" onClick={() => onNavigate({ status: 'all', titleId: title!.tmdb_id })}>
                <span onClick={(e) => { e.stopPropagation(); onOpenProfile(c.user_id); }} style={{ cursor: 'pointer', flexShrink: 0 }}>
                  <Avatar profile={who} id={c.user_id} size="sm" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="feed-meta">
                    <b className="link-name" onClick={(e) => { e.stopPropagation(); onOpenProfile(c.user_id); }}>{c.user_id === userId ? 'Jij' : who!.name.split(' ')[0]}</b> over <b>{title!.name}</b>
                    <span className="muted"> · {timeAgo(c.created_at)}</span>
                  </div>
                  <div className="feed-text">“{c.text}”</div>
                </div>
                <Thumb path={title!.poster_path} name={title!.name} w={40} h={60} />
              </div>
            ))}
          </div>
        </>
      )}

      {totalCount > 0 && (
        <>
          <div className="stat-grid" style={{ marginBottom: 12, marginTop: 12 }}>
            <button className="stat-box tint-accent" onClick={() => onNavigate({ status: 'mine' })}>
              <span className="stat-ico">📚</span>
              <div className="stat-body">
                <div className="k">Jouw series</div>
                <div className="v"><CountUp value={totalCount} /></div>
              </div>
            </button>
            <div className="stat-box tint-warn">
              <span className="stat-ico">⭐</span>
              <div className="stat-body">
                <div className="k">Gemiddeld cijfer</div>
                <div className="v">{avgScore != null ? <CountUp value={avgScore} decimals={1} /> : '—'}</div>
              </div>
            </div>
            <button className="stat-box tint-good" onClick={() => onNavigate({ status: 'finished' })}>
              <span className="stat-ico">✅</span>
              <div className="stat-body">
                <div className="k">Afgezien</div>
                <div className="v"><CountUp value={finishedCount} /></div>
              </div>
            </button>
            <div className="stat-box tint-info">
              <span className="stat-ico">⏱️</span>
              <div className="stat-body">
                <div className="k">Kijkuren</div>
                <div className="v">{hours > 0 ? <CountUp value={Math.round(hours)} suffix="u" /> : scoredCount > 0 ? '—' : '—'}</div>
              </div>
            </div>
          </div>

          {donutParts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <Donut parts={donutParts} total={totalCount} onPick={(s) => onNavigate({ status: s })} />
            </div>
          )}

          {myGenreCounts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Jouw genres</div>
              {myGenreCounts.map((g) => (
                <GenreStat
                  key={g.genre}
                  genre={g.genre}
                  count={g.count}
                  avg={g.avg}
                  max={maxGenreCount}
                  best={g.best}
                  color="var(--accent)"
                  onGenre={() => onNavigate({ status: 'mine', genre: g.genre })}
                  onTitle={(id) => onNavigate({ status: 'mine', titleId: id })}
                />
              ))}
            </div>
          )}

          {myActors.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">🎭 Jouw vaste cast</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Acteurs die in meerdere series op je lijst spelen — tik voor hun series.
              </div>
              {myActors.map((a) => (
                <button key={a.name} className="actor-row" onClick={() => onNavigate({ status: 'mine', actor: a.name })}>
                  {actorPhotos.has(a.name)
                    ? <img className="actor-photo" src={PERSON_IMG + actorPhotos.get(a.name)} alt="" loading="lazy" />
                    : <span className="actor-badge">{a.name.trim().charAt(0)}</span>}
                  <span className="actor-name">{a.name}</span>
                  <span className="actor-stats">
                    <b>{a.count} series</b>
                    <span className="val-sub">gem. {fmt1(a.avg)}</span>
                  </span>
                </button>
              ))}
              {myActorsAll.length > 5 && (
                <button className="btn ghost more-btn" onClick={() => setCastExpanded((v) => !v)}>
                  {castExpanded ? '▴ Minder' : 'Top-15 bekijken'}
                </button>
              )}
            </div>
          )}

          {myCreators.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">🎬 Jouw beste serie makers</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Bedenkers van meerdere series die jij een cijfer gaf — tik voor hun series.
              </div>
              {myCreators.map((c) => (
                <button key={c.name} className="actor-row" onClick={() => onNavigate({ status: 'mine', creator: c.name })}>
                  {c.photo
                    ? <img className="actor-photo" src={PERSON_IMG + c.photo} alt="" loading="lazy" />
                    : <span className="actor-badge">{c.name.trim().charAt(0)}</span>}
                  <span className="actor-name">{c.name}</span>
                  <span className="actor-stats">
                    <b>{c.count} series</b>
                    <span className="val-sub">gem. {fmt1(c.avg)}</span>
                  </span>
                </button>
              ))}
              {myCreatorsAll.length > 5 && (
                <button className="btn ghost more-btn" onClick={() => setMakersExpanded((v) => !v)}>
                  {makersExpanded ? '▴ Minder' : 'Top-15 bekijken'}
                </button>
              )}
            </div>
          )}

          {myServices.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title with-unit">Jouw streamingdiensten<span className="col-unit">seizoenen</span></div>
              {myServices.map((s) => (
                <BarRow
                  key={s.service}
                  label={<SvcLabel name={s.service} svcLogos={svcLogos} />}
                  value={s.seasons}
                  max={maxServiceCount}
                  val={<b>{s.seasons}</b>}
                  color="var(--good)"
                  onClick={() => onNavigate({ status: 'mine', service: s.service })}
                />
              ))}
            </div>
          )}

          {year && (
            <div className="card year-card" style={{ marginBottom: 12 }}>
              <div className="card-title">✨ Jouw {currentYear} in series</div>
              {/* Hoogste cijfer als visuele held; aantallen/uren staan al bij de tegels. */}
              {year.best && (
                <div className="year-hero" onClick={() => onNavigate({ status: 'all', titleId: year.best!.title.tmdb_id })}>
                  <Thumb path={year.best.title.poster_path} name={year.best.title.name} w={64} h={96} />
                  <div className="yh-body">
                    <div className="yh-label">🏆 Jouw hoogste cijfer</div>
                    <div className="yh-name">{year.best.title.name}</div>
                    <StatusBadge status={null} score={year.best.score} />
                  </div>
                </div>
              )}
              {(year.topGenre || year.bestService) && (
                <div className="year-chips">
                  {year.bestService && (
                    <span className="chip">
                      🥇 Beste dienst:{' '}
                      {svcLogos.has(year.bestService.service) && (
                        <img className="svc-inline" src={serviceLogoUrl(svcLogos.get(year.bestService.service)!)} alt="" style={{ width: 15, height: 15 }} decoding="async" />
                      )}
                      <b>{year.bestService.service}</b> · gem. {fmt1(year.bestService.avg)}
                    </span>
                  )}
                  {year.topGenre && <span className="chip">🏷️ Meest gekeken genre: <b>{year.topGenre}</b></span>}
                </div>
              )}
              {year.clash && (
                <IconRow
                  ico="⚔️"
                  line={<>Grootste meningsverschil: <TLink title={year.clash.title} onNavigate={onNavigate} /></>}
                  sub={<>Jij gaf een {year.clash.mine}, <span className="link-name" onClick={() => onOpenProfile(year.clash!.friend.id)}>{year.clash.friend.name}</span> een {year.clash.theirs}</>}
                />
              )}
            </div>
          )}
        </>
      )}

      <CompareCards snap={snap} userId={userId} onOpenProfile={onOpenProfile} onNavigate={onNavigate} />
      <GroupCards snap={snap} userId={userId} onNavigate={onNavigate} />
    </div>
  );
}
