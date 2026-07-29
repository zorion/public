# Sun Position — Ubiquitous Language

## Terms

### Location
The point on Earth the visitor is exploring: a latitude/longitude pair. Chosen by
browser geolocation, manual lat/lon entry, a preset city, a click on the Picker, or a
Picker name search. A Location is still only coordinates: place names are an input to
finding one, never part of it, and nothing downstream knows the name of anywhere.

### Picker
The basemap beside the controls, there so a visitor can choose a Location without
leaving the page for an external map. Panning, zooming and clicking it are the only
map interactions; a name search resolves a typed place to coordinates. The Picker
answers "where am I pointing?", and shades the Band of Totality so that the question
gets asked of the right places — the Skyline and the verdict are still computed purely
from the resulting coordinates.

### Sun Path
The sequence of sun positions (azimuth + elevation) over one calendar day at a
Location. The central object of the page: a visitor picks a Location and a date and
sees that day's Sun Path.

### Azimuth
Compass bearing of the sun: degrees clockwise from true north (0° = N, 90° = E,
180° = S, 270° = W). Always true north, never magnetic.

### Elevation
Angle of the sun above the horizon, in degrees. Negative when the sun is below the
horizon. Canonical term is **elevation** — not "altitude" — to avoid confusion with
height above sea level.

### Display Time
Every clock reading shown to the visitor (axis labels, sunrise/sunset, the "now"
marker) is in the **visitor's browser timezone**, always labeled with that timezone.
The page never claims to know the civil timezone of a remote Location.

### Now Marker
The sun's position at the current instant, highlighted on the Sun Path when the
selected date is today.

### Skyline
The apparent elevation angle of the terrain horizon as a function of azimuth, as
seen from a Location. Mountains near and far raise it above 0°; it is what can hide
a low sun. The page's western Skyline is the one that matters.

### Visible / Occluded
The sun is **Visible** from a Location at an instant when its elevation exceeds the
Skyline elevation at the sun's azimuth; otherwise it is **Occluded**. This is the
question the page exists to answer — in particular for the total solar eclipse of
2026-08-12, when the sun sits low in the WNW as seen from Catalonia.

### Critical Wedge
The narrow range of azimuths the sun sweeps during the Totality Window at a
Location. The Skyline must be known most precisely there — elsewhere, coarser is
acceptable.

### Near Field
The ground close enough to the observer that buildings and vegetation (not just
terrain) can occlude a low sun — roughly the first few hundred meters. Beyond it,
only terrain matters.

### Eye Elevation
Where the observer's eyes are: the bare-ground elevation at the Location, plus
standing eye height, plus any visitor-declared height above ground (terrace,
rooftop). Deliberately based on bare ground, not on the surface model — standing
beside a building must not put your eyes on its roof.

### Local Circumstances
The eclipse as experienced at one specific Location: the contact times, whether the
Location lies inside the band of totality, and the duration of totality there. These
differ meaningfully across Catalonia.

### Band of Totality
The strip of ground the Moon's umbra sweeps: inside it the eclipse becomes total,
outside it stays partial however little is missing. Which side of its edge a Location
falls on is not something a visitor can guess — over Catalonia that edge runs between
Lleida and Barcelona — so the Picker shades it. Its eastern end is closed by sunset
rather than by the umbra leaving the ground: further east the shadow still arrives, but
for places whose sun has already set.

### Contact Times (C1–C4)
The four instants bounding an eclipse at a Location: C1 first bite, C2 start of
totality, C3 end of totality, C4 last bite. C2–C3 is the **Totality Window** — the
span during which the sun must be Visible for the trip to have been worth it.
