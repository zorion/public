import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LANGS, DEFAULT_LANG, isLang, normalizeLang, localeOf, translate, messagesFor,
} from '../src/i18n.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const HTML = read('index.html');
const SOURCES = ['src/app.js', 'src/mapview.js'].map(read).join('\n');

// Keys as the page actually asks for them: data-i18n* attributes in the markup,
// and t('…') calls in the modules.
const keysIn = (text, pattern) => [...text.matchAll(pattern)].map(m => m[1]);
const HTML_KEYS = keysIn(HTML, /data-i18n[\w-]*="([\w.]+)"/g);
const CODE_KEYS = keysIn(SOURCES, /\bt\(\s*'([\w.]+)'/g);
const USED_KEYS = [...new Set([...HTML_KEYS, ...CODE_KEYS, 'page.title'])];

test('the markup and the modules do ask for messages', () => {
  assert.ok(HTML_KEYS.length > 20, `only ${HTML_KEYS.length} keys in index.html`);
  assert.ok(CODE_KEYS.length > 20, `only ${CODE_KEYS.length} t() calls in src`);
});

test('every key the page uses exists in every language', () => {
  for (const { code } of LANGS) {
    const table = messagesFor(code);
    const missing = USED_KEYS.filter(k => !(k in table));
    assert.deepEqual(missing, [], `${code} is missing ${missing.join(', ')}`);
  }
});

test('the languages define exactly the same keys', () => {
  const reference = Object.keys(messagesFor(DEFAULT_LANG)).sort();
  for (const { code } of LANGS) {
    assert.deepEqual(Object.keys(messagesFor(code)).sort(), reference,
      `${code} does not match ${DEFAULT_LANG} key for key`);
  }
});

test('no message is defined but unused', () => {
  const orphans = Object.keys(messagesFor(DEFAULT_LANG)).filter(k => !USED_KEYS.includes(k));
  assert.deepEqual(orphans, []);
});

// index.html ships the Spanish text so the first paint is right; MESSAGES.es is
// what every later render uses. If the two drift, a visitor sees one string
// before the module loads and another after.
test('index.html mirrors the Spanish messages verbatim', () => {
  const squash = s => s.replace(/\s+/g, ' ').trim();
  const html = squash(HTML);
  const es = messagesFor('es');
  for (const key of HTML_KEYS.concat('page.title')) {
    assert.ok(html.includes(squash(es[key])),
      `index.html no longer contains MESSAGES.es['${key}']: ${es[key]}`);
  }
});

test('every placeholder in a message is filled by some other language too', () => {
  const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  const es = messagesFor('es');
  for (const { code } of LANGS) {
    const table = messagesFor(code);
    for (const key of Object.keys(es)) {
      assert.deepEqual(placeholders(table[key]), placeholders(es[key]),
        `${code}['${key}'] takes different parameters than es`);
    }
  }
});

test('interpolates parameters and leaves unfilled ones visible', () => {
  assert.equal(translate('es', 'status.tiles', { n: 42 }), 'Descargando relieve… 42 teselas');
  assert.equal(translate('ca', 'status.tiles', { n: 42 }), 'Descarregant relleu… 42 tessel·les');
  // A forgotten parameter must read as a defect, not as a silent gap.
  assert.ok(translate('es', 'status.tiles').includes('{n}'));
});

// The three verdict headlines the panorama is really about. Reaching them in a
// browser needs a finished skyline, so they are checked as strings here.
test('renders each totality headline in both languages', () => {
  for (const key of ['verdict.totalVisible', 'verdict.totalPartly', 'verdict.totalHidden']) {
    for (const { code } of LANGS) {
      const out = translate(code, key, { seconds: 92 });
      assert.match(out, /92/, `${code}['${key}'] lost the duration`);
      assert.match(out, /<strong class="(good|bad)">/, `${code}['${key}'] lost its colour`);
    }
  }
});

// A duration and its unit are held together by a thin space, so a line can never
// wrap between "92" and "s". One message used a plain space; keeping all of them
// honest is easier than remembering which.
test('every duration is separated from its unit by a thin space', () => {
  for (const { code } of LANGS) {
    for (const [key, message] of Object.entries(messagesFor(code))) {
      if (!message.includes('{seconds}')) continue;
      assert.match(message, /\{seconds\} s/,
        `${code}['${key}'] does not put a thin space before the unit`);
    }
  }
});

test('an untranslated key falls back to Spanish rather than to nothing', () => {
  assert.equal(translate('ca', 'no.such.key'), 'no.such.key');
  assert.equal(translate('ca', 'verdict.visible'), 'visible');
});

test('unknown languages resolve to the default', () => {
  assert.ok(isLang('ca'));
  assert.ok(!isLang('en'));
  assert.equal(normalizeLang('en'), DEFAULT_LANG);
  assert.equal(normalizeLang(null), DEFAULT_LANG);
  assert.equal(localeOf('ca'), 'ca-ES');
  assert.equal(localeOf('nonsense'), 'es-ES');
  assert.equal(translate('en', 'verdict.max'), 'Máximo');
});

test('the switcher names each language in that language', () => {
  assert.deepEqual(LANGS.map(l => l.name), ['Castellano', 'Català']);
  assert.equal(LANGS[0].code, DEFAULT_LANG);
});
