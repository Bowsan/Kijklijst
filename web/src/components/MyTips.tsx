import { useState } from 'react';
import type { Snapshot } from '../lib/types';
import { sentRecommendations, type TipStatus } from '../lib/compute';
import { withdrawRecommendation, setRecommendationNote } from '../lib/api';
import Avatar from './Avatar';
import Thumb from './Thumb';

interface Props {
  snap: Snapshot;
  userId: string;
  onOpenTitle: (tmdbId: number) => void;
  /** Open het profiel van een vriend. */
  onOpenProfile: (id: string) => void;
  /** Open het profiel van een vriend meteen in "Raad iets aan"-modus. */
  onRecommendTo: (id: string) => void;
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

// Reactietekst van de ontvanger bij een tip.
const RESPONSE_TEXT: Record<string, string> = {
  thanks: '“Thanks, ziet er leuk uit!”',
  meh: '“Mwah, niet echt iets voor mij.”',
};

export default function MyTips({ snap, userId, onOpenTitle, onOpenProfile, onRecommendTo, onChange, toast }: Props) {
  const tips = sentRecommendations(snap, userId);
  // Per vriend groeperen: kopje met naam, daaronder de tips aan die vriend.
  const byFriend: { to: NonNullable<(typeof tips)[number]['to']>; items: typeof tips }[] = [];
  for (const t of tips) {
    const group = byFriend.find((g) => g.to.id === t.to!.id);
    if (group) group.items.push(t);
    else byFriend.push({ to: t.to!, items: [t] });
  }
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
      {byFriend.map(({ to, items }) => (
      <div key={to.id} style={{ marginBottom: 14 }}>
        <div className="row spread" style={{ margin: '0 4px 8px' }}>
          <span className="row" style={{ gap: 8, cursor: 'pointer', minWidth: 0 }} onClick={() => onOpenProfile(to.id)}>
            <Avatar profile={to} id={to.id} size="sm" />
            <span className="link-name" style={{ fontWeight: 600 }}>{to.name}</span>
            <span className="muted" style={{ fontSize: 12 }}>· {items.length} tip{items.length === 1 ? '' : 's'}</span>
          </span>
          <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 13, flexShrink: 0 }} onClick={() => onRecommendTo(to.id)}>
            💌 Raad iets aan
          </button>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(({ rec, title, status }) => {
          const meta = STATUS_META[status];
          return (
            <div key={rec.id} className="tip-row">
              {/* Klik op poster of titel → naar de serie (bv. om opnieuw aan te raden). */}
              <div className="tip-open" onClick={() => onOpenTitle(title!.tmdb_id)} title={`Open ${title!.name}`}>
                <Thumb path={title!.poster_path} name={title!.name} w={48} h={72} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tip-title tip-open" onClick={() => onOpenTitle(title!.tmdb_id)}>{title!.name}</div>
                <span className="tip-status" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
                {rec.response && RESPONSE_TEXT[rec.response] && (
                  <div className="tip-note">💬 {RESPONSE_TEXT[rec.response]}</div>
                )}

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
      </div>
      ))}
    </>
  );
}
