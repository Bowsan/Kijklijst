import { useEffect, useMemo, useState } from 'react';
import type { Snapshot, Title, Status } from './lib/types';
import { STATUS_LABELS, STATUS_ORDER } from './lib/types';
import { getUserId, getBlind } from './lib/identity';
import { fetchState, subscribe, saveRating, createManualTitle } from './lib/api';
import {
  profileById, myRating, groupAverage, guessService, incomingRecommendations,
  visibleUserIds,
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
import RecommendSheet from './components/RecommendSheet';
import ImportSheet from './components/ImportSheet';
import ShareSheet from './components/ShareSheet';
import ManualAddSheet from './components/ManualAddSheet';

type Tab = 'dashboard' | 'list' | 'foryou' | 'friends' | 'profile';
type Sort = 'recent' | 'avg' | 'name';

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
  const [sort, setSort] = useState<Sort>('recent');

  // Paginering
  const PAGE_SIZE = 20;
  const [listPage, setListPage] = useState(1);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

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

  // Pagina resetten bij filterwijziging
  useEffect(() => { setListPage(1); }, [statusFilter, genreFilter, serviceFilter, sort]);

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

  const addManualTitle = async (name: string, service: string) => {
    try {
      const { tmdb_id } = await createManualTitle(name, service || undefined);
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
      list = list.filter((t) => myRating(snap, t.tmdb_id, userId));
    } else if (statusFilter === 'all') {
      // "Alles" = jouw series + die van de vrienden die je volgt.
      const visible = new Set(visibleUserIds(snap, userId));
      list = list.filter((t) => snap.ratings.some((r) => r.title_id === t.tmdb_id && visible.has(r.user_id)));
    } else {
      list = list.filter((t) =>
        snap.ratings.some((r) => r.title_id === t.tmdb_id && r.status === statusFilter)
      );
    }
    if (genreFilter) list = list.filter((t) => t.genres.includes(genreFilter));
    if (serviceFilter) {
      list = list.filter((t) => {
        const svc = guessService(t, me, myRating(snap, t.tmdb_id, userId)?.service || null);
        return t.providers.includes(serviceFilter) || svc === serviceFilter;
      });
    }

    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'avg') return (groupAverage(snap, b.tmdb_id) ?? 0) - (groupAverage(snap, a.tmdb_id) ?? 0);
      return b.created_at - a.created_at;
    });
    return list;
  }, [snap, statusFilter, genreFilter, serviceFilter, sort, userId, me]);

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
              <option value="avg">Hoogste cijfer</option>
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
                  initialExpanded={t.tmdb_id === justAddedId}
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
