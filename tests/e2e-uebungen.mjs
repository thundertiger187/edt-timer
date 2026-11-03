// E2E v1.8.0: neue Grundübungen (Ausfallschritte, Beckenheben, Superman, Sit-ups) und eigene Übungen als Kacheln.
// Aufruf: node tests/e2e-uebungen.mjs [BASIS_URL]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
let base = process.argv[2], server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18745', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18745/'; }
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
const NOW = Date.parse('2026-11-03T18:00:00+01:00'), DAY = 86400000, iso = t => new Date(t).toISOString();
const BASE8 = ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge', 'Ausfallschritte', 'Beckenheben', 'Superman', 'Sit-ups'];
const NEW4 = { 'Ausfallschritte': 'tpl-ausfall-5', 'Beckenheben': 'tpl-becken-5', 'Superman': 'tpl-superman-5', 'Sit-ups': 'tpl-situps-5' };
const settings = { setupDone: true, dayTipSeen: true, asked: BASE8, recNotify: false, sound: false, leadIn: 5, exSel: 'Liegestütze' };
const maxes = { 'Liegestütze': [{ v: 28, date: iso(NOW - 4 * DAY), source: 'test', durMs: 60000 }], 'Sit-ups': [{ v: 35, date: iso(NOW - 2 * DAY), source: 'manual' }] };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const mk = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.clock.install({ time: new Date(NOW) }); return { ctx, page, errors }; };
const seed = async (page, data) => { await page.goto(base); await page.waitForSelector('.setup, .extiles');
  await page.evaluate(d => { for (const k of Object.keys(localStorage)) if (k.startsWith('edt.')) localStorage.removeItem(k); for (const [k, v] of Object.entries(d)) localStorage.setItem('edt.' + k, JSON.stringify(v)); }, data);
  await page.reload(); await page.waitForSelector('.extiles'); await page.clock.runFor(1200); };
const settle = async page => { await page.clock.runFor(900); await page.waitForTimeout(250); };
const scrollTo = (page, sel, off = 8) => page.$eval(sel, (e, off) => { const m = e.closest('main') || document.scrollingElement; m.scrollTop += e.getBoundingClientRect().top - (m.getBoundingClientRect?.().top || 0) - off; }, off);
const noToast = page => page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
const ls = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem('edt.' + k)), k);

// --- 1) Startseite: 8 Grundübungen mit Strichmännchen
const A = await mk(390, 844); let page = A.page;
await seed(page, { settings, maxes, history: [] });
const tiles = await page.$$eval('.extiles .extile', e => e.map(t => ({ ex: t.dataset.exsel, fig: !!t.querySelector('svg.fig'), cust: t.classList.contains('cust'), h: Math.round(t.getBoundingClientRect().height) })));
assert.deepEqual(tiles.map(t => t.ex), BASE8); assert.ok(tiles.every(t => t.fig && !t.cust)); assert.equal(new Set(tiles.map(t => t.h)).size, 1, 'gleich hoch');
assert.equal(await page.textContent('.extile[data-exsel="Sit-ups"] .exmax b'), '35');
assert.equal((await page.textContent('.extiles .addex')).trim(), '+ Eigene Übung');
const lefts = await page.$$eval('.extiles .extile', e => e.map(t => Math.round(t.getBoundingClientRect().left)));
assert.equal(new Set(lefts).size, 2, '2 Spalten');
await page.addStyleTag({ content: '.rv{transform:none!important;opacity:1!important}' });
await settle(page); await noToast(page); await scrollTo(page, '.extiles'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SCREENS, '80_start_uebungen.png') });
ok('Startseite: 8 Grundübungen in 2 Spalten (alte 4 zuerst), je mit Strichmännchen, gleich hoch, darunter „+ Eigene Übung“', `Kachel ${tiles[0].h} px`);

// --- 2) Neue Grundübungen aufklappen: Vorlage, Fitnesstest-Box, Animation
for (const [ex, tpl] of Object.entries(NEW4)) {
  await page.click(`[data-exsel="${ex}"]`); await page.waitForSelector(`#xp-panel[data-panel="${ex}"] .card[data-id="${tpl}"]`);
  assert.ok(await page.$(`.extile.open[data-exsel="${ex}"] svg.fig[data-anim]`), `${ex} animiert`);
  const p = await page.textContent('#xp-panel'); assert.match(p, ex === 'Sit-ups' ? /Test wiederholen/ : /Fitnesstest starten/); assert.doesNotMatch(p, /Eigene Übung ·/);
}
await page.click('[data-exsel="Sit-ups"]'); await page.waitForTimeout(300);
await page.click('[data-exsel="Ausfallschritte"]'); await page.waitForSelector('#xp-panel[data-panel="Ausfallschritte"]');
await settle(page); await noToast(page); await scrollTo(page, '.extile[data-exsel="Ausfallschritte"]'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SCREENS, '81_neue_uebung_offen.png') });
ok('Ausfallschritte/Beckenheben/Superman/Sit-ups klappen auf wie die alten: eigene 5-min-Vorlage, Fitnesstest-Box, animierte Figur');

