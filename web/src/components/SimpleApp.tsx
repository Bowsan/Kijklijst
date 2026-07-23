import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Snapshot, Title, Rating, SearchResult } from '../lib/types';
import { posterUrl } from '../lib/types';
import { saveRating, searchTmdb, saveProfile } from '../lib/api';
import { watchingTitles, followingProfiles, profileById } from '../lib/compute';
import PosterFallback from './PosterFallback';
import Avatar from './Avatar';
import FriendsIcon from './FriendsIcon';

interface Props {
  snap: Snapshot;
  userId: string;
  online: boolean;
  onChange: () => void;
  toast: (m: string) => void;
  setSimpleMode: (v: boolean) => void;
}

/** Simpele modus: een kaal kijklijstje ("Ik kijk") en wat je vrienden kijken
 *  ("De rest"). Geen cijfers, tips of statistieken — bewust minimaal. */
export default function SimpleApp({ snap, userId, online, onChange, toast, setSimpleMode }: Props) {
  const [tab, setTab] = useState<'ikkijk' | 'derest'>('ikkijk');
  const [showSettings, setShowSettings] = useState(false);

  // Mijn lijst opgesplitst in "aan het kijken" en "gezien".
  const mine = useMemo(() => {
    const rows = snap.ratings
      .filter((r) => r.user_id === userId && (r.status === 'watching' || r.status === 'finished'))
      .map((r) => ({ rating: r, title: snap.titles.find((t) => t.tmdb_id === r.title_id) }))
      .filter((x): x is { rating: Rating; title: Title } => x.title != null)
      .sort((a, b) => (b.rating.created_at ?? b.rating.updated_at) - (a.rating.created_at ?? a.rating.updated_at));
    return {
      watching: rows.filter((x) => x.rating.status === 'watching'),
      seen: rows.filter((x) => x.rating.status === 'finished'),
    };
  }, [snap, userId]);

  return (
    <div className="app sm-app">
      <header className="topbar">
        <h1><img className="logo-img" src="/icons/logo-bank.png" alt="" /> Op de Bank</h1>
        <button className="topbar-item sm-gear" aria-label="Instellingen" onClick={() => setShowSettings(true)}>⚙️</button>
      </header>

      {!online && <div className="offline-banner">Geen verbinding — wijzigingen worden bewaard zodra je weer online bent.</div>}

      <div className="page sm-page">
        {tab === 'ikkijk'
          ? <IkKijk watching={mine.watching} seen={mine.seen} onChange={onChange} toast={toast} />
          : <DeRest snap={snap} userId={userId} />}
      </div>

      <nav className="nav sm-nav">
        <button className={tab === 'ikkijk' ? 'active' : ''} onClick={() => setTab('ikkijk')}>
          <span className="ico">📺</span>Ik kijk
        </button>
        <button className={tab === 'derest' ? 'active' : ''} onClick={() => setTab('derest')}>
          <span className="ico"><FriendsIcon size={25} /></span>De rest
        </button>
      </nav>

      {showSettings && (
        <Settings snap={snap} userId={userId} onClose={() => setShowSettings(false)} onChange={onChange} setSimpleMode={setSimpleMode} toast={toast} />
      )}
    </div>
  );
}

/** "Ik kijk" — toevoegen, aan het kijken, gezien. */
function IkKijk({ watching, seen, onChange, toast }: {
  watching: { rating: Rating; title: Title }[];
  seen: { rating: Rating; title: Title }[];
  onChange: () => void;
  toast: (m: string) => void;
}) {
  return (
    <div className="sm-list-wrap">
      <AddSeries watchingIds={new Set(watching.map((x) => x.title.tmdb_id))} onChange={onChange} toast={toast} />

      <div className="sm-label">Aan het kijken</div>
      <div className="sm-list">
        {watching.length === 0
          ? <EmptyBlock icon="📺" title="Nog niets op je lijst" sub="Tik op ‘Serie toevoegen’ om de serie die je nu kijkt toe te voegen." />
          : watching.map((x) => <SimpleRow key={x.title.tmdb_id} title={x.title} rating={x.rating} done={false} onChange={onChange} toast={toast} />)}
      </div>

      {seen.length > 0 && (
        <>
          <div className="sm-label">Gezien</div>
          <div className="sm-list">
            {seen.map((x) => <SimpleRow key={x.title.tmdb_id} title={x.title} rating={x.rating} done onChange={onChange} toast={toast} />)}
          </div>
        </>
      )}
    </div>
  );
}

