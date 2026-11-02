// E2E v1.7.0: Kombi-Training – anlegen über die UI, abwechselnde Übungen, Ansagen, Pausen, Zeitende, Ergebnis,
// Verlauf (Typ combo), Rekord-Kacheln unverändert, Diagramm Regulär/Kombi/Gesamt, Erholung beider Muskelgruppen.
// Aufruf: node tests/e2e-combo.mjs [BASIS_URL]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
let base = process.argv[2], server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18745', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18745/'; }
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
const NOW = Date.parse('2026-11-02T18:00:00+01:00'), DAY = 86400000, iso = t => new Date(t).toISOString();
const sets = (n, r) => Array.from({ length: n }, (_, i) => ({ n: i + 1, target: r, done: r }));
const history = [
  { id: 'h-lz', workoutId: 'tpl-liegestuetz-5', workoutName: 'Liegestütz-EDT 5 min', exercise: 'Liegestütze', date: iso(NOW - 3 * DAY), limitMs: 300000, total: 99, sets: sets(9, 11), elapsedMs: 300000, aborted: false, perMin: 19.8, prevBest: null },
  { id: 'h-kb', workoutId: 'tpl-kniebeugen-5', workoutName: 'Kniebeugen-EDT 5 min', exercise: 'Kniebeugen', date: iso(NOW - 3 * 3600000), limitMs: 300000, total: 80, sets: sets(8, 10), elapsedMs: 300000, aborted: false, perMin: 16, prevBest: null },
  // alte 5-min-Kombi mit sehr hohen Werten: darf weder „Rekord 5 min“ noch Max beeinflussen
  { id: 'h-old', type: 'combo', comboId: 'c-old', workoutId: 'c-old', workoutName: 'Alt', name: 'Alt', exercise: null, exercises: ['Liegestütze', 'Klimmzüge'], mode: 'time', limitMs: 300000, rounds: null, roundsDone: 9,
    total: 600, perEx: { 'Liegestütze': 500, 'Klimmzüge': 100 }, steps: [{ exercise: 'Liegestütze', reps: 50, restSec: 10 }, { exercise: 'Klimmzüge', reps: 10, restSec: 10 }], sets: sets(20, 30), elapsedMs: 300000, aborted: false, perMin: 120, prevBest: null, date: iso(NOW - 10 * DAY) },
];
const maxes = { 'Liegestütze': [{ v: 30, date: iso(NOW - 5 * DAY), source: 'test', durMs: 60000 }], 'Klimmzüge': [{ v: 10, date: iso(NOW - 5 * DAY), source: 'test', durMs: 60000 }] };
const settings = { setupDone: true, dayTipSeen: true, asked: ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'], recNotify: false, sound: true, voice: true, leadIn: 5 };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
await ctx.addInitScript(() => { window.__said = []; Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => window.__said.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {}, speaking: false, pending: false } }); });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const shot = n => page.screenshot({ path: path.join(SCREENS, n) });
await page.clock.install({ time: new Date(NOW) });
await page.goto(base); await page.waitForSelector('.setup, .extiles');
await page.evaluate(({ history, maxes, settings }) => { localStorage.setItem('edt.history', JSON.stringify(history)); localStorage.setItem('edt.maxes', JSON.stringify(maxes)); localStorage.setItem('edt.settings', JSON.stringify(settings)); localStorage.removeItem('edt.combos'); }, { history, maxes, settings });
await page.reload(); await page.waitForSelector('.extiles');
const tiles = () => page.$$eval('.extile[data-exsel]:not(.own)', e => Object.fromEntries(e.map(t => [t.dataset.exsel, [t.querySelector('.exmax b')?.textContent, t.querySelector('.exbest b')?.textContent]])));
const tilesBefore = await tiles();
assert.equal(tilesBefore['Liegestütze'][1], '99', 'Rekord 5 min ohne Kombi'); assert.equal(tilesBefore['Liegestütze'][0], '30');
ok('Rekord-Kacheln vorher', JSON.stringify(tilesBefore));

