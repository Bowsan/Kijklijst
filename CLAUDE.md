# Op de Bank (Kijklijst) — projectoverzicht

Serie-volg-PWA ("dit ben ik aan het kijken / wat kijkt de rest"). Compact
overzicht voor een nieuwe sessie. Nederlands is de UI-taal; commit-berichten en
code-commentaar ook in het Nederlands.

## Stack & structuur
- **web/** — React + Vite + TypeScript. Belangrijkste bestanden:
  - `src/App.tsx` — hoofdstate, tabs, topbar-items, status-tabs (groot bestand).
  - `src/components/Chrome.tsx` — `TopBar` + `NavBar` (footer). Puur presentatie.
  - `src/components/Dashboard.tsx` — dashboard met tabs `kijken|actueel|stats`.
  - `src/components/Friends.tsx`, `Activity.tsx`, `SimpleApp.tsx` (Simpele modus).
  - `src/styles.css` — alle CSS (groot; zoek op class-namen).
  - `src/lib/` — `identity.ts` (localStorage-keys), `compute.ts` (afgeleide data),
    `api.ts`, `types.ts`.
- **server/** — Node + Express + better-sqlite3. `src/index.ts` (routes),
  `src/db.ts` (schema + **additieve** migraties), `src/tmdb.ts`, `src/titles.ts`.
- **e2e/smoke.mjs** — Playwright-rooktest die de gebouwde server doorloopt.
- PWA: `#root` is de scroll-container; safe-area via `--safe-top`/`--safe-bottom`.

## Ship-pipeline (elke wijziging)
1. `cd web && npm run build`
2. `npm run test` (vitest, ~50 tests)
3. `rm -rf server/public && cp -r web/dist server/public`
4. Playwright-verificatie + `node e2e/smoke.mjs`
5. commit → push naar de branch → PR → squash-merge
6. Deploy verifiëren via `mcp__github__actions_list` (workflow `deploy.yml`,
   branch `main`); controleer laatste `head_sha` = merge-sha, conclusion `success`.
   - De output is vaak te groot; hij wordt naar een bestand geschreven. Lees met:
     `jq -r '.workflow_runs[0] | "\(.status) \(.conclusion) \(.head_sha[0:9]) \(.display_title)"' <bestand>`

## Vaste conventies / constraints
- **Branch:** ontwikkel op `claude/mobile-web-app-github-deploy-varx8i`; nooit naar
  een andere branch pushen zonder expliciete toestemming.
- **GitHub-scope:** alleen `bowsan/kijklijst`.
- **DB-migraties zijn altijd additief** — nooit bestaande series/gebruikers verliezen.
- **Geen PR aanmaken tenzij expliciet gevraagd.**
- **Secrets** (TMDb/OMDb) alleen via env-vars / GitHub Secrets, nooit in code.
- Commit-trailers:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01RdjehYrFBnPEEkJtnzYz1x`
- PR-footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + sessielink.

## Belangrijke UI-patronen
- **Glijdende tab-indicator** (onderstreepje in status-tabs, pil in footer):
  CSS-vars `--tab-count/--tab-index/--tab-op` (en `--nav-*` voor de footer) sturen
  een enkele `::after`/`::before` met `transform: translateX(calc(var(--index) * 100%))`.
  Curve: `cubic-bezier(0.34, 1.56, 0.64, 1)` @ 0.42s. Bij actieve index `< 0`
  (bijv. Vrienden/Profiel in de kopbalk) fadet de indicator via opacity weg.
  Respecteert `prefers-reduced-motion`. Helper `tabStyle(count, index)` in App.tsx.
- **Gepinde status-tabs bij scrollen** (variant A): `.status-tabs { position: sticky;
  top: var(--safe-top) }`; topbar los op `.tab-list/.tab-dashboard/.tab-friends`.
- **Topbar-iconen:** alleen Vrienden (aggregaat rood bolletje: ongelezen berichten +
  inkomende tips + nieuwe volgers) en Profiel (eigen avatar in afgerond vierkantje).
- **Dashboard-tabs:** `Aan het kijken` / `Actueel` / `Statistieken`.
- **Getalnotatie:** `fmt1(n) = n.toFixed(1).replace('.', ',')` (Nederlandse komma;
  hele getallen tonen één decimaal, bijv. 7,0).
- **Simpele modus** (`SimpleApp.tsx`): notitieblok-variant, keuze bij onboarding
  (`getSimpleMode`/`setSimpleMode`, key `opdebank.simpleMode`). Alleen kijk/gezien,
  "De rest" = alleen vrienden, één regel notitie per serie.

## Huidige staat
- Laatste gemergede werk: PR #155 (glijdende footer-pil), deploy geslaagd.
- Werkboom schoon, alles gepusht. Reeks tab-animaties (onderstreep + footer) is af.
