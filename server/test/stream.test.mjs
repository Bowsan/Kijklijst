// De SSE-stream moet ongecomprimeerd en direct doorstromen. Ging dit ooit mis
// (gzip buffert de uitvoer), dan kwamen er helemaal geen live-updates meer aan
// zonder dat er iets zichtbaar kapot leek — vandaar deze test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4699;

async function metServer(fn) {
  const scratch = mkdtempSync(join(tmpdir(), 'streamtest-'));
  const env = { ...process.env, DATABASE_PATH: join(scratch, 'db.sqlite'), PORT: String(PORT) };
  execFileSync('node', ['scripts/seed-e2e.mjs'], { cwd: serverDir, env, stdio: 'ignore' });
  const srv = spawn('node', ['dist/index.js'], { cwd: serverDir, env, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) {
      const ok = await fetch(`http://localhost:${PORT}/api/state`).then((r) => r.ok).catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await fn();
  } finally {
    srv.kill();
    rmSync(scratch, { recursive: true, force: true });
  }
}

test('de stream wordt niet gecomprimeerd en levert meteen een event', async () => {
  await metServer(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`http://localhost:${PORT}/api/stream`, { signal: ctrl.signal });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    // Compressie zou de stream bufferen: dit hoort er níét te staan.
    assert.equal(res.headers.get('content-encoding'), null);

    // Zonder compressie komt het openings-event er direct doorheen.
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      if (buf.includes('event: hello')) break;
    }
    clearTimeout(t);
    ctrl.abort();
    assert.ok(buf.includes('event: hello'), 'openings-event ontbreekt');
  });
});

test('een wijziging bereikt een verbonden client als state-event', async () => {
  await metServer(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`http://localhost:${PORT}/api/stream`, { signal: ctrl.signal });
    const dec = new TextDecoder();
    let buf = '';

    // Meelezen op de achtergrond en ondertussen iemand een bericht laten plaatsen.
    const meelezen = (async () => {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        if (buf.includes('event: state')) return true;
      }
      return false;
    })();

    // Even wachten tot de verbinding er echt staat voor we iets wijzigen.
    await new Promise((r) => setTimeout(r, 300));
    const post = await fetch(`http://localhost:${PORT}/api/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ tmdb_id: 9000, text: 'Test-bericht' }),
    });
    assert.ok(post.ok, 'bericht plaatsen mislukte');

    const gezien = await Promise.race([
      meelezen,
      new Promise((r) => setTimeout(() => r(false), 5000)),
    ]);
    clearTimeout(t);
    ctrl.abort();
    assert.ok(gezien, 'wijziging kwam niet als state-event op de stream aan');
  });
});

test('gewone API-antwoorden worden wél nog gecomprimeerd', async () => {
  await metServer(async () => {
    const res = await fetch(`http://localhost:${PORT}/api/state`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-encoding'), 'gzip');
  });
});
