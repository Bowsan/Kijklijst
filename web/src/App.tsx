import { useEffect, useMemo, useState } from 'react';
import type { Snapshot, Title, Status } from './lib/types';
import { STATUS_LABELS, STATUS_ORDER } from './lib/types';
import { getUserId, getBlind } from './lib/identity';
import { fetchState, subscribe, saveRating } from './lib/api';
import {
  profileById, myRating, groupAverage, guessService, incomingRecommendations,
} from './lib/compute';

import Onboarding from './components/Onboarding';
import SearchBox from './components/SearchBox';
import TitleCard from './components/TitleCard';
import ActivityFeed from './components/Activity';
import ForYou from './components/ForYou';
import Stats from './components/Stats';
import Profile from './components/Profile';
import RecommendSheet from './components/RecommendSheet';
import ImportSheet from './components/ImportSheet';
import ShareSheet from './components/ShareSheet';

type Tab = 'list' | 'foryou' | 'stats' | 'profile';
type Sort = 'recent' | 'avg' | 'name';

export default function App() {
  const userId = getUserId();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>('list');
  const [blind, setBlindState] = useState(getBlind());
  const [recommendTarget, setRecommendTarget] = useState<Title | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showActivity, setShowActivity] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<Status | 'all' | 'mine'>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [genreFilter, setGenreFilter] = useState<string>('');
  const [sort, setSort] = useState<Sort>('recent');

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

  const addTitle = async (tmdbId: number) => {
    try {
      await saveRating({ tmdb_id: tmdbId, status: 'watching' });
      await reload();
      toast('Toegevoegd aan de lijst');
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
    } else if (statusFilter !== 'all') {
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
        <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={() => setShowActivity((v) => !v)}>
          🔔
        </button>
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
              <SearchBox onPick={(r) => addTitle(r.tmdb_id)} placeholder="Voeg een serie toe…" />
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
            visibleTitles.map((t) => (
              <TitleCard
                key={t.tmdb_id}
                snap={snap}
                title={t}
                userId={userId}
                blind={blind}
                onRecommend={setRecommendTarget}
                onChange={reload}
                toast={toast}
              />
            ))
          )}
        </div>
      )}

      {tab === 'foryou' && (
        <ForYou snap={snap} userId={userId} blind={blind} onRecommend={setRecommendTarget} onChange={reload} toast={toast} />
      )}

      {tab === 'stats' && <Stats snap={snap} userId={userId} />}

      {tab === 'profile' && (
        <Profile snap={snap} userId={userId} blind={blind} setBlindState={setBlindState} onChange={reload} onShare={() => setShowShare(true)} toast={toast} />
      )}

      {/* Onderste navigatie */}
      <nav className="nav">
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
          <span className="ico">🛋️</span>Lijst
        </button>
        <button className={tab === 'foryou' ? 'active' : ''} onClick={() => setTab('foryou')}>
          <span className="ico">✨</span>Voor jou
          {forYouCount > 0 && <span className="badge">{forYouCount}</span>}
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <span className="ico">📊</span>Statistieken
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

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
