import { useEffect, useMemo, useState } from 'react';
import type { Snapshot, Title, Status } from './lib/types';
import { STATUS_LABELS, STATUS_ORDER } from './lib/types';
import { getUserId, getBlind } from './lib/identity';
import { fetchState, subscribe, saveRating, createManualTitle } from './lib/api';
import {
  profileById, myRating, groupAverage, guessService, incomingRecommendations,
  visibleUserIds, followingProfiles,
} from './lib/compute';

import Onboarding from './components/Onboarding';
import SearchBox from './components/SearchBox';
import TitleCard from './components/TitleCard';
import ActivityFeed from './components/Activity';
import ForYou from './components/ForYou';
import Dashboard from './components/Dashboard';
import Friends from './components/Friends';
import ProfileView from './components/ProfileView';
import Profile from './components/Profile';
import Avatar from './components/Avatar';
import RecommendSheet from './components/RecommendSheet';
import ImportSheet from './components/ImportSheet';
import ShareSheet from './components/ShareSheet';
import ManualAddSheet from './components/ManualAddSheet';

type Tab = 'dashboard' | 'list' | 'foryou' | 'friends' | 'profile';
type Sort = 'recent' | 'oldest' | 'avg' | 'avg_asc' | 'name';

export default function App() {
  const userId = getUserId();
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

  // Filters
  const [statusFilter, setStatusFilter] = useState<Status | 'all' | 'mine'>('mine');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [genreFilter, setGenreFilter] = useState<string>('');
  const [friendFilter, setFriendFilter] = useState<string>(''); // '' = iedereen (alleen in "Alles")
  const [notSeenOnly, setNotSeenOnly] = useState(false);
  const [nameFilter, setNameFilter] = useState<string>('');
  const [sort, setSort] = useState<Sort>('recent');

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
    setStatusFilter(opts.status ?? 'mine');
    setGenreFilter(opts.genre ?? '');
    setServiceFilter(opts.service ?? '');
    setFriendFilter('');
    setNotSeenOnly(false);
    setNameFilter('');
    setSort('recent');
    setFocusTitleId(opts.titleId ?? null);
    setTab('list');
  };

  // Pagina resetten bij filterwijziging
  useEffect(() => { setListPage(1); }, [statusFilter, genreFilter, serviceFilter, sort, friendFilter, nameFilter]);
  // Vriend-filter en niet-gezien-filter alleen relevant binnen "Alles".
  useEffect(() => { if (statusFilter !== 'all') { setFriendFilter(''); setNotSeenOnly(false); } }, [statusFilter]);

  const addTitle = async (tmdbId: number) => {
    try {
      await saveRating({ tmdb_id: tmdbId, status: 'watching' });
      await reload();
      setJustAddedId(tmdbId);
      setStatusFilter('mine');
      toast('Toegevoegd aan de lijst');
    } catch (e: any) {
      toast(e.message || 'Toevoegen mislukt');
    }
  };

  const addManualTitle = async (name: string, service: string, seasons: number) => {
    try {
      const { tmdb_id } = await createManualTitle(name, service || undefined, seasons);
      await saveRating({ tmdb_id, status: 'watching', ...(service ? { service } : {}) });
      await reload();
      setJustAddedId(tmdb_id);
      setStatusFilter('mine');
      setManualAddQuery(null);
      setTab('list');
      toast('Handmatig toegevoegd');
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

  const allServices = useMemo(() => {
    if (!snap) return [];
    const set = new Set<string>();
    snap.titles.forEach((t) => t.providers.forEach((p) => set.add(p)));
    return [...set].sort();
  }, [snap]);

  const visibleTitles = useMemo(() => {
    if (!snap) return [];
    let list = [...snap.titles];

    if (statusFilter === 'mine') {
      // Mijn lijst = alleen wat jij hebt toegevoegd.
      list = list.filter((t) => myRating(snap, t.tmdb_id, userId));
    } else if (statusFilter === 'all') {
      // Alles = jouw series + die van de vrienden die je volgt; eventueel één vriend uitgelicht.
      const visible = new Set(visibleUserIds(snap, userId));
      list = list.filter((t) => snap.ratings.some((r) => r.title_id === t.tmdb_id && visible.has(r.user_id)));
      if (friendFilter) {
        list = list.filter((t) => snap.ratings.some((r) => r.title_id === t.tmdb_id && r.user_id === friendFilter));
      }
      if (notSeenOnly) {
        // Alleen series tonen die JIJ nog niet hebt afgezien én niet hebt afgehaakt.
        list = list.filter((t) => {
          const st = myRating(snap, t.tmdb_id, userId)?.status;
          return st !== 'finished' && st !== 'dropped';
        });
      }
    } else if (statusFilter === 'watching') {
      // Mee bezig = wat jij én je gevolgde vrienden kijken.
      const visible = new Set(visibleUserIds(snap, userId));
      list = list.filter((t) =>
        snap.ratings.some((r) => r.title_id === t.tmdb_id && r.status === 'watching' && visible.has(r.user_id))
      );
    } else {
      // Gekeken / Wil ik kijken / Afgehaakt = alleen jouw eigen lijst.
      list = list.filter((t) => myRating(snap, t.tmdb_id, userId)?.status === statusFilter);
    }
    if (genreFilter) list = list.filter((t) => t.genres.includes(genreFilter));
    if (serviceFilter) {
      list = list.filter((t) => {
        const svc = guessService(t, me, myRating(snap, t.tmdb_id, userId)?.service || null);
        return t.providers.includes(serviceFilter) || svc === serviceFilter;
      });
    }
    if (nameFilter.length >= 2) {
      const q = nameFilter.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }

    // Cijfer waarop gesorteerd wordt: in "Alles" het groepsgemiddelde, anders je eigen cijfer.
    const scoreOf = (tmdbId: number): number | null =>
      statusFilter === 'all' ? groupAverage(snap, tmdbId) : (myRating(snap, tmdbId, userId)?.score ?? null);

    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'avg') return (scoreOf(b.tmdb_id) ?? 0) - (scoreOf(a.tmdb_id) ?? 0);
      if (sort === 'avg_asc') return (scoreOf(a.tmdb_id) ?? 99) - (scoreOf(b.tmdb_id) ?? 99);
      const isAll = statusFilter === 'all';
      const tsA = isAll ? a.created_at : (myRating(snap, a.tmdb_id, userId)?.updated_at ?? a.created_at);
      const tsB = isAll ? b.created_at : (myRating(snap, b.tmdb_id, userId)?.updated_at ?? b.created_at);
      return sort === 'oldest' ? tsA - tsB : tsB - tsA;
    });
    return list;
  }, [snap, statusFilter, genreFilter, serviceFilter, friendFilter, notSeenOnly, nameFilter, sort, userId, me]);

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

      {tab === 'list' && (
        <div className="page">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <SearchBox onPick={(r) => addTitle(r.tmdb_id)} onManualAdd={(q) => setManualAddQuery(q)} placeholder="Voeg een serie toe…" />
            </div>
            <button className="btn ghost" style={{ padding: '10px 12px', flexShrink: 0 }} onClick={() => setShowImport(true)} title="Hele lijst importeren">
              📋
            </button>
          </div>

          {/* Filters */}
          <div className="filters" style={{ marginTop: 12 }}>
            <button className={statusFilter === 'all' ? 'sel' : ''} onClick={() => setStatusFilter('all')}>Alles</button>
            <button className={statusFilter === 'mine' ? 'sel' : ''} onClick={() => setStatusFilter('mine')}>Mijn lijst</button>
            {STATUS_ORDER.map((s) => (
              <button key={s} className={statusFilter === s ? 'sel' : ''} onClick={() => setStatusFilter(s)}>{STATUS_LABELS[s]}</button>
            ))}
          </div>

          {/* Binnen "Alles": uitlichten van één vriend (of jezelf), met foto + gezien-filter. */}
          {statusFilter === 'all' && (
            <>
              <div className="friend-filter">
                <button className={friendFilter === '' ? 'sel' : ''} onClick={() => setFriendFilter('')}>
                  <span className="ff-icon">👥</span>Iedereen
                </button>
                <button className={friendFilter === userId ? 'sel' : ''} onClick={() => setFriendFilter(userId)}>
                  <Avatar profile={me} id={userId} size="sm" />Jij
                </button>
                {followingProfiles(snap, userId).map((p) => (
                  <button key={p.id} className={friendFilter === p.id ? 'sel' : ''} onClick={() => setFriendFilter(p.id)}>
                    <Avatar profile={p} id={p.id} size="sm" />{p.name}
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: 8 }}>
                <button
                  className="btn ghost"
                  style={{
                    fontSize: 13, padding: '5px 12px', borderRadius: 999,
                    ...(notSeenOnly ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}),
                  }}
                  onClick={() => setNotSeenOnly((v) => !v)}
                >
                  Nog niet gezien
                </button>
              </div>
            </>
          )}

          <input
            placeholder="Zoek op naam…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              <option value="">Alle diensten</option>
              {allServices.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
              <option value="">Alle genres</option>
              {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">Nieuwste</option>
              <option value="oldest">Oudste</option>
              <option value="avg">Hoogste cijfer</option>
              <option value="avg_asc">Laagste cijfer</option>
              <option value="name">A–Z</option>
            </select>
          </div>

          {visibleTitles.length === 0 ? (
            <div className="empty">
              <div className="big">🛋️</div>
              <p>Nog niets op de lijst.</p>
              <p className="muted">Zoek hierboven een serie of importeer je hele lijst in één keer.</p>
            </div>
          ) : (
            <>
              {visibleTitles.slice(0, listPage * PAGE_SIZE).map((t) => (
                <TitleCard
                  key={t.tmdb_id}
                  snap={snap}
                  title={t}
                  userId={userId}
                  blind={blind}
                  showGroupScore={statusFilter === 'all'}
                  onRecommend={setRecommendTarget}
                  onChange={reload}
                  toast={toast}
                  initialExpanded={t.tmdb_id === justAddedId || t.tmdb_id === focusTitleId}
                />
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