/** Eén serie-regel: poster, titel, notitieregeltje en één tik kijk↔gezien. */
function SimpleRow({ title, rating, done, onChange, toast }: {
  title: Title;
  rating: Rating;
  done: boolean;
  onChange: () => void;
  toast: (m: string) => void;
}) {
  const [note, setNote] = useState(rating.watch_note ?? '');

  const saveNote = async () => {
    const v = note.trim();
    if (v === (rating.watch_note ?? '')) return;
    try { await saveRating({ tmdb_id: title.tmdb_id, watchNote: v }); onChange(); }
    catch { toast('Notitie opslaan lukte niet'); }
  };

  const toggleDone = async () => {
    try {
      await saveRating({ tmdb_id: title.tmdb_id, status: done ? 'watching' : 'finished' });
      onChange();
      toast(done ? 'Terug naar Aan het kijken' : 'Verplaatst naar Gezien');
    } catch { toast('Wijzigen lukte niet'); }
  };

  return (
    <div className={`sm-row${done ? ' done' : ''}`}>
      {title.poster_path
        ? <img className="poster sm-poster" src={posterUrl(title.poster_path, 'small')} alt="" loading="lazy" />
        : <PosterFallback name={title.name} width={46} height={66} />}
      <div className="sm-row-main">
        <div className="sm-row-title">{title.name}</div>
        <input
          className="sm-note"
          value={note}
          placeholder="+ notitie"
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          maxLength={120}
          aria-label={`Notitie bij ${title.name}`}
        />
      </div>
      <button
        className="sm-check"
        onClick={toggleDone}
        aria-label={done ? 'Terug naar aan het kijken' : 'Markeer als gezien'}
        title={done ? 'Terug naar aan het kijken' : 'Markeer als gezien'}
      >✓</button>
    </div>
  );
}

