import type { Snapshot } from '../lib/types';
import { selectTitles, followingProfiles } from '../lib/compute';
import Sheet from './Sheet';
import Avatar from './Avatar';

export type StatusTab = 'all' | 'want' | 'watching' | 'finished';

interface Props {
  snap: Snapshot;
  userId: string;
  allServices: string[];
  allGenres: string[];
  /** De actieve statustab — nodig voor de live "Toon N series"-teller. */
  baseStatus: StatusTab;
  // Live waarden + directe setters: een keuze is meteen van toepassing.
  friend: string;
  services: string[];
  genres: string[];
  dropped: boolean;
  onFriend: (v: string) => void;
  onToggleService: (s: string) => void;
  onToggleGenre: (g: string) => void;
  onToggleDropped: () => void;
  onClear: () => void;
  onClose: () => void;
}

export default function FilterSheet({
  snap, userId, allServices, allGenres, baseStatus,
  friend, services, genres, dropped,
  onFriend, onToggleService, onToggleGenre, onToggleDropped, onClear, onClose,
}: Props) {
  const friends = followingProfiles(snap, userId);
  const me = snap.profiles.find((p) => p.id === userId);

  // Live aantal series dat overblijft met de huidige keuze ('me' → jouw account).
  const count = selectTitles(snap, userId, {
    status: dropped ? 'dropped' : baseStatus,
    friend: friend === 'me' ? userId : friend,
    services, genres, name: '',
  }).length;

  return (
    <Sheet title="Filters" onClose={onClose}>
      {/* Vrienden — wiens lijst */}
      <div className="filter-section">
        <div className="fs-label">Wiens lijst</div>
        <div className="friend-filter">
          <button className={friend === '' ? 'sel' : ''} onClick={() => onFriend('')}>
            <span className="ff-icon">👥</span>Iedereen
          </button>
          <button className={friend === 'me' ? 'sel' : ''} onClick={() => onFriend('me')}>
            <Avatar profile={me} id={userId} size="sm" />Jij
          </button>
          {friends.map((p) => (
            <button key={p.id} className={friend === p.id ? 'sel' : ''} onClick={() => onFriend(p.id)}>
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
              <button key={s} className={`chip-toggle ${services.includes(s) ? 'on' : ''}`} onClick={() => onToggleService(s)}>
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
              <button key={g} className={`chip-toggle ${genres.includes(g) ? 'on' : ''}`} onClick={() => onToggleGenre(g)}>
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
          <button className={`chip-toggle ${dropped ? 'on' : ''}`} onClick={onToggleDropped}>
            Afgehaakt
          </button>
        </div>
      </div>

      {/* Acties — keuzes zijn al toegepast; deze knoppen wissen of sluiten alleen. */}
      <div className="row" style={{ gap: 10, marginTop: 18 }}>
        <button className="btn ghost" onClick={onClear}>Wissen</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={onClose}>
          Toon {count} serie{count === 1 ? '' : 's'}
        </button>
      </div>
    </Sheet>
  );
}