// --- Startseite: Abschnitt Kombi unter „Übungen“, leerer Zustand
const heads = await page.$$eval('.sec .sh h2', e => e.map(x => x.textContent));
assert.ok(heads.indexOf('Kombi') === heads.indexOf('Übungen') + 1, `Kombi unter Übungen: ${heads}`);
assert.match(await page.textContent('.kombi .cempty'), /Kombi anlegen/);
ok('Startseite: Abschnitt „Kombi“ unter „Übungen“, leerer Zustand mit „Kombi anlegen“');

// --- Kombi anlegen über die UI
await page.click('.kombi .cempty [data-act=combo-new]'); await page.waitForSelector('.sheet.cedit');
const draft = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__rz.cdraft)));
let d = await draft();
assert.equal(d.name, 'Push & Pull');
assert.deepEqual(d.steps.map(x => [x.exercise, x.reps, x.restSec]), [['Liegestütze', 12, 20], ['Klimmzüge', 4, 20]], 'Vorgabe 40 % vom Max');
assert.equal(d.limitMin, 10);
// Bearbeiten: Reps hoch und wieder runter, Schritt 3 hinzufügen und wieder löschen, Modus wechseln und zurück
await page.click('[data-cst=reps][data-ci="1"][data-d="1"]'); d = await draft(); assert.equal(d.steps[1].reps, 5);
await page.click('[data-cst=reps][data-ci="1"][data-d="-1"]'); d = await draft(); assert.equal(d.steps[1].reps, 4);
await page.click('[data-act=cstep-add]'); d = await draft(); assert.equal(d.steps.length, 3);
await page.click('[data-act=cstep-del][data-ci="2"]'); d = await draft(); assert.equal(d.steps.length, 2);
await page.click('[data-act=cmode][data-clim="0"]'); d = await draft(); assert.equal(d.mode, 'rounds');
assert.ok(await page.$('[data-cst=rounds]'), 'Rundenzahl bei „Ohne Limit“');
await page.click('[data-act=cmode][data-clim="10"]'); d = await draft(); assert.deepEqual([d.mode, d.limitMin], ['time', 10]);
await page.fill('#c-name', 'Push & Pull');
await page.$eval('.sheet.cedit', e => { e.scrollTop = 0; }); await page.clock.runFor(600); await page.waitForTimeout(400); await shot('71_kombi_editor.png');
await page.click('[data-act=combo-save]'); await page.waitForSelector('.ccard');
const combos = await page.evaluate(() => JSON.parse(localStorage.getItem('edt.combos')));
assert.equal(combos.length, 1); const C = combos[0];
assert.deepEqual([C.name, C.mode, C.limitMin, C.steps.map(x => [x.exercise, x.reps, x.restSec])], ['Push & Pull', 'time', 10, [['Liegestütze', 12, 20], ['Klimmzüge', 4, 20]]]);
await page.clock.runFor(800); await page.$eval('.kombi', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(100); await shot('70_kombi_start.png');
ok('Kombi über die UI angelegt (Liegestütze 12/20 s, Klimmzüge 4/20 s, 10 min) und in edt.combos gespeichert', C.id);

// --- Training
await page.click(`.ccard[data-cid="${C.id}"] [data-act=combo-start]`); await page.waitForSelector('#t-lead');
await page.evaluate(() => { window.__said.length = 0; });
await page.clock.runFor(5100); await page.waitForSelector('.cwork');
const cur = () => page.evaluate(() => ({ ex: document.querySelector('.cwork .cex')?.textContent.trim(), next: document.querySelector('.cwork .cnext')?.textContent.trim(), status: window.__rz.session?.status }));
let c = await cur();
assert.equal(c.ex, '12 Liegestütze'); assert.match(c.next, /Danach: 4 Klimmzüge · 20 s Pause/);
assert.ok((await page.evaluate(() => window.__said)).includes('Los: 12 Liegestütze'));
await page.clock.runFor(3000); await shot('72_kombi_training.png');
ok('Satz 1: „12 Liegestütze“ groß, darunter „Danach: 4 Klimmzüge“, Ansage „Los: 12 Liegestütze“');

const seq = [c.ex]; let restsChecked = 0;
for (let i = 0; i < 40; i++) {
  await page.clock.runFor(i === 0 ? 12000 : 15000);
  if (await page.$('[data-act=partial-ok]')) break;
  await page.evaluate(() => { window.__said.length = 0; });
  const exp = seq.at(-1).includes('Liegestütze') ? '4 Klimmzüge' : '12 Liegestütze';
  await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]');
  const said = await page.evaluate(() => [...window.__said]);
  assert.ok(said.includes(`Pause 20 Sekunden. Nächster Satz: ${exp}`), `Pausenansage: ${said}`);
  assert.match(await page.textContent('.next'), new RegExp(`Als Nächstes: ${exp}`));
  if (restsChecked < 2) { // Pausenlänge 20 s
    assert.equal(await page.evaluate(() => window.__rz.session.restMs), 20000);
    await page.clock.runFor(19500); assert.equal((await cur()).status, 'rest', 'nach 19,5 s noch Pause');
    await page.clock.runFor(700); restsChecked++;
  } else await page.clock.runFor(20200);
  await page.waitForSelector('.cwork'); c = await cur(); seq.push(c.ex);
  assert.ok((await page.evaluate(() => window.__said)).includes(`Los: ${exp}`));
}
assert.ok(seq.length >= 10);
seq.forEach((x, i) => assert.equal(x, i % 2 ? '4 Klimmzüge' : '12 Liegestütze', `Satz ${i + 1}`));
ok(`Übungen wechseln sich ab (${seq.length} Sätze), Pausen 20 s, Ansagen „Pause 20 Sekunden. Nächster Satz: …“ und „Los: …“`);

