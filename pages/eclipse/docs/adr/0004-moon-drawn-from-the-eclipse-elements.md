# The Moon is drawn from the eclipse's own elements, not from a lunar ephemeris

The panorama now draws the Moon over the sun, so a visitor scrubbing the timeline sees
the bite open, close, and — inside the band — swallow the disk. Its position comes from
the Besselian elements already in `eclipse.js`, not from a lunar theory.

The elements give this almost for free. The shadow axis is perpendicular to the
fundamental plane, so the observer's offset from it, `(u, v)` — ξ east, η north — is the
direction the Moon's centre appears displaced from the sun's. And `L1` and `|L2|` are by
definition the axis distances at which the limbs touch from outside and from inside,
which fixes both the scale from Earth radii to degrees (`2S / (L1 + L2)`) and the Moon's
own semidiameter (`S · (L1 - L2) / (L1 + L2)`) from the same two tangencies. That last
expression is already in the file: it is what `localCircumstances` returns as the
magnitude of a total eclipse, and what `eclipse.test.js` pins against NASA's 1.034.

## Considered Options

- **Meeus' abridged ELP2000-82 plus topocentric parallax** — the usual way to get a moon,
  and it would work on any date. Rejected as a second source of truth for the same
  geometry: at ~10″ in longitude it is accurate enough to look right and inaccurate
  enough to disagree, and the disagreement would land exactly where this page is
  precise — the drawn limbs would part company with the C1–C4 printed beside them, by a
  few seconds of scrubbing. The parallax term alone (~1°, dwarfing the sun's diameter)
  is a whole second class of bug to get wrong, and none of it is reusable here: the
  page has no question that needs the Moon anywhere but against the sun.
- **Draw the bite as a fraction, without a position** — a shutter closing over the disk,
  no Moon geometry at all. Cheaper, and rejected because the direction is the
  interesting half: north of the band's edge the Moon crosses south of the sun's centre,
  and which limb keeps its light is what a photographer is framing for.

## Consequences

- The Moon exists only inside the elements' window (15h–21h TDT on 2026-08-12);
  `moonDisk` returns `null` everywhere else, and the panorama simply draws no Moon. On
  any other date — the page works for all of them — there is no Moon at all. This is the
  price of not carrying a lunar theory, and it is the right trade only because the Moon
  is here to show the eclipse.
- Separation stays linear in `(u, v)`, which is the Besselian construction's own
  definition rather than an approximation of it, but the offset is carried to the Moon's
  coordinates as a spherical one. Adding half a degree to the sun's RA and declination
  instead would cost ~1″ of separation — invisible, yet enough to break the tangency the
  tests pin at 1e-6.
- The Moon is lifted by the *sun's* refraction, not its own. The two lifts differ by up
  to 8% of the sun's radius as the pair reaches the horizon, and since the panorama draws
  undistorted disks, letting each take its own would overlap the drawn limbs before C1.
  The contact times are airless quantities; the drawing agrees with them by riding up
  together. The cost is that the differential flattening of a low sun — which the page
  does not draw for the sun's own disk either — is not shown.
- The glow follows obscuration, so it fades as the light goes — but by its cube root,
  because the eye answers luminance by roughly that power law. A linear ramp made
  Barcelona's 99.7% partial, which is still dazzling and still outside the band, look
  like Tarragona's totality: the one distinction this page exists to draw.
- At totality the disk goes black and a corona is drawn around it. Without it, the
  instant the visitor came for renders as a dark dot that reads like a bug.
- Sun-drawing precision is now shared: `horizontalPosition` came out of `sunPosition`,
  so both bodies reach azimuth and elevation by the same conversion.
