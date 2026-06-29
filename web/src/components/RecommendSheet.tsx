import { useState } from 'react';
import type { Snapshot, Title } from '../lib/types';
import { sendRecommendation } from '../lib/api';
import { followingProfiles } from '../lib/compute';
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
  const friends = followingProfiles(snap, userId);

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
        <p className="muted">Je volgt nog geen vrienden. Voeg vrienden toe via de Vrienden-pagina om ze aan te raden.</p>
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
          <label className="muted" style={{ fontSize: 13, display: 'block', margin: '4px 0 4px' }}>Berichtje toevoegen (optioneel)</label>
          <textarea
            placeholder="Bijv. Deze vind je vast leuk, is met die gave acteur!"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ resize: 'none' }}
          />
          <button className="btn primary full" style={{ marginTop: 12 }} disabled={!to} onClick={send}>
            Stuur aanrader
          </button>
        </>
      )}
    </Sheet>
  );
}
