import { useState } from 'react';
import type { Snapshot } from '../lib/types';
import { selectTitles, followingProfiles } from '../lib/compute';
import Sheet from './Sheet';
import Avatar from './Avatar';

export type StatusTab = 'all' | 'want' | 'watching' | 'finished';

export interface PanelFilters {
  friend: string; // '' = Iedereen
  services: string[];
  genres: string[];
  dropped: boolean; // Afgehaakt tonen (alleen-afgehaakt)
}

interface Props {
  snap: Snapshot;
  userId: string;
  allServices: string[];
  allGenres: string[];
  /** De actieve statustab — nodig voor de live "Toon N series"-teller. */
  baseStatus: StatusTab;
  initial: PanelFilters;
  onApply: (v: PanelFilters) => void;
  onClose: () => void;
}

export default function FilterSheet({ snap, userId, allServices, allGenres, baseStatus, initial, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<PanelFilters>(initial);
  const friends = followingProfiles(snap, userId);
  const me = snap.profiles.find((p) => p.id === userId);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // Live aantal series dat overblijft met de huidige (concept)keuze.
  const count = selectTitles(snap, userId, {
    status: draft.dropped ? 'dropped' : baseStatus,
    friend: draft.friend,
    services: draft.services,
    genres: draft.genres,
    name: '',
  }).length;

  const clear = () => setDraft({ friend: '', services: [], genres: [], dropped: false });

  return (
    <Sheet title="Filters" onClose={onClose}>
      {/* Vrienden — wiens lijst */}
      <div className="filter-section">
        <div className="fs-label">Wiens lijst</div>
        <div className="friend-filter">
          <button className={draft.friend === '' ? 'sel' : ''} onClick={() => setDraft((d) => ({ ...d, friend: '' }))}>
            <span className="ff-icon">👥</span>Iedereen
          </button>
          <button className={draft.friend === userId ? 'sel' : ''} onClick={() => setDraft((d) => ({ ...d, friend: userId }))}>
            <Avatar profile={me} id={userId} size="sm" />Jij
          </button>
          {friends.map((p) => (
            <button key={p.id} className={draft.friend === p.id ? 'sel' : ''} onClick={() => setDraft((d) => ({ ...d, friend: p.id }))}>
              <Avatar profile={p} id={p.id} size="sm" />{p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Streamingdiensten — meerkeuze */}
      {allServices.length > 0 && (
        <div className="filter-section">
          <div className="fs-label">Streamingdiensten</div>
          <div className="chip-wrap">
            {allServices.map((s) => (
              <button
                key={s}
                className={`chip-toggle ${draft.services.includes(s) ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, services: toggle(d.services, s) }))}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Genres — meerkeuze */}
      {allGenres.length > 0 && (
        <div className="filter-section">
          <div className="fs-label">Genres</div>
          <div className="chip-wrap">
            {allGenres.map((g) => (
              <button
                key={g}
                className={`chip-toggle ${draft.genres.includes(g) ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, genres: toggle(d.genres, g) }))}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status — overloop (Afgehaakt past niet in de tabbalk) */}
      <div className="filter-section">
        <div className="fs-label">Status</div>
        <div className="chip-wrap">
          <button
            className={`chip-toggle ${draft.dropped ? 'on' : ''}`}
            onClick={() => setDraft((d) => ({ ...d, dropped: !d.dropped }))}
          >
            Afgehaakt
          </button>
        </div>
      </div>

      {/* Acties */}
      <div className="row" style={{ gap: 10, marginTop: 18 }}>
        <button className="btn ghost" onClick={clear}>Wissen</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => { onApply(draft); onClose(); }}>
          Toon {count} serie{count === 1 ? '' : 's'}
        </button>
      </div>
    </Sheet>
  );
}
