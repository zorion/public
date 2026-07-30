# Catalan from a client-side dictionary, Spanish still the default

The page is about an eclipse over Catalonia and was written in Spanish. It now also
reads in Catalan. Every visitor-facing string lives in `src/i18n.js` as one flat
dictionary per language; `applyLanguage()` in `app.js` walks the `data-i18n*` attributes
in `index.html` and swaps them, and everything rendered from code goes through
`t(key, params)`. Spanish stays the default: a URL with no `lang=` is exactly the page
it was before, byte for byte.

Language is part of the Location URL rather than a separate mechanism. `share.js` reads
and writes `lang`, omitting it at the default, so the address bar the page keeps
rewriting never invents a `lang=` nobody asked for and a shared Catalan link stays
Catalan. There is deliberately no browser-language sniffing and nothing stored on the
visitor's machine: the URL is the whole state, as it already was for the spot and the
height.

`index.html` still ships the Spanish text as literal markup rather than empty elements
that JavaScript fills. The first paint is then correct for the default language with no
flash and nothing to lay out twice, and the title and heading are readable to anything
that does not run scripts. The cost is that those strings exist twice — in the markup
and in `MESSAGES.es` — so `test/i18n.test.js` asserts the markup still contains each of
them verbatim, along with key parity between the languages, no orphaned messages, and
matching placeholders per key.

## Considered Options

- **A second HTML file, `ca/index.html`** — no runtime machinery at all, and the simplest
  thing to serve. Rejected because it duplicates the whole page structure: every layout
  or control change would then have to be made twice, in a repo whose page is mostly
  structure and whose text is a small part of it.
- **Build-time generation of one page per language** — the same two files to serve, from
  one source. Rejected because it would be the repo's first build step, which
  `0002-hand-rolled-basemap-picker` already declined to add for a much larger feature.
- **Sniff `navigator.languages`** — a Catalan-reading visitor would land on Catalan with
  no click. Rejected for now: it makes the page served at a bare URL depend on the
  reader, which is a bigger change than adding a language, and the switcher is one tap
  away. It is a two-line change to `parseShareParams` if that turns out to be wanted.

## Consequences

- Switching language does not reload. A reload would re-fetch every elevation tile for a
  spot whose Skyline is already computed, and the Skyline is the slow part of the page.
  The switcher is still a pair of real `<a href>`s, so the Catalan page can be shared,
  bookmarked and opened in a new tab; the click handler only intercepts the same-tab case.
- Because `t` reads `state.lang` on every call rather than being bound once, nothing that
  holds a translator needs rebuilding — `mapview.js` takes `t` at construction and picks
  up the change. Canvas text is the exception: it is not DOM, so the picker exposes
  `refresh()` and the panorama is redrawn by the usual `renderAll()`.
- Transient status text (tile progress, a search failure) is cleared rather than
  retranslated on a switch. It answers a request that has already finished, and the next
  one will be phrased in the new language.
- Place names are never translated — presets, geocoder answers, and the compass points,
  which happen to be the same letters in both languages. `accept-language` on the
  Nominatim query follows the page, so it only changes which name comes back for a place,
  never which places do.
- The date and time input widgets stay in the browser's own locale. They are native
  controls, and the page has never claimed to set them.
