import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { db, getSnapshot, parseJson } from './db.js';
import { searchTv, getTvDetails, getImdbId, getNewTv, findTvIdByImdb, discoverByPeople, getRecommendations } from './tmdb.js';
import { tvmazeByImdb, type EnrichData } from './tvmaze.js';
import { addClient, broadcast } from './events.js';
import { scheduleBackups } from './backup.js';
import { uploadsDir, storeDataUri, migrateDataUrisToFiles } from './uploads.js';
import { initPush, pushPublicKey, saveSubscription, removeSubscription, sendPushTo } from './push.js';
import { logActivity, nameOf, titleNameOf, listersOf } from './helpers.js';
import { ensureTitle, refreshTitle, refreshTitles, backfillImdbIds, backfillCastMeta, backfillFirstAirDates, refreshOngoingTitles, refreshImdbRatings, attachImdbRatings } from './titles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

// Vangnet: een vergeten .catch() of een fout in een timer mag de server niet
// stilletjes slopen — loggen en doordraaien (de data staat veilig in SQLite).
process.on('unhandledRejection', (reason) => {
  console.error('Onafgehandelde promise-fout:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Onverwachte fout:', err);
});

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' })); // ruimte voor kleine avatar-afbeeldingen

// Geüploade avatars en covers (bestanden op het data-volume).
app.use('/uploads', express.static(uploadsDir(), { maxAge: '30d', immutable: true }));


import systemRoutes from './routes/system.js';
import tmdbRoutes from './routes/tmdb.js';
import titlesRoutes from './routes/titles.js';
import profileRoutes from './routes/profile.js';
import ratingsRoutes from './routes/ratings.js';
import recommendationsRoutes from './routes/recommendations.js';
import commentsRoutes from './routes/comments.js';
import pushRoutes from './routes/push.js';
import friendsRoutes from './routes/friends.js';
import messagesRoutes from './routes/messages.js';

// Alle API-routes; elke router draagt zijn eigen volledige paden.
app.use(systemRoutes);
app.use(tmdbRoutes);
app.use(titlesRoutes);
app.use(profileRoutes);
app.use(ratingsRoutes);
app.use(recommendationsRoutes);
app.use(commentsRoutes);
app.use(pushRoutes);
app.use(friendsRoutes);
app.use(messagesRoutes);

// ---------- Statische frontend serveren ----------
const webDist = join(__dirname, '..', 'public');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    // Een ontbrekende upload moet 404 geven, niet de app-schil (de service
    // worker zou die HTML anders als "afbeelding" cachen).
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Op de Bank server luistert op poort ${PORT}`);
  if (!process.env.TMDB_API_KEY) {
    console.warn('LET OP: TMDB_API_KEY ontbreekt — zoeken en details werken pas met een sleutel.');
  }
  // Dagelijkse back-up van de database (bewaart de laatste 14 dagen).
  scheduleBackups();
  // Web push initialiseren (VAPID-sleutels op het data-volume).
  initPush();
  // Bestaande base64-afbeeldingen eenmalig naar bestanden verplaatsen.
  try { migrateDataUrisToFiles(); } catch (e: any) { console.warn('Uploads-migratie mislukt:', e?.message || e); }
  // Niet awaiten: op de achtergrond laten lopen (na elkaar, rustig getimed).
  // IMDb-cijfers meteen ophalen voor titels die al een imdb_id hebben…
  refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e));
  backfillImdbIds()
    .catch((e) => console.warn('IMDb-backfill mislukt:', e?.message || e))
    .finally(() => backfillCastMeta().catch((e) => console.warn('Cast-backfill mislukt:', e?.message || e)))
    // Uitgavedatum aanvullen voor titels die die nog missen (sorteren op uitgave).
    .finally(() => backfillFirstAirDates().catch((e) => console.warn('Uitgavedatum-backfill mislukt:', e?.message || e)))
    // …en nogmaals na de id-backfill, voor titels die net een imdb_id kregen.
    .finally(() => refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e)));
  refreshOngoingTitles().catch((e) => console.warn('Auto-refresh mislukt:', e?.message || e));
  // Daarna elke 12 uur opnieuw de lopende series en IMDb-cijfers checken.
  setInterval(() => {
    refreshOngoingTitles().catch((e) => console.warn('Auto-refresh mislukt:', e?.message || e));
    refreshImdbRatings().catch((e) => console.warn('IMDb-cijfers mislukt:', e?.message || e));
  }, 12 * 3600 * 1000);
});
