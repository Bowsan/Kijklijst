import type { Snapshot } from '../lib/types';
import { posterUrl, STATUS_LABELS } from '../lib/types';
import {
  profileById, favoriteTitles, listedTitles, totalWatchHours, ratedCount, serviceStats,
  isFollowing, myRating,
} from '../lib/compute';
import { followUser, unfollowUser } from '../lib/api';
import Sheet from './Sheet';
import Avatar from './Avatar';
import ServiceLogo from './ServiceLogo';

interface Props {
  snap: Snapshot;
  /** Het profiel dat wordt bekeken. */
  profileId: string;
  /** De ingelogde gebruiker. */
  userId: string;
  onClose: () => void;
  onChange: () => void;
  onAdd: (tmdbId: number) => void;
  /** Ga naar een specifieke serie in de lijst. */
  onOpenTitle: (tmdbId: number) => void;
  /** Toon de hele lijst "als" deze vriend, gesorteerd op diens cijfer. */
  onViewList: (profileId: string) => void;
  toast: (m: string) => void;
}

export default function ProfileView({ snap, profileId, userId, onClose, onChange, onAdd, onOpenTitle, onViewList, toast }: Props) {
  const profile = profileById(snap, profileId);
  const isMe = profileId === userId;
  const following = isFollowing(snap, userId, profileId);
  const favorites = favoriteTitles(snap, profileId, 5);
  const fullList = listedTitles(snap, profileId);

  // Series waar jij én deze vriend allebei een cijfer voor gaven, met het grootste verschil.
  const biggestDiffs = isMe
    ? []
    : fullList
        .map(({ title, rating }) => {
          const mineScore = myRating(snap, title.tmdb_id, userId)?.score;
          if (rating.score == null || mineScore == null) return null;
          return { title, theirScore: rating.score, myScore: mineScore, diff: Math.abs(rating.score - mineScore) };
        })
        .filter((x): x is { title: typeof fullList[number]['title']; theirScore: number; myScore: number; diff: number } => x != null && x.diff > 0)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 5);
  const hours = Math.round(totalWatchHours(snap, profileId));
  const rated = ratedCount(snap, profileId);
  const services = serviceStats(snap, profileId).slice(0, 3);

  const toggleFollow = async () => {
    try {
      if (following) { await unfollowUser(profileId); toast('Ontvolgd'); }
      else { await followUser(profileId); toast('Je volgt nu ' + (profile?.name || 'deze vriend')); }
      onChange();
    } catch (e: any) {
      toast(e.message || 'Mislukt');
    }
  };

  return (
    <Sheet title={profile?.name || 'Profiel'} onClose={onClose}>
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        <Avatar profile={profile} id={profileId} size="lg" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 18 }}>{profile?.name || 'Onbekend'}</div>
          <div className="muted" style={{ fontSize: 13 }}>{rated} beoordeeld · {hours} kijkuren</div>
        </div>
        {!isMe && (
          <button className={following ? 'btn ghost' : 'btn primary'} onClick={toggleFollow}>
            {following ? 'Ontvolgen' : '+ Volgen'}
          </button>
        )}
      </div>

      {services.length > 0 && (
        <div className="genres" style={{ marginTop: 12 }}>
          {services.map((s) => (
            <span className="chip" key={s.service}>
              <ServiceLogo snap={snap} name={s.service} size={13} />{s.service} · {s.count}×
            </span>
          ))}
        </div>
      )}

      {!isMe && fullList.length > 0 && (
        <button className="btn full" style={{ marginTop: 14 }} onClick={() => onViewList(profileId)}>
          📋 Bekijk lijst als {profile?.name?.split(' ')[0] || 'deze vriend'}
        </button>
      )}

      <h3 style={{ marginTop: 18 }}>Favoriete series</h3>
      {favorites.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>Nog geen beoordeelde series.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {favorites.map(({ title, score }) => {
            const haveIt = !!myRating(snap, title.tmdb_id, userId);
            return (
              <div key={title.tmdb_id} className="pv-row" onClick={() => onOpenTitle(title.tmdb_id)}>
                {title.poster_path
                  ? <img src={posterUrl(title.poster_path, 'small')} alt="" style={{ width: 44, height: 66, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 66, borderRadius: 4, background: 'var(--surface-2)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{title.name}</div>
                  <div className="title-sub">{title.year || '—'}</div>
                </div>
                <span className="badge-score sel" style={{ flexShrink: 0 }}>{score}</span>
                {!isMe && !haveIt && (
                  <button className="btn ghost" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); onAdd(title.tmdb_id); }} title="Aan mijn lijst toevoegen">+</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {biggestDiffs.length > 0 && (
        <>
          <h3 style={{ marginTop: 18 }}>Grootste verschil met jou</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {biggestDiffs.map(({ title, theirScore, myScore, diff }) => (
              <div key={title.tmdb_id} className="pv-row" onClick={() => onOpenTitle(title.tmdb_id)}>
                {title.poster_path
                  ? <img src={posterUrl(title.poster_path, 'small')} alt="" style={{ width: 44, height: 66, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 66, borderRadius: 4, background: 'var(--surface-2)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{title.name}</div>
                  <div className="title-sub">
                    Jij {myScore} · {profile?.name?.split(' ')[0] || 'vriend'} {theirScore}
                  </div>
                </div>
                <span className="chip" style={{ flexShrink: 0, fontWeight: 700 }} title="Verschil in cijfer">Δ {diff}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {fullList.length > 0 && (
        <>
          <h3 style={{ marginTop: 18 }}>Hele kijklijst ({fullList.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fullList.map(({ title, rating }) => {
              const haveIt = !!myRating(snap, title.tmdb_id, userId);
              return (
                <div key={title.tmdb_id} className="pv-row" onClick={() => onOpenTitle(title.tmdb_id)}>
                  {title.poster_path
                    ? <img src={posterUrl(title.poster_path, 'small')} alt="" style={{ width: 44, height: 66, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 44, height: 66, borderRadius: 4, background: 'var(--surface-2)', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{title.name}</div>
                    <div className="title-sub">
                      {title.year || '—'}
                      {title.providers[0] && <> · <ServiceLogo snap={snap} name={title.providers[0]} size={13} />{title.providers[0]}</>}
                    </div>
                  </div>
                  {rating.score != null
                    ? <span className="badge-score sel" style={{ flexShrink: 0 }}>{rating.score}</span>
                    : rating.status
                      ? <span className="chip" style={{ flexShrink: 0, fontSize: 12 }}>{STATUS_LABELS[rating.status]}</span>
                      : null}
                  {!isMe && !haveIt && (
                    <button className="btn ghost" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); onAdd(title.tmdb_id); }} title="Aan mijn lijst toevoegen">+</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}
