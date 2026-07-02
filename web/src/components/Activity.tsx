import type { Snapshot } from '../lib/types';
import { profileById, titleById } from '../lib/compute';
import Avatar from './Avatar';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'net';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} u`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

export default function ActivityFeed({ snap }: { snap: Snapshot }) {
  if (!snap.activity.length) {
    return <p className="muted center" style={{ padding: 20 }}>Nog geen activiteit. Voeg een serie toe om te beginnen.</p>;
  }

  return (
    <div>
      {snap.activity.slice(0, 30).map((a) => {
        const who = profileById(snap, a.user_id);
        const title = a.title_id ? titleById(snap, a.title_id) : undefined;

        // Systeem-melding: nieuw seizoen (geen gebruiker, eigen opmaak).
        if (a.type === 'new_season') {
          return (
            <div className="activity-item" key={a.id}>
              <div className="act-emoji">🎉</div>
              <div style={{ flex: 1 }}>
                <div className="activity-text"><b>{title?.name || 'Een serie'}</b> heeft een nieuw seizoen (seizoen {String(a.meta.to)})</div>
                <div className="activity-time">{timeAgo(a.created_at)}</div>
              </div>
            </div>
          );
        }

        let text: React.ReactNode = null;

        if (a.type === 'rating') {
          text = <><b>{who?.name || 'Iemand'}</b> gaf <b>{title?.name}</b> een {String(a.meta.score)}</>;
        } else if (a.type === 'added') {
          text = <><b>{who?.name || 'Iemand'}</b> voegde <b>{title?.name}</b> toe</>;
        } else if (a.type === 'recommend') {
          const to = profileById(snap, String(a.meta.to_user));
          text = <><b>{who?.name || 'Iemand'}</b> raadt <b>{title?.name}</b> aan{to ? <> aan {to.name}</> : null}</>;
        } else {
          text = <><b>{who?.name || 'Iemand'}</b> deed iets</>;
        }

        return (
          <div className="activity-item" key={a.id}>
            <Avatar profile={who} id={a.user_id} size="sm" />
            <div style={{ flex: 1 }}>
              <div className="activity-text">{text}</div>
              <div className="activity-time">{timeAgo(a.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
