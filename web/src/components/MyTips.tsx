import { useState } from 'react';
import type { Snapshot } from '../lib/types';
import { posterUrl } from '../lib/types';
import { sentRecommendations, type TipStatus } from '../lib/compute';
import { withdrawRecommendation, setRecommendationNote } from '../lib/api';
import Avatar from './Avatar';

interface Props {
  snap: Snapshot;
  userId: string;
  onChange: () => void;
  toast: (m: string) => void;
}

// Leesbare status + kleur van wat de vriend met jouw tip deed.
const STATUS_META: Record<TipStatus, { label: string; color: string }> = {
  wishlist: { label: 'Op wishlist gezet', color: 'var(--good)' },
  watching: { label: 'Kijkt het nu', color: 'var(--info)' },
  finished: { label: 'Heeft het gezien', color: 'var(--good)' },
  dropped: { label: 'Afgehaakt', color: '#b47b7b' },
  dismissed: { label: 'Weggeklikt', color: 'var(--muted)' },
  pending: { label: 'Nog niks mee gedaan', color: 'var(--warn)' },
};

export default function MyTips({ snap, userId, onChange, toast }: Props) {
  const tips = sentRecommendations(snap, userId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (tips.length === 0) return null;

  const saveNote = async (id: string) => {
    try {
      await setRecommendationNote(id, noteText.trim());
      setEditingId(null);
      onChange();
      toast('Opmerking opgeslagen');
    } catch (e: any) { toast(e.message || 'Mislukt'); }
  };

  const withdraw = async (id: string) => {
    try {
      await withdrawRecommendation(id);
      setConfirmId(null);
      onChange();
      toast('Tip teruggetrokken');
    } catch (e: any) { toast(e.message || 'Mislukt'); }
  };

  return (
    <>
      <h2>Jouw tips</h2>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 8px' }}>
        Series die je aan vrienden aanraadde — met wat zij ermee deden.
      </p>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tips.map(({ rec, to, title, status }) => {
          const meta = STATUS_META[status];
          return (
            <div key={rec.id} className="tip-row">
              {title!.poster_path
                ? <img className="tip-poster" src={posterUrl(title!.poster_path, 'small')} alt="" />
                : <div className="tip-poster empty" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tip-title">{title!.name}</div>
                <div className="row" style={{ gap: 6, margin: '3px 0' }}>
                  <Avatar profile={to} id={rec.to_user} size="sm" />
                  <span className="muted" style={{ fontSize: 13 }}>aan {to!.name}</span>
                </div>
                <span className="tip-status" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>

                {editingId === rec.id ? (
                  <div style={{ marginTop: 8 }}>
                    <input
                      autoFocus
                      placeholder="Opmerking voor je vriend…"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveNote(rec.id)}
                    />
                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                      <button className="btn primary" style={{ padding: '4px 12px' }} onClick={() => saveNote(rec.id)}>Opslaan</button>
                      <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setEditingId(null)}>Annuleer</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {rec.note && <div className="tip-note">“{rec.note}”</div>}
                    <div className="row" style={{ gap: 10, marginTop: 6 }}>
                      <button
                        className="btn ghost" style={{ padding: '2px 4px', fontSize: 12 }}
                        onClick={() => { setEditingId(rec.id); setNoteText(rec.note || ''); }}
                      >
                        {rec.note ? '✏️ Opmerking bewerken' : '✏️ Opmerking toevoegen'}
                      </button>
                      {confirmId === rec.id ? (
                        <span className="row" style={{ gap: 6 }}>
                          <button className="btn ghost" style={{ padding: '2px 4px', fontSize: 12, color: '#e55' }} onClick={() => withdraw(rec.id)}>Terugtrekken?</button>
                          <button className="btn ghost" style={{ padding: '2px 4px', fontSize: 12 }} onClick={() => setConfirmId(null)}>Nee</button>
                        </span>
                      ) : (
                        <button className="btn ghost" style={{ padding: '2px 4px', fontSize: 12, color: 'var(--muted)' }} onClick={() => setConfirmId(rec.id)}>Terugtrekken</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
