import type { Snapshot } from '../lib/types';
import { selectTitles, followingProfiles, type StatusValue } from '../lib/compute';
import Sheet from './Sheet';
import Avatar from './Avatar';
import ServiceLogo from './ServiceLogo';
import FriendsIcon from './FriendsIcon';

interface Props {
  snap: Snapshot;
  userId: string;
  allServices: string[];
  allGenres: string[];
  /** De actieve status (incl. overloop-opties Afgehaakt / Nog afkijken). */
  status: StatusValue;
  // Live waarden + directe setters: een keuze is meteen van toepassing.
  friend: string;
  services: string[];
  genres: string[];
  myServices: string[];
  onFriend: (v: string) => void;
  onToggleService: (s: string) => void;
  onMyServices: () => void;
  onToggleGenre: (g: string) => void;
  onToggleDropped: () => void;
  onToggleNotDone: () => void;
  noScore: boolean;
  onToggleNoScore: () => void;
  onClear: () => void;
  onClose: () => void;
}

export default function FilterSheet({
  snap, userId, allServices, allGenres, status,
  friend, services, genres, myServices, noScore,
  onFriend, onToggleService, onMyServices, onToggleGenre, onToggleDropped, onToggleNotDone, onToggleNoScore, onClear, onClose,
}: Props) {
  const friends = followingProfiles(snap, userId);
  const me = snap.profiles.find((p) => p.id === userId);
  const dropped = status === 'dropped';
  const notDone = status === 'notdone';
  const myServicesOn = myServices.length > 0 && myServices.every((s) => services.includes(s));

  // Live aantal series dat overblijft met de huidige keuze ('me' → jouw account).
  const count = selectTitles(snap, userId, {
    status,
    friend: friend === 'me' ? userId : friend,
    services, genres, name: '', noScore,
  }).length;

  return (
    <Sheet title="Filter" onClose={onClose}>
      {/* Vrienden — wiens lijst */}
      <div className="filter-section">
        <div className="fs-label">Wiens lijst</div>
        <div className="friend-filter">
          <button className={friend === '' ? 'sel' : ''} onClick={() => onFriend('')}>
            <FriendsIcon size={26} className="ff-icon" />Iedereen
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
            {myServices.length > 0 && (
              <button className={`chip-toggle ${myServicesOn ? 'on' : ''}`} onClick={onMyServices}>
                ★ Mijn diensten
              </button>
            )}
            {allServices.map((s) => (
              <button key={s} className={`chip-toggle ${services.includes(s) ? 'on' : ''}`} onClick={() => onToggleService(s)}>
                <ServiceLogo snap={snap} name={s} />{s}
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

      {/* Status — overloop (past niet in de tabbalk) */}
      <div className="filter-section">
        <div className="fs-label">Status</div>
        <div className="chip-wrap">
          <button className={`chip-toggle ${dropped ? 'on' : ''}`} onClick={onToggleDropped}>
            Afgehaakt
          </button>
          <button className={`chip-toggle ${notDone ? 'on' : ''}`} onClick={onToggleNotDone}>
            Nog afkijken
          </button>
          <button className={`chip-toggle ${noScore ? 'on' : ''}`} onClick={onToggleNoScore}>
            Zonder cijfer
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
