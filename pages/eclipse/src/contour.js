// Marching squares: turns a grid of samples of a signed field into the region
// where that field is positive. Pure grid math — the caller decides what a grid
// coordinate means, so nothing here knows about maps or eclipses.

// Cell corners, clockwise from the top-left. Every cell is wound the same way,
// so a canvas can fill all of them as one non-zero path and get their union
// without seams where they touch.
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

// `values` holds (cols + 1) × (rows + 1) samples, row-major: values[j][i] lives
// at grid coordinate (i, j). Returns
//   fills — one polygon per cell the region touches, as fractional grid
//           coordinates, together covering exactly the positive region;
//   edges — the segments of those polygons that cut through a cell rather than
//           running along its border, which is the region's outline alone.
// Splitting the two lets a caller shade the region and draw its edge in
// different styles from one pass.
export function positiveRegion(values, cols, rows) {
  const fills = [];
  const edges = [];
  const at = (i, j) => values[j * (cols + 1) + i];

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const corner = CORNERS.map(([di, dj]) => at(i + di, j + dj));
      const inside = corner.map(v => v > 0);
      if (!inside.some(Boolean)) continue;

      // Walk the cell's border once, keeping the corners that are inside and
      // the points where the field crosses zero between two of them. In border
      // order those points already form the polygon, for every one of the
      // sixteen corner patterns.
      const poly = [];
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        if (inside[k]) {
          poly.push({ x: i + CORNERS[k][0], y: j + CORNERS[k][1], onOutline: false });
        }
        if (inside[k] !== inside[next]) {
          const f = corner[k] / (corner[k] - corner[next]);
          poly.push({
            x: i + CORNERS[k][0] + f * (CORNERS[next][0] - CORNERS[k][0]),
            y: j + CORNERS[k][1] + f * (CORNERS[next][1] - CORNERS[k][1]),
            onOutline: true,
          });
        }
      }
      fills.push(poly);

      // Two crossings in a row are joined by a chord of the cell: that chord is
      // the region's outline here. Anything touching a corner runs along the
      // cell border instead, where the region continues into its neighbour.
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        if (a.onOutline && b.onOutline) edges.push([a, b]);
      }
    }
  }
  return { fills, edges };
}
