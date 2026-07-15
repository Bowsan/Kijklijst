// Testdata voor de e2e-smoke (e2e/smoke.mjs). Draaien vanuit de servermap
// met DATABASE_PATH naar een wegwerpbestand; maakt het schema aan via dist/db.js.
if (!process.env.DATABASE_PATH) {
  console.error('DATABASE_PATH ontbreekt — weiger tegen een echte database te seeden.');
  process.exit(1);
}
const { db } = await import('../dist/db.js');

const now = Date.now();
const prof = db.prepare('INSERT OR REPLACE INTO profiles (id, name, avatar, color, services, updated_at) VALUES (?,?,?,?,?,?)');
prof.run('user-me', 'Testkijker', null, '#7c5cff', '["Netflix"]', now);
prof.run('user-a', 'Anna', null, '#ff5c8a', '["Netflix"]', now);

const title = db.prepare(`INSERT OR REPLACE INTO titles
  (tmdb_id, name, year, poster_path, genres, seasons, episode_count, runtime, providers, overview, cast, creators, added_by, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const seasons = JSON.stringify([{ season_number: 1, episode_count: 9, name: 'S1', air_year: 2023 }]);
const creators = JSON.stringify([{ name: 'Vince Gilligan', photo: null }]);
const rate = db.prepare('INSERT OR REPLACE INTO ratings (title_id, user_id, score, status, seasons, updated_at) VALUES (?,?,?,?,?,?)');

for (let i = 0; i < 6; i++) {
  title.run(9000 + i, `E2E-serie ${i}`, 2022, null, '["Drama"]', seasons, 9, 50, '["Netflix"]', 'Testserie.', '["Pedro Pascal"]', creators, 'user-me', now - i);
  rate.run(9000 + i, 'user-me', 6 + (i % 5), i % 2 === 0 ? 'finished' : 'watching', '[1]', now);
  rate.run(9000 + i, 'user-a', 7, 'finished', '[1]', now);
}
db.prepare('INSERT INTO comments (id, title_id, user_id, text, created_at) VALUES (?,?,?,?,?)')
  .run('e2e-c1', 9000, 'user-a', 'Prikbord werkt!', now);
db.prepare('INSERT OR REPLACE INTO follows (follower, followee, created_at) VALUES (?,?,?)')
  .run('user-me', 'user-a', now);

console.log('e2e-seed klaar');
