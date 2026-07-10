import { useMemo, useState } from 'react';
import type { Snapshot, Title, Profile } from '../lib/types';
import { posterUrl } from '../lib/types';
import { saveProfile, identify, fetchState, followUser, saveRating } from '../lib/api';
import { setUserId, getUserId } from '../lib/identity';
import { MIN_RATINGS_FOR_PROFILE } from '../lib/compute';
import Avatar from './Avatar';

// Onboarding in drie korte stappen: naam → vrienden volgen → een paar cijfers.
// De laatste twee stappen zijn overslaanbaar; doel is dat een nieuwe gebruiker
// meteen een gevulde app én werkende tips heeft.

type Step = 'name' | 'friends' | 'rate';

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [rated, setRated] = useState<Map<number, number>>(new Map());

  const start = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Bestaat er al iemand met deze naam? Dan dat account overnemen
      // (bijv. dezelfde persoon op een tweede apparaat), anders een nieuw aanmaken.
      const { id } = await identify(name.trim());
      if (id) {
        setUserId(id);
      } else {
        await saveProfile({ name: name.trim() });
      }
      const s = await fetchState().catch(() => null);
      setSnap(s);
      const others = s ? followableProfiles(s) : [];
      if (others.length > 0) setStep('friends');
      else if (s && popularTitles(s).length > 0) setStep('rate');
      else onDone();
    } catch {
      /* naam-stap opnieuw proberen */
    } finally {
      setBusy(false);
    }
  };

  // Andere niet-verborgen accounts die je nog niet volgt.
  function followableProfiles(s: Snapshot): Profile[] {
    const me = getUserId();
    const following = new Set(s.follows.filter((f) => f.follower === me).map((f) => f.followee));
    return s.profiles.filter((p) => p.id !== me && !p.hidden && !following.has(p.id));
  }

  // De bekendste series in de groep (meeste beoordelaars) om snel te cijferen.
  function popularTitles(s: Snapshot): Title[] {
    const me = getUserId();
    const myRated = new Set(s.ratings.filter((r) => r.user_id === me && r.score != null).map((r) => r.title_id));
    const counts = new Map<number, number>();
    for (const r of s.ratings) counts.set(r.title_id, (counts.get(r.title_id) || 0) + 1);
    return s.titles
      .filter((t) => !myRated.has(t.tmdb_id))
      .sort((a, b) => (counts.get(b.tmdb_id) || 0) - (counts.get(a.tmdb_id) || 0))
      .slice(0, 8);
  }

  const toggleFollow = async (p: Profile) => {
    if (followed.has(p.id)) return; // ontvolgen kan later gewoon in de app
    try {
      await followUser(p.id);
      setFollowed((prev) => new Set(prev).add(p.id));
    } catch { /* stil laten — geen blocker in onboarding */ }
  };

  const quickRate = async (t: Title, score: number) => {
    try {
      // Alleen het cijfer — de status ("Gezien" etc.) kiest de gebruiker zelf.
      await saveRating({ tmdb_id: t.tmdb_id, score });
      setRated((prev) => new Map(prev).set(t.tmdb_id, score));
    } catch { /* stil laten */ }
  };

  const others = snap ? followableProfiles(snap) : [];
  const rateTitles = useMemo(() => (snap ? popularTitles(snap) : []), [snap]);

  if (step === 'friends') {
    return (
      <div className="onboard">
        <div className="hero">
          <div className="big">👥</div>
          <h1>Wie wil je volgen?</h1>
          <p className="muted">Van de vrienden die je volgt zie je de lijsten, cijfers en tips.</p>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {others.map((p) => (
            <div className="row spread" key={p.id} style={{ padding: '6px 0' }}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar profile={p} size="sm" />
                <span>{p.name}</span>
              </div>
              {followed.has(p.id)
                ? <span className="muted" style={{ fontSize: 13 }}>✓ Je volgt {p.name.split(' ')[0]}</span>
                : <button className="btn primary" style={{ padding: '4px 12px' }} onClick={() => toggleFollow(p)}>+ Volgen</button>}
            </div>
          ))}
        </div>
        <button
          className="btn primary full"
          onClick={() => (rateTitles.length > 0 ? setStep('rate') : onDone())}
        >
          {followed.size > 0 ? 'Verder' : 'Overslaan'}
        </button>
      </div>
    );
  }

  if (step === 'rate') {
    const done = rated.size;
    return (
      <div className="onboard onboard-top">
        <div className="hero compact">
          <div className="big">⭐</div>
          <h1>Ken je deze series?</h1>
          <p className="muted">
            Geef er een paar een cijfer — vanaf {MIN_RATINGS_FOR_PROFILE} cijfers krijg je persoonlijke tips.
            {done > 0 && <> Al <b>{done}</b> gedaan!</>}
          </p>
        </div>
        {/* Knop boven de lijst, zodat overslaan/klaar altijd boven de vouw staat. */}
        <button className="btn primary full" onClick={onDone}>
          {done > 0 ? 'Klaar — naar de app' : 'Overslaan'}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rateTitles.map((t) => (
            <div className="card" key={t.tmdb_id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10 }}>
              {t.poster_path
                ? <img src={posterUrl(t.poster_path, 'small')} alt="" style={{ width: 44, height: 66, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                : <div className="poster" style={{ width: 44, height: 66 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                {rated.has(t.tmdb_id) ? (
                  <div style={{ fontSize: 13, color: 'var(--good)', marginTop: 4 }}>✓ Je gaf een {rated.get(t.tmdb_id)}</div>
                ) : (
                  <div className="row" style={{ gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                    {[6, 7, 8, 9, 10].map((n) => (
                      <button key={n} className="quick-score" onClick={() => quickRate(t, n)}>{n}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div className="hero">
        <div className="big">🛋️</div>
        <h1>Op de Bank</h1>
        <p className="muted">Een gedeelde kijklijst voor series, samen met je vrienden.</p>
      </div>
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          placeholder="Hoe heet je?"
          autoFocus
        />
        <button className="btn primary full" style={{ marginTop: 12 }} disabled={busy || !name.trim()} onClick={start}>
          Beginnen
        </button>
        <p className="muted center" style={{ fontSize: 12, marginTop: 16 }}>
          Geen account nodig. Je naam laat de groep zien wie wat vindt. Een foto kun je later toevoegen.
        </p>
      </div>
    </div>
  );
}
