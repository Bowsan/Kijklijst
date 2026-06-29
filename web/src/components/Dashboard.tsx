import type { ReactNode } from 'react';
import type { Snapshot, Title } from '../lib/types';
import { POSTER_SMALL } from '../lib/types';
import { followingProfiles, watchingTitles, myRating } from '../lib/compute';
import Avatar from './Avatar';

interface Props {
  snap: Snapshot;
  userId: string;
  onOpenProfile: (id: string) => void;
  onAdd: (tmdbId: number) => void;
  onGoFriends: () => void;
}

function TitleRow({ title, right }: { title: Title; right?: ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'center', padding: '4px 0' }}>
      {title.poster_path
        ? <img src={POSTER_SMALL + title.poster_path} alt="" style={{ width: 36, height: 54, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 36, height: 54, borderRadius: 4, background: 'var(--surface2)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{title.name}</div>
        <div className="title-sub">{title.year || '—'}</div>
      </div>
      {right}
    </div>
  );
}

export default function Dashboard({ snap, userId, onOpenProfile, onAdd, onGoFriends }: Props) {
  const myWatching = watchingTitles(snap, userId);
  const friends = followingProfiles(snap, userId);
  const friendsWatching = friends
    .map((p) => ({ profile: p, titles: watchingTitles(snap, p.id) }))
    .filter((fw) => fw.titles.length > 0);

  return (
    <div className="page">
      <h2>Nu aan het kijken</h2>
      {myWatching.length === 0 ? (
        <p className="muted" style={{ margin: '0 4px 8px' }}>Je hebt nog niets als "Mee bezig" gemarkeerd.</p>
      ) : (
        <div className="card">
          {myWatching.map((t) => <TitleRow key={t.tmdb_id} title={t} />)}
        </div>
      )}

      <h2 style={{ marginTop: 18 }}>Mijn vrienden kijken</h2>
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
                  right={haveIt
                    ? <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>op je lijst</span>
                    : <button className="btn ghost" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => onAdd(t.tmdb_id)} title="Aan mijn lijst toevoegen">+</button>}
                />
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
