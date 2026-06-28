# 🛋️ Op de Bank

Een gedeelde, **mobile-first** kijklijst voor series, samen met je vrienden. Je geeft series een cijfer van 1 tot 10, houdt seizoenen bij, raadt titels persoonlijk aan en ziet in één oogopslag wat de groep kijkt. Geen accounts, lage drempel.

Gebaseerd op het conceptdocument *Op de Bank*.

## Wat het kan

- **Series toevoegen** met directe titelsuggesties via TMDb (poster, jaar, genres, cast, seizoenen, streamingdiensten in NL).
- **Cijfer geven** met één tik (1–10) en een **status** (aan het kijken / uitgekeken / wil ik kijken / afgehaakt).
- **Seizoenen bijhouden** met tikbare blokjes (S1 S2 …); eerdere seizoenen vullen vanzelf mee.
- **Groepsgemiddelde** per titel en **wie waar zit**, met avatars.
- **Hele lijst importeren** door te plakken (`Breaking Bad 9`), met controle bij twijfel.
- **Voor jou**: smaakprofiel, smaakgenoten, persoonlijke aanraders van vrienden en berekende tips (vanaf 5 beoordeelde series).
- **Persoonlijk aanraden** aan één vriend, met privé wegklikken en terugkoppeling als de ander kijkt.
- **Kijkstatistieken**: geschatte kijkuren (totaal/per serie) en per streamingdienst.
- **Realtime**: cijfers van anderen verschijnen vrijwel direct (Server-Sent Events).
- **PWA**: installeerbaar op je telefoon, werkt als app.
- **Blind cijferen** en **emoji-reacties** voor het sociale tintje.
- **Delen** via link + QR-code.

## Architectuur

| Laag | Keuze |
|------|-------|
| Frontend | React + Vite + TypeScript, mobile-first PWA |
| Backend | Node + Express + TypeScript |
| Opslag | SQLite (per beoordeling apart weggeschreven) |
| Realtime | Server-Sent Events |
| Serie-info | TMDb via een lichte eigen proxy (sleutel blijft op de server) |
| Identiteit | Lokale, onzichtbare code per apparaat — geen account |
| Deploy | Docker image → GitHub Action → SSH naar de server |

Alles draait op **één eigen server**, zonder externe database-dienst. De geheime TMDb-sleutel staat alleen op de server en komt nooit in de frontend.

> Streaming-informatie voor Nederland komt via TMDb/JustWatch en moet als bron worden vermeld.

## Lokaal ontwikkelen

Je hebt Node 22+ nodig en een **TMDb API v3-sleutel** (gratis via <https://www.themoviedb.org/settings/api>).

```bash
# 1. Afhankelijkheden
npm run install:all

# 2. Backend-config
cp .env.example .env        # vul TMDB_API_KEY in
#   (in de server-map gebruikt `npm run dev` standaard ./data/opdebank.sqlite)

# 3. Twee terminals:
TMDB_API_KEY=jouwsleutel npm run dev:server   # backend op :8080
npm run dev:web                                # frontend op :5173 (proxy't /api naar :8080)
```

Open <http://localhost:5173>.

## Met Docker draaien

```bash
cp .env.example .env        # vul TMDB_API_KEY in
npm run docker:build
npm run docker:run          # app op http://localhost:8080
```

Het hele product (frontend + backend) zit in één image; de database leeft in een Docker-volume (`/data`).

## Deployen naar de server (GitHub Action)

De workflow `.github/workflows/deploy.yml` doet bij elke push naar `main`:

1. Bouwt het Docker-image en pusht het naar **GitHub Container Registry** (`ghcr.io`).
2. Rolt het uit op de server via SSH (`docker compose pull && up -d`) — **mits ingeschakeld**.

### Server eenmalig klaarmaken (samen met iemand die een server heeft)

1. Een Linux-server (VPS) met **Docker** en **Docker Compose** geïnstalleerd.
2. Een gebruiker met SSH-toegang en rechten om Docker te draaien.
3. (Aanbevolen) een reverse proxy met HTTPS, bijv. Caddy of Nginx + Let's Encrypt, die naar poort `8080` wijst.

### Secrets en variabelen in GitHub instellen

Onder **Settings → Secrets and variables → Actions**:

| Type | Naam | Inhoud |
|------|------|--------|
| Variable | `DEPLOY_ENABLED` | `true` (zet de deploy-stap aan) |
| Secret | `SSH_HOST` | IP/hostname van de server |
| Secret | `SSH_USER` | SSH-gebruikersnaam |
| Secret | `SSH_KEY` | private SSH-sleutel (de publieke staat op de server) |
| Secret | `SSH_PORT` | SSH-poort (optioneel, standaard 22) |
| Secret | `DEPLOY_PATH` | map op de server, bijv. `~/opdebank` (optioneel) |
| Secret | `TMDB_API_KEY` | je TMDb-sleutel |
| Secret | `HOST_PORT` | poort op de server (optioneel, standaard 8080) |

Zolang `DEPLOY_ENABLED` niet op `true` staat, bouwt de Action alleen het image en wordt er niets uitgerold — handig totdat de server klaar is.

> Het image staat onder `ghcr.io/<owner>/<repo>`. Als de server een eigen toegangstoken nodig heeft om te pullen, zet dan `GHCR_USER` en `GHCR_TOKEN` als secrets; anders gebruikt de Action de standaard `GITHUB_TOKEN`.

## Beperkingen (uit het concept)

- De low-key identiteit beschermt tegen per ongeluk husselen, niet tegen kwade opzet. Wis je je browsergegevens of wissel je van toestel, dan begin je als nieuwe persoon.
- Kijkuren en de gekozen streamingdienst zijn schattingen op basis van TMDb en je aangevinkte seizoenen.
- Streaming-info voor NL loopt via TMDb ongeveer een dag achter.

## Mappenstructuur

```
server/   Express + SQLite + TMDb-proxy + SSE
web/      React + Vite PWA (mobile-first)
scripts/  PWA-icoongenerator
Dockerfile, docker-compose.yml, .github/workflows/deploy.yml
```
