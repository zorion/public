import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positiveRegion } from '../src/contour.js';

// Shoelace area of one cell polygon; summing them gives the area the region
// covers, which is the property the map actually depends on.
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const totalArea = fills => fills.reduce((sum, p) => sum + area(p), 0);

// Samples written out as rows, the way the grid is laid out on screen, so each
// case reads as the picture it is meant to be.
const region = rows => positiveRegion(rows.flat(), rows[0].length - 1, rows.length - 1);

test('a field that is positive nowhere yields nothing', () => {
  const { fills, edges } = region([[-1, -1], [-1, -1]]);
  assert.deepEqual(fills, []);
  assert.deepEqual(edges, []);
});

test('a field that is positive everywhere fills every cell and has no outline', () => {
  const { fills, edges } = region([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
  assert.equal(fills.length, 4);
  assert.equal(totalArea(fills), 4);
  assert.deepEqual(edges, []);
});

test('one positive corner becomes a triangle with the outline as its hypotenuse', () => {
  // Only the top-left corner is positive, so the crossings land at the midpoints
  // of the two edges leaving it.
  const { fills, edges } = region([[1, -1], [-1, -1]]);
  assert.equal(fills.length, 1);
  assert.equal(area(fills[0]), 0.125);
  assert.equal(edges.length, 1);
  const [a, b] = edges[0];
  assert.deepEqual([a.x, a.y].sort(), [0, 0.5]);
  assert.deepEqual([b.x, b.y].sort(), [0, 0.5]);
});

test('a straight edge is placed by interpolation, not snapped to the grid', () => {
  // Left column +3, right column −1: the field vanishes three quarters of the
  // way across, so the region is a rectangle of that width.
  const { fills, edges } = region([[3, -1], [3, -1]]);
  assert.equal(area(fills[0]), 0.75);
  assert.equal(edges.length, 1);
  assert.equal(edges[0][0].x, 0.75);
  assert.equal(edges[0][1].x, 0.75);
});

test('the outline follows the region across cells and only cuts cell interiors', () => {
  // A 4×1 strip of cells, positive on the left, negative on the right: the
  // region is one run of cells and the outline is a single segment in the cell
  // where the sign changes. Borders between two positive cells are not outline.
  const { fills, edges } = region([[2, 2, 1, -1, -3], [2, 2, 1, -1, -3]]);
  assert.equal(fills.length, 3);
  assert.equal(edges.length, 1);
  assert.equal(edges[0][0].x, edges[0][1].x);
  assert.equal(edges[0][0].x, 2.5);
  assert.equal(totalArea(fills), 2.5);
});

test('a saddle cell stays a single simple polygon', () => {
  // Opposite corners positive: the walk has to produce one closed hexagon with
  // two outline chords, not a self-crossing shape that would fill wrongly.
  const { fills, edges } = region([[1, -1], [-1, 1]]);
  assert.equal(fills.length, 1);
  assert.equal(fills[0].length, 6);
  assert.equal(edges.length, 2);
  assert.ok(area(fills[0]) > 0 && area(fills[0]) < 1, String(area(fills[0])));
});

test('neighbouring cells share their vertices exactly, so a fill has no seams', () => {
  // The same crossing computed from either side of a shared border must land on
  // the identical coordinate — a canvas union depends on it.
  const { fills } = region([[-1, 3, -1], [-1, 3, -1]]);
  const left = fills.find(p => p.some(v => v.x < 1));
  const right = fills.find(p => p.some(v => v.x > 1));
  const onBorder = poly => poly.filter(v => v.x === 1).map(v => v.y).sort();
  assert.deepEqual(onBorder(left), onBorder(right));
  assert.equal(onBorder(left).length, 2);
});
