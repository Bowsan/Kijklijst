// De vaste app-schil: kopbalk (logo + import/vrienden/meldingen) en de
// onderste navigatiebalk. Puur presentatie — alle state blijft in App.

export type Tab = 'dashboard' | 'list' | 'foryou' | 'friends' | 'profile';

export function TopBar({ tab, unseen, chatUnread, onImport, onFriends, onActivity }: {
  tab: Tab;
  unseen: number;
  /** Aantal ongelezen chatberichten (badge op de vrienden-knop). */
  chatUnread: number;
  onImport: () => void;
  onFriends: () => void;
  onActivity: () => void;
}) {
  return (
    <header className="topbar">
      <h1><img className="logo-img" src="/icons/logo-bank.png" alt="" /> Op de Bank</h1>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={onImport} title="Hele lijst importeren" aria-label="Hele lijst importeren">
          <img className="topbar-ico" src="/icons/top-import.png" alt="" />
        </button>
        <button className={`btn ghost ${tab === 'friends' ? 'sel' : ''}`} style={{ padding: '6px 10px', position: 'relative' }} onClick={onFriends} title="Vrienden" aria-label={chatUnread > 0 ? `Vrienden, ${chatUnread} ongelezen berichten` : 'Vrienden'}>
          <img className="topbar-ico" src="/icons/top-friends.png" alt="" />
          {chatUnread > 0 && <span className="unread-badge topbar-badge">{chatUnread}</span>}
        </button>
        <button className="btn ghost" style={{ padding: '6px 10px', position: 'relative' }} onClick={onActivity} title="Meldingen" aria-label={unseen > 0 ? `Meldingen, ${unseen} nieuw` : 'Meldingen'}>
          <img className="topbar-ico" src="/icons/top-bell.png" alt="" />
          {unseen > 0 && <span className="notif-dot" />}
        </button>
      </div>
    </header>
  );
}

export function NavBar({ tab, forYouCount, onTab }: {
  tab: Tab;
  forYouCount: number;
  onTab: (t: Tab) => void;
}) {
  return (
    <nav className="nav">
      <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => onTab('dashboard')}>
        <span className="ico"><img src="/icons/nav-home.png" alt="" /></span>Dashboard
      </button>
      <button className={tab === 'list' ? 'active' : ''} onClick={() => onTab('list')}>
        <span className="ico"><img src="/icons/logo-bank.png" alt="" /></span>Lijst
      </button>
      <button className={tab === 'foryou' ? 'active' : ''} onClick={() => onTab('foryou')}>
        <span className="ico"><img src="/icons/nav-foryou.png" alt="" /></span>Voor jou
        {forYouCount > 0 && <span className="badge">{forYouCount}</span>}
      </button>
      <button className={tab === 'profile' ? 'active' : ''} onClick={() => onTab('profile')}>
        <span className="ico"><img src="/icons/nav-profile.png" alt="" /></span>Profiel
      </button>
    </nav>
  );
}
