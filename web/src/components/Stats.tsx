import type { Snapshot } from '../lib/types';
import { totalWatchHours, ratedCount, serviceStats, myRating, watchHours } from '../lib/compute';

export default function Stats({ snap, userId }: { snap: Snapshot; userId: string }) {
  const hours = totalWatchHours(snap, userId);
  const rated = ratedCount(snap, userId);
  const services = serviceStats(snap, userId);
  const maxCount = Math.max(1, ...services.map((s) => s.count));

  // Kijkuren per serie (top 5).
  const perTitle = snap.titles
    .map((t) => ({ title: t, hours: watchHours(t, myRating(snap, t.tmdb_id, userId)) }))
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);
  const maxHours = Math.max(1, ...perTitle.map((x) => x.hours));

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

      {perTitle.length === 0 && services.length === 0 && (
        <div className="empty">
          <div className="big">📊</div>
          <p>Vink seizoenen aan bij je series om je kijkuren en diensten te zien.</p>
        </div>
      )}
    </div>
  );
}
