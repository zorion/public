# Three-tier skyline data, fetched at runtime

The Skyline is assembled from three sources at view time, in the browser: ICGC
terrain-rgb tiles (5 m DTM, Catalonia) for the near-to-mid field, AWS terrarium
tiles (EU-DEM ~25 m) beyond Catalonia's borders, and ~150 ICGC WMS
GetFeatureInfo point queries against the 1 m surface model (buildings +
vegetation) inside the narrow azimuth wedge the sun sweeps during the eclipse.
We chose runtime fetching over shipping a baked DEM because a 5 m grid of
Catalonia plus the 150 km western buffer would cost tens of MB per page load or
lose the nearby-ridge resolution the eclipse verdict depends on.

## Considered Options

- **Ship a heightmap with the page** — fully offline but ~5–20 MB payload, or
  a coarser grid that misses the ridge/building next door; the eclipse sun sits
  at ~4°, where tens of meters of nearby relief flip the answer.
- **Precomputed horizon grid** — smallest runtime cost, but snapping the
  viewpoint to a ~1 km grid is unacceptable (valley vs hilltop 500 m apart flip
  the verdict).
- **Bulk DSM raster at runtime** — impossible: the only Catalonia-wide DSM is
  a 154 GB BigTIFF on datacloud.icgc.cat, which sends no CORS headers
  (verified 2026-07-19). GetFeatureInfo point queries are the only
  browser-reachable access to surface heights, which is why buildings are
  sampled as ~150 points in the Critical Wedge instead of as a raster.

## Consequences

- The page needs the network; on fetch failure it degrades to whatever tier
  still answers (terrain-only, or terrarium-only), and the verdict says so.
- ICGC data is CC BY 4.0 — the attribution footer is a license requirement,
  not decoration.
- Outside Catalonia the tool still works worldwide, terrain-only, at ~25 m.
