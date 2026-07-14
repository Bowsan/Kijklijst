import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Snapshot, Title, Status, Profile } from '../lib/types';
import { posterUrl, PERSON_IMG, serviceLogoUrl } from '../lib/types';
import {
  followingProfiles, watchingTitles, myRating,
  serviceStats, totalWatchHours, ratedCount,
  visibleUserIds, titleById, profileById, yearStats,
  juryScores, groupDivision, tasteOutliers, blindSpotGenre, finisherStats, favoriteActors, favoriteCreators,
} from '../lib/compute';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';
import PosterFallback from './PosterFallback';

interface NavOpts {
  status?: Status | 'all' | 'mine';
  genre?: string;
  service?: string;
  actor?: string;
  creator?: string;
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

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Onthul kaarten pas (met stagger) zodra ze in beeld scrollen. */
function useReveal(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = root.querySelectorAll('.card, .stat-grid, .empty');
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).style.transitionDelay = `${i++ * 70}ms`;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref]);
}

/** Teller die soepel naar zijn eindwaarde loopt (ease-out). */
function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const [n, setN] = useState(reducedMotion() ? value : 0);
  useEffect(() => {
    if (reducedMotion()) { setN(value); return; }
    let start: number | null = null;
    let raf = 0;
    const dur = 900;
    const step = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / dur);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toFixed(decimals)}{suffix}</>;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'net';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} u`;
  return `${Math.floor(h / 24)} d`;
}

function Thumb({ title, w = 44, h = 66 }: { title: Title; w?: number; h?: number }) {
  return title.poster_path
    ? <img src={posterUrl(title.poster_path, 'small')} alt="" style={{ width: w, height: h, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
    : <PosterFallback name={title.name} width={w} height={h} />;
}

function TitleRow({ title, right, onClick }: { title: Title; right?: ReactNode; onClick?: () => void }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'center', padding: '4px 0' }}>
      <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', flexShrink: 0 }}><Thumb title={title} /></div>
      <div style={{ flex: 1, minWidth: 0, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{title.name}</div>
        <div className="title-sub">{title.year || '—'}</div>
      </div>
      {right}
    </div>
  );
}

function BarRow({ label, value, max, val, color, onClick }: { label: ReactNode; value: number; max: number; val: ReactNode; color?: string; onClick?: () => void }) {
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

/** Klikbare serienaam in lopende tekst. */
function TLink({ title, onNavigate }: { title: Title; onNavigate: (o: NavOpts) => void }) {
  return (
    <span className="tlink" role="link" onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}>
      {title.name}
    </span>
  );
}

/** Rij met het icoon in een eigen kolom: de titelregel kapt af met puntjes
    en de toelichting staat altijd op de regel eronder. */
function IconRow({ ico, line, sub }: { ico: string; line: ReactNode; sub: ReactNode }) {
  return (
    <div className="icon-row">
      <span className="icon-row-ico">{ico}</span>
      <div className="icon-row-body">
        <div className="icon-row-line">{line}</div>
        <div className="icon-row-sub">{sub}</div>
      </div>
    </div>
  );
}

interface DonutPart { label: string; count: number; color: string; status: Status }

/** Donut voor de lijstverdeling: statuskleuren, 2px-gaten, klikbare legenda. */
function Donut({ parts, total, onPick }: { parts: DonutPart[]; total: number; onPick: (s: Status) => void }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const GAP = parts.length > 1 ? 3 : 0;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 120 120" role="img" aria-label={`Verdeling van je ${total} series`}>
        <g transform="rotate(-90 60 60)">
          {parts.map((p) => {
            const len = Math.max(0, (p.count / total) * C - GAP);
            const el = (
              <circle
                key={p.status} cx="60" cy="60" r={R} fill="none"
                stroke={p.color} strokeWidth="15"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}
                style={{ cursor: 'pointer' }} onClick={() => onPick(p.status)}
              >
                <title>{`${p.label}: ${p.count}`}</title>
              </circle>
            );
            acc += (p.count / total) * C;
            return el;
          })}
        </g>
        <text x="60" y="58" textAnchor="middle" className="donut-num"><CountUp value={total} /></text>
        <text x="60" y="74" textAnchor="middle" className="donut-lbl">series</text>
      </svg>
      <div className="donut-legend">
        {parts.map((p) => (
          <button key={p.status} className="dl-row" onClick={() => onPick(p.status)}>
            <span className="dl-dot" style={{ background: p.color }} />
            <span className="dl-name">{p.label}</span>
            <b className="dl-count">{p.count}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ snap, userId, onOpenProfile, onAdd, onGoFriends, onNavigate }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  useReveal(pageRef);

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
  const myActorsAll = useMemo(() => favoriteActors(snap, userId, 15), [snap, userId]);
  const [castExpanded, setCastExpanded] = useState(false);
  const myActors = castExpanded ? myActorsAll : myActorsAll.slice(0, 5);
  // Portretfoto per acteur (uit de cast-metadata van welke serie dan ook).
  const actorPhotos = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of snap.titles) {
      for (const c of t.cast_meta ?? []) {
        if (c.photo && !m.has(c.name)) m.set(c.name, c.photo);
      }
    }
    return m;
  }, [snap]);
  // Beste seriemakers (bedenkers met meerdere beoordeelde series).
  const myCreators = useMemo(() => favoriteCreators(snap, userId, 5), [snap, userId]);
  // Dienstlogo's (TMDb-paden), verzameld door de server bij het verversen.
  const svcLogos = useMemo(
    () => new Map((snap.service_logos ?? []).map((l) => [l.name, l.logo_path])),
    [snap],
  );
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
      .slice(0, 8);
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

  // Laatst geplaatste berichten (van jou + gevolgde vrienden), nieuwste eerst.
  const latestComments = useMemo(() => {
    return snap.comments
      .filter((c) => visible.has(c.user_id))
      .map((c) => ({ c, who: profileById(snap, c.user_id), title: titleById(snap, c.title_id) }))
      .filter((x) => x.who && x.title)
      .sort((a, b) => b.c.created_at - a.c.created_at)
      .slice(0, 4);
  }, [snap, visible]);

  const maxGroupGenre = groupGenreCounts.length ? Math.max(...groupGenreCounts.map((g) => g.count)) : 1;
  const maxGroupService = groupServiceCounts.length ? Math.max(...groupServiceCounts.map((s) => s.count)) : 1;

  const hasGroupData = friends.length > 0;

  const donutParts: DonutPart[] = ([
    { label: 'Afgezien', count: finishedCount, color: 'var(--good)', status: 'finished' },
    { label: 'Mee bezig', count: watchingCount, color: 'var(--info)', status: 'watching' },
    { label: 'Wishlist', count: wantCount, color: 'var(--warn)', status: 'want' },
    { label: 'Afgehaakt', count: droppedCount, color: '#b47b7b', status: 'dropped' },
  ] as DonutPart[]).filter((p) => p.count > 0);

  return (
    <div className="page dash" ref={pageRef}>
      <h2 className="dash-h2"><span className="h2-ico">📺</span>Nu aan het kijken</h2>
      {myWatching.length === 0 ? (
        <p className="muted" style={{ margin: '0 4px 8px' }}>Je hebt nog niets als "Mee bezig" gemarkeerd.</p>
      ) : (
        <div className="card">
          {myWatching.map((t) => (
            <TitleRow key={t.tmdb_id} title={t} onClick={() => onNavigate({ status: 'mine', titleId: t.tmdb_id })} />
          ))}
        </div>
      )}

      <h2 className="dash-h2"><span className="h2-ico">👥</span>Mijn vrienden kijken</h2>
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

      {/* ---- Laatst geplaatste berichten ---- */}
      {latestComments.length > 0 && (
        <>
          <h2 className="dash-h2"><span className="h2-ico">💬</span>Laatste berichten</h2>
          <div className="card">
            {latestComments.map(({ c, who, title }) => (
              <div key={c.id} className="feed-row" onClick={() => onNavigate({ status: 'all', titleId: title!.tmdb_id })}>
                <Avatar profile={who} id={c.user_id} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="feed-meta">
                    <b>{c.user_id === userId ? 'Jij' : who!.name.split(' ')[0]}</b> over <b>{title!.name}</b>
                    <span className="muted"> · {timeAgo(c.created_at)}</span>
                  </div>
                  <div className="feed-text">“{c.text}”</div>
                </div>
                <Thumb title={title!} w={40} h={60} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---- Mijn statistieken ---- */}
      {totalCount > 0 && (
        <>
          <h2 className="dash-h2"><span className="h2-ico">📊</span>Mijn statistieken</h2>

          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <button className="stat-box tint-accent" onClick={() => onNavigate({ status: 'mine' })}>
              <div className="k">Series op de lijst</div>
              <div className="stat-row">
                <span className="stat-ico">📚</span>
                <div className="v"><CountUp value={totalCount} /></div>
              </div>
            </button>
            <div className="stat-box tint-warn">
              <div className="k">Gemiddeld cijfer</div>
              <div className="stat-row">
                <span className="stat-ico">⭐</span>
                <div className="v">{avgScore != null ? <CountUp value={avgScore} decimals={1} /> : '—'}</div>
              </div>
            </div>
            <button className="stat-box tint-good" onClick={() => onNavigate({ status: 'finished' })}>
              <div className="k">Afgezien</div>
              <div className="stat-row">
                <span className="stat-ico">✅</span>
                <div className="v"><CountUp value={finishedCount} /></div>
              </div>
            </button>
            <div className="stat-box tint-info">
              <div className="k">Kijkuren</div>
              <div className="stat-row">
                <span className="stat-ico">⏱️</span>
                <div className="v">{hours > 0 ? <CountUp value={Math.round(hours)} suffix="u" /> : scoredCount > 0 ? '—' : '—'}</div>
              </div>
            </div>
          </div>

          {/* Verdeling als donut met klikbare legenda */}
          {donutParts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Verdeling lijst</div>
              <Donut parts={donutParts} total={totalCount} onPick={(s) => onNavigate({ status: s })} />
            </div>
          )}

          {myGenreCounts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Mijn genres</div>
              {myGenreCounts.map((g) => (
                <BarRow
                  key={g.genre}
                  label={g.genre}
                  value={g.count}
                  max={maxGenreCount}
                  val={g.avg != null ? <><b>{g.count}×</b> <span className="val-sub">· {g.avg.toFixed(1)}</span></> : <b>{g.count}×</b>}
                  color="var(--accent)"
                  onClick={() => onNavigate({ status: 'mine', genre: g.genre })}
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
                    <span className="val-sub">gem. {a.avg.toFixed(1).replace('.', ',')}</span>
                  </span>
                </button>
              ))}
              {myActorsAll.length > 5 && (
                <button
                  className="btn ghost"
                  style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 4px', marginTop: 2 }}
                  onClick={() => setCastExpanded((v) => !v)}
                >
                  {castExpanded ? '▴ Minder' : `▾ Meer (top ${myActorsAll.length})`}
                </button>
              )}
            </div>
          )}

          {myCreators.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">🎬 Beste seriemakers</div>
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
                    <span className="val-sub">gem. {c.avg.toFixed(1).replace('.', ',')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {myServices.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Streamingdiensten</div>
              {myServices.map((s) => (
                <BarRow
                  key={s.service}
                  label={
                    <span className="svc-cell">
                      {svcLogos.has(s.service)
                        ? <img className="svc-logo" src={serviceLogoUrl(svcLogos.get(s.service)!)} alt="" loading="lazy" />
                        : <span className="svc-logo svc-fallback">{s.service.trim().charAt(0)}</span>}
                      <span className="svc-name">{s.service}</span>
                    </span>
                  }
                  value={s.count}
                  max={maxServiceCount}
                  val={<b>{s.count}×</b>}
                  color="var(--good)"
                  onClick={() => onNavigate({ status: 'mine', service: s.service })}
                />
              ))}
            </div>
          )}

          {year && (
            <div className="card year-card" style={{ marginBottom: 12 }}>
              <div className="card-title">✨ Jouw {currentYear} in series</div>
              {/* Hoogste cijfer als visuele held; aantallen/uren staan al bij de statistieken. */}
              {year.best && (
                <div className="year-hero" onClick={() => onNavigate({ status: 'all', titleId: year.best!.title.tmdb_id })}>
                  <Thumb title={year.best.title} w={64} h={96} />
                  <div className="yh-body">
                    <div className="yh-label">🏆 Jouw hoogste cijfer</div>
                    <div className="yh-name">{year.best.title.name}</div>
                    <StatusBadge status={null} score={year.best.score} />
                  </div>
                </div>
              )}
              {year.topGenre && (
                <div className="year-chips">
                  <span className="chip">🏷️ Meest gekeken genre: <b>{year.topGenre}</b></span>
                </div>
              )}
              {year.clash && (
                <IconRow
                  ico="⚔️"
                  line={<>Grootste meningsverschil: <TLink title={year.clash.title} onNavigate={onNavigate} /></>}
                  sub={<>Jij gaf een {year.clash.mine}, {year.clash.friend.name} een {year.clash.theirs}</>}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* ---- De Bank vergelijkt: sociale inzichten uit de gedeelde cijfers ---- */}
      {hasCompare && (
        <>
          <h2 className="dash-h2"><span className="h2-ico">🛋️</span>De Bank vergelijkt</h2>

          {jury.length >= 2 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">🧑‍⚖️ De jury</div>
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
              <div className="card-title">⚔️ Verdeeld & eensgezind</div>
              <div className="year-rows">
                {division.divided && (
                  <IconRow
                    ico="🔥"
                    line={<>Meest verdeeld: <TLink title={division.divided.title} onNavigate={onNavigate} /></>}
                    sub={<>{nick(division.divided.low.user)} gaf een {division.divided.low.score}, {nick(division.divided.high.user)} een {division.divided.high.score}</>}
                  />
                )}
                {division.agreed && (
                  <IconRow
                    ico="🤝"
                    line={<>Meest eensgezind: <TLink title={division.agreed.title} onNavigate={onNavigate} /></>}
                    sub={<>Alle {division.agreed.count} cijfers hooguit {division.agreed.spread === 0 ? 'nul' : division.agreed.spread.toFixed(1).replace('.', ',')} punt uit elkaar</>}
                  />
                )}
              </div>
            </div>
          )}

          {(outliers.guilty || outliers.panned || blindSpot) && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">🙈 Jouw smaak vs de groep</div>
              <div className="year-rows">
                {outliers.guilty && (
                  <IconRow
                    ico="💖"
                    line={<>Jouw guilty pleasure: <TLink title={outliers.guilty.title} onNavigate={onNavigate} /></>}
                    sub={<>Jij gaf een {outliers.guilty.mine}, de rest gemiddeld {outliers.guilty.others.toFixed(1).replace('.', ',')}</>}
                  />
                )}
                {outliers.panned && (
                  <IconRow
                    ico="🥶"
                    line={<>Alleen jij vond dit niks: <TLink title={outliers.panned.title} onNavigate={onNavigate} /></>}
                    sub={<>Jij een {outliers.panned.mine}, de rest {outliers.panned.others.toFixed(1).replace('.', ',')}</>}
                  />
                )}
                {blindSpot && (
                  <IconRow
                    ico="🕳️"
                    line={<>Blinde vlek: <b>{blindSpot.genre}</b></>}
                    sub={<>Je vrienden keken al {blindSpot.count} series in dit genre, jij nog geen één</>}
                  />
                )}
              </div>
            </div>
          )}

          {finishers.length >= 2 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">🏁 Afmakers</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Hoeveel van de begonnen series kijkt iedereen ook echt af?
              </div>
              {finishers.map((f) => (
                <div className="finisher-row" key={f.profile.id}>
                  <Avatar profile={f.profile} size="sm" />
                  <span className="fin-name">{nick(f.profile)}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${f.pct}%`, background: f.pct >= 70 ? 'var(--good)' : f.pct >= 40 ? 'var(--warn)' : '#b47b7b' }} />
                  </div>
                  <span className="fin-val">
                    <b>{f.pct}%</b>
                    <span className="val-sub">{f.finished}/{f.finished + f.dropped}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- Groepsstatistieken ---- */}
      {hasGroupData && (groupTitleStats.length > 0 || groupGenreCounts.length > 0 || mostRecommended.length > 0) && (
        <>
          <h2 className="dash-h2"><span className="h2-ico">🌍</span>In de groep</h2>

          {groupTitleStats.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Populairste series</div>
              <div className="poster-strip">
                {groupTitleStats.map(({ title, listCount, avg }) => (
                  <button key={title.tmdb_id} className="pstrip-item" onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}>
                    <div className="pstrip-poster">
                      <Thumb title={title} w={76} h={114} />
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
                <BarRow key={g.genre} label={g.genre} value={g.count} max={maxGroupGenre} val={<b>{g.count}×</b>} color="var(--warn)" onClick={() => onNavigate({ status: 'all', genre: g.genre })} />
              ))}
            </div>
          )}

          {groupServiceCounts.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Populaire diensten</div>
              {groupServiceCounts.map((s) => (
                <BarRow key={s.service} label={s.service} value={s.count} max={maxGroupService} val={<b>{s.count}×</b>} color="var(--accent-2)" onClick={() => onNavigate({ status: 'all', service: s.service })} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
