# The Band of Totality is traced from the elements per view, not stored as a path

The Picker now shades the Band of Totality, because the single most consequential fact
about a viewing spot is which side of that edge it falls on, and over Catalonia the edge
runs between Lleida and Barcelona — nowhere a visitor would think to look for it.

The band is not stored as a boundary. Each redraw samples `totalityMargin` — the signed
depth into the umbra at a location's own moment of maximum — on a grid of the canvas's
own pixels, and marching squares turns those samples into the region where it is
positive (`contour.js`, `traceFieldOnView` in `map.js`). Sampling in screen space rather
than in degrees is what makes this cheap and honest at the same time: the same ~3,300
samples resolve the band to a few pixels whether the view spans a street or a continent,
so the shading can never visibly disagree with the verdict for the marker beside it.
One trace costs ~4 ms, and because a mercator pan at fixed zoom is a plain pixel
translation, panning moves the cached result by an offset instead of re-tracing.

## Considered Options

- **Offset a central line by the path half-width** — the usual way an eclipse path is
  drawn, and much cheaper. Rejected because it is wrong exactly where this page is
  aimed: the shadow axis leaves the Earth at 18:32 UT, over Castile, while totality
  continues south-east past the Balearics as the umbra's edge grazes the terminator at
  sunset. A central line does not reach Catalonia, and there is no half-width to offset.
- **Generate the boundary offline and commit the coordinates** — no runtime cost, and
  the polygon could be as fine as we liked. Rejected because it would be a second,
  stale-able source of truth beside the Besselian elements, and because a fixed
  resolution goes soft at exactly the zoom where a visitor hunting the edge needs it
  sharpest.
- **Test the field per pixel** — exact, no interpolation, no marching squares. Two
  orders of magnitude more work for a boundary that a coarse grid already places within
  a pixel or two, since the field is nearly linear across the band.

## Consequences

- `totalityMargin` closes the band's eastern end at ζ = 0, the sun on the geometric
  horizon, so the shading stops where the sun sets even though the umbra still reaches
  the ground further east. `localCircumstances` applies no such gate — it reports the
  geometry and lets the Skyline decide visibility — so the two differ in a strip beyond
  the sunset limit, far from anywhere this page is about.
- The band is a property of the eclipse, not of the timeline, so it is drawn whatever
  date is selected. Nothing about it moves when the visitor scrubs time.
- Zoomed in far from the edge, nothing is drawn at all, and zoomed in well inside it the
  whole view is washed with no edge in sight. Hence the label on the map and the note
  under it telling the visitor to zoom out: without them the feature is invisible at the
  zoom the picker opens at.
- Tracing runs only while the picker is open and drawing, so a visitor who never opens
  the `<details>` pays nothing — the same bargain the tiles already make.
- Getting this right depended on a fix to the elements themselves: μ, the Greenwich hour
  angle, follows Earth's rotation and so belongs to UT, while the other elements are
  tabulated against TDT. Reading it at the TDT epoch had put every location 0.298° of
  longitude — 24 km — too far west, which is a third of the band's width and enough to
  have reported Lleida as missing totality. Three goldens in `eclipse.test.js` now pin
  it, tightened to the precision NASA's own tables print.
