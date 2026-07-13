import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot, Title, Status, SearchResult } from './lib/types';
import { posterUrl } from './lib/types';
import { getUserId, getBlind, getTheme, setTheme, getActivitySeen, setActivitySeen, getForYouSeen, setForYouSeen, type Theme } from './lib/identity';
import { loadPrefs, savePrefs, type SortKey, type SortDir } from './lib/prefs';
import { fetchState, subscribe, saveRating, createManualTitle, searchTmdb } from './lib/api';
import {
  profileById, myRating, groupAverage, selectTitles, serviceOptions, forYouBadgeCount,
  unseenNotificationCount,
} from './lib/compute';

import Onboarding from './components/Onboarding';
import ListSearchBar from './components/ListSearchBar';
import StatusBadge from './components/StatusBadge';
import Avatar from './components/Avatar';
import FilterSheet from './components/FilterSheet';
import TitleCard from './components/TitleCard';
import ActivityFeed from './components/Activity';
import Sheet from './components/Sheet';
import ForYou from './components/ForYou';
import Dashboard from './components/Dashboard';
import Friends from './components/Friends';
import ProfileView from './components/ProfileView';
import Profile from './components/Profile';
import RecommendSheet from './components/RecommendSheet';
import ImportSheet from './components/ImportSheet';
import ShareSheet from './components/ShareSheet';
import ManualAddSheet from './components/ManualAddSheet';

type Tab = 'dashboard' | 'list' | 'foryou' | 'friends' | 'profile';
type StatusTab = 'all' | 'want' | 'watching' | 'finished';
type StatusValue = StatusTab | 'dropped' | 'notdone';

// De statustabs bovenaan (kijkstatus). Afgehaakt zit in het filterpaneel.
const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'Alles' },
  { key: 'want', label: 'Wishlist' },
  { key: 'watching', label: 'Mee bezig' },
  { key: 'finished', label: 'Gezien' },
];

const SORT_OPTIONS: { key: SortKey; label: string; dir: SortDir }[] = [
  { key: 'date', label: 'Nieuwste', dir: 'desc' },
  { key: 'date', label: 'Oudste', dir: 'asc' },
  { key: 'name', label: 'Alfabetisch (A–Z)', dir: 'asc' },
  { key: 'rating', label: 'Hoogste rating', dir: 'desc' },
];

function sortLabel(key: SortKey, dir: SortDir): string {
  if (key === 'name') return dir === 'asc' ? 'A–Z' : 'Z–A';
  if (key === 'rating') return dir === 'desc' ? 'Hoogste' : 'Laagste';
  return dir === 'desc' ? 'Nieuwste' : 'Oudste';
}

