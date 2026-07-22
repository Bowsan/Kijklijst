// De vaste app-schil: kopbalk (logo + menu-iconen) en de onderste
// navigatiebalk. Puur presentatie — alle state blijft in App.

import type { ReactNode } from 'react';

export type Tab = 'dashboard' | 'list' | 'foryou' | 'friends' | 'profile';

/** Eén menu-item in de kopbalk. Nieuwe items = één extra entry in App. */
export interface TopBarItem {
  key: string;
  /** Toegankelijk label (en tooltip). */
  label: string;
  /** PNG-icoon (pad onder /icons) of een emoji-string. */
  icon?: string;
  /** Eigen icoon-node (bijv. de avatar); wint van `icon`. */
  iconNode?: ReactNode;
  /** Rood teltje (bijv. ongelezen berichten). 0 = geen badge. */
  badge?: number;
  /** Klein rood bolletje zonder aantal (bijv. nieuwe log-items). */
  dot?: boolean;
  /** Extra class op de knop (bijv. voor de avatar die het vierkantje vult). */
  itemClass?: string;
  active?: boolean;
  onClick: () => void;
}

export function TopBar({ items, onLogo }: {
  items: TopBarItem[];
  /** Tik op het logo → naar het dashboard. */
  onLogo: () => void;
}) {
  return (
    <header className="topbar">
      <h1>
        <button className="topbar-logo" onClick={onLogo} aria-label="Naar het dashboard">
          <img className="logo-img" src="/icons/logo-bank.png" alt="" /> Op de Bank
        </button>
      </h1>
      <div className="row" style={{ gap: 10 }}>
        {items.map((it) => (
          <button
            key={it.key}
            className={`btn ghost topbar-item ${it.itemClass || ''} ${it.active ? 'sel' : ''}`}
            onClick={it.onClick}
            title={it.label}
            aria-label={it.badge ? `${it.label}, ${it.badge} nieuw` : it.label}
          >
            {it.iconNode ? it.iconNode : <TopBarIcon icon={it.icon || ''} />}
            {it.badge != null && it.badge > 0 && <span className="unread-badge topbar-badge">{it.badge}</span>}
            {it.dot && !it.badge && <span className="notif-dot" />}
          </button>
        ))}
      </div>
    </header>
  );
}

/** PNG uit de eigen iconenset, of anders de emoji op vergelijkbare grootte. */
function TopBarIcon({ icon }: { icon: string }): ReactNode {
  if (icon.endsWith('.png')) return <img className="topbar-ico" src={`/icons/${icon}`} alt="" />;
  return <span className="topbar-ico emoji" aria-hidden="true">{icon}</span>;
}

export function NavBar({ tab, forYouCount, dashboardDot, onTab }: {
  tab: Tab;
  forYouCount: number;
  /** Klein rood bolletje op Dashboard bij ongelezen meldingen. */
  dashboardDot?: boolean;
  onTab: (t: Tab) => void;
}) {
  return (
    <nav className="nav">
      <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => onTab('dashboard')}>
        <span className="ico"><img src="/icons/nav-home.png" alt="" /></span>Dashboard
        {dashboardDot && <span className="notif-dot nav-dot" aria-label="nieuwe meldingen" />}
      </button>
      <button className={tab === 'list' ? 'active' : ''} onClick={() => onTab('list')}>
        <span className="ico"><img src="/icons/logo-bank.png" alt="" /></span>Lijst
      </button>
      <button className={tab === 'foryou' ? 'active' : ''} onClick={() => onTab('foryou')}>
        <span className="ico"><img src="/icons/nav-foryou.png" alt="" /></span>Voor jou
        {forYouCount > 0 && <span className="badge">{forYouCount}</span>}
      </button>
    </nav>
  );
}
