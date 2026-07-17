import { useEffect, useRef, useState } from 'react';
import type { Snapshot, Message } from '../lib/types';
import { sendMessage, markMessagesRead } from '../lib/api';
import { profileById } from '../lib/compute';
import { fmtDateTime } from '../lib/format';
import Sheet from './Sheet';
import Avatar from './Avatar';

interface Props {
  snap: Snapshot;
  userId: string;
  /** De vriend met wie je chat. */
  withId: string;
  /** Alle berichten van de ingelogde gebruiker (beide richtingen). */
  messages: Message[];
  /** Berichten opnieuw ophalen (na verzenden / gelezen-markeren). */
  onRefresh: () => void;
  onClose: () => void;
  toast: (m: string) => void;
}

/** 1-op-1 gesprek met een vriend: bubbels + invoerveld. */
export default function ChatSheet({ snap, userId, withId, messages, onRefresh, onClose, toast }: Props) {
  const friend = profileById(snap, withId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const thread = messages
    .filter((m) => (m.from_user === userId && m.to_user === withId) || (m.from_user === withId && m.to_user === userId))
    .sort((a, b) => a.created_at - b.created_at);

  // Binnenkomende berichten als gelezen markeren zodra het gesprek open is.
  const unreadFromFriend = thread.some((m) => m.from_user === withId && m.read_at == null);
  useEffect(() => {
    if (!unreadFromFriend) return;
    markMessagesRead(withId).then(onRefresh).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withId, unreadFromFriend]);

  // Naar het laatste bericht scrollen bij openen en bij nieuwe berichten.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.length]);

  const send = async () => {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await sendMessage(withId, clean);
      setText('');
      onRefresh();
    } catch (e: any) {
      toast(e.message || 'Versturen mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={`💬 ${friend?.name || 'Gesprek'}`} onClose={onClose}>
      <div className="chat-thread">
        {thread.length === 0 && (
          <p className="muted center" style={{ fontSize: 13, padding: '24px 0' }}>
            Nog geen berichten — zeg eens hoi 👋
          </p>
        )}
        {thread.map((m) => {
          const mine = m.from_user === userId;
          return (
            <div key={m.id} className={`chat-row ${mine ? 'mine' : ''}`}>
              {!mine && <Avatar profile={friend} id={withId} size="xs" />}
              <div className={`chat-bubble ${mine ? 'mine' : ''}`}>
                <div className="chat-text">{m.text}</div>
                <div className="chat-time">{fmtDateTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <input
          value={text}
          placeholder={`Bericht aan ${friend?.name?.split(' ')[0] || 'je vriend'}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={send}>Stuur</button>
      </div>
    </Sheet>
  );
}
