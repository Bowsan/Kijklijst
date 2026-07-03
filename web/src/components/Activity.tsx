import type { Snapshot, Comment } from '../lib/types';
import { profileById, titleById, commentsOnMyList } from '../lib/compute';
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

interface Props {
  snap: Snapshot;
  userId: string;
  onOpenTitle: (titleId: number) => void;
}

// Twee bronnen samenvoegen in één tijdlijn: de activiteitenlog + berichten van
// anderen bij series die op jouw lijst staan.
type FeedItem =
  | { kind: 'activity'; id: string; created_at: number; a: Snapshot['activity'][number] }
  | { kind: 'comment'; id: string; created_at: number; c: Comment };

export default function ActivityFeed({ snap, userId, onOpenTitle }: Props) {
  const messages = commentsOnMyList(snap, userId);

  const items: FeedItem[] = [
    ...snap.activity.map((a) => ({ kind: 'activity' as const, id: a.id, created_at: a.created_at, a })),
    ...messages.map((c) => ({ kind: 'comment' as const, id: `c-${c.id}`, created_at: c.created_at, c })),
  ]
    .sort((x, y) => y.created_at - x.created_at)
    .slice(0, 40);

  if (items.length === 0) {
    return <p className="muted center" style={{ padding: 20 }}>Nog geen activiteit. Voeg een serie toe om te beginnen.</p>;
  }

  return (
    <div>
      {items.map((item) => {
        // Bericht van een vriend bij een serie op jouw lijst — valt extra op en is klikbaar.
        if (item.kind === 'comment') {
          const c = item.c;
          const who = profileById(snap, c.user_id);
          const title = titleById(snap, c.title_id);
          return (
            <button
              type="button"
              className="activity-item message"
              key={item.id}
              onClick={() => onOpenTitle(c.title_id)}
            >
              <Avatar profile={who} id={c.user_id} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="activity-text">
                  💬 Bericht van <b>{who?.name || 'Iemand'}</b> bij <b>{title?.name || 'een serie'}</b>
                </div>
                <div className="activity-time">{timeAgo(c.created_at)}</div>
              </div>
            </button>
          );
        }

        const a = item.a;
        const who = profileById(snap, a.user_id);
        const title = a.title_id ? titleById(snap, a.title_id) : undefined;

        // Systeem-melding: nieuw seizoen (geen gebruiker, eigen opmaak).
        if (a.type === 'new_season') {
          return (
            <div className="activity-item" key={item.id}>
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
          <div className="activity-item" key={item.id}>
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