// --- Zeitende im Satz → Teil-Satz (Klimmzüge) 2 Wdh.
await page.waitForSelector('[data-act=partial-ok]');
assert.match(await page.textContent('.sheet'), /Klimmzüge/);
await page.click('[data-pv="2"]'); await page.click('[data-act=partial-ok]'); await page.waitForSelector('.ctot');
await page.clock.runFor(2500);
const tot = await page.$$eval('.ctot > div', e => e.map(x => [x.querySelector('small').textContent, x.querySelector('b').textContent]));
const fullL = Math.ceil((seq.length) / 2), fullK = Math.floor(seq.length / 2) - (seq.length % 2 ? 0 : 1); // letzter Satz (Klimmzüge) = Teil-Satz
const L = 12 * fullL, K = 4 * fullK + 2;
assert.deepEqual(tot, [['Liegestütze', String(L)], ['Klimmzüge', String(K)], ['Gesamt', String(L + K)]]);
assert.match(await page.textContent('main'), /zählen nicht für Rekorde/);
await shot('73_kombi_ergebnis.png');
const H = await page.evaluate(() => JSON.parse(localStorage.getItem('edt.history')));
const h = H.find(x => x.comboId === C.id);
assert.ok(h); assert.equal(h.type, 'combo'); assert.equal(h.exercise, null); assert.equal(h.name, 'Push & Pull');
assert.deepEqual(h.perEx, { 'Liegestütze': L, 'Klimmzüge': K }); assert.equal(h.total, L + K); assert.equal(h.steps.length, 2); assert.equal(h.limitMs, 600000);
ok('Ergebnis: Summen je Übung + Gesamt, Verlaufseintrag type combo', `${L} + ${K} = ${L + K}`);

// --- Startseite: Rekord-Kacheln unverändert, „Zuletzt“ mit Namen, Erholung beider Gruppen
await page.click('header [data-go=home]'); await page.waitForSelector('.extiles'); await page.clock.runFor(1500);
assert.deepEqual(await tiles(), tilesBefore, 'Kacheln unverändert');
assert.match(await page.textContent('.lr.lcombo'), /Push & Pull\s*Kombi/);
const recTiles = await page.$$eval('.extile[data-exsel]', e => Object.fromEntries(e.map(t => [t.dataset.exsel, !!t.querySelector('.exrec.wait')])));
assert.ok(recTiles['Liegestütze'] && recTiles['Klimmzüge'] && recTiles['Dips'], `Erholung push + pull: ${JSON.stringify(recTiles)}`);
const watches = await page.evaluate(() => [].concat(window.__rz.settings.recWatch || []).map(w => w.group).sort());
assert.equal(watches.length, 2, `zwei Erholungs-Beobachtungen: ${watches}`);
assert.equal(await page.$$eval('.ccard .exrec.wait', e => e.length), 2);
// Warnung vor erneutem Start: beide Gruppen
await page.click(`.ccard[data-cid="${C.id}"] [data-act=combo-start]`); await page.waitForSelector('.crecsheet');
assert.equal(await page.$$eval('.crecsheet .recclock', e => e.length), 2);
await page.click('[data-act=crec-wait]'); await page.waitForSelector('.crecsheet', { state: 'detached' });
ok('Rekord-Kacheln unverändert, „Zuletzt“ zeigt „Push & Pull“ + Kombi, Erholung für beide Muskelgruppen + Warnung mit 2 Uhren', watches.join(', '));

