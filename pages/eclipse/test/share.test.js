import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShareParams, shareQuery } from '../src/share.js';

test('round-trips a spot with height', () => {
  const spot = { lat: 41.1189, lon: 1.2445, extraHeightM: 15 };
  assert.deepEqual(parseShareParams('?' + shareQuery(spot)), spot);
});

test('omits h=0 and parses its absence back to ground level', () => {
  const q = shareQuery({ lat: 40.71, lon: 0.7, extraHeightM: 0 });
  assert.equal(q, 'lat=40.71&lon=0.7');
  assert.deepEqual(parseShareParams('?' + q), { lat: 40.71, lon: 0.7, extraHeightM: 0 });
});

test('rejects missing, malformed, and out-of-range coordinates', () => {
  assert.equal(parseShareParams('').lat, null);
  assert.equal(parseShareParams('?lat=41.4').lat, null); // lon missing
  assert.equal(parseShareParams('?lat=abc&lon=1.2').lat, null);
  assert.equal(parseShareParams('?lat=91&lon=1.2').lat, null);
  assert.equal(parseShareParams('?lat=41.4&lon=181').lat, null);
});

test('clamps absurd heights and ignores negative ones', () => {
  assert.equal(parseShareParams('?lat=41&lon=1&h=9000').extraHeightM, 500);
  assert.equal(parseShareParams('?lat=41&lon=1&h=-5').extraHeightM, 0);
});
