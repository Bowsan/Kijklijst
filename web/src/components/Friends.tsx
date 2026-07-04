import { useState } from 'react';
import type { Snapshot } from '../lib/types';
import { followingProfiles, suggestedProfiles, hiddenProfiles } from '../lib/compute';
import { followUser, unfollowUser, setProfileHidden } from '../lib/api';
import Avatar from './Avatar';
import MyTips from './MyTips';

interface Props {
  snap: Snapshot;
  userId: string;
  onOpenProfile: (id: string) => void;
  onChange: () => void;
  onShare: () => void;
  toast: (m: string) => void;
}

export default function Friends({ snap, userId, onOpenProfile, onChange, onShare, toast }: Props) {
  const friends = followingProfiles(snap, userId);
  const suggestions = suggestedProfiles(snap, userId);
  const hidden = hiddenProfiles(snap, userId);
  const [showHidden, setShowHidden] = useState(false);

  const follow = async (id: string, name: string) => {
    try { await followUser(id); toast('Je volgt nu ' + name); onChange(); }
    catch (e: any) { toast(e.message || 'Mislukt'); }
  };
  const unfollow = async (id: string) => {
    try { await unfollowUser(id); toast('Ontvolgd'); onChange(); }
    catch (e: any) { toast(e.message || 'Mislukt'); }
  };
  const setHidden = async (id: string, hide: boolean) => {
    try { await setProfileHidden(id, hide); toast(hide ? 'Account verborgen' : 'Account weer zichtbaar'); onChange(); }
    catch (e: any) { toast(e.message || 'Mislukt'); }
  };

  return (
    <div className="page">
      <h2>Vrienden</h2>
      <button className="btn full" onClick={onShare}>🔗 Vrienden uitnodigen</button>

      <h2 style={{ marginTop: 18 }}>Wie je volgt</h2>
      {friends.length === 0 ? (
        <div className="empty">
          <div className="big">👥</div>
          <p>Je volgt nog niemand.</p>
          <p className="muted">Volg vrienden om hun series in je "Alles"-lijst en op je dashboard te zien.</p>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {friends.map((p) => (
            <div className="row spread" key={p.id} style={{ padding: '6px 0' }}>
              <div className="row" style={{ gap: 10, cursor: 'pointer' }} onClick={() => onOpenProfile(p.id)}>
                <Avatar profile={p} size="sm" />
                <span>{p.name}</span>
              </div>
              <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => unfollow(p.id)}>Ontvolgen</button>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <h2 style={{ marginTop: 18 }}>Mensen om te volgen</h2>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {suggestions.map((p) => (
              <div className="row spread" key={p.id} style={{ padding: '6px 0' }}>
                <div className="row" style={{ gap: 10, cursor: 'pointer' }} onClick={() => onOpenProfile(p.id)}>
                  <Avatar profile={p} size="sm" />
                  <span>{p.name}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn ghost" style={{ padding: '4px 8px', color: 'var(--muted)' }} title="Verbergen uit deze lijst" onClick={() => setHidden(p.id, true)}>Verberg</button>
                  <button className="btn primary" style={{ padding: '4px 10px' }} onClick={() => follow(p.id, p.name)}>+ Volgen</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <MyTips snap={snap} userId={userId} onChange={onChange} toast={toast} />

      {hidden.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <button
            className="btn ghost"
            style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 2px' }}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? '▾' : '▸'} Verborgen accounts ({hidden.length})
          </button>
          {showHidden && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {hidden.map((p) => (
                <div className="row spread" key={p.id} style={{ padding: '6px 0' }}>
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar profile={p} size="sm" />
                    <span className="muted">{p.name}</span>
                  </div>
                  <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setHidden(p.id, false)}>Toon weer</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