// --- Verlauf: Umschalter Regulär | Kombi | Gesamt
await page.click('.tab[data-go=history]'); await page.waitForSelector('.dev');
const dev = () => page.evaluate(() => { const s = window.__rz.devSr; return { mode: document.querySelector('.devc')?.dataset.mode ?? s.mode, on: document.querySelector('.devmode .chip.on')?.textContent, pts: s.points.map(p => ({ v: p.value, combo: p.sessions.some(x => x.combo), single: p.sessions.some(x => !x.combo) })), sum: document.querySelector('.devsum')?.textContent || '', note: !!document.querySelector('.devnote') }; });
assert.deepEqual(await page.$$eval('.devmode .chip', e => e.map(x => x.textContent)), ['Regulär', 'Kombi', 'Gesamt']);
let v = await dev(); assert.equal(v.on, 'Regulär'); assert.ok(v.pts.length >= 1 && v.pts.every(p => !p.combo), 'Regulär ohne Kombi');
await page.click('[data-dex="__all"]'); v = await dev(); assert.ok(v.pts.every(p => !p.combo));
await page.click('[data-dmode=combo]'); await page.waitForTimeout(200); v = await dev();
assert.equal(v.on, 'Kombi'); assert.ok(v.pts.every(p => p.combo && !p.single));
assert.deepEqual(await page.$$eval('.devlim .chip', e => e.map(x => x.textContent)), ['5 min', '10 min'], 'Dauer-Chips der Kombis');
await page.click('[data-dlim="10"]'); await page.waitForTimeout(200); v = await dev();
assert.match(await page.textContent('.dev .panel-h'), /10-min-Kombis/);
assert.equal(v.pts.at(-1).v, L + K, 'heute Kombi alle Übungen');
await page.click('[data-dex="Klimmzüge"]'); await page.waitForTimeout(200); if (await page.$('[data-dlim="10"]:not(.on)')) await page.click('[data-dlim="10"]'); await page.waitForTimeout(200); v = await dev(); assert.equal(v.pts.at(-1).v, K, 'Kombi gefiltert auf Klimmzüge');
await page.click('[data-dex="__all"]'); await page.click('[data-dmode=all]'); await page.waitForTimeout(200); v = await dev();
assert.equal(v.on, 'Gesamt'); assert.ok(v.note);
assert.equal(v.pts.at(-1).v, L + K + 80, 'Gesamt heute = Kombi + Kniebeugen-EDT');
assert.ok(v.pts.at(-1).combo && v.pts.at(-1).single);
await page.clock.runFor(1200); await page.$eval('.dev', e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(1500); await shot('74_verlauf_toggle.png');
await page.click('[data-dmode=reg]'); v = await dev(); assert.equal(v.on, 'Regulär');
ok('Verlauf: Regulär ohne Kombi, Kombi nur Kombi (Filter Klimmzüge), Gesamt summiert beide pro Tag', `heute ${L + K + 80}`);

// leere Zustände je Modus
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
const p2 = await ctx2.newPage(); await p2.clock.install({ time: new Date(NOW) }); await p2.goto(base); await p2.waitForSelector('.setup, .extiles');
await p2.evaluate(({ settings }) => { localStorage.setItem('edt.history', '[]'); localStorage.setItem('edt.settings', JSON.stringify(settings)); }, { settings });
await p2.reload(); await p2.click('.tab[data-go=history]'); await p2.waitForSelector('.dev');
const empties = [];
for (const m of ['reg', 'combo', 'all']) { await p2.click(`[data-dmode=${m}]`); await p2.waitForTimeout(150); empties.push(await p2.textContent('.dev .devempty')); }
assert.equal(new Set(empties).size, 3, `eigene leere Zustände: ${empties}`);
await ctx2.close();
ok('Leere Zustände je Modus verschieden');

assert.deepEqual(errors, []);
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-combo-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