export default function App() {
  const userId = getUserId();
  const saved = useMemo(() => loadPrefs(), []);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [blind, setBlindState] = useState(getBlind());
  const [theme, setThemeState] = useState<Theme>(getTheme());

  const changeTheme = (t: Theme) => { setTheme(t); setThemeState(t); };
  const [recommendTarget, setRecommendTarget] = useState<Title | null>(null);
  const [profileTarget, setProfileTarget] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [manualAddQuery, setManualAddQuery] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [showActivity, setShowActivity] = useState(false);
  const [activitySeen, setActivitySeenState] = useState(getActivitySeen());
  const [forYouSeen, setForYouSeenState] = useState(getForYouSeen());

  // Offline-detectie: toon een banner zolang er geen verbinding is.
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => { setOnline(true); reload(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // "Voor jou" openen → tips en nieuwe seizoenen als gezien markeren (badge weg).
  useEffect(() => {
    if (tab !== 'foryou') return;
    const now = Date.now();
    setForYouSeen(now);
    setForYouSeenState(now);
  }, [tab]);

  // Log/notificaties openen → alles als "gezien" markeren (bolletje verdwijnt).
  const openActivity = () => {
    setShowActivity((v) => {
      const next = !v;
      if (next) { const now = Date.now(); setActivitySeen(now); setActivitySeenState(now); }
      return next;
    });
  };

  // Filters — statustab springt bij openen terug naar "Alles"; de rest is onthouden.
  const [status, setStatus] = useState<StatusValue>('all');
  // Scope van de lijst: 'me' = Jij (lost altijd op naar het huidige account, ook
  // na inloggen met een bestaande naam), '' = Iedereen, of een specifiek vriend-id.
  const [friend, setFriend] = useState<string>(saved.friend ?? 'me');
  // Het echte gebruikers-id waarop we filteren ('me' → jouw account, '' → groep).
  const scopeUser = friend === 'me' ? userId : friend;
  const [services, setServices] = useState<string[]>(saved.services);
  const [genres, setGenres] = useState<string[]>(saved.genres);
  const [nameFilter, setNameFilter] = useState<string>('');
  // Acteurfilter: gezet door op een acteursnaam te tikken (kaart of dashboard).
  const [actorFilter, setActorFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(saved.sortDir);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickFilterOpen, setQuickFilterOpen] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Paginering: in stappen laden tijdens scrollen (geen harde limiet meer).
  const PAGE_SIZE = 30;
  const [listPage, setListPage] = useState(1);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [focusTitleId, setFocusTitleId] = useState<number | null>(null);

  const reload = () => fetchState().then(setSnap).catch(() => {});

  useEffect(() => {
    reload();
    const unsub = subscribe(reload);
    return unsub;
  }, []);

  // Filterkeuzes onthouden tussen bezoeken (status bewust niet).
  useEffect(() => {
    savePrefs({ friend, services, genres, sortKey, sortDir });
  }, [friend, services, genres, sortKey, sortDir]);

  const toast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const me = snap ? profileById(snap, userId) : undefined;

  // Vanuit het dashboard naar de lijst springen met een passend filter.
  const navigateToList = (opts: {
    status?: Status | 'all' | 'mine';
    genre?: string;
    service?: string;
    actor?: string;
    titleId?: number;
  }) => {
    const s = opts.status;
    if (s === 'all' || s == null) { setFriend(''); setStatus('all'); }
    else if (s === 'mine') { setFriend('me'); setStatus('all'); }
    else { setFriend('me'); setStatus(s); }
    setGenres(opts.genre ? [opts.genre] : []);
    setServices(opts.service ? [opts.service] : []);
    setActorFilter(opts.actor ?? '');
    setNameFilter('');
    setSearchOpen(false);
    setSortKey('date');
    setSortDir('desc');
    setFocusTitleId(opts.titleId ?? null);
    setTab('list');
  };

  // "Jij" heeft een eigen knop en een vriend-scope toont z'n eigen banner,
  // dus die tellen hier niet mee als paneelfilter.
  const activeFilterCount =
    services.length + genres.length + (actorFilter ? 1 : 0) +
    (status === 'dropped' || status === 'notdone' ? 1 : 0);

  const pickSort = (key: SortKey, dir: SortDir) => {
    if (sortKey === key && sortDir === dir) {
      // Zelfde optie opnieuw → richting omdraaien.
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(dir);
    }
    setShowSortMenu(false);
  };

  // Pagina resetten bij filterwijziging
  useEffect(() => { setListPage(1); }, [status, genres, services, sortKey, sortDir, friend, nameFilter, actorFilter]);
  // (geen koppeling meer tussen status en vriend — die assen staan los van elkaar)

  const addTitle = async (tmdbId: number) => {
    if (snap && myRating(snap, tmdbId, userId)) {
      toast('Staat al in je lijst!');
      return;
    }
    try {
      // Nieuw toegevoegde series gaan naar de wishlist; "Mee bezig" kies je zelf.
      await saveRating({ tmdb_id: tmdbId, status: 'want' });
      await reload();
      setJustAddedId(tmdbId);
      setFriend('me');
      setStatus('want');
      toast('Op je wishlist gezet');
    } catch (e: any) {
      toast(e.message || 'Toevoegen mislukt');
    }
  };

  const addManualTitle = async (name: string, service: string, seasons: number) => {
    try {
      const { tmdb_id } = await createManualTitle(name, service || undefined, seasons);
      await saveRating({ tmdb_id, status: 'want', ...(service ? { service } : {}) });
      await reload();
      setJustAddedId(tmdb_id);
      setFriend('me');
      setStatus('want');
      setManualAddQuery(null);
      setTab('list');
      toast('Op je wishlist gezet');
    } catch (e: any) {
      toast(e.message || 'Toevoegen mislukt');
    }
  };

  const allGenres = useMemo(() => {
    if (!snap) return [];
    const set = new Set<string>();
    snap.titles.forEach((t) => t.genres.forEach((g) => set.add(g)));
    return [...set].sort();
  }, [snap]);

  // Welke series staan al op jouw lijst — om dat in de zoeksuggesties te tonen.
  const myTitleIds = useMemo(
    () => new Set(snap ? snap.ratings.filter((r) => r.user_id === userId).map((r) => r.title_id) : []),
    [snap, userId],
  );

  // Zelfde dienstenlijst als het profiel (gedeelde bron).
  const allServices = useMemo(() => (snap ? serviceOptions(snap) : []), [snap]);

  // --- Zoeken/toevoegen via de + knop ---
  const searchQuery = nameFilter.trim();
  const searchActive = searchOpen && searchQuery.length >= 2;
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!searchActive) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      searchAbort.current?.abort();
      const ctrl = new AbortController();
      searchAbort.current = ctrl;
      try {
        setSearchResults(await searchTmdb(searchQuery, ctrl.signal));
      } catch {
        /* afgebroken of mislukt */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchActive, searchQuery]);

  // Series uit JOUW lijst die op de zoekterm passen — om dubbel toevoegen te voorkomen.
  const myMatches = useMemo(() => {
    if (!snap || !searchActive) return [];
    const q = searchQuery.toLowerCase();
    return snap.titles
      .filter((t) => myTitleIds.has(t.tmdb_id) && t.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snap, searchActive, searchQuery, myTitleIds]);

  // TMDb-suggesties die nog niet op je lijst staan.
  const addableResults = useMemo(
    () => searchResults.filter((r) => !myTitleIds.has(r.tmdb_id)),
    [searchResults, myTitleIds],
  );

  // Een serie openen die al op je lijst staat: naar het juiste filter + uitklappen.
  const openExisting = (tmdbId: number) => {
    const st = snap ? myRating(snap, tmdbId, userId)?.status : null;
    setFriend('me');
    setStatus(st ?? 'all');
    setNameFilter('');
    setSearchOpen(false);
    setFocusTitleId(tmdbId);
  };

  // Bij een specifieke persoon tonen we diens eigen cijfer; bij "Iedereen" het groepsgemiddelde.
  const personScore = (tmdbId: number): number | null => {
    if (!snap) return null;
    if (scopeUser) return snap.ratings.find((r) => r.title_id === tmdbId && r.user_id === scopeUser)?.score ?? null;
    return groupAverage(snap, tmdbId);
  };
  const personDate = (t: Title): number => {
    if (!snap || !scopeUser) return t.created_at;
    return snap.ratings.find((r) => r.title_id === t.tmdb_id && r.user_id === scopeUser)?.updated_at ?? t.created_at;
  };

  const visibleTitles = useMemo(() => {
    if (!snap) return [];
    const list = selectTitles(snap, userId, { status, friend: scopeUser, services, genres, name: nameFilter, actor: actorFilter || undefined });

    list.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'rating') {
        cmp = (personScore(a.tmdb_id) ?? -1) - (personScore(b.tmdb_id) ?? -1);
      } else {
        cmp = personDate(a) - personDate(b);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, status, friend, services, genres, nameFilter, actorFilter, sortKey, sortDir, userId]);

  // Bij navigeren naar de lijst zonder specifieke serie: naar de bovenkant springen.
  // focusTitleId bewust NIET in de deps: anders springt het na het wissen van de
  // focus alsnog naar boven, terwijl we juist bij de gekozen serie willen blijven.
  useEffect(() => {
    if (tab !== 'list' || focusTitleId != null) return;
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, status, genres, services, friend]);

  // Zorg dat een aangeklikte serie binnen de geladen pagina valt.
  useEffect(() => {
    if (focusTitleId == null) return;
    const idx = visibleTitles.findIndex((t) => t.tmdb_id === focusTitleId);
    if (idx >= 0) setListPage((p) => Math.max(p, Math.floor(idx / PAGE_SIZE) + 1));
  }, [focusTitleId, visibleTitles]);

  // En scroll die serie in beeld zodra ze gerenderd is; daarna de focus loslaten.
  useEffect(() => {
    if (tab !== 'list' || focusTitleId == null) return;
    const el = document.getElementById(`title-${focusTitleId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const id = setTimeout(() => setFocusTitleId(null), 600);
      return () => clearTimeout(id);
    }
  }, [tab, focusTitleId, listPage, visibleTitles]);

  // Oneindig scrollen: laad de volgende stap zodra de sentinel in beeld komt.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setListPage((p) => p + 1); },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, visibleTitles, listPage]);

  // "Terug naar boven"-knop tonen zodra je een eind naar beneden hebt gescrold.
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const forYouCount = snap ? forYouBadgeCount(snap, userId, forYouSeen) : 0;
  const unseenMessages = snap ? unseenNotificationCount(snap, userId, activitySeen) : 0;

  // Laden: skeleton-kaarten i.p.v. een kale tekstregel.
  if (!snap) {
    return (
      <div className="app">
        <header className="topbar">
          <h1><img className="logo-img" src="/icons/logo-bank.png" alt="" /> Op de Bank</h1>
        </header>
        <div className="page" aria-busy="true" aria-label="Laden">
          <div className="skel skel-bar" style={{ width: '40%' }} />
          {[0, 1, 2, 3].map((i) => (
            <div className="card skel-card" key={i}>
              <div className="skel skel-poster" />
              <div style={{ flex: 1 }}>
                <div className="skel skel-bar" style={{ width: '60%' }} />
                <div className="skel skel-bar" style={{ width: '35%' }} />
                <div className="skel skel-bar" style={{ width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Onboarding als er nog geen profiel met naam is voor dit apparaat.
  if (!me) return <Onboarding onDone={reload} />;

  return (
    <div className="app">
      <header className="topbar">
        <h1><img className="logo-img" src="/icons/logo-bank.png" alt="" /> Op de Bank</h1>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={() => setShowImport(true)} title="Hele lijst importeren" aria-label="Hele lijst importeren">
            <img className="topbar-ico" src="/icons/top-import.png" alt="" />
          </button>
          <button className={`btn ghost ${tab === 'friends' ? 'sel' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setTab('friends')} title="Vrienden" aria-label="Vrienden">
            <img className="topbar-ico" src="/icons/top-friends.png" alt="" />
          </button>
          <button className="btn ghost" style={{ padding: '6px 10px', position: 'relative' }} onClick={openActivity} title="Meldingen" aria-label={unseenMessages > 0 ? `Meldingen, ${unseenMessages} nieuw` : 'Meldingen'}>
            <img className="topbar-ico" src="/icons/top-bell.png" alt="" />
            {unseenMessages > 0 && <span className="notif-dot" />}
          </button>
        </div>
      </header>

      {!online && <div className="offline-banner" role="status">⚡ Geen verbinding — wijzigingen kunnen nu niet worden opgeslagen</div>}

      {/* Meldingen — als overlay over de huidige pagina heen. */}
      {showActivity && (
        <Sheet title="Meldingen" onClose={() => setShowActivity(false)}>
          <ActivityFeed
            snap={snap}
            userId={userId}
            onOpenTitle={(id) => { setShowActivity(false); navigateToList({ status: 'all', titleId: id }); }}
          />
        </Sheet>
      )}

      {tab === 'list' && searchActive && (
        <div className="page" style={{ paddingBottom: 88 }}>
          {/* Al op je lijst — zodat je dubbel toevoegen voorkomt */}
          {myMatches.length > 0 && (
            <>
              <div className="lsp-label" style={{ marginTop: 4 }}>Al op je lijst:</div>
              {myMatches.map((t) => {
                const r = myRating(snap, t.tmdb_id, userId);
                const badge: Status | null = r?.status ?? null;
                return (
                  <button key={t.tmdb_id} className="suggestion" onClick={() => openExisting(t.tmdb_id)}>
                    {t.poster_path ? <img src={posterUrl(t.poster_path, 'small')} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="s-name">{t.name}</div>
                      <div className="title-sub">{t.year || '—'}</div>
                    </div>
                    {(badge || r?.score != null) && <StatusBadge status={badge} score={r?.score ?? null} />}
                  </button>
                );
              })}
            </>
          )}

          {/* Toevoegen — TMDb-suggesties die nog niet op je lijst staan */}
          <div className="lsp-label" style={{ marginTop: myMatches.length > 0 ? 16 : 4 }}>
            {myMatches.length > 0 ? 'Andere series toevoegen:' : 'Toevoegen:'}
          </div>
          {addableResults.map((r) => (
            <button key={r.tmdb_id} className="suggestion" onClick={() => addTitle(r.tmdb_id)}>
              {r.poster_path ? <img src={posterUrl(r.poster_path, 'small')} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s-name">{r.name}</div>
                <div className="title-sub">{r.year || '—'}</div>
              </div>
              <span className="chip" style={{ flexShrink: 0, color: 'var(--accent)', borderColor: 'var(--accent)' }}>+ Toevoegen</span>
            </button>
          ))}
          <button className="suggestion" onClick={() => { setManualAddQuery(searchQuery); setSearchOpen(false); }}>
            <div className="poster" style={{ width: 36, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>➕</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s-name">"{searchQuery}" handmatig toevoegen</div>
              <div className="title-sub">Niet gevonden? Voeg de serie zelf toe.</div>
            </div>
          </button>
        </div>
      )}

      {tab === 'list' && !searchActive && (
        <div className="page" style={searchOpen ? { paddingBottom: 88 } : undefined}>
          {/* Banner wanneer je de lijst van een vriend bekijkt ("als die vriend"). */}
          {friend && friend !== 'me' && (
            <div className="viewing-as">
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                <Avatar profile={profileById(snap, friend)} id={friend} size="sm" />
                <span>Dit is de lijst van: <b>{profileById(snap, friend)?.name || 'Vriend'}</b></span>
              </div>
              <button className="btn ghost" style={{ padding: '4px 10px', flexShrink: 0 }} onClick={() => setFriend('me')}>Naar jouw lijst</button>
            </div>
          )}

          {/* Zone 1 — statusbalk (kijkstatus), de hoofdnavigatie */}
          <div className="status-bar">
            {STATUS_TABS.map((s) => (
              <button
                key={s.key}
                className={status === s.key ? 'sel' : ''}
                onClick={() => setStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Zone 2 — actiebalk: links filters + zoeken, rechts sorteren */}
          <div className="action-bar">
            <div className="row" style={{ gap: 8 }}>
              <button className={`filter-btn ${activeFilterCount > 0 ? 'on' : ''}`} onClick={() => setShowFilterSheet(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              {/* Scope: standaard je eigen lijst (Jij); tik Iedereen voor de groep. */}
              <div className="scope-toggle">
                <button className={friend === 'me' ? 'sel' : ''} onClick={() => setFriend('me')}>Jij</button>
                <button className={friend === '' ? 'sel' : ''} onClick={() => setFriend('')}>Iedereen</button>
              </div>
              <button
                className={`quick-search-btn ${nameFilter.trim() ? 'on' : ''}`}
                aria-label="Zoek in deze lijst"
                onClick={() => { setSearchOpen(false); setQuickFilterOpen((v) => { const next = !v; if (!next) setNameFilter(''); return next; }); }}
              >🔍</button>
            </div>
            <div style={{ position: 'relative' }}>
              <button className="sort-btn" onClick={() => setShowSortMenu((v) => !v)}>
                {sortLabel(sortKey, sortDir)} {sortDir === 'desc' ? '↓' : '↑'}
              </button>
              {showSortMenu && (
                <>
                  <div className="popover-backdrop" onClick={() => setShowSortMenu(false)} />
                  <div className="sort-menu">
                    {SORT_OPTIONS.map((o) => {
                      const active = o.key === 'date' ? (sortKey === 'date' && sortDir === o.dir) : sortKey === o.key;
                      return (
                        <button key={o.label} className={active ? 'active' : ''} onClick={() => pickSort(o.key, o.dir)}>
                          {o.label}
                          {active && <span style={{ float: 'right' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Snel zoeken/filteren binnen de huidige lijst (puur filteren, geen toevoegen) */}
          {quickFilterOpen && (
            <div className="quick-search">
              <input
                autoFocus
                placeholder="Filter in deze lijst…"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
              />
              <button className="close" aria-label="Sluiten" onClick={() => { setNameFilter(''); setQuickFilterOpen(false); }}>✕</button>
            </div>
          )}

          {/* Actieve filter-chips — alleen als er filters aanstaan */}
          {activeFilterCount > 0 && (
            <div className="active-chips">
              {actorFilter && (
                <button className="active-chip" onClick={() => setActorFilter('')}>🎭 {actorFilter} ✕</button>
              )}
              {services.map((s) => (
                <button key={s} className="active-chip" onClick={() => setServices((arr) => arr.filter((x) => x !== s))}>{s} ✕</button>
              ))}
              {genres.map((g) => (
                <button key={g} className="active-chip" onClick={() => setGenres((arr) => arr.filter((x) => x !== g))}>{g} ✕</button>
              ))}
              {status === 'dropped' && (
                <button className="active-chip" onClick={() => setStatus('all')}>Afgehaakt ✕</button>
              )}
              {status === 'notdone' && (
                <button className="active-chip" onClick={() => setStatus('all')}>Nog afkijken ✕</button>
              )}
            </div>
          )}

          {visibleTitles.length === 0 ? (
            activeFilterCount > 0 || status !== 'all' || nameFilter.trim() ? (
              <div className="empty">
                <div className="big">🔍</div>
                <p>Geen series met deze filters.</p>
                <button
                  className="btn"
                  style={{ marginTop: 10 }}
                  onClick={() => { setStatus('all'); setFriend('me'); setServices([]); setGenres([]); setNameFilter(''); setActorFilter(''); setQuickFilterOpen(false); }}
                >
                  Wis filters
                </button>
              </div>
            ) : (
              <div className="empty">
                <div className="big">🛋️</div>
                <p>Nog niets op de lijst.</p>
                <p className="muted">Voeg een serie toe met de <b>+</b> knop rechtsonder, of importeer je hele lijst in één keer.</p>
              </div>
            )
          ) : (
            <>
              {visibleTitles.slice(0, listPage * PAGE_SIZE).map((t) => (
                <div key={t.tmdb_id} id={`title-${t.tmdb_id}`}>
                  <TitleCard
                    snap={snap}
                    title={t}
                    userId={userId}
                    blind={blind}
                    showGroupScore={friend === ''}
                    compareUserId={friend && friend !== 'me' ? friend : undefined}
                    onActor={(name) => { setActorFilter(name); toast(`Gefilterd op ${name}`); window.scrollTo({ top: 0 }); }}
                    onRecommend={setRecommendTarget}
                    onChange={reload}
                    toast={toast}
                    initialExpanded={t.tmdb_id === justAddedId || t.tmdb_id === focusTitleId}
                  />
                </div>
              ))}
              {visibleTitles.length > listPage * PAGE_SIZE && (
                <div ref={loadMoreRef} className="load-more">
                  Nog {visibleTitles.length - listPage * PAGE_SIZE} series — scroll om te laden…
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Zweef-knop: zoeken, filteren én toevoegen in één. */}
      {tab === 'list' && (
        searchOpen ? (
          <ListSearchBar
            value={nameFilter}
            onChange={setNameFilter}
            onClose={() => { setNameFilter(''); setSearchOpen(false); }}
          />
        ) : (
          <button className="fab-search" aria-label="Zoek of voeg toe" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1 }} onClick={() => { setQuickFilterOpen(false); setNameFilter(''); setSearchOpen(true); }}>+</button>
        )
      )}

      {/* Terug naar boven */}
      {showScrollTop && !searchOpen && (
        <button className="scroll-top" aria-label="Terug naar boven" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
      )}

      {tab === 'dashboard' && (
        <Dashboard
          snap={snap}
          userId={userId}
          onOpenProfile={setProfileTarget}
          onAdd={addTitle}
          onGoFriends={() => setTab('friends')}
          onNavigate={navigateToList}
        />
      )}

      {tab === 'foryou' && (
        <ForYou snap={snap} userId={userId} blind={blind} onRecommend={setRecommendTarget} onAdd={addTitle} onChange={reload} toast={toast} />
      )}

      {tab === 'friends' && (
        <Friends snap={snap} userId={userId} onOpenProfile={setProfileTarget} onOpenTitle={(id) => navigateToList({ status: 'all', titleId: id })} onChange={reload} onShare={() => setShowShare(true)} toast={toast} />
      )}

      {tab === 'profile' && (
        <Profile snap={snap} userId={userId} blind={blind} setBlindState={setBlindState} theme={theme} setTheme={changeTheme} onChange={reload} onShare={() => setShowShare(true)} toast={toast} />
      )}

      {/* Onderste navigatie */}
      <nav className="nav">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          <span className="ico"><img src="/icons/nav-home.png" alt="" /></span>Dashboard
        </button>
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
          <span className="ico"><img src="/icons/logo-bank.png" alt="" /></span>Lijst
        </button>
        <button className={tab === 'foryou' ? 'active' : ''} onClick={() => setTab('foryou')}>
          <span className="ico"><img src="/icons/nav-foryou.png" alt="" /></span>Voor jou
          {forYouCount > 0 && <span className="badge">{forYouCount}</span>}
        </button>
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          <span className="ico"><img src="/icons/nav-profile.png" alt="" /></span>Profiel
        </button>
      </nav>

      {/* Sheets */}
      {showFilterSheet && (
        <FilterSheet
          snap={snap}
          userId={userId}
          allServices={allServices}
          allGenres={allGenres}
          status={status}
          friend={friend}
          services={services}
          genres={genres}
          myServices={me?.services || []}
          onFriend={setFriend}
          onToggleService={(s) => setServices((arr) => (arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]))}
          onMyServices={() => setServices((cur) => {
            const mine = me?.services || [];
            const allOn = mine.length > 0 && mine.every((s) => cur.includes(s));
            return allOn ? cur.filter((s) => !mine.includes(s)) : [...new Set([...cur, ...mine])];
          })}
          onToggleGenre={(g) => setGenres((arr) => (arr.includes(g) ? arr.filter((x) => x !== g) : [...arr, g]))}
          onToggleDropped={() => setStatus((st) => (st === 'dropped' ? 'all' : 'dropped'))}
          onToggleNotDone={() => setStatus((st) => (st === 'notdone' ? 'all' : 'notdone'))}
          onClear={() => { setFriend('me'); setServices([]); setGenres([]); setStatus((st) => (st === 'dropped' || st === 'notdone' ? 'all' : st)); }}
          onClose={() => setShowFilterSheet(false)}
        />
      )}
      {recommendTarget && (
        <RecommendSheet snap={snap} title={recommendTarget} userId={userId} onClose={() => setRecommendTarget(null)} onDone={toast} />
      )}
      {showImport && <ImportSheet onClose={() => setShowImport(false)} onDone={(m) => { toast(m); reload(); }} />}
      {showShare && <ShareSheet onClose={() => setShowShare(false)} onToast={toast} />}
      {manualAddQuery !== null && (
        <ManualAddSheet
          initialName={manualAddQuery}
          onClose={() => setManualAddQuery(null)}
          onConfirm={addManualTitle}
        />
      )}
      {profileTarget && (
        <ProfileView
          snap={snap}
          profileId={profileTarget}
          userId={userId}
          onClose={() => setProfileTarget(null)}
          onChange={reload}
          onAdd={(id) => addTitle(id)}
          onOpenTitle={(id) => { setProfileTarget(null); navigateToList({ status: 'all', titleId: id }); }}
          onViewList={(id) => {
            setProfileTarget(null);
            setFriend(id);
            setStatus('all');
            setGenres([]); setServices([]); setNameFilter('');
            setSortKey('rating'); setSortDir('desc');
            setTab('list');
          }}
          toast={toast}
        />
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
