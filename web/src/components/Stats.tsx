import type { Snapshot } from '../lib/types';
import { POSTER_SMALL } from '../lib/types';
import { totalWatchHours, ratedCount, serviceStats, myRating, watchHours } from '../lib/compute';

export default function Stats({ snap, userId }: { snap: Snapshot; userId: string }) {
  const hours = totalWatchHours(snap, userId);
  const rated = ratedCount(snap, userId);
  const services = serviceStats(snap, userId);
  const maxCount = Math.max(1, ...services.map((s) => s.count));

  const perTitle = snap.titles
    .map((t) => ({ title: t, hours: watchHours(t, myRating(snap, t.tmdb_id, userId)) }))
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);
  const maxHours = Math.max(1, ...perTitle.map((x) => x.hours));

  const friendsWatching = snap.profiles
    .filter((p) => p.id !== userId)
    .map((p) => {
      const titles = snap.ratings
        .filter((r) => r.user_id === p.id && r.status === 'watching')
        .map((r) => snap.titles.find((t) => t.tmdb_id === r.title_id))
        .filter((t): t is NonNullable<typeof t> => t != null);
      return { profile: p, titles };
    })
    .filter((fw) => fw.titles.length > 0);

  return (
    <div className="page">
      <h2>Jouw kijkjaar</h2>
      <div className="stat-grid">
        <div className="stat-box">
          <div className="v">{Math.round(hours)}</div>
          <div className="k">geschatte kijkuren</div>
        </div>
        <div className="stat-box">
          <div className="v">{rated}</div>
          <div className="k">series beoordeeld</div>
        </div>
      </div>
      <p className="note" style={{ margin: '8px 4px' }}>
        Kijkuren zijn een schatting op basis van de seizoenen die je aanvinkt en de speelduur uit TMDb.
      </p>

      {perTitle.length > 0 && (
        <>
          <h2>Meeste tijd aan besteed</h2>
          <div className="card">
            {perTitle.map(({ title, hours }) => (
              <div className="bar-row" key={title.tmdb_id}>
                <div className="label">{title.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(hours / maxHours) * 100}%` }} /></div>
                <div className="val">{Math.round(hours)} u</div>
              </div>
            ))}
          </div>
        </>
      )}

      {services.length > 0 && (
        <>
          <h2>Waar je het meest kijkt</h2>
          <div className="card">
            {services.map((s) => (
              <div className="bar-row" key={s.service}>
                <div className="label">{s.service}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(s.count / maxCount) * 100}%` }} /></div>
                <div className="val">{s.count}× · {Math.round(s.hours)}u</div>
              </div>
            ))}
          </div>
          <p className="note" style={{ margin: '8px 4px' }}>
            "Waar je keek" is de beste gok van de app op basis van je abonnementen, tenzij je het per serie zelf overschrijft.
          </p>
        </>
      )}

      {friendsWatching.length > 0 && (
        <>
          <h2>Wat kijken mijn vrienden?</h2>
          {friendsWatching.map(({ profile, titles }) => (
            <div key={profile.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{profile.name}</div>
              {titles.map((t) => (
                <div key={t.tmdb_id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                  {t.poster_path
                    ? <img src={POSTER_SMALL + t.poster_path} alt="" style={{ width: 32, height: 48, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 32, height: 48, borderRadius: 4, background: 'var(--surface2)', flexShrink: 0 }} />}
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{t.name}</div>
                    <div className="title-sub">{t.year || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {perTitle.length === 0 && services.length === 0 && friendsWatching.length === 0 && (
        <div className="empty">
          <div className="big">📊</div>
          <p>Vink seizoenen aan bij je series om je kijkuren en diensten te zien.</p>
        </div>
      )}
    </div>
  );
}
