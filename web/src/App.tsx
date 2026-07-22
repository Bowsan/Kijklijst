import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot, Title, Status, SearchResult, Message } from './lib/types';
import { posterUrl, serviceLogoUrl } from './lib/types';
import { getUserId, getBlind, getTheme, setTheme, getActivitySeen, setActivitySeen, getForYouSeen, setForYouSeen, getFriendsSeen, setFriendsSeen, isOnboarded, getSimpleMode, setSimpleMode as setSimpleModePref, colorFor, type Theme } from './lib/identity';
import { loadPrefs, savePrefs, type SortKey, type SortDir } from './lib/prefs';
import { fetchState, subscribe, saveRating, createManualTitle, searchTmdb, fetchMessages, enablePush, isPushEnabled } from './lib/api';
import { isStandalone, shouldAskPush, clearAskPush } from './lib/install';
import {
  profileById, myRating, groupAverage, selectTitles, serviceOptions, forYouBadgeCount,
  unseenNotificationCount, incomingRecommendations, sentRecommendations,
} from './lib/compute';

import Onboarding from './components/Onboarding';
import SimpleApp from './components/SimpleApp';
import { TopBar, NavBar, type Tab } from './components/Chrome';
import ListSearchBar from './components/ListSearchBar';
import StatusBadge from './components/StatusBadge';
import Avatar from './components/Avatar';
import FilterSheet from './components/FilterSheet';
import TitleCard from './components/TitleCard';
import ActivityFeed from './components/Activity';
import Sheet from './components/Sheet';
import ForYou from './components/ForYou';
import Dashboard, { type DashSection } from './components/Dashboard';
import Friends from './components/Friends';
import ProfileView from './components/ProfileView';
import Profile from './components/Profile';
import RecommendSheet from './components/RecommendSheet';
import ImportSheet from './components/ImportSheet';
import ShareSheet from './components/ShareSheet';
import ManualAddSheet from './components/ManualAddSheet';
import ChatSheet from './components/ChatSheet';

type StatusTab = 'all' | 'want' | 'watching' | 'finished';
type StatusValue = StatusTab | 'dropped' | 'notdone';

// De statustabs bovenaan (kijkstatus). Afgehaakt zit in het filterpaneel.
const DASH_TABS: { key: DashSection; label: string }[] = [
  { key: 'kijken', label: 'Aan het kijken' },
  { key: 'actueel', label: 'Actueel' },
  { key: 'stats', label: 'Statistieken' },
];

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'Alles' },
  { key: 'want', label: 'Wishlist' },
  { key: 'watching', label: 'Mee bezig' },
  { key: 'finished', label: 'Gezien' },
];

// Eén optie per sleutel; de richting togglet door dezelfde optie opnieuw te
// kiezen (het pijltje toont welke kant op). De `dir` is de standaardrichting.
const SORT_OPTIONS: { key: SortKey; label: string; dir: SortDir }[] = [
  { key: 'name', label: 'Alfabetisch', dir: 'asc' },
  { key: 'date', label: 'Aangepast', dir: 'desc' },
  { key: 'release', label: 'Uitgave', dir: 'desc' },
  { key: 'rating', label: 'Rating', dir: 'desc' },
  { key: 'imdb', label: 'IMDb Rating', dir: 'desc' },
];

// Het scroll-element van de app (zie styles.css): #root, niet het document.
const scroller = () => document.getElementById('root');

function sortLabel(key: SortKey): string {
  return SORT_OPTIONS.find((o) => o.key === key)?.label ?? 'Aangepast';
}

