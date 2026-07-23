import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Snapshot, Title, Status } from '../../lib/types';
import { serviceLogoUrl } from '../../lib/types';
import { genreEmoji } from '../../lib/genres';
import { scoreColor } from '../../lib/score';
import { fmt1 } from '../../lib/format';
import Thumb from '../Thumb';

/** Navigatie-opties vanaf het dashboard naar de lijst. */
export interface NavOpts {
  status?: Status | 'all' | 'mine';
  genre?: string;
  service?: string;
  actor?: string;
  creator?: string;
  titleId?: number;
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Onthul kaarten pas (met stagger) zodra ze in beeld scrollen. */
export function useReveal(ref: React.RefObject<HTMLDivElement | null>, dep?: unknown) {
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
    // Vangnet: vuurt de observer niet (zuinige stand, verborgen tab), dan
    // worden de kaarten na 1,5s alsnog gewoon getoond.
    const failsafe = setTimeout(() => targets.forEach((el) => el.classList.add('in')), 1500);
    return () => { clearTimeout(failsafe); io.disconnect(); };
    // dep: bij het wisselen van dashboard-tab opnieuw de nieuwe kaarten onthullen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, dep]);
}

/** Teller die soepel naar zijn eindwaarde loopt (ease-out). De eindwaarde is
    gegarandeerd: vuurt requestAnimationFrame niet of te traag (iOS in
    spaarstand, tab op de achtergrond), dan zet een timer 'm alsnog neer —
    anders bleef de teller op 0 hangen. */
export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
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
    const settle = setTimeout(() => setN(value), dur + 300);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [value]);
  return <>{n.toFixed(decimals)}{suffix}</>;
}

export function TitleRow({ title, right, onClick }: { title: Title; right?: ReactNode; onClick?: () => void }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'center', padding: '4px 0' }}>
      <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', flexShrink: 0 }}><Thumb path={title.poster_path} name={title.name} /></div>
      <div style={{ flex: 1, minWidth: 0, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{title.name}</div>
        <div className="title-sub">{title.year || '—'}</div>
      </div>
      {right}
    </div>
  );
}

export function BarRow({ label, value, max, val, color, onClick }: { label: ReactNode; value: number; max: number; val: ReactNode; color?: string; onClick?: () => void }) {
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

// Drie willekeurige series uit de (al op rating gesorteerde) top van een genre.
function pickThree(pool: Title[]): Title[] {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 3);
}

/** Genre-kaart: icoon links (over de hele kaart), en rechts drie regels —
 *  naam + gemiddelde, drie klikbare voorbeeldseries, en de balk met N×.
 *  Tik op de kaart filtert op het genre; tik op een titel opent die serie. */
export function GenreStat({ genre, count, avg, max, pool, onGenre, onTitle }: {
  genre: string;
  count: number;
  avg: number | null;
  max: number;
  /** Kandidaten (top ~25 op rating) waaruit 3 voorbeelden worden gekozen. */
  pool: Title[];
  onGenre: () => void;
  onTitle: (tmdbId: number) => void;
}) {
  // Willekeurige keuze vasthouden zolang de kaart in beeld is (niet flikkeren
  // bij ongerelateerde re-renders); bij opnieuw openen van de statistieken
  // (nieuwe mount) wordt 'r opnieuw gekozen.
  const poolKey = pool.map((t) => t.tmdb_id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const examples = useMemo(() => pickThree(pool), [poolKey]);
  const fill = avg != null ? scoreColor(avg) : 'var(--accent)';
  return (
    <div
      className="genre-card"
      role="button"
      tabIndex={0}
      onClick={onGenre}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGenre(); } }}
    >
      <span className="genre-icon">{genreEmoji(genre)}</span>
      <div className="genre-main">
        <div className="genre-titlerow">
          <span className="genre-name">{genre}</span>
          {avg != null && <span className="genre-avg" style={{ color: scoreColor(avg) }}>{fmt1(avg)}</span>}
        </div>
        {examples.length > 0 && (
          <div className="genre-examples">
            {examples.map((t, i) => (
              <span key={t.tmdb_id}>
                {i > 0 && <span className="genre-sep"> · </span>}
                <span
                  className="genre-serie"
                  role="link"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onTitle(t.tmdb_id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onTitle(t.tmdb_id); } }}
                >{t.name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="genre-barrow">
          <div className="bar-track"><div className="bar-fill" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%`, background: fill }} /></div>
          <span className="genre-count"><b>{count}×</b></span>
        </div>
      </div>
    </div>
  );
}

/** Klikbare serienaam in lopende tekst. */
export function TLink({ title, onNavigate }: { title: Title; onNavigate: (o: NavOpts) => void }) {
  return (
    <span className="tlink" role="link" onClick={() => onNavigate({ status: 'all', titleId: title.tmdb_id })}>
      {title.name}
    </span>
  );
}

/** Rij met het icoon in een eigen kolom: de titelregel kapt af met puntjes
    en de toelichting staat altijd op de regel eronder. */
export function IconRow({ ico, line, sub }: { ico: string; line: ReactNode; sub: ReactNode }) {
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

/** Dienstlogo + naam als label in een balkrij, met letter-fallback. */
export function SvcLabel({ name, svcLogos }: { name: string; svcLogos: Map<string, string> }) {
  const path = svcLogos.get(name);
  return (
    <span className="svc-cell">
      {path
        ? <img className="svc-logo" src={serviceLogoUrl(path)} alt="" decoding="async" />
        : <span className="svc-logo svc-fallback">{name.trim().charAt(0)}</span>}
      <span className="svc-name">{name}</span>
    </span>
  );
}

/** Dienstnaam → TMDb-logopad, zoals de server ze verzamelde. */
export function useSvcLogos(snap: Snapshot): Map<string, string> {
  return useMemo(
    () => new Map((snap.service_logos ?? []).map((l) => [l.name, l.logo_path])),
    [snap],
  );
}

export interface DonutPart { label: string; count: number; color: string; status: Status }

/** Donut voor de lijstverdeling: statuskleuren, kleine gaten, klikbare legenda. */
export function Donut({ parts, total, onPick }: { parts: DonutPart[]; total: number; onPick: (s: Status) => void }) {
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
        <text x="60" y="56" textAnchor="middle" dominantBaseline="central" className="donut-num"><CountUp value={total} /></text>
        <text x="60" y="74" textAnchor="middle" dominantBaseline="central" className="donut-lbl">series</text>
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
