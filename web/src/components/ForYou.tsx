import type { Snapshot, Title } from '../lib/types';
import {
  ratedCount, computedRecommendations, incomingRecommendations, MIN_RATINGS_FOR_PROFILE,
} from '../lib/compute';
import { dismissRecommendation } from '../lib/api';
import TitleCard from './TitleCard';

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
  const computed = ready ? computedRecommendations(snap, userId) : [];

  const dismiss = async (id: string) => {
    await dismissRecommendation(id);
    onChange();
  };

  return (
    <div className="page">
      {/* Persoonlijke aanraders van vrienden — altijd, ook onder de 5 */}
      {incoming.length > 0 && (
        <>
          <h2>Voor jou aangeraden</h2>
          {incoming.map(({ rec, from, title }) => (
            <div key={rec.id} style={{ marginBottom: 16 }}>
              <div className="pill-recommend">
                <b>{from?.name || 'Iemand'}</b> raadt jou aan{rec.note ? `: "${rec.note}"` : ''}
              </div>
              <TitleCard snap={snap} title={title!} userId={userId} blind={blind} onRecommend={onRecommend} onChange={onChange} toast={toast} />
              <button
                className="btn ghost"
                style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 2px', marginTop: 2 }}
                onClick={() => dismiss(rec.id)}
              >
                Verwijder deze aanrader
              </button>
            </div>
          ))}
        </>
      )}

      {!ready && (
        <div className="empty">
          <div className="big">⭐</div>
          <p>Je hebt <b>{count}</b> van de {MIN_RATINGS_FOR_PROFILE} series beoordeeld.</p>
          <p className="muted">Geef nog {MIN_RATINGS_FOR_PROFILE - count} cijfer{MIN_RATINGS_FOR_PROFILE - count === 1 ? '' : 's'} en je persoonlijke tips gaan vanzelf branden.</p>
        </div>
      )}

      {ready && (
        <>
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