export default function App() {
  const userId = getUserId();
  const saved = useMemo(() => loadPrefs(), []);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [blind, setBlindState] = useState(getBlind());
  const [simpleMode, setSimpleModeState] = useState(getSimpleMode());
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const changeSimpleMode = (v: boolean) => { setSimpleModePref(v); setSimpleModeState(v); };

  const changeTheme = (t: Theme) => { setTheme(t); setThemeState(t); };
  const [recommendTarget, setRecommendTarget] = useState<Title | null>(null);
  const [profileTarget, setProfileTarget] = useState<string | null>(null);
  // Open het profiel meteen in "Raad iets aan"-modus.
  const [profileRecMode, setProfileRecMode] = useState(false);
  const openRecommendTo = (id: string) => { setProfileRecMode(true); setProfileTarget(id); };
  // Sub-tab van de vriendenpagina — hier zodat de kopbalk er direct heen kan linken.
  const [friendsSubTab, setFriendsSubTab] = useState<'friends' | 'tips' | 'messages'>('friends');
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [manualAddQuery, setManualAddQuery] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [showActivity, setShowActivity] = useState(false);
  const [activitySeen, setActivitySeenState] = useState(getActivitySeen());
  const [forYouSeen, setForYouSeenState] = useState(getForYouSeen());
  const [friendsSeen, setFriendsSeenState] = useState(getFriendsSeen());
  // Welke dashboard-sectie actief is (Aan het kijken / Actueel / Statistieken).
  const [dashTab, setDashTab] = useState<DashSection>('kijken');

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

  // Alle meldingen tonen (overlay) én als "gezien" markeren.
  const markActivitySeen = () => { const now = Date.now(); setActivitySeen(now); setActivitySeenState(now); };
  const openActivity = () => { setShowActivity(true); markActivitySeen(); };

  // Op de "Actueel"-sectie van het dashboard staan de meldingen — dus markeer ze
  // daar als gezien (het bolletje op Dashboard verdwijnt).
  useEffect(() => {
    if (tab === 'dashboard' && dashTab === 'actueel') markActivitySeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dashTab]);

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
  // Makersfilter: gezet door op een seriemaker te tikken op het dashboard.
  const [creatorFilter, setCreatorFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(saved.sortDir);
  const [compact, setCompact] = useState<boolean>(saved.compact);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickFilterOpen, setQuickFilterOpen] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Paginering: in stappen bijladen tijdens het scrollen.
  const PAGE_SIZE = 30;
  const [listPage, setListPage] = useState(1);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [focusTitleId, setFocusTitleId] = useState<number | null>(null);

  // Privéberichten staan niet in de gedeelde snapshot; apart ophalen,
  // maar wel op hetzelfde ritme verversen (de SSE-ping triggert reload).
  const [messages, setMessages] = useState<Message[]>([]);
  const reloadMessages = () => fetchMessages().then(setMessages).catch(() => {});
  const reload = () => {
    fetchState().then(setSnap).catch(() => {});
    reloadMessages();
  };
  const [chatTarget, setChatTarget] = useState<string | null>(null);

  useEffect(() => {
    reload();
    const unsub = subscribe(reload);
    return unsub;
  }, []);

  // Dienstlogo's alvast voorladen: het zijn er maar een paar en piepklein.
  // Ze belanden zo meteen in de afbeeldingencache van de service worker en
  // verschijnen daarna overal direct, zonder zichtbaar na-laden.
  const warmedLogos = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const l of snap?.service_logos ?? []) {
      if (warmedLogos.current.has(l.logo_path)) continue;
      warmedLogos.current.add(l.logo_path);
      const img = new Image();
      img.src = serviceLogoUrl(l.logo_path);
    }
  }, [snap]);

  // Filterkeuzes onthouden tussen bezoeken (status bewust niet).
  useEffect(() => {
    savePrefs({ friend, services, genres, sortKey, sortDir, compact });
  }, [friend, services, genres, sortKey, sortDir, compact]);

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
    creator?: string;
    titleId?: number;
  }) => {
    const s = opts.status;
    if (s === 'all' || s == null) { setFriend(''); setStatus('all'); }
    else if (s === 'mine') { setFriend('me'); setStatus('all'); }
    else { setFriend('me'); setStatus(s); }
    setGenres(opts.genre ? [opts.genre] : []);
    setServices(opts.service ? [opts.service] : []);
    setActorFilter(opts.actor ?? '');
    setCreatorFilter(opts.creator ?? '');
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
    services.length + genres.length + (actorFilter ? 1 : 0) + (creatorFilter ? 1 : 0) +
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
  useEffect(() => { setListPage(1); }, [status, genres, services, sortKey, sortDir, friend, nameFilter, actorFilter, creatorFilter]);

  // Toevoegen vanuit een gefilterde lijst erft die status (Wishlist/Mee bezig/
  // Gezien/Afgehaakt); overal anders is de wishlist de standaard.
  const listAddStatus = (): Status =>
    status === 'watching' || status === 'finished' || status === 'dropped' ? status : 'want';
  const ADD_TOAST: Record<Status, string> = {
    want: 'Op je wishlist gezet',
    watching: 'Toegevoegd als Mee bezig',
    finished: 'Toegevoegd als Gezien',
    dropped: 'Toegevoegd als Afgehaakt',
  };

  const addTitle = async (tmdbId: number, st: Status = 'want') => {
    if (snap && myRating(snap, tmdbId, userId)) {
      toast('Staat al in je lijst!');
      return;
    }
    try {
      await saveRating({ tmdb_id: tmdbId, status: st });
      await reload();
      setJustAddedId(tmdbId);
      setFriend('me');
      setStatus(st);
      toast(ADD_TOAST[st]);
    } catch (e: any) {
      toast(e.message || 'Toevoegen mislukt');
    }
  };

  const addManualTitle = async (name: string, service: string, seasons: number) => {
    const st = listAddStatus();
    try {
      const { tmdb_id } = await createManualTitle(name, service || undefined, seasons);
      await saveRating({ tmdb_id, status: st, ...(service ? { service } : {}) });
      await reload();
      setJustAddedId(tmdb_id);
      setFriend('me');
      setStatus(st);
      setManualAddQuery(null);
      setTab('list');
      toast(ADD_TOAST[st]);
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
  // "Aangepast": wanneer deze gebruiker de serie voor het laatst wijzigde
  // (updated_at), met de titel-datum als terugval voor oudere gegevens.
  const personDate = (t: Title): number => {
    if (!snap || !scopeUser) return t.created_at;
    const r = snap.ratings.find((r) => r.title_id === t.tmdb_id && r.user_id === scopeUser);
    return r?.updated_at ?? t.created_at;
  };
  // Uitgavedatum als sorteersleutel: volledige datum indien bekend, anders het
  // jaar (zodat sorteren meteen werkt terwijl de datums op de achtergrond vullen).
  const releaseKey = (t: Title): string =>
    t.first_air_date || (t.year != null ? `${t.year}-00-00` : '');

  const visibleTitles = useMemo(() => {
    if (!snap) return [];
    const list = selectTitles(snap, userId, { status, friend: scopeUser, services, genres, name: nameFilter, actor: actorFilter || undefined, creator: creatorFilter || undefined });

    list.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'rating') {
        cmp = (personScore(a.tmdb_id) ?? -1) - (personScore(b.tmdb_id) ?? -1);
      } else if (sortKey === 'imdb') {
        cmp = (a.imdb_rating ?? -1) - (b.imdb_rating ?? -1);
      } else if (sortKey === 'release') {
        cmp = releaseKey(a).localeCompare(releaseKey(b));
      } else {
        cmp = personDate(a) - personDate(b);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, status, friend, services, genres, nameFilter, actorFilter, creatorFilter, sortKey, sortDir, userId]);

  // Kaarten die open staan om te bewerken. Zolang er één open is, bevriezen we
  // de lijstvolgorde en -selectie: een statuswijziging laat de kaart dan niet
  // direct verspringen of verdwijnen. Pas bij het sluiten (of een filter-/
  // sorteerwijziging) schikt de lijst zich opnieuw.
  const [editingIds, setEditingIds] = useState<Set<number>>(new Set());
  const onEditToggle = useCallback((id: number, open: boolean) => {
    setEditingIds((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const editing = editingIds.size > 0;
  const frozenListRef = useRef<Title[] | null>(null);
  useEffect(() => { frozenListRef.current = null; }, [status, friend, services, genres, nameFilter, actorFilter, creatorFilter, sortKey, sortDir, tab]);
  useEffect(() => { if (!editing) frozenListRef.current = null; }, [editing]);

  let listTitles = visibleTitles;
  if (editing && snap) {
    if (!frozenListRef.current) frozenListRef.current = visibleTitles;
    // Bevroren volgorde, maar wél met de verste titeldata uit de snapshot.
    const byId = new Map(snap.titles.map((t) => [t.tmdb_id, t]));
    listTitles = frozenListRef.current.map((t) => byId.get(t.tmdb_id) ?? t);
  }

  // Bij navigeren naar de lijst zonder specifieke serie: naar de bovenkant springen.
  // focusTitleId bewust NIET in de deps: anders springt het na het wissen van de
  // focus alsnog naar boven, terwijl we juist bij de gekozen serie willen blijven.
  useEffect(() => {
    if (tab !== 'list' || focusTitleId != null) return;
    scroller()?.scrollTo({ top: 0 });
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
  // Zodra je voorbij de (weg-scrollende) topbar bent, staat de tabbalk "los" —
  // dan geven we 'm een subtiele schaduw.
  const [headerScrolled, setHeaderScrolled] = useState(false);
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const onScroll = () => {
      setShowScrollTop(el.scrollTop > 500);
      setHeaderScrolled(el.scrollTop > 40);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Na de onboarding-instructie "zet op je beginscherm" (iOS): bij de eerste
  // start vanaf het beginscherm alsnog éénmalig meldingen voorstellen.
  const [showPushAsk, setShowPushAsk] = useState(false);

  // Na de onboarding: land op de eigen "Gezien"-lijst met een hint bij de +knop.
  const [showAddHint, setShowAddHint] = useState(false);
  const finishOnboarding = async () => {
    await reload();
    // De onboarding kan de simpele modus hebben gekozen — die vlag hier oppikken.
    setSimpleModeState(getSimpleMode());
    setFriend('me');
    setStatus('finished');
    setTab('list');
    setShowAddHint(true);
  };
  useEffect(() => {
    if (!isStandalone() || !shouldAskPush()) return;
    if (!('Notification' in window) || Notification.permission === 'denied') { clearAskPush(); return; }
    isPushEnabled().then((on) => {
      if (on) clearAskPush();
      else setShowPushAsk(true);
    }).catch(() => {});
  }, []);
  const answerPushAsk = async (yes: boolean) => {
    clearAskPush();
    setShowPushAsk(false);
    if (yes) {
      const ok = await enablePush().catch(() => false);
      toast(ok ? 'Meldingen staan aan 🔔' : 'Meldingen aanzetten lukte niet — probeer het via je profiel');
    }
  };

  // iOS-toetsenbordhoogte bijhouden in --kb-inset: de zoekbalk blijft erboven
  // staan en de zoekresultaten krijgen genoeg extra scrollruimte.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--kb-inset');
    };
  }, []);

  const forYouCount = snap ? forYouBadgeCount(snap, userId, forYouSeen) : 0;
  const unseenMessages = snap ? unseenNotificationCount(snap, userId, activitySeen) : 0;
  const unreadChats = messages.filter((m) => m.to_user === userId && m.read_at == null).length;
  const unreadFrom = (id: string) => messages.filter((m) => m.from_user === id && m.to_user === userId && m.read_at == null).length;
  // Nieuwe volgers sinds je de vriendenlijst voor het laatst opende.
  const newFollowers = snap ? snap.follows.filter((f) => f.followee === userId && f.created_at > friendsSeen).length : 0;
  // Eén rood bolletje op het Vrienden-icoon: berichten + tips + nieuwe vrienden.
  const friendsDot = !!snap && (unreadChats > 0 || incomingRecommendations(snap, userId).length > 0 || newFollowers > 0);
  // Rood bolletje op Dashboard bij ongelezen meldingen (het belletje verdween).
  const dashboardDot = unseenMessages > 0;
  // Aantal verstuurde tips (label op de Vrienden-subtab "Jouw tips").
  const tipCount = snap ? sentRecommendations(snap, userId).length : 0;
  // Eigen avatar als Profiel-icoon in de kopbalk: vierkantje met afgeronde hoeken.
  const profileIcon = me?.avatar
    ? <img className="topbar-ava" src={me.avatar} alt="" />
    : <span className="topbar-ava" style={{ background: me?.color || colorFor(userId) }}>{(me?.name || '?').trim().charAt(0).toUpperCase()}</span>;

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

  // Onboarding: bij een nieuw apparaat (geen profiel), of éénmalig voor wie
  // minder dan 5 beoordelingen heeft en de onboarding nog niet zag.
  const scoredByMe = snap.ratings.filter((r) => r.user_id === userId && r.score != null).length;
  if (!me || (!isOnboarded() && scoredByMe < 5)) {
    return <Onboarding existing={!!me} onDone={finishOnboarding} />;
  }

  // Simpele modus: een kaal kijklijstje in plaats van de volledige app.
  if (simpleMode) {
    return (
      <SimpleApp
        snap={snap}
        userId={userId}
        online={online}
        onChange={reload}
        toast={toast}
        setSimpleMode={changeSimpleMode}
      />
    );
  }

  return (
    <div className={`app tab-${tab}${headerScrolled ? ' scrolled' : ''}`}>
      <TopBar
        onLogo={() => setTab('dashboard')}
        items={[
          {
            key: 'friends', label: 'Vrienden', icon: 'top-friends.png',
            active: tab === 'friends',
            dot: friendsDot,
            onClick: () => {
              setTab('friends');
              setFriendsSubTab('friends');
              const now = Date.now();
              setFriendsSeen(now);
              setFriendsSeenState(now);
            },
          },
          {
            key: 'profile', label: 'Profiel', iconNode: profileIcon, itemClass: 'topbar-item-ava',
            active: tab === 'profile',
            onClick: () => setTab('profile'),
          },
        ]}
      />

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
        <div className="page" style={{ paddingBottom: 'calc(84px + var(--safe-bottom) + var(--kb-inset, 0px))' }}>
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
            <button key={r.tmdb_id} className="suggestion" onClick={() => addTitle(r.tmdb_id, listAddStatus())}>
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
        <>
          {/* Zone 1 — statustabs: pinnen bovenin bij scrollen (topbar + werkbalk scrollen weg). */}
          <div className="status-tabs" role="tablist" aria-label="Kijkstatus">
            {STATUS_TABS.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={status === s.key}
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
              <button
                className={`quick-search-btn ${nameFilter.trim() ? 'on' : ''}`}
                aria-label="Zoek in deze lijst"
                onClick={() => { setSearchOpen(false); setQuickFilterOpen((v) => { const next = !v; if (!next) setNameFilter(''); return next; }); }}
              >🔍</button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className={`compact-btn ${compact ? 'on' : ''}`}
                aria-pressed={compact}
                aria-label={compact ? 'Volledige weergave' : 'Compacte weergave'}
                title={compact ? 'Volledige weergave' : 'Compacte weergave'}
                onClick={() => setCompact((v) => !v)}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <circle cx="3.6" cy="6" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="3.6" cy="12" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="3.6" cy="18" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <div style={{ position: 'relative' }}>
              <button className="sort-btn" onClick={() => setShowSortMenu((v) => !v)}>
                {sortLabel(sortKey)} {sortDir === 'desc' ? '↓' : '↑'}
              </button>
              {showSortMenu && (
                <>
                  <div className="popover-backdrop" onClick={() => setShowSortMenu(false)} />
                  <div className="sort-menu">
                    {SORT_OPTIONS.map((o) => {
                      const active = sortKey === o.key;
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
          </div>

        <div className="page" style={searchOpen ? { paddingBottom: 'calc(84px + var(--safe-bottom) + var(--kb-inset, 0px))' } : undefined}>
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
              {creatorFilter && (
                <button className="active-chip" onClick={() => setCreatorFilter('')}>🎬 {creatorFilter} ✕</button>
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
              {listTitles.slice(0, listPage * PAGE_SIZE).map((t) => (
                <div key={t.tmdb_id} id={`title-${t.tmdb_id}`}>
                  <TitleCard
                    snap={snap}
                    title={t}
                    userId={userId}
                    blind={blind}
                    showGroupScore={friend === ''}
                    showWanters={status === 'want' && friend === ''}
                    compact={compact}
                    compareUserId={friend && friend !== 'me' ? friend : undefined}
                    onActor={(name) => { setActorFilter(name); toast(`Gefilterd op ${name}`); scroller()?.scrollTo({ top: 0 }); }}
                    onOpenProfile={setProfileTarget}
                    onRecommend={setRecommendTarget}
                    onChange={reload}
                    toast={toast}
                    initialExpanded={t.tmdb_id === justAddedId || t.tmdb_id === focusTitleId}
                    onEditToggle={onEditToggle}
                  />
                </div>
              ))}
              {listTitles.length > listPage * PAGE_SIZE && (
                <div ref={loadMoreRef} className="load-more">
                  Nog {listTitles.length - listPage * PAGE_SIZE} series — scroll om te laden…
                </div>
              )}
            </>
          )}
        </div>
        </>
      )}

      {/* Zweef-knop: zoeken, filteren én toevoegen in één. */}
      {tab === 'list' && (
        searchOpen ? (
          <ListSearchBar
            value={nameFilter}
            onChange={setNameFilter}
            onImport={() => setShowImport(true)}
            onClose={() => { setNameFilter(''); setSearchOpen(false); }}
          />
        ) : (
          <>
            {showAddHint && (
              <button className="fab-hint" onClick={() => { setShowAddHint(false); setQuickFilterOpen(false); setNameFilter(''); setSearchOpen(true); }}>
                Voeg hier jouw series toe!
              </button>
            )}
            <button className="fab-search" aria-label="Zoek of voeg toe" style={{ fontSize: 30, fontWeight: 300, lineHeight: 1 }} onClick={() => { setShowAddHint(false); setQuickFilterOpen(false); setNameFilter(''); setSearchOpen(true); }}>+</button>
          </>
        )
      )}

      {/* Terug naar boven */}
      {showScrollTop && !searchOpen && (
        <button className="scroll-top" aria-label="Terug naar boven" onClick={() => scroller()?.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
      )}

      {tab === 'dashboard' && (
        <>
          {/* Dashboard-secties als tabs, net als op de lijst (pinnen bij scrollen). */}
          <div className="status-tabs" role="tablist" aria-label="Dashboard-secties">
            {DASH_TABS.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={dashTab === s.key}
                className={dashTab === s.key ? 'sel' : ''}
                onClick={() => setDashTab(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Dashboard
            snap={snap}
            userId={userId}
            dashTab={dashTab}
            onOpenProfile={setProfileTarget}
            onAdd={addTitle}
            onGoFriends={() => setTab('friends')}
            onNavigate={navigateToList}
            onShowAllActivity={openActivity}
          />
        </>
      )}

      {tab === 'foryou' && (
        <ForYou snap={snap} userId={userId} blind={blind} onRecommend={setRecommendTarget} onAdd={addTitle} onChat={setChatTarget} onOpenProfile={setProfileTarget} onChange={reload} toast={toast} />
      )}

      {tab === 'friends' && (
        <>
          {/* Vrienden-secties als tabs, consistent met lijst en dashboard. */}
          <div className="status-tabs" role="tablist" aria-label="Vrienden-secties">
            <button role="tab" aria-selected={friendsSubTab === 'friends'} className={friendsSubTab === 'friends' ? 'sel' : ''} onClick={() => setFriendsSubTab('friends')}>Vrienden</button>
            <button role="tab" aria-selected={friendsSubTab === 'tips'} className={friendsSubTab === 'tips' ? 'sel' : ''} onClick={() => setFriendsSubTab('tips')}>Jouw tips{tipCount > 0 ? ` (${tipCount})` : ''}</button>
            <button role="tab" aria-selected={friendsSubTab === 'messages'} className={`tab-badged ${friendsSubTab === 'messages' ? 'sel' : ''}`} onClick={() => setFriendsSubTab('messages')}>
              Berichten{unreadChats > 0 && <span className="tab-dot" aria-label="ongelezen berichten" />}
            </button>
          </div>
          <Friends snap={snap} userId={userId} subTab={friendsSubTab} onOpenProfile={setProfileTarget} onRecommendTo={openRecommendTo} onOpenTitle={(id) => navigateToList({ status: 'all', titleId: id })} messages={messages} onOpenChat={setChatTarget} onChange={reload} onShare={() => setShowShare(true)} toast={toast} />
        </>
      )}

      {tab === 'profile' && (
        <Profile snap={snap} userId={userId} blind={blind} setBlindState={setBlindState} simpleMode={simpleMode} setSimpleMode={changeSimpleMode} theme={theme} setTheme={changeTheme} onChange={reload} onShare={() => setShowShare(true)} toast={toast} />
      )}

      {/* Tijdens zoeken/toevoegen verbergen we de balk: hij is dan overbodig en
          neemt ruimte weg van de zoekresultaten. */}
      {!searchOpen && <NavBar tab={tab} forYouCount={forYouCount} dashboardDot={dashboardDot} onTab={setTab} />}

      {/* Eénmalig voorstel om meldingen aan te zetten (eerste start vanaf beginscherm). */}
      {showPushAsk && (
        <Sheet title="🔔 Meldingen aanzetten?" onClose={() => answerPushAsk(false)}>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Mooi, de app staat op je beginscherm! Wil je een seintje krijgen bij nieuwe tips,
            berichten en reacties van je vrienden?
          </p>
          <button className="btn primary full" onClick={() => answerPushAsk(true)}>🔔 Zet meldingen aan</button>
          <button className="btn ghost full" style={{ marginTop: 8 }} onClick={() => answerPushAsk(false)}>Niet nu</button>
        </Sheet>
      )}

      {chatTarget && snap && (
        <ChatSheet
          snap={snap}
          userId={userId}
          withId={chatTarget}
          messages={messages}
          onRefresh={reloadMessages}
          onClose={() => setChatTarget(null)}
          toast={toast}
        />
      )}

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
          initialRecMode={profileRecMode}
          onClose={() => { setProfileTarget(null); setProfileRecMode(false); }}
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
          onChat={(id) => { setProfileTarget(null); setChatTarget(id); }}
          chatUnread={profileTarget ? unreadFrom(profileTarget) : 0}
          toast={toast}
        />
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
