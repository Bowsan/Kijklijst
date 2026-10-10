import express from 'express';
import { randomUUID } from 'node:crypto';
import { db, getSnapshot, parseJson } from '../db.js';
import { searchTv, getTvDetails, getImdbId, getNewTv, findTvIdByImdb, discoverByPeople, getRecommendations } from '../tmdb.js';
import { tvmazeByImdb, type EnrichData } from '../tvmaze.js';
import { addClient, broadcast } from '../events.js';
import { storeDataUri } from '../uploads.js';
import { pushPublicKey, saveSubscription, removeSubscription, sendPushTo } from '../push.js';
import { logActivity, nameOf, titleNameOf, listersOf } from '../helpers.js';
import { ensureTitle, refreshTitle, refreshTitles, attachImdbRatings, laatsteRonde, rondeIndienNodig, teVerversenTitels, RONDE_INTERVAL, MAX_PER_RONDE } from '../titles.js';
import { userId } from '../http.js';

const router = express.Router();

// ---------- Health ----------
router.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    tmdb: !!process.env.TMDB_API_KEY,
    omdb: !!process.env.OMDB_API_KEY,
    // Hoeveel titels hebben al een IMDb-cijfer? Handig om de OMDb-job te volgen.
    imdb_ratings: (db.prepare('SELECT COUNT(*) c FROM titles WHERE imdb_rating IS NOT NULL').get() as any).c,
    // Loopt de seizoenronde nog? "wachtend" is wat er nu aan de beurt staat.
    seizoenronde: {
      laatst: laatsteRonde(),
      interval_uur: RONDE_INTERVAL / 3600000,
      wachtend: teVerversenTitels().length,
      max_per_ronde: MAX_PER_RONDE,
    },
  });
});

// ---------- Realtime (SSE) ----------
router.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: hello\ndata: {}\n\n`);
  addClient(res);
});

// ---------- Volledige snapshot ----------
router.get('/api/state', (_req, res) => {
  // De app opent of komt terug: als de seizoenronde aan de beurt is, start hem.
  // Zo blijft het verversen doorgaan ook als de timer een slag mist (herstart
  // van de server, container die tussendoor in slaap gaat). Dit blokkeert het
  // antwoord niet; de ronde loopt op de achtergrond en meldt zich via de stream.
  rondeIndienNodig('app geopend');
  res.json(getSnapshot());
});

export default router;
