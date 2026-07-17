import { useMemo } from 'react';
import type { Snapshot, Message, Profile } from '../lib/types';
import { followingProfiles, profileById } from '../lib/compute';
import { timeAgo } from '../lib/format';
import Avatar from './Avatar';

interface Props {
  snap: Snapshot;
  userId: string;
  messages: Message[];
  /** Open het 1-op-1 gesprek met een vriend. */
  onOpenChat: (id: string) => void;
}

interface Convo {
  other: string;
  profile: Profile | undefined;
  last: Message | null;
  unread: number;
}

/** Overzicht van gesprekken: elk gevolgd contact als rij, nieuwste bovenaan. */
export default function Messages({ snap, userId, messages, onOpenChat }: Props) {
  const convos = useMemo(() => {
    const byUser = new Map<string, Convo>();
    // Begin met alle gevolgde vrienden, zodat je ook een nieuw gesprek kunt starten.
    for (const p of followingProfiles(snap, userId)) {
      byUser.set(p.id, { other: p.id, profile: p, last: null, unread: 0 });
    }
    for (const m of messages) {
      const other = m.from_user === userId ? m.to_user : m.from_user;
      const e = byUser.get(other) ?? { other, profile: profileById(snap, other), last: null, unread: 0 };
      if (!e.last || m.created_at > e.last.created_at) e.last = m;
      if (m.to_user === userId && m.read_at == null) e.unread++;
      byUser.set(other, e);
    }
    return [...byUser.values()]
      .filter((c) => c.profile) // onbekende/verwijderde accounts overslaan
      .sort((a, b) => {
        // Ongelezen eerst, dan op tijd van het laatste bericht, dan op naam.
        if ((b.unread > 0 ? 1 : 0) !== (a.unread > 0 ? 1 : 0)) return (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0);
        const at = a.last?.created_at ?? 0;
        const bt = b.last?.created_at ?? 0;
        if (bt !== at) return bt - at;
        return (a.profile!.name || '').localeCompare(b.profile!.name || '');
      });
  }, [snap, userId, messages]);

  if (convos.length === 0) {
    return (
      <div className="empty">
        <div className="big">💬</div>
        <p>Nog geen gesprekken.</p>
        <p className="muted">Volg vrienden en stuur ze een berichtje vanaf hun profiel.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {convos.map((c) => {
        const mine = c.last?.from_user === userId;
        const preview = c.last ? `${mine ? 'Jij: ' : ''}${c.last.text}` : 'Nog geen bericht — zeg eens hoi 👋';
        return (
          <button key={c.other} className="convo-row" onClick={() => onOpenChat(c.other)}>
            <Avatar profile={c.profile} id={c.other} size="sm" />
            <div className="convo-body">
              <div className="convo-top">
                <span className={`convo-name${c.unread > 0 ? ' unread' : ''}`}>{c.profile!.name}</span>
                {c.last && <span className="convo-time">{timeAgo(c.last.created_at)}</span>}
              </div>
              <div className={`convo-preview${c.unread > 0 ? ' unread' : ''}`}>{preview}</div>
            </div>
            {c.unread > 0 && <span className="notif-dot convo-dot" aria-label={`${c.unread} ongelezen`} />}
          </button>
        );
      })}
    </div>
  );
}
