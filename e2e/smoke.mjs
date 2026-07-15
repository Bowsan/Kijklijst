// E2E-smoke: bouwt niets, maar start de gebouwde server met testdata en loopt
// met een echte browser door alle pagina's. Faalt op JS-fouten of ontbrekende
// kernonderdelen. Vereist: server/dist + server/public (web-build) aanwezig,
// en Playwright + Chromium (devDependency van web/).
//
//   node e2e/smoke.mjs
//
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, 'web', 'package.json'));
const { chromium } = require(process.env.SMOKE_PLAYWRIGHT || 'playwright');

const PORT = 4180;
const scratch = mkdtempSync(join(tmpdir(), 'opdebank-e2e-'));
const dbPath = join(scratch, 'db.sqlite');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

// 1. Seed + server starten.
execFileSync('node', ['scripts/seed-e2e.mjs'], {
  cwd: join(root, 'server'),
  env: { ...process.env, DATABASE_PATH: dbPath },
  stdio: 'inherit',
});
const server = spawn('node', ['dist/index.js'], {
  cwd: join(root, 'server'),
  env: { ...process.env, DATABASE_PATH: dbPath, PORT: String(PORT) },
  stdio: 'inherit',
});

try {
  // Wachten tot de API antwoordt.
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    up = await fetch(`http://localhost:${PORT}/api/state`).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) throw new Error('server kwam niet op');
  ok('server draait');

  // 2. Browser: alle tabs langs, JS-fouten verzamelen.
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('opdebank.userId', 'user-me'));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.dash', { timeout: 10000 });
  const body = () => page.evaluate(() => document.body.textContent || '');

  // Dashboard: statistiektegels + minstens één inhoudskaart.
  if (await page.locator('.stat-box').count() === 4) ok('dashboard: 4 statistiektegels');
  else fail('dashboard: statistiektegels missen');
  if ((await body()).includes('Jouw vaste cast')) ok('dashboard: cast-kaart');
  else fail('dashboard: cast-kaart mist');

  // Lijst: kaarten renderen, kaart open/dicht, status- en cijferelementen.
  await page.click('.nav button:has-text("Lijst")');
  await page.waitForSelector('.title-card', { timeout: 10000 });
  ok(`lijst: ${await page.locator('.title-card').count()} kaarten`);
  await page.locator('.title-card').first().locator('.title-head').click();
  await page.waitForSelector('.status-row', { timeout: 5000 });
  if (await page.locator('.score-slider').count()) ok('kaart: cijferslider aanwezig');
  else fail('kaart: cijferslider mist');
  if ((await body()).includes('Prikbord werkt!')) ok('kaart: prikbordbericht zichtbaar');
  else fail('kaart: prikbordbericht mist');
  await page.locator('.title-card').first().locator('.title-head').click();

  // Voor jou + Profiel: renderen zonder crash.
  await page.click('.nav button:has-text("Voor jou")');
  await page.waitForTimeout(400);
  ok('voor jou: geladen');
  await page.click('.nav button:has-text("Profiel")');
  await page.waitForSelector('.service-grid', { timeout: 5000 });
  ok('profiel: geladen');

  // Vriendprofiel via de vriendenpagina.
  await page.click('.topbar button[title="Vrienden"]');
  await page.click('text=Anna');
  await page.waitForSelector('.sheet', { timeout: 5000 });
  if ((await body()).includes('Raad Anna iets aan')) ok('vriendprofiel: aanraadknop');
  else fail('vriendprofiel: aanraadknop mist');

  // TMDb is hier niet bereikbaar: 502's van de proxy zijn verwacht, de rest niet.
  const real = jsErrors.filter((e) => !/502|Failed to fetch|NetworkError/i.test(e));
  if (real.length) fail(`JS-fouten: ${real.join(' | ')}`);
  else ok('geen JS-fouten');

  await browser.close();
} catch (e) {
  fail(e?.message || String(e));
} finally {
  server.kill();
  rmSync(scratch, { recursive: true, force: true });
}

process.exit(process.exitCode || 0);
