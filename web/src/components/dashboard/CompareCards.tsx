import { useMemo } from 'react';
import type { Snapshot, Profile } from '../../lib/types';
import {
  followingProfiles, juryScores, groupDivision, tasteOutliers, blindSpotGenre,
  finisherStats, tasteMates,
} from '../../lib/compute';
import { fmt1 } from '../../lib/format';
import Avatar from '../Avatar';
import { IconRow, TLink, type NavOpts } from './widgets';

interface Props {
  snap: Snapshot;
  userId: string;
  onOpenProfile: (id: string) => void;
  onNavigate: (opts: NavOpts) => void;
}

/** "De Bank vergelijkt": sociale inzichten uit de gedeelde cijfers —
    smaakmatch, de jury, verdeeld/eensgezind, smaak vs de groep en afmakers. */
export default function CompareCards({ snap, userId, onOpenProfile, onNavigate }: Props) {
  const jury = useMemo(() => juryScores(snap, userId), [snap, userId]);
  const division = useMemo(() => groupDivision(snap, userId), [snap, userId]);
  const outliers = useMemo(() => tasteOutliers(snap, userId), [snap, userId]);
  const blindSpot = useMemo(() => blindSpotGenre(snap, userId), [snap, userId]);
  const finishers = useMemo(() => finisherStats(snap, userId), [snap, userId]);
  // Smaakmatch: gevolgde vrienden met minimaal 3 gedeelde beoordeelde series.
  const tasteRank = useMemo(() => {
    const followed = new Set(followingProfiles(snap, userId).map((p) => p.id));
    return tasteMates(snap, userId).filter((m) => followed.has(m.profile.id) && m.shared >= 3).slice(0, 5);
  }, [snap, userId]);

  const nick = (p: Profile) => (p.id === userId ? 'Jij' : p.name);
  const hasCompare =
    jury.length >= 2 || division.divided != null || division.agreed != null ||
    outliers.guilty != null || outliers.panned != null || blindSpot != null || finishers.length >= 2 ||
    tasteRank.length > 0;
  if (!hasCompare) return null;

  return (
    <>
      <h2 className="dash-h2"><span className="h2-ico">🛋️</span>De Bank vergelijkt</h2>

      {tasteRank.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">💘 Beste smaakmatch</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Hoe dichter jullie cijfers bij elkaar liggen op dezelfde series, hoe hoger de match.
          </div>
          {tasteRank.map((m, i) => (
            <button key={m.profile.id} className="match-row" onClick={() => onOpenProfile(m.profile.id)}>
              <span className="match-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
              <Avatar profile={m.profile} id={m.profile.id} size="sm" />
              <div className="match-body">
                <div className="match-name">{m.profile.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${m.match}%`, background: 'var(--accent)' }} /></div>
                <div className="match-sub">{m.shared} gedeelde series</div>
              </div>
              <b className="match-pct">{m.match}%</b>
            </button>
          ))}
        </div>
      )}

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
                {j.delta > 0 ? '+' : '−'}{fmt1(Math.abs(j.delta))}
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
                sub={<>Alle {division.agreed.count} cijfers hooguit {division.agreed.spread === 0 ? 'nul' : fmt1(division.agreed.spread)} punt uit elkaar</>}
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
                sub={<>Jij gaf een {outliers.guilty.mine}, de rest gemiddeld {fmt1(outliers.guilty.others)}</>}
              />
            )}
            {outliers.panned && (
              <IconRow
                ico="🥶"
                line={<>Alleen jij vond dit niks: <TLink title={outliers.panned.title} onNavigate={onNavigate} /></>}
                sub={<>Jij een {outliers.panned.mine}, de rest {fmt1(outliers.panned.others)}</>}
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
  );
}
