// Unit tests voor het parsen van OMDb-antwoorden (node:test, draait tegen dist/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// titles.js trekt db.js mee: naar een wegwerpdatabase wijzen vóór het importeren.
process.env.DATABASE_PATH = join(tmpdir(), `omdb-test-${process.pid}.sqlite`);
const { parseOmdbRating } = await import('../dist/titles.js');

test('geldig OMDb-antwoord levert cijfer en aantal stemmen', () => {
  assert.deepEqual(
    parseOmdbRating({ imdbRating: '8.4', imdbVotes: '1,234,567' }),
    { rating: 8.4, votes: 1234567 },
  );
});

test('"N/A" en ontbrekende velden worden null', () => {
  assert.deepEqual(parseOmdbRating({ imdbRating: 'N/A', imdbVotes: 'N/A' }), { rating: null, votes: null });
  assert.deepEqual(parseOmdbRating({}), { rating: null, votes: null });
  assert.deepEqual(parseOmdbRating(undefined), { rating: null, votes: null });
});

test('rommelige invoer breekt niet', () => {
  assert.deepEqual(parseOmdbRating({ imdbRating: 'acht', imdbVotes: 'veel' }), { rating: null, votes: null });
});