/** Zoek-en-voeg-toe: verschijnt onder een "+ Serie toevoegen"-balk. */
function AddSeries({ watchingIds, onChange, toast }: {
  watchingIds: Set<number>;
  onChange: () => void;
  toast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try { setResults(await searchTmdb(q, ctrl.signal)); }
      catch { /* afgebroken of mislukt — laat de vorige resultaten staan */ }
      finally { setBusy(false); }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const add = async (r: SearchResult) => {
    try {
      await saveRating({ tmdb_id: r.tmdb_id, status: 'watching' });
      setQ(''); setResults([]); setOpen(false);
      onChange();
      toast(`${r.name} toegevoegd`);
    } catch { toast('Toevoegen lukte niet'); }
  };

  if (!open) {
    return (
      <button className="sm-addbar" onClick={() => setOpen(true)}>
        <span className="sm-plus">+</span> Serie toevoegen
      </button>
    );
  }

  return (
    <div className="sm-add">
      <div className="sm-add-head">
        <input
          className="sm-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek een serie…"
          autoFocus
          aria-label="Zoek een serie"
        />
        <button className="sm-add-close" onClick={() => { setOpen(false); setQ(''); setResults([]); }} aria-label="Sluiten">✕</button>
      </div>
      {busy && <p className="sm-empty">Zoeken…</p>}
      {!busy && q.trim() && results.length === 0 && <p className="sm-empty">Niets gevonden voor “{q}”.</p>}
      <div className="sm-results">
        {results.map((r) => (
          <button key={r.tmdb_id} className="sm-result" onClick={() => add(r)} disabled={watchingIds.has(r.tmdb_id)}>
            {r.poster_path
              ? <img className="poster sm-poster" src={posterUrl(r.poster_path, 'small')} alt="" loading="lazy" />
              : <PosterFallback name={r.name} width={40} height={58} />}
            <span className="sm-result-main">
              <span className="sm-row-title">{r.name}</span>
              <span className="sm-result-sub">{r.year || '—'}</span>
            </span>
            <span className="sm-result-add">{watchingIds.has(r.tmdb_id) ? '✓' : '+'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** "De rest" — alleen vrienden die je volgt, en wat zij nu kijken. */
function DeRest({ snap, userId }: { snap: Snapshot; userId: string }) {
  // Alles op mijn eigen lijst (aan het kijken óf gezien) — voor de "ook op jouw lijst"-hint.
  const myList = useMemo(
    () => new Set(
      snap.ratings
        .filter((r) => r.user_id === userId && (r.status === 'watching' || r.status === 'finished'))
        .map((r) => r.title_id),
    ),
    [snap, userId],
  );
  const friends = useMemo(() => {
    return followingProfiles(snap, userId)
      .map((p) => ({ profile: p, titles: watchingTitles(snap, p.id) }))
      .filter((f) => f.titles.length > 0);
  }, [snap, userId]);

  if (friends.length === 0) {
    return (
      <div className="sm-list-wrap">
        <div className="sm-label">Wat je vrienden kijken</div>
        <EmptyBlock icon={<FriendsIcon size={40} />} title="Nog niemand aan het kijken" sub="Niemand die je volgt kijkt nu iets — zodra ze iets starten, zie je het hier." />
      </div>
    );
  }

  return (
    <div className="sm-list-wrap">
      <div className="sm-label">Wat je vrienden kijken</div>
      <div className="sm-list">
        {friends.map(({ profile, titles }) => (
          <div className="sm-friend" key={profile.id}>
            <div className="sm-friend-head">
              <Avatar profile={profile} size="sm" />
              <div>
                <div className="sm-friend-name">{profile.name}</div>
                <div className="sm-friend-sub">kijkt {titles.length} {titles.length === 1 ? 'serie' : 'series'}</div>
              </div>
            </div>
            {titles.map((t) => (
              <div className="sm-watchline" key={t.tmdb_id}>
                <span className="sm-wt">{t.name}</span>
                {myList.has(t.tmdb_id) && <span className="sm-same">· ook op jouw lijst</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vriendelijke lege staat met icoon en uitleg. */
function EmptyBlock({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="sm-emptyblock">
      <div className="sm-empty-ico" aria-hidden="true">{icon}</div>
      <div className="sm-empty-title">{title}</div>
      {sub && <div className="sm-empty-sub">{sub}</div>}
    </div>
  );
}

/** Instellingen: je naam wijzigen en de schakelaar terug naar de volledige app. */
function Settings({ snap, userId, onClose, onChange, setSimpleMode, toast }: {
  snap: Snapshot;
  userId: string;
  onClose: () => void;
  onChange: () => void;
  setSimpleMode: (v: boolean) => void;
  toast: (m: string) => void;
}) {
  const current = profileById(snap, userId)?.name ?? '';
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);

  const saveName = async () => {
    const v = name.trim();
    if (!v || v === current) return;
    setSaving(true);
    try { await saveProfile({ name: v }); onChange(); toast('Naam opgeslagen'); }
    catch { toast('Naam opslaan lukte niet'); }
    finally { setSaving(false); }
  };

  const turnOff = () => {
    setSimpleMode(false);
    toast('Volledige app aangezet');
  };

  return (
    <div className="sm-sheet-backdrop" onClick={onClose}>
      <div className="sm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Instellingen">
        <div className="sm-sheet-head">
          <h2>Instellingen</h2>
          <button className="sm-add-close" onClick={onClose} aria-label="Sluiten">✕</button>
        </div>

        <div className="sm-setrow sm-setrow-col">
          <b>Je naam</b>
          <div className="sm-name-edit">
            <input
              className="sm-search"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hoe heet je?"
              maxLength={40}
              aria-label="Je naam"
            />
            <button className="btn primary" onClick={saveName} disabled={saving || !name.trim() || name.trim() === current}>
              Opslaan
            </button>
          </div>
        </div>

        <div className="sm-setrow">
          <div className="sm-set-txt">
            <b>Simpele modus</b>
            <span>Alleen je kijklijst en wat vrienden kijken. Zet uit voor cijfers, tips en statistieken.</span>
          </div>
          <button className="switch on" role="switch" aria-checked="true" aria-label="Simpele modus" onClick={turnOff}>
            <span className="knob" />
          </button>
        </div>
      </div>
    </div>
  );
}
