// Every string the page shows a visitor, in each language it offers.
//
// The repo has no build step and no server, so translation is a plain dictionary
// applied in the browser. Spanish is the default and is *also* what index.html
// ships as literal markup, so the first paint reads correctly before this module
// runs; `MESSAGES.es` is the authoritative copy of those strings and
// test/i18n.test.js checks the two have not drifted apart.
//
// Keys never carry place names: presets, geocoder answers and compass points are
// the same words in both languages or are proper nouns, and translating a place
// name would only make it harder to find on a map.

export const DEFAULT_LANG = 'es';

// `name` is written in the language it names — a switcher that offers "Catalán"
// to someone who reads Catalan is no help. `locale` drives clock formatting and
// the language place-name search answers in.
export const LANGS = [
  { code: 'es', name: 'Castellano', locale: 'es-ES' },
  { code: 'ca', name: 'Català', locale: 'ca-ES' },
];

const MESSAGES = {
  es: {
    'page.title': 'Sol y horizonte — Eclipse total del 12 de agosto de 2026',
    'page.h1': 'Sol y horizonte',
    'page.tagline': '¿Quedará el sol por encima del relieve? Pensado para el eclipse total del 12 de agosto de 2026 en Cataluña.',
    'lang.nav': 'Idioma',

    'place.section': 'Lugar',
    'place.field': 'Lugar',
    'place.lat': 'Latitud',
    'place.lon': 'Longitud',
    'place.height': 'Altura sobre el suelo (m)',
    'place.heightHint': 'Si estarás en una azotea o terraza, pon aquí su altura',
    'place.geolocate': '📍 Mi ubicación',
    'preset.custom': '— personalizado —',

    'map.summary': '🗺️ Elegir el punto en un mapa',
    'map.searchLabel': 'Buscar un lugar por su nombre',
    'map.searchPlaceholder': 'Buscar un lugar: Àger, Montsec, Tibidabo…',
    'map.searchButton': 'Buscar',
    'map.pickerAria': 'Mapa. Haz clic para elegir el punto de observación; flechas para desplazar, + y − para acercar, Intro para elegir el centro.',
    'map.zoomIn': 'Acercar',
    'map.zoomOut': 'Alejar',
    'map.notePick': 'Haz clic en el mapa para elegir el punto: arrastra para desplazarte y usa la rueda o dos dedos para acercar. La línea naranja apunta a donde estará el sol a la hora seleccionada — es la dirección que tiene que estar despejada.',
    'map.noteBand': 'La zona sombreada es la <strong>franja de totalidad</strong>: dentro el eclipse llega a ser total, fuera se queda en parcial por poco que falte. El borde pasa entre Lleida y Barcelona, así que aleja el mapa para ver de qué lado cae tu punto.',
    'map.bandLegend': 'Franja de totalidad',
    'map.searching': 'Buscando…',
    'map.searchFailed': 'No se pudo buscar (sin conexión con el buscador de nombres).',
    'map.searchNoResults': 'Sin resultados para «{query}».',

    'time.section': 'Fecha y hora',
    'time.date': 'Fecha',
    'time.now': 'Ahora',
    'time.eclipse': '◉ Eclipse',
    'time.tzNote': 'Todas las horas en tu zona horaria: {tz}.',

    'panorama.note': 'Horizonte calculado con relieve real (curvatura terrestre y refracción incluidas). Dentro de Cataluña se añaden edificios y vegetación (modelo de superficies de 1&nbsp;m) en el sector por donde se pondrá el sol. Fuera de ese sector, solo relieve del terreno.',
    'footer.credits': 'Datos de elevaciones: <a href="https://www.icgc.cat/">Institut Cartogràfic i Geològic de Catalunya</a> (CC&nbsp;BY&nbsp;4.0) · Fuera de Cataluña: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (EU-DEM, © Unión Europea) · Elementos besselianos del eclipse: NASA/GSFC (F.&nbsp;Espenak) · Mapa base y búsqueda de lugares: ©&nbsp;<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL), teselas y <a href="https://nominatim.openstreetmap.org/">Nominatim</a> de la OSM Foundation. Cálculo aproximado — verifica sobre el terreno antes del día del eclipse.',

    'status.tiles': 'Descargando relieve… {n} teselas',
    'status.groundElevation': 'Buscando la elevación del terreno…',
    'status.terrainHorizon': 'Calculando el horizonte de terreno…',
    'status.surface': 'Consultando edificios y vegetación (modelo 1 m)…',
    'status.surfaceProgress': 'Consultando edificios y vegetación… {done}/{total}',
    'status.geolocating': 'Pidiendo tu ubicación…',
    'status.geolocateFailed': 'No se pudo obtener la ubicación.',

    'verdict.calculating': 'Calculando…',
    'verdict.pendingHorizon': 'Comprobando el relieve del horizonte…',
    'verdict.pendingShort': 'Comprobando el relieve…',
    'verdict.visible': 'visible',
    'verdict.occluded': 'oculto',
    'verdict.atTimeHint': 'Llevar la línea de tiempo a esta hora',
    'verdict.localSunset': 'Ocaso tras el horizonte local: <strong>{time}</strong>.',
    'verdict.sunAt': 'Sol a las {time}: altura {altitude}°, acimut {azimuth}°',
    'verdict.notVisibleHere': 'El eclipse del 12 de agosto de 2026 no es visible desde este punto.',
    'verdict.c1': 'C1 — primer contacto',
    'verdict.c2': 'C2 — inicio totalidad',
    'verdict.max': 'Máximo',
    'verdict.c3': 'C3 — fin totalidad',
    'verdict.c4': 'C4 — último contacto',
    'verdict.colTime': 'Hora',
    'verdict.colAltitude': 'Altura',
    'verdict.totalityDuration': 'Aquí la totalidad dura <strong>{seconds} s</strong>.',
    'verdict.totalVisible': '<strong class="good">ECLIPSE TOTAL VISIBLE</strong> desde aquí — totalidad de {seconds} s por encima del horizonte local.',
    'verdict.totalPartly': '<strong class="bad">Totalidad solo parcialmente visible</strong>: el relieve oculta parte de los {seconds} s de totalidad.',
    'verdict.totalHidden': '<strong class="bad">Totalidad OCULTA tras el relieve</strong> (duraría {seconds} s con horizonte despejado).',
    'verdict.partial': 'Aquí el eclipse será <strong>parcial</strong> (magnitud {magnitude}%): la franja de totalidad queda fuera de este punto. Máximo a las {time}',
    'verdict.buildingsPending': 'Edificios aún no consultados…',
    'verdict.outsideCatalonia': 'Fuera de Cataluña: solo relieve del terreno, sin edificios.',

    'readout.azimuth': 'Acimut {azimuth}° — horizonte a {elevation}°',
    'readout.ridge': ' (cresta a {km} km)',
  },

  ca: {
    'page.title': "Sol i horitzó — Eclipsi total del 12 d'agost del 2026",
    'page.h1': 'Sol i horitzó',
    'page.tagline': "Quedarà el sol per damunt del relleu? Pensat per a l'eclipsi total del 12 d'agost del 2026 a Catalunya.",
    'lang.nav': 'Idioma',

    'place.section': 'Lloc',
    'place.field': 'Lloc',
    'place.lat': 'Latitud',
    'place.lon': 'Longitud',
    'place.height': 'Alçada sobre el sòl (m)',
    'place.heightHint': "Si estaràs en un terrat o una terrassa, posa-hi la seva alçada",
    'place.geolocate': '📍 La meva ubicació',
    'preset.custom': '— personalitzat —',

    'map.summary': '🗺️ Triar el punt en un mapa',
    'map.searchLabel': 'Cercar un lloc pel seu nom',
    'map.searchPlaceholder': 'Cercar un lloc: Àger, Montsec, Tibidabo…',
    'map.searchButton': 'Cerca',
    'map.pickerAria': "Mapa. Fes clic per triar el punt d'observació; fletxes per desplaçar, + i − per acostar, Intro per triar el centre.",
    'map.zoomIn': 'Acostar',
    'map.zoomOut': 'Allunyar',
    'map.notePick': "Fes clic al mapa per triar el punt: arrossega per desplaçar-te i fes servir la roda o dos dits per acostar-t'hi. La línia taronja apunta cap a on estarà el sol a l'hora seleccionada — és la direcció que ha d'estar lliure d'obstacles.",
    'map.noteBand': "La zona ombrejada és la <strong>franja de totalitat</strong>: a dins l'eclipsi arriba a ser total, a fora es queda en parcial per poc que hi falti. La vora passa entre Lleida i Barcelona, així que allunya el mapa per veure de quin costat cau el teu punt.",
    'map.bandLegend': 'Franja de totalitat',
    'map.searching': 'Cercant…',
    'map.searchFailed': "No s'ha pogut cercar (sense connexió amb el cercador de noms).",
    'map.searchNoResults': 'Sense resultats per a «{query}».',

    'time.section': 'Data i hora',
    'time.date': 'Data',
    'time.now': 'Ara',
    'time.eclipse': '◉ Eclipsi',
    'time.tzNote': 'Totes les hores en la teva zona horària: {tz}.',

    'panorama.note': "Horitzó calculat amb relleu real (curvatura terrestre i refracció incloses). Dins de Catalunya s'hi afegeixen edificis i vegetació (model de superfícies d'1&nbsp;m) al sector per on es pondrà el sol. Fora d'aquest sector, només relleu del terreny.",
    'footer.credits': "Dades d'elevacions: <a href=\"https://www.icgc.cat/\">Institut Cartogràfic i Geològic de Catalunya</a> (CC&nbsp;BY&nbsp;4.0) · Fora de Catalunya: <a href=\"https://registry.opendata.aws/terrain-tiles/\">Terrain Tiles</a> (EU-DEM, © Unió Europea) · Elements besselians de l'eclipsi: NASA/GSFC (F.&nbsp;Espenak) · Mapa base i cerca de llocs: ©&nbsp;<a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors (ODbL), tessel·les i <a href=\"https://nominatim.openstreetmap.org/\">Nominatim</a> de l'OSM Foundation. Càlcul aproximat — verifica-ho sobre el terreny abans del dia de l'eclipsi.",

    'status.tiles': 'Descarregant relleu… {n} tessel·les',
    'status.groundElevation': "Cercant l'elevació del terreny…",
    'status.terrainHorizon': "Calculant l'horitzó del terreny…",
    'status.surface': "Consultant edificis i vegetació (model d'1 m)…",
    'status.surfaceProgress': 'Consultant edificis i vegetació… {done}/{total}',
    'status.geolocating': 'Demanant la teva ubicació…',
    'status.geolocateFailed': "No s'ha pogut obtenir la ubicació.",

    'verdict.calculating': 'Calculant…',
    'verdict.pendingHorizon': "Comprovant el relleu de l'horitzó…",
    'verdict.pendingShort': 'Comprovant el relleu…',
    'verdict.visible': 'visible',
    'verdict.occluded': 'ocult',
    'verdict.atTimeHint': 'Portar la línia de temps a aquesta hora',
    'verdict.localSunset': "Posta de sol rere l'horitzó local: <strong>{time}</strong>.",
    'verdict.sunAt': 'Sol a les {time}: altura {altitude}°, azimut {azimuth}°',
    'verdict.notVisibleHere': "L'eclipsi del 12 d'agost del 2026 no és visible des d'aquest punt.",
    'verdict.c1': 'C1 — primer contacte',
    'verdict.c2': 'C2 — inici totalitat',
    'verdict.max': 'Màxim',
    'verdict.c3': 'C3 — fi totalitat',
    'verdict.c4': 'C4 — últim contacte',
    'verdict.colTime': 'Hora',
    'verdict.colAltitude': 'Altura',
    'verdict.totalityDuration': 'Aquí la totalitat dura <strong>{seconds} s</strong>.',
    'verdict.totalVisible': '<strong class="good">ECLIPSI TOTAL VISIBLE</strong> des d\'aquí — totalitat de {seconds} s per damunt de l\'horitzó local.',
    'verdict.totalPartly': '<strong class="bad">Totalitat només parcialment visible</strong>: el relleu oculta part dels {seconds} s de totalitat.',
    'verdict.totalHidden': '<strong class="bad">Totalitat OCULTA rere el relleu</strong> (duraria {seconds} s amb un horitzó lliure d\'obstacles).',
    'verdict.partial': "Aquí l'eclipsi serà <strong>parcial</strong> (magnitud {magnitude}%): la franja de totalitat queda fora d'aquest punt. Màxim a les {time}",
    'verdict.buildingsPending': 'Edificis encara no consultats…',
    'verdict.outsideCatalonia': 'Fora de Catalunya: només relleu del terreny, sense edificis.',

    'readout.azimuth': 'Azimut {azimuth}° — horitzó a {elevation}°',
    'readout.ridge': ' (cresta a {km} km)',
  },
};

const PLACEHOLDER = /\{(\w+)\}/g;

// A placeholder with no matching parameter is left standing rather than blanked:
// a message that prints "{seconds}" is a bug report, an empty gap is a mystery.
const interpolate = (template, params) =>
  template.replace(PLACEHOLDER, (whole, name) =>
    (Object.hasOwn(params, name) ? String(params[name]) : whole));

export const isLang = code => LANGS.some(l => l.code === code);

export const normalizeLang = code => (isLang(code) ? code : DEFAULT_LANG);

export const localeOf = lang => LANGS.find(l => l.code === normalizeLang(lang)).locale;

// Falls back to Spanish for a key a translation has not caught up with, and to
// the bare key if even that is missing — visibly wrong, but never a thrown
// exception in the middle of rendering the verdict.
export function translate(lang, key, params = {}) {
  const template = MESSAGES[normalizeLang(lang)][key] ?? MESSAGES[DEFAULT_LANG][key];
  return template === undefined ? key : interpolate(template, params);
}

export const makeTranslator = lang => (key, params) => translate(lang, key, params);

// For the key-parity test; not for rendering.
export const messagesFor = lang => MESSAGES[normalizeLang(lang)];
