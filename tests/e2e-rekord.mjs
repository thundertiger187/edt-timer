// E2E v1.4.1 (angepasst an v1.5.0): Kacheln ohne „erholt“, „Max am Stück“ + „Rekord 5 min“ aus dem Verlauf. Aufruf: node tests/e2e-rekord.mjs [BASIS_URL]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
let base = process.argv[2], server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18736', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18736/'; }
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
await page.clock.install({ time: new Date('2026-10-31T12:00:00+01:00') });
await page.goto(base); await page.waitForSelector('.setup, .extiles');

const NOW = Date.parse('2026-10-31T12:00:00+01:00');
const iso = minAgo => new Date(NOW - minAgo * 60000).toISOString();
const sess = (id, exercise, workoutId, minAgo, limitMin, total, extra = {}) => ({ id, workoutId, workoutName: workoutId, exercise, date: iso(minAgo), limitMs: limitMin * 60000, total, sets: [], elapsedMs: limitMin * 60000, aborted: false, perMin: total / limitMin, prevBest: null, ...extra });
const history = [
  sess('s1', 'Liegestütze', 'tpl-liegestuetz-5', 3 * 1440, 5, 96),
  sess('s2', 'Liegestütze', 'tpl-liegestuetz-5', 2 * 1440, 5, 112, { shortRec: { pct: 12 } }), // verkürzte Erholung zählt
  sess('s3', 'Liegestütze', 'tpl-liegestuetz-5b', 1440, 5, 140, { aborted: true }),             // abgebrochen: zählt nicht
  sess('s4', 'Liegestütze', 'x-lieg-10', 1500, 10, 180),                                         // 10 min: zählt nicht
  sess('s5', 'Kniebeugen', 'tpl-kniebeugen-10', 2000, 10, 210),                                  // nur 10 min → „–“
  { id: 's6', workoutId: 'tpl-dips-6', exercise: 'Dips', date: iso(2200), limitMin: 5, total: 41, sets: [] }, // älterer Eintrag mit limitMin statt limitMs
  { id: 's7', workoutId: 'own-burpee', date: iso(1600), total: 63, sets: [] },                  // nur workoutId: Übung/Dauer aus dem Workout
  sess('s8', 'Klimmzüge', 'tpl-klimmzug-8', 6, 5, 34),                                          // vor 6 min beendet → Erholung läuft
];
const maxes = { 'Liegestütze': [{ v: 25, date: iso(4 * 1440), source: 'test' }], 'Kniebeugen': [{ v: 35, date: iso(4 * 1440), source: 'test' }], 'Klimmzüge': [{ v: 8, date: iso(4 * 1440), source: 'test' }] };
await page.evaluate(({ history, maxes }) => {
  localStorage.setItem('edt.history', JSON.stringify(history)); localStorage.setItem('edt.maxes', JSON.stringify(maxes));
  const s = JSON.parse(localStorage.getItem('edt.settings') || '{}');
  localStorage.setItem('edt.settings', JSON.stringify({ ...s, setupDone: true, dayTipSeen: true, exSel: 'Liegestütze', asked: ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'], recNotify: false }));
  const w = JSON.parse(localStorage.getItem('edt.workouts') || 'null');
  if (w) { w.push({ id: 'own-burpee', name: 'Burpees 5 min', exercise: 'Burpees', muscle: 'own', limitMin: 5, phases: [{ reps: 5, restSec: 20, rounds: null }], auto: { enabled: false } }); localStorage.setItem('edt.workouts', JSON.stringify(w)); }
}, { history, maxes });
await page.reload(); await page.waitForSelector('.extiles');
const tiles = await page.$$eval('.extiles .extile:not(.own)', e => e.map(x => ({ name: x.querySelector('.exname').textContent, max: x.querySelector('.exmax').textContent, best: x.querySelector('.exbest').textContent, rec: x.querySelector('.exrec')?.textContent ?? null, text: x.textContent })));
const T = Object.fromEntries(tiles.map(t => [t.name, t]));
assert.equal(T['Liegestütze'].max, 'Max am Stück 25'); assert.equal(T['Liegestütze'].best, 'Rekord 5 min 112');
assert.equal(T['Kniebeugen'].best, 'Rekord 5 min –');
assert.equal(T['Dips'].max, 'Max am Stück Test offen'); assert.equal(T['Dips'].best, 'Rekord 5 min 41');
assert.equal(T['Klimmzüge'].best, 'Rekord 5 min 34'); assert.match(T['Klimmzüge'].rec, /^Erholung noch \d:\d\d$/);
for (const t of tiles) assert.doesNotMatch(t.text, /erholt/, `${t.name}: kein „erholt“`);
assert.equal(await page.$$eval('.extiles .exrec.ok', e => e.length), 0);
ok('Kacheln: Max am Stück / Rekord 5 min (max, verkürzte Erholung zählt, 10 min/abgebrochen ignoriert, ältere Einträge), kein „erholt“', tiles.map(t => `${t.name}: ${t.max} · ${t.best}${t.rec ? ' · ' + t.rec : ''}`).join(' | '));
// Kacheln passen auf 390 px: kein Überlauf, Werte überlappen die Figur nicht
const lay = await page.$$eval('.extiles .extile:not(.own)', e => e.map(x => { const r = x.getBoundingClientRect(), s = x.querySelector('.tv').getBoundingClientRect(), f = x.querySelector('.tf').getBoundingClientRect(); // v1.8.0: Figur bzw. Kürzel (eigene Übung)
  return { over: x.scrollWidth > x.clientWidth + 1, stR: s.right, stB: s.bottom, fL: f.left, fT: f.top, fB: f.bottom, sT: s.top, inside: s.right <= r.right }; }));
for (const l of lay) { assert.ok(!l.over && l.inside); assert.ok(l.fB <= l.sT + 1, 'Werte überlappen Figur'); }
ok('Layout 390 px: kein Überlauf, keine Überlappung mit Figur');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(SCREENS, '46_kacheln_rekord.png') }); // Handy 390×844
await page.locator('.extiles').screenshot({ path: path.join(SCREENS, '46b_kacheln_ausschnitt.png') });
// Countdown endet → Zeile verschwindet, kein „erholt“
await page.clock.fastForward(10 * 60000); await page.clock.runFor(2000);
await page.waitForTimeout(300);
assert.equal(await page.$$eval('.extile:has-text("Klimmzüge") .exrec.wait', e => e.length), 0);
assert.doesNotMatch(await page.textContent('.extiles'), /erholt/);
ok('Countdown abgelaufen → Zeile weg, kein „erholt“');
// Eigene Übungen: Rekord 5 min aus workoutId-Eintrag
// v1.8.0: eigene Übung hat eine eigene Kachel (aus dem Workout übernommen), Rekord steht dort
const ct = '.extile.cust[data-exsel="Burpees"]'; await page.waitForSelector(ct);
const cr = await page.textContent(ct + ' .exbest'); assert.doesNotMatch(await page.textContent(ct), /erholt/);
assert.equal(cr.trim(), 'Rekord 5 min 63'); ok('Eigene Übung: eigene Kachel, Rekord 5 min ohne „erholt“', cr.trim());
await page.click(ct); await page.waitForSelector('#xp-panel[data-panel="Burpees"] .card[data-id="own-burpee"]');
await page.click(ct); await page.waitForTimeout(500);
assert.deepEqual(errors, []); ok('Keine JS-Fehler');
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-rekord-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
