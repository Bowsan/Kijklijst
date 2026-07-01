import { useState } from 'react';
import type { Snapshot, Title, Status } from '../lib/types';
import { sendRecommendation } from '../lib/api';
import { followingProfiles, myRating } from '../lib/compute';
import Sheet from './Sheet';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';

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

  // De diensten waarop de serie te zien is (of anders de dienst waarop jij hem keek).
  const myService = myRating(snap, title.tmdb_id, userId)?.service;
  const neededServices = title.providers.length ? title.providers : (myService ? [myService] : []);

  // Status + dienst-beschikbaarheid per vriend, zodat je gericht kunt aanraden.
  const friendInfo = (id: string) => {
    const r = snap.ratings.find((x) => x.title_id === title.tmdb_id && x.user_id === id);
    const status: Status | null = r?.status ?? (r?.score != null ? 'finished' : null);
    const profile = friends.find((f) => f.id === id);
    const has = neededServices.filter((s) => (profile?.services || []).includes(s));
    return { status, score: r?.score ?? null, has };
  };

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
          <div className="rec-friends">
            {friends.map((f) => {
              const info = friendInfo(f.id);
              return (
                <button key={f.id} className={`rec-friend ${to === f.id ? 'sel' : ''}`} onClick={() => setTo(f.id)}>
                  <Avatar profile={f} size="sm" />
                  <span className="rf-name">{f.name}</span>
                  <span className="rf-info">
                    {info.status && <StatusBadge status={info.status} score={info.score} />}
                    {neededServices.length > 0 && (
                      info.has.length
                        ? <span className="rf-svc ok">✓ {info.has.join(', ')}</span>
                        : <span className="rf-svc no">✗ {neededServices.slice(0, 2).join(', ')}</span>
                    )}
                  </span>
                </button>
              );
            })}
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
