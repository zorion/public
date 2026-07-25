# Hand-rolled canvas basemap picker, no map library

Choosing a viewing spot used to mean leaving the page for an external map to read off
a latitude and longitude. The page now carries its own basemap: OpenStreetMap raster
tiles drawn onto a canvas, with drag-to-pan, wheel/pinch zoom, click-to-choose, and a
Nominatim name search. That stays inside the site's constraints, because slippy tiles
are plain HTTP GETs — the same thing the page already does for ICGC and terrarium
elevation tiles — so nothing here needs a server.

It is written by hand rather than with a map library. The tile math the picker needs is
the tile math `geo.js` already had, the repo has no build step and no dependencies, and
a library would have been the first of both. The whole thing is ~200 lines of DOM in
`mapview.js` over ~130 lines of pure view math in `map.js`, which is testable under
`node:test` like everything else. The cost is what we chose not to have: no smooth
fractional zoom, no inertia, no retina tiles, no rotation.

## Considered Options

- **Leaflet, vendored into the repo** — pinch zoom, inertia, a draggable marker and a
  layer switcher for free, and still fully static. Rejected for the ~160 KB of
  committed third-party code and its manual update path, in a repo that so far has
  neither.
- **Leaflet from a CDN** — least code to write, but it makes the page depend on a
  third-party origin staying up and lets that origin run scripts on the site.
- **Link out to an external map** — no code at all, but it is exactly the round trip
  the picker exists to remove.

## Consequences

- Two more runtime origins, both governed by usage policies the code has to respect:
  tiles are fetched only for what is on screen and the attribution under the map is a
  requirement, and geocoding runs once per explicit search — never per keystroke —
  behind a client-side rate limit.
- Zoom steps are whole levels, so tiles are always drawn at native size. Because a step
  invalidates every tile id at once, the picker paints stand-ins from cached ancestor or
  child tiles; without that, every zoom would flash the empty background.
- The tile cache is bounded (unlike the elevation caches, which are bounded by the
  narrow azimuth wedge they sample). Panning can visit thousands of tiles, so it evicts
  oldest-first, far above what a viewport holds.
- Search results are biased by the current viewport. Unbiased, "Montsec" answers with a
  village in France well before the Catalan range.
- The picker draws a ray toward the sun's azimuth at the selected instant, which is the
  direction that has to be clear. It is a sighting aid only: whether the sun actually
  clears the terrain is still the Skyline's answer, not the map's.