// Fitnesstest-Anleitung Ausfallschritte mit Figur + Zählhinweis
await page.click('#xp-panel [data-act=assess]'); await page.waitForSelector('[data-act=assess-test]');
const intro = await page.textContent('main'); assert.match(intro, /Gezählt wird jeder Schritt, links und rechts im Wechsel/); assert.ok(await page.$('main svg.fig'));
ok('Fitnesstest Ausfallschritte: Anleitung mit Figur und „Gezählt wird jeder Schritt …“');
await page.goto(base); await page.waitForSelector('.extiles');

// Strichmännchen-Übersicht (4 neue × 3 Positionen) aus dem gebauten figures.js
await page.evaluate(async () => {
  const F = await import('./figures.js'), ex = ['Ausfallschritte', 'Beckenheben', 'Superman', 'Sit-ups'];
  document.body.innerHTML = `<div style="padding:14px;color:#fff;font:600 14px system-ui">${ex.map(e => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><b style="width:100px;flex:none;font-size:13px">${e}</b>${[0, 0.5, 1].map(p => `<div style="flex:none;width:82px;height:72px;border:1px solid #2a2f37;border-radius:10px">${F.frameSvg(e, p)}</div>`).join('')}</div>`).join('')}</div>`;
  document.querySelectorAll('svg').forEach(s => { s.style.width = '100%'; s.style.height = '100%'; });
});
const nFig = await page.$$eval('svg.fig', e => e.length); assert.equal(nFig, 12);
await page.screenshot({ path: path.join(SCREENS, '82_stickmen.png'), clip: { x: 0, y: 0, width: 390, height: 400 } });
ok('Strichmännchen der 4 neuen Übungen (Start/Mitte/Ende) gerendert', '82_stickmen.png');

// --- 3) Eigene Übung über „+ Eigene Übung“ anlegen
await seed(page, { settings, maxes, history: [] });
await page.click('.addex'); await page.waitForSelector('.sheet.xedit #x-name');
await page.click('[data-act=xsave]'); assert.equal(await page.textContent('.xerr'), 'Name fehlt.');
await page.fill('#x-name', 'Situps'); await page.click('[data-act=xsave]'); assert.equal(await page.textContent('.xerr'), '„Sit-ups“ ist bereits eine Grundübung.');
await page.fill('#x-name', '123'); await page.click('[data-act=xsave]'); assert.match(await page.textContent('.xerr'), /mindestens einen Buchstaben/);
await page.fill('#x-name', 'Burpees'); await page.click('[data-xm=own]'); await page.click('[data-act=xsave]');
await page.waitForSelector('#xp-panel[data-panel="Burpees"]');
let ex = await ls(page, 'exercises'); assert.deepEqual(ex.map(e => [e.name, e.muscle]), [['Burpees', 'own']]);
const ct = await page.$eval('.extile.cust[data-exsel="Burpees"]', t => ({ mono: t.querySelector('.tf.mono')?.textContent.trim(), fig: !!t.querySelector('svg'), name: t.querySelector('.exname').textContent, open: t.classList.contains('open'), max: t.querySelector('.exmax b').textContent }));
assert.deepEqual([ct.fig, ct.name, ct.open, ct.max], [false, 'Burpees', true, 'Test offen']); assert.ok(ct.mono && ct.mono.length <= 2, ct.mono);
const all = await page.$$eval('.extiles .extile', e => e.map(t => t.dataset.exsel)); assert.deepEqual(all, [...BASE8, 'Burpees']);
assert.match(await page.textContent('#xp-panel .xp-own'), /Eigene Übung · eigene Erholung/);
assert.match(await page.textContent('#xp-panel .askcard'), /Fitnesstest Burpees/);
ok('Eigene Übung angelegt (Fehler: leer, „Situps“ = Grundübung, ohne Buchstaben) → eigene Kachel nach den Grundübungen, Kürzel statt Figur, Panel offen', `Kürzel ${ct.mono}`);
// + Neues Workout im Panel der eigenen Kachel
await page.click('#xp-panel [data-act=new]'); await page.waitForSelector('header .btn[data-act=save]');
assert.match(await page.textContent('main'), /Burpees/);
await page.click('header [data-act=save]'); await page.waitForSelector('#xp-panel[data-panel="Burpees"] .card');
const ws = (await ls(page, 'workouts')).filter(w => w.exercise === 'Burpees'); assert.equal(ws.length, 1); assert.equal(ws[0].muscle, 'own');
assert.match(await page.textContent('#xp-panel .xp-h'), /1 Workout/);
await page.addStyleTag({ content: '.rv{transform:none!important;opacity:1!important}' });
await page.clock.runFor(3500); await page.waitForTimeout(400); // Toast abwarten
await settle(page); await noToast(page); await scrollTo(page, '.extile[data-exsel="Burpees"]'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SCREENS, '84_eigene_kachel_offen.png') });
ok('Panel der eigenen Kachel: „+ Neues Workout“ legt ein Burpees-Workout an (Muskelgruppe übernommen)', ws[0].id);
// zu- und wieder aufklappen
await page.click('[data-exsel="Burpees"]'); await page.waitForTimeout(400); assert.equal(await page.$('#xp-panel'), null);
await page.click('[data-exsel="Burpees"]'); await page.waitForSelector('#xp-panel[data-panel="Burpees"]');
assert.equal(await page.$('[data-act=assess-test]'), null, 'kein erzwungener Fitnesstest');
ok('Eigene Kachel klappt auf/zu wie die Grundübungen, ohne erzwungenen Fitnesstest');

// --- 4) Umbenennen: Workouts, Verlauf und Fitnesstest-Werte ziehen mit
await page.evaluate(({ NOW, w }) => {
  localStorage.setItem('edt.history', JSON.stringify([{ id: 'hb', workoutId: w, workoutName: 'Burpees', exercise: 'Burpees', date: new Date(NOW - 2 * 86400000).toISOString(), limitMs: 300000, total: 40, sets: [{ n: 1, target: 5, done: 5 }], elapsedMs: 300000, aborted: false, perMin: 8, prevBest: null }]));
  localStorage.setItem('edt.maxes', JSON.stringify({ ...JSON.parse(localStorage.getItem('edt.maxes')), Burpees: [{ v: 12, date: new Date(NOW - 86400000).toISOString(), source: 'manual' }] }));
}, { NOW, w: ws[0].id });
await page.reload(); await page.waitForSelector('.extile[data-exsel="Burpees"]');
assert.equal(await page.textContent('.extile[data-exsel="Burpees"] .exmax b'), '12'); assert.equal(await page.textContent('.extile[data-exsel="Burpees"] .exbest b'), '40');
if (!(await page.$('#xp-panel[data-panel="Burpees"]'))) await page.click('[data-exsel="Burpees"]');
await page.click('#xp-panel [data-act=xedit]'); await page.waitForSelector('.sheet.xedit [data-act=xdel]');
assert.equal(await page.inputValue('#x-name'), 'Burpees');
await page.fill('#x-name', 'Burpee Jumps'); await page.click('[data-xm=core]'); await page.click('[data-act=xsave]');
await page.waitForSelector('.extile.cust[data-exsel="Burpee Jumps"]');
assert.equal(await page.$('[data-exsel="Burpees"]'), null);
assert.deepEqual((await ls(page, 'exercises')).map(e => [e.name, e.muscle]), [['Burpee Jumps', 'core']]);
assert.deepEqual((await ls(page, 'workouts')).filter(w => w.id === ws[0].id).map(w => [w.exercise, w.muscle]), [['Burpee Jumps', 'core']]);
assert.equal((await ls(page, 'history'))[0].exercise, 'Burpee Jumps'); const mx = await ls(page, 'maxes'); assert.ok(mx['Burpee Jumps'] && !mx.Burpees);
assert.equal(await page.textContent('.extile[data-exsel="Burpee Jumps"] .exmax b'), '12');
ok('Umbenennen „Burpees“ → „Burpee Jumps“ (Muskel Bauch): Kachel, Workout, Verlauf und Max ziehen mit');
// Doppelter Name
await page.click('.addex'); await page.waitForSelector('#x-name'); await page.fill('#x-name', 'burpee  jumps'); await page.click('[data-act=xsave]');
assert.equal(await page.textContent('.xerr'), 'Diese Übung gibt es schon.'); await page.click('[data-act=xcancel]');
// --- 5) Löschen (ohne Kombi): Workout weg, Verlauf und Max bleiben
page.once('dialog', d => { assert.match(d.message(), /Übung „Burpee Jumps“ und 1 Workout löschen\? Verlauf und Fitnesstest-Werte bleiben erhalten\./); d.accept(); });
if (!(await page.$('#xp-panel[data-panel="Burpee Jumps"]'))) await page.click('[data-exsel="Burpee Jumps"]');
await page.click('#xp-panel [data-act=xedit]'); await page.waitForSelector('[data-act=xdel]'); await page.click('[data-act=xdel]');
await page.waitForFunction(() => !document.querySelector('.sheet.xedit'));
assert.deepEqual(await ls(page, 'exercises'), []); assert.equal((await ls(page, 'workouts')).filter(w => w.exercise === 'Burpee Jumps').length, 0);
assert.equal((await ls(page, 'history')).length, 1); assert.ok((await ls(page, 'maxes'))['Burpee Jumps']);
// Nach dem Neuladen keine Wiederauferstehung aus Verlauf/Max
await page.reload(); await page.waitForSelector('.extiles'); assert.deepEqual(await page.$$eval('.extiles .extile', e => e.map(t => t.dataset.exsel)), BASE8);
ok('Löschen mit Rückfrage: Kachel und Workout weg, Verlauf und Max bleiben, kommt nach Neuladen nicht zurück');
assert.deepEqual(A.errors, []); await A.ctx.close();

// --- 6) Migration von 1.7.0-Daten
const M = await mk(390, 844); page = M.page;
const w17 = (id, name, exercise) => ({ id, name, exercise, muscle: 'own', limitMin: 5, phases: [{ fromMin: 0, reps: 6, restSec: 20 }], auto: { enabled: false }, adapt: { enabled: false }, countMode: 'button' });
const d17 = {
  workouts: [w17('o-sit', 'Bauch', 'Situps'), w17('o-bur', 'Burpees 5', 'Burpees'), w17('o-gb', 'Brücke', 'Glute Bridge')],
  history: [{ id: 'h17', workoutId: 'o-sit', workoutName: 'Bauch', exercise: 'Situps', date: iso(NOW - 3 * DAY), limitMs: 300000, total: 77, sets: [{ n: 1, target: 6, done: 6 }], elapsedMs: 300000, aborted: false, perMin: 15.4, prevBest: null }],
  maxes: { Situps: [{ v: 31, date: iso(NOW - 6 * DAY), source: 'manual' }] },
  settings: { setupDone: true, dayTipSeen: true, asked: ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'], recNotify: false, sound: false, exSel: '__own' },
};
await seed(page, d17); await page.clock.runFor(1000);
assert.match(await page.textContent('.toast'), /Jetzt Grundübung: (Situps → Sit-ups, Glute Bridge → Beckenheben|Glute Bridge → Beckenheben, Situps → Sit-ups)/);
const W = await ls(page, 'workouts');
assert.deepEqual(['o-sit', 'o-bur', 'o-gb'].map(id => W.find(w => w.id === id)?.exercise), ['Sit-ups', 'Burpees', 'Beckenheben']);
for (const t of Object.values(NEW4)) assert.ok(W.some(w => w.id === t), `Vorlage ${t} ergänzt`);
assert.equal((await ls(page, 'history'))[0].exercise, 'Sit-ups'); assert.equal((await ls(page, 'maxes'))['Sit-ups'][0].v, 31);
assert.deepEqual((await ls(page, 'exercises')).map(e => e.name), ['Burpees']);
const bk = await ls(page, 'backup-1.8.0'); assert.ok(bk && JSON.stringify(bk).includes('Situps'), 'Sicherung mit Originaldaten');
assert.deepEqual(await page.$$eval('.extiles .extile', e => e.map(t => t.dataset.exsel)), [...BASE8, 'Burpees']);
assert.equal(await page.textContent('.extile[data-exsel="Sit-ups"] .exmax b'), '31'); assert.equal(await page.textContent('.extile[data-exsel="Sit-ups"] .exbest b'), '77');
assert.notEqual((await ls(page, 'settings')).exSel, '__own');
const ver = (await ls(page, 'settings')).exVer;
await page.reload(); await page.waitForSelector('.extiles'); assert.equal((await ls(page, 'workouts')).length, W.length, 'Upgrade nur einmal'); assert.equal(ver, 1);
ok('Migration 1.7.0: „Situps“ → Sit-ups, „Glute Bridge“ → Beckenheben (Workouts, Verlauf, Max), Burpees als eigene Kachel, 4 Vorlagen ergänzt, Sicherung edt.backup-1.8.0, nur einmal');
assert.deepEqual(M.errors, []); await M.ctx.close();

// --- 7) 360×640: Startseite mit eigener Übung
const S = await mk(360, 640); page = S.page;
await seed(page, { settings: { ...settings, exSel: null }, maxes, history: [], exercises: [{ id: 'x-b', name: 'Burpees', muscle: 'own' }] });
await page.addStyleTag({ content: '.rv{transform:none!important;opacity:1!important}' });
if (await page.$('#xp-panel')) await page.click('.extile.open');
await page.waitForTimeout(300);
await settle(page); await noToast(page); await scrollTo(page, '.extile[data-exsel="Ausfallschritte"]'); await page.waitForTimeout(300);
const sw = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(sw <= 360, `kein Querscrollen (${sw})`);
await page.screenshot({ path: path.join(SCREENS, '85_start_360.png') });
ok('360×640: Startseite mit 8 Grund- und 1 eigenen Kachel ohne Querscrollen', '85_start_360.png');
assert.deepEqual(S.errors, []); await S.ctx.close();

fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-uebungen-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
