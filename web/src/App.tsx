import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot, Title, Status, SearchResult } from './lib/types';
import { POSTER_SMALL } from './lib/types';
import { getUserId, getBlind } from './lib/identity';
import { loadPrefs, savePrefs, type SortKey, type SortDir } from './lib/prefs';
import { fetchState, subscribe, saveRating, createManualTitle, searchTmdb } from './lib/api';
import {
  profileById, myRating, groupAverage, incomingRecommendations, selectTitles,
} from './lib/compute';

import Onboarding from './components/Onboarding';
import ListSearchBar from './components/ListSearchBar';
import StatusBadge from './components/StatusBadge';
import FilterSheet from './components/FilterSheet';
import TitleCard from './components/TitleCard';
import ActivityFeed from './components/Activity';
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
type StatusValue = StatusTab | 'dropped';

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
  const [recommendTarget, setRecommendTarget] = useState<Title | null>(null);
  const [profileTarget, setProfileTarget] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [manualAddQuery, setManualAddQuery] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [showActivity, setShowActivity] = useState(false);

  // Filters — statustab springt bij openen terug naar "Alles"; de rest is onthouden.
  const [status, setStatus] = useState<StatusValue>('all');
  const [friend, setFriend] = useState<string>(saved.friend);
  const [services, setServices] = useState<string[]>(saved.services);
  const [genres, setGenres] = useState<string[]>(saved.genres);
  const [nameFilter, setNameFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(saved.sortDir);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Paginering
  const PAGE_SIZE = 20;
  const [listPage, setListPage] = useState(1);
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
    titleId?: number;
  }) => {
    const s = opts.status;
    if (s === 'all' || s == null) { setFriend(''); setStatus('all'); }
    else if (s === 'mine') { setFriend(userId); setStatus('all'); }
    else { setFriend(userId); setStatus(s); }
    setGenres(opts.genre ? [opts.genre] : []);
    setServices(opts.service ? [opts.service] : []);
    setNameFilter('');
    setSearchOpen(false);
    setSortKey('date');
    setSortDir('desc');
    setFocusTitleId(opts.titleId ?? null);
    setTab('list');
  };

  const activeFilterCount =
    (friend ? 1 : 0) + services.length + genres.length + (status === 'dropped' ? 1 : 0);

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
  useEffect(() => { setListPage(1); }, [status, genres, services, sortKey, sortDir, friend, nameFilter]);
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
      setFriend(userId);
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
      setFriend(userId);
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

  const allServices = useMemo(() => {
    if (!snap) return [];
    const set = new Set<string>();
    snap.titles.forEach((t) => t.providers.forEach((p) => set.add(p)));
    return [...set].sort();
  }, [snap]);

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
    setFriend(userId);
    setStatus(st ?? 'all');
    setNameFilter('');
    setSearchOpen(false);
    setFocusTitleId(tmdbId);
  };

  // Bij een specifieke persoon tonen we diens eigen cijfer; bij "Iedereen" het groepsgemiddelde.
  const personScore = (tmdbId: number): number | null => {
    if (!snap) return null;
    if (friend) return snap.ratings.find((r) => r.title_id === tmdbId && r.user_id === friend)?.score ?? null;
    return groupAverage(snap, tmdbId);
  };
  const personDate = (t: Title): number => {
    if (!snap || !friend) return t.created_at;
    return snap.ratings.find((r) => r.title_id === t.tmdb_id && r.user_id === friend)?.updated_at ?? t.created_at;
  };

  const visibleTitles = useMemo(() => {
    if (!snap) return [];
    const list = selectTitles(snap, userId, { status, friend, services, genres, name: nameFilter });

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
  }, [snap, status, friend, services, genres, nameFilter, sortKey, sortDir, userId]);

  // Bij navigeren naar de lijst zonder specifieke serie: naar de bovenkant springen.
  useEffect(() => {
    if (tab !== 'list' || focusTitleId != null) return;
    window.scrollTo({ top: 0 });
  }, [tab, status, genres, services, friend, focusTitleId]);

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

  const forYouCount = snap ? incomingRecommendations(snap, userId).length : 0;

  // Laden
  if (!snap) return <div className="loading">Laden…</div>;

  // Onboarding als er nog geen profiel met naam is voor dit apparaat.
  if (!me) return <Onboarding onDone={reload} />;

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo">🛋️</span> Op de Bank</h1>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={() => setShowImport(true)} title="Hele lijst importeren">
            📋
          </button>
          <button className={`btn ghost ${tab === 'friends' ? 'sel' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setTab('friends')} title="Vrienden">
            👥
          </button>
          <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={() => setShowActivity((v) => !v)} title="Activiteit">
            🔔
          </button>
        </div>
      </header>

      {/* Activiteit */}
      {showActivity && (
        <div className="page" style={{ paddingTop: 4 }}>
          <ActivityFeed snap={snap} />
        </div>
      )}

      {tab === 'list' && searchActive && (
        <div className="page" style={{ paddingBottom: 88 }}>
          {/* Al op je lijst — zodat je dubbel toevoegen voorkomt */}
          {myMatches.length > 0 && (
            <>
              <div className="lsp-label" style={{ marginTop: 4 }}>Al op je lijst:</div>
              {myMatches.map((t) => {
                const r = myRating(snap, t.tmdb_id, userId);
                const badge: Status | null = r?.status ?? (r?.score != null ? 'finished' : null);
                return (
                  <button key={t.tmdb_id} className="suggestion" onClick={() => openExisting(t.tmdb_id)}>
                    {t.poster_path ? <img src={POSTER_SMALL + t.poster_path} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="s-name">{t.name}</div>
                      <div className="title-sub">{t.year || '—'}</div>
                    </div>
                    {badge && <StatusBadge status={badge} score={r?.score ?? null} />}
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
              {r.poster_path ? <img src={POSTER_SMALL + r.poster_path} alt="" /> : <div className="poster" style={{ width: 36, height: 54 }} />}
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

          {/* Zone 2 — actiebalk: links filters, rechts sorteren */}
          <div className="action-bar">
            <button className={`filter-btn ${activeFilterCount > 0 ? 'on' : ''}`} onClick={() => setShowFilterSheet(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
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

          {/* Actieve filter-chips — alleen als er filters aanstaan */}
          {activeFilterCount > 0 && (
            <div className="active-chips">
              {friend && (
                <button className="active-chip" onClick={() => setFriend('')}>
                  {friend === userId ? 'Jij' : (profileById(snap, friend)?.name || 'Vriend')} ✕
                </button>
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
            </div>
          )}

          {visibleTitles.length === 0 ? (
            activeFilterCount > 0 || status !== 'all' ? (
              <div className="empty">
                <div className="big">🔍</div>
                <p>Geen series met deze filters.</p>
                <button
                  className="btn"
                  style={{ marginTop: 10 }}
                  onClick={() => { setStatus('all'); setFriend(''); setServices([]); setGenres([]); }}
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
                    showGroupScore={!friend}
                    onRecommend={setRecommendTarget}
                    onChange={reload}
                    toast={toast}
                    initialExpanded={t.tmdb_id === justAddedId || t.tmdb_id === focusTitleId}
                  />
                </div>
              ))}
              {visibleTitles.length > listPage * PAGE_SIZE && (
                <button
                  className="btn ghost full"
                  style={{ marginTop: 8 }}
                  onClick={() => setListPage((p) => p + 1)}
                >
                  Meer laden ({visibleTitles.length - listPage * PAGE_SIZE} resterend)
                </button>
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
          <button className="fab-search" aria-label="Zoek of voeg toe" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1 }} onClick={() => setSearchOpen(true)}>+</button>
        )
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
        <ForYou snap={snap} userId={userId} blind={blind} onRecommend={setRecommendTarget} onChange={reload} toast={toast} />
      )}

      {tab === 'friends' && (
        <Friends snap={snap} userId={userId} onOpenProfile={setProfileTarget} onChange={reload} onShare={() => setShowShare(true)} toast={toast} />
      )}

      {tab === 'profile' && (
        <Profile snap={snap} userId={userId} blind={blind} setBlindState={setBlindState} onChange={reload} onShare={() => setShowShare(true)} toast={toast} />
      )}

      {/* Onderste navigatie */}
      <nav className="nav">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          <span className="ico">🏠</span>Dashboard
        </button>
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
          <span className="ico">🛋️</span>Lijst
        </button>
        <button className={tab === 'foryou' ? 'active' : ''} onClick={() => setTab('foryou')}>
          <span className="ico">✨</span>Voor jou
          {forYouCount > 0 && <span className="badge">{forYouCount}</span>}
        </button>
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          <span className="ico">👤</span>Profiel
        </button>
      </nav>

      {/* Sheets */}
      {showFilterSheet && (
        <FilterSheet
          snap={snap}
          userId={userId}
          allServices={allServices}
          allGenres={allGenres}
          baseStatus={status === 'dropped' ? 'all' : status}
          initial={{ friend, services, genres, dropped: status === 'dropped' }}
          onApply={(v) => {
            setFriend(v.friend);
            setServices(v.services);
            setGenres(v.genres);
            if (v.dropped) setStatus('dropped');
            else if (status === 'dropped') setStatus('all');
          }}
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
          toast={toast}
        />
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
