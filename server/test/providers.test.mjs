// Unit tests voor de provider-normalisatie (node:test, draait tegen dist/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProvider, canonicalProviders } from '../dist/providers.js';

test('kanaal-varianten worden samengevoegd tot de kale dienstnaam', () => {
  assert.equal(canonicalProvider('MGM Amazon Channel'), 'MGM');
  assert.equal(canonicalProvider('Crunchyroll Amazon Channel'), 'Crunchyroll');
  assert.equal(canonicalProvider('HBO Max Apple TV Channel'), 'HBO Max');
});

test('Apple TV-, NPO- en Max-varianten krijgen één naam', () => {
  assert.equal(canonicalProvider('Apple TV+'), 'Apple TV');
  assert.equal(canonicalProvider('Apple TV Plus'), 'Apple TV');
  assert.equal(canonicalProvider('NPO Start'), 'NPO Plus');
  assert.equal(canonicalProvider('Max'), 'HBO Max');
  assert.equal(canonicalProvider('HBO Max'), 'HBO Max');
});

test('canonicalProviders ontdubbelt en behoudt de volgorde', () => {
  assert.deepEqual(
    canonicalProviders(['Netflix', 'Max', 'HBO Max', 'Apple TV+', 'Apple TV', '']),
    ['Netflix', 'HBO Max', 'Apple TV'],
  );
});
