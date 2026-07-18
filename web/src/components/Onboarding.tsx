import { useEffect, useState } from 'react';
import type { Snapshot, Title, Profile } from '../lib/types';
import { saveProfile, identify, fetchState, followUser, enablePush } from '../lib/api';
import { setUserId, getUserId, setOnboarded } from '../lib/identity';
import { MIN_RATINGS_FOR_PROFILE } from '../lib/compute';
import { isStandalone } from '../lib/install';
import Avatar from './Avatar';
import TitleCard from './TitleCard';

// Onboarding in korte stappen: naam → vrienden volgen → een eerste stap met je
// collectie (10 bekendste series, gewone lijstkaartjes) → meldingen (alleen als
// de app al op het beginscherm staat). Alles na de naam is overslaanbaar.

type Step = 'name' | 'friends' | 'rate' | 'push';

export default function Onboarding({ existing = false, onDone }: {
  /** Bestaande gebruiker (naam bekend): sla de naam/vrienden-stappen over. */
  existing?: boolean;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  // Vaste selectie voor de cijfer-stap, zodat kaarten niet verspringen na een actie.
  const [rateIds, setRateIds] = useState<number[]>([]);

  // Klaar: vlag zetten zodat de onboarding niet nogmaals verschijnt.
  const finish = () => {
    setOnboarded();
    onDone();
  };
  // Na de laatste inhoudelijke stap: meldingen voorstellen als de app al als
  // geïnstalleerde app draait, anders klaar (de beginscherm-tip staat in Profiel).
  const finishOrPush = () => (isStandalone() ? setStep('push') : finish());

  const enterRate = (s: Snapshot) => {
    const ids = popularTitles(s).map((t) => t.tmdb_id);
    if (ids.length === 0) return finishOrPush();
    setRateIds(ids);
    setStep('rate');
  };

  // Bestaande gebruiker: direct naar de collectie-stap.
  useEffect(() => {
    if (!existing) return;
    fetchState()
      .then((s) => { setSnap(s); enterRate(s); })
      .catch(finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

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
      else if (s) enterRate(s);
      else finish();
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

  // De 10 meest beoordeelde series van de app die je zelf nog geen cijfer gaf.
  function popularTitles(s: Snapshot): Title[] {
    const me = getUserId();
    const myScored = new Set(s.ratings.filter((r) => r.user_id === me && r.score != null).map((r) => r.title_id));
    const counts = new Map<number, number>();
    for (const r of s.ratings) {
      if (r.score != null) counts.set(r.title_id, (counts.get(r.title_id) || 0) + 1);
    }
    return s.titles
      .filter((t) => !myScored.has(t.tmdb_id))
      .sort((a, b) => (counts.get(b.tmdb_id) || 0) - (counts.get(a.tmdb_id) || 0))
      .slice(0, 10);
  }

  const toggleFollow = async (p: Profile) => {
    if (followed.has(p.id)) return; // ontvolgen kan later gewoon in de app
    try {
      await followUser(p.id);
      setFollowed((prev) => new Set(prev).add(p.id));
    } catch { /* stil laten — geen blocker in onboarding */ }
  };

  // Kaart-acties verversen de snapshot, zodat status en cijfer meteen kloppen.
  const refresh = async () => {
    try { setSnap(await fetchState()); } catch { /* volgende actie probeert opnieuw */ }
  };

  const [pushState, setPushState] = useState<'idle' | 'busy' | 'on' | 'failed'>('idle');
  const doPush = async () => {
    setPushState('busy');
    try {
      const ok = await enablePush();
      setPushState(ok ? 'on' : 'failed');
      if (ok) setTimeout(finish, 900);
    } catch {
      setPushState('failed');
    }
  };

  const others = snap ? followableProfiles(snap) : [];

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
          onClick={() => (snap ? enterRate(snap) : finishOrPush())}
        >
          {followed.size > 0 ? 'Verder' : 'Overslaan'}
        </button>
      </div>
    );
  }

  if (step === 'rate' && snap) {
    const me = getUserId();
    const titles = rateIds
      .map((id) => snap.titles.find((t) => t.tmdb_id === id))
      .filter((t): t is Title => t != null);
    // Voortgang: hoeveel van deze series heb je iets gegeven (status of cijfer)?
    const done = rateIds.filter((id) => snap.ratings.some((r) => r.title_id === id && r.user_id === me && (r.status || r.score != null))).length;
    return (
      <div className="onboard onboard-top">
        <div className="hero compact">
          <div className="big">⭐</div>
          <h1>Zet een eerste stap met je collectie</h1>
          <p className="muted">
            Tik op een serie om 'm te beoordelen of op je Wishlist te zetten.
            Vanaf {MIN_RATINGS_FOR_PROFILE} cijfers krijg je handige tips!
            {done > 0 && <> Al <b>{done}</b> gedaan!</>}
          </p>
        </div>
        {/* Knop boven de lijst, zodat overslaan/klaar altijd boven de vouw staat. */}
        <button className="btn primary full" onClick={finishOrPush}>
          {done > 0 ? 'Verder' : 'Overslaan'}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {titles.map((t) => (
            <TitleCard
              key={t.tmdb_id}
              snap={snap}
              title={t}
              userId={me}
              blind={false}
              onRecommend={() => {}}
              onChange={refresh}
              toast={() => {}}
            />
          ))}
        </div>
      </div>
    );
  }

  if (step === 'push') {
    return (
      <div className="onboard">
        <div className="hero">
          <div className="big">🔔</div>
          <h1>Meldingen aanzetten?</h1>
          <p className="muted">
            Krijg een seintje bij nieuwe tips, berichten en reacties van je vrienden. Niet vaker dan nodig.
          </p>
        </div>
        {pushState === 'on' ? (
          <p className="center" style={{ color: 'var(--good)', fontWeight: 600 }}>✓ Meldingen staan aan!</p>
        ) : (
          <>
            <button className="btn primary full" disabled={pushState === 'busy'} onClick={doPush}>
              🔔 Zet meldingen aan
            </button>
            {pushState === 'failed' && (
              <p className="muted center" style={{ fontSize: 13 }}>
                Dat lukte niet — je kunt het later nog eens proberen via je profiel.
              </p>
            )}
            <button className="btn ghost full" style={{ marginTop: 4 }} onClick={finish}>Niet nu</button>
          </>
        )}
      </div>
    );
  }

  // Bestaande gebruiker die nog laadt: korte leegte i.p.v. de naam-stap.
  if (existing) return <div className="onboard" />;

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
