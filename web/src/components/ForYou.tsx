import type { Snapshot, Title } from '../lib/types';
import {
  ratedCount, tasteProfile, tasteMates, computedRecommendations,
  incomingRecommendations, MIN_RATINGS_FOR_PROFILE,
} from '../lib/compute';
import { dismissRecommendation } from '../lib/api';
import TitleCard from './TitleCard';
import Avatar from './Avatar';

interface Props {
  snap: Snapshot;
  userId: string;
  blind: boolean;
  onRecommend: (t: Title) => void;
  onChange: () => void;
  toast: (m: string) => void;
}

export default function ForYou({ snap, userId, blind, onRecommend, onChange, toast }: Props) {
  const count = ratedCount(snap, userId);
  const incoming = incomingRecommendations(snap, userId);
  const ready = count >= MIN_RATINGS_FOR_PROFILE;
  const profile = ready ? tasteProfile(snap, userId).slice(0, 4) : [];
  const mates = ready ? tasteMates(snap, userId).slice(0, 5) : [];
  const computed = ready ? computedRecommendations(snap, userId) : [];

  return (
    <div className="page">
      {/* Persoonlijke aanraders van vrienden — altijd, ook onder de 5 */}
      {incoming.length > 0 && (
        <>
          <h2>Voor jou aangeraden</h2>
          {incoming.map(({ rec, from, title }) => (
            <div key={rec.id}>
              <div className="pill-recommend row spread">
                <span><b>{from?.name || 'Iemand'}</b> raadt jou aan{rec.note ? `: "${rec.note}"` : ''}</span>
                <button className="btn ghost" style={{ padding: '4px 8px' }} onClick={async () => { await dismissRecommendation(rec.id); onChange(); }}>✕</button>
              </div>
              <TitleCard snap={snap} title={title!} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
            </div>
          ))}
        </>
      )}

      {!ready && (
        <div className="empty">
          <div className="big">⭐</div>
          <p>Je hebt <b>{count}</b> van de {MIN_RATINGS_FOR_PROFILE} series beoordeeld.</p>
          <p className="muted">Geef nog {MIN_RATINGS_FOR_PROFILE - count} cijfer{MIN_RATINGS_FOR_PROFILE - count === 1 ? '' : 's'} en je smaakprofiel, smaakgenoten en persoonlijke tips gaan vanzelf branden.</p>
        </div>
      )}

      {ready && (
        <>
          {/* Smaakprofiel */}
          {profile.length > 0 && (
            <>
              <h2>Jouw smaak</h2>
              <div className="card">
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Je zit het hoogst op:</p>
                <div className="genres">
                  {profile.map((g) => (
                    <span className="chip" key={g.genre} style={{ borderColor: 'var(--accent)' }}>
                      {g.genre} · {g.avg.toFixed(1)}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Smaakgenoten */}
          {mates.length > 0 && (
            <>
              <h2>Smaakgenoten</h2>
              <div className="card">
                {mates.map((m) => (
                  <div className="row spread" key={m.profile.id} style={{ padding: '6px 0' }}>
                    <div className="row">
                      <Avatar profile={m.profile} size="sm" />
                      <span>{m.profile.name}</span>
                    </div>
                    <div className="row">
                      <span className="muted" style={{ fontSize: 12 }}>{m.shared} gedeeld</span>
                      <b style={{ color: 'var(--accent)' }}>{m.match}%</b>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Berekende aanraders */}
          {computed.length > 0 && (
            <>
              <h2>Misschien iets voor jou</h2>
              {computed.map(({ title }) => (
                <TitleCard key={title.tmdb_id} snap={snap} title={title} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
              ))}
            </>
          )}

          {computed.length === 0 && incoming.length === 0 && (
            <p className="muted center" style={{ padding: 30 }}>Nog geen tips — voeg meer series toe of laat vrienden cijfers geven.</p>
          )}
        </>
      )}
    </div>
  );
}
