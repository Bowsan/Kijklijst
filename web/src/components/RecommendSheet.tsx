import { useState } from 'react';
import type { Snapshot, Title } from '../lib/types';
import { sendRecommendation } from '../lib/api';
import Sheet from './Sheet';
import Avatar from './Avatar';

interface Props {
  snap: Snapshot;
  title: Title;
  userId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export default function RecommendSheet({ snap, title, userId, onClose, onDone }: Props) {
  const [to, setTo] = useState<string>('');
  const [note, setNote] = useState('');
  const friends = snap.profiles.filter((p) => p.id !== userId);

  const send = async () => {
    if (!to) return;
    try {
      await sendRecommendation({ to_user: to, tmdb_id: title.tmdb_id, note: note || undefined });
      const name = friends.find((f) => f.id === to)?.name || 'je vriend';
      onDone(`Aangeraden aan ${name} 💌`);
      onClose();
    } catch (e: any) {
      onDone(e.message || 'Versturen mislukt');
    }
  };

  return (
    <Sheet title={`"${title.name}" aanraden`} onClose={onClose}>
      {friends.length === 0 ? (
        <p className="muted">Er zijn nog geen vrienden om aan aan te raden. Deel de link en haal er iemand bij.</p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13 }}>Aan wie raad je dit persoonlijk aan?</p>
          <div className="service-grid" style={{ marginBottom: 12 }}>
            {friends.map((f) => (
              <button key={f.id} className={to === f.id ? 'sel' : ''} onClick={() => setTo(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
                <Avatar profile={f} size="sm" />
                {f.name}
              </button>
            ))}
          </div>
          <input placeholder="Waarom past dit bij hem/haar? (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary full" style={{ marginTop: 12 }} disabled={!to} onClick={send}>
            Stuur aanrader
          </button>
        </>
      )}
    </Sheet>
  );
}
