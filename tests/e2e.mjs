// E2E mit Playwright + Fake-Clock (beschleunigte Zeit). Aufruf: node tests/e2e.mjs [BASIS_URL]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
let base = process.argv[2], server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18734', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18734/'; }

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
const log = []; const ok = (name, extra = '') => { log.push(`✓ ${name}${extra ? ' – ' + extra : ''}`); console.log(`✓ ${name}${extra ? ' – ' + extra : ''}`); };
const shot = async name => { await page.waitForTimeout(450); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await page.screenshot({ path: path.join(SCREENS, name) }); };
const S = () => page.evaluate(() => { const s = __rz.session; return s && { status: s.status, phaseIdx: s.phaseIdx, round: s.round, setNo: s.setNo, restMs: s.restMs, target: s.target, total: s.sets.reduce((a, x) => a + x.done, 0), sets: s.sets.length }; });
const run = ms => page.clock.runFor(ms);

await page.clock.install({ time: new Date('2026-10-30T12:00:00+01:00') });
await page.goto(base); await page.waitForSelector('.extiles');
ok('Startseite geladen', base);
assert.deepEqual(await page.$$eval('.extile .exname', e => e.map(x => x.textContent)), ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge']);
ok('Vier Kernübungen als Hauptauswahl');
await shot('01_start_einstufung_offen.png');

// Einstufung: geführter Maximaltest mit Zählknopf
await page.click('.askcard [data-act=assess]'); await page.waitForSelector('.q');
assert.match(await page.textContent('.q'), /Wie viele Liegestütze schaffst du maximal am Stück\?/);
await shot('02_einstufung_frage.png');
await page.click('[data-act=assess-test]'); await page.waitForSelector('#a-lead');
await run(3100); await page.waitForSelector('[data-act=assess-tap]');
for (let i = 0; i < 25; i++) { await page.click('[data-act=assess-tap]'); await run(1200); }
assert.equal(await page.textContent('#a-count'), '25');
await shot('03_maximaltest_zaehlen.png');
await page.click('[data-act=assess-stop]'); await page.waitForSelector('#a-val');
assert.equal(await page.textContent('#a-val'), '25');
const pb = await page.textContent('.planbox');
assert.match(pb, /10 Wdh\. · 15 s Pause × 6, danach 20 s/); assert.match(pb, /Stufe Mittel/);
await shot('04_einstufung_ergebnis_plan.png');
ok('Maximaltest: 25 gezählt → Plan 10 Wdh./15 s ×6, dann 20 s (Stufe Mittel)');
await page.click('[data-act=assess-save]'); await page.waitForSelector('.extiles');
assert.match(await page.textContent('.maxbar'), /25/);
const maxes = await page.evaluate(() => JSON.parse(localStorage.getItem('repzeit.maxes')));
assert.equal(maxes['Liegestütze'][0].v, 25); assert.equal(maxes['Liegestütze'][0].source, 'test');
const tpl = await page.evaluate(() => __rz.workouts.find(w => w.id === 'tpl-liegestuetz-5').phases);
assert.deepEqual(tpl, [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 10, restSec: 20, rounds: null }]);
ok('Maximum gespeichert, Vorlage automatisch angepasst');
await page.waitForTimeout(500);
await shot('05_vorlagen.png');

// Einstufung Eingabe per Zahl (Klimmzüge) → andere Pausen
await page.click('[data-exsel="Klimmzüge"]'); await page.waitForSelector('#a-val');
await page.click('[data-act=av][data-d="1"]'); await page.click('[data-act=av][data-d="1"]'); await page.click('[data-act=av][data-d="1"]'); // 5 → 8
assert.equal(await page.textContent('#a-val'), '8');
assert.match(await page.textContent('.planbox'), /3 Wdh\. · 25 s Pause × 6, danach 30 s/);
await page.click('[data-act=assess-save]'); await page.waitForSelector('.extiles');
ok('Zahleneingabe Klimmzüge 8 → 3 Wdh., 25 s ×6, dann 30 s');
await page.click('[data-exsel="Liegestütze"]');

// Editor
await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=edit]'); await page.waitForSelector('#f-name');
assert.match(await page.textContent('.formula'), /Satz = 40 % × Max 25 = 10 Wdh\./);
await shot('06_editor.png');
await page.click('[data-step="auto.pct"][data-d="1"]'); // 45 % → 11
assert.match(await page.textContent('.formula'), /45 % × Max 25 = 11 Wdh/);
await page.click('[data-step="auto.pct"][data-d="-1"]');
await page.evaluate(() => document.querySelector('#f-name').scrollIntoView());
await page.screenshot({ path: path.join(SCREENS, '06b_editor_ganz.png'), fullPage: true });
ok('Editor: Formel sichtbar und überschreibbar (Satzgröße %)');
await page.click('[data-go=home]');

// Plan-Vorschau mit Phasen-Zeiträumen
const labels = () => page.$$eval('.plabel', e => e.map(x => x.textContent));
await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=start]'); await page.waitForSelector('[data-act=plan-start]');
assert.deepEqual(await labels(), ['Phase 1 · 0:00–3:30 · 10 Wdh / 15 s Pause, Runden 1–6', 'Phase 2 · 3:30–5:00 · 10 Wdh / 20 s Pause, Runden 7–9']);
await shot('14_plan_vorschau.png');
ok('Plan-Vorschau: Phase 1 · 0:00–3:30 (Runden 1–6), Phase 2 · 3:30–5:00 (Runden 7–9)');
// Phasen-Editor: Start später, Wdh., Phase hinzufügen → Zeiträume live
await page.click('[data-pst=start][data-i="1"][data-d="1"]');
assert.match((await labels())[0], /0:00–4:05 .* Runden 1–7/);
await page.click('[data-pst=reps][data-i="1"][data-d="-1"]'); await page.click('[data-act=plan-add]');
assert.equal(await page.$$eval('.pcard', e => e.length), 3);
assert.match((await labels())[2], /^Phase 3 · \d:\d\d–5:00 · 9 Wdh \/ 25 s Pause/);
await page.evaluate(() => document.querySelector('.pcard[data-phase="1"]').scrollIntoView());
await shot('15_phasen_editor.png');
await page.click('[data-act=plan-del][data-i="2"]'); await page.click('[data-act=plan-reset]');
assert.deepEqual(await labels(), ['Phase 1 · 0:00–3:30 · 10 Wdh / 15 s Pause, Runden 1–6', 'Phase 2 · 3:30–5:00 · 10 Wdh / 20 s Pause, Runden 7–9']);
ok('Phasen-Editor: Start ab Runde 8 → Phase 1 0:00–4:05, dritte Phase, Zurücksetzen');

// Training
await page.click('[data-act=plan-start]'); await page.waitForSelector('#t-lead');
await run(5100); await page.waitForSelector('[data-act=done]');
const rests = [];
for (let i = 1; i <= 7; i++) {
  await run(12000); if (i === 3) { assert.match(await page.textContent('.pstrip'), /P1 0:00–.*P2 \d:\d\d–5:00/); await shot('07_training_satz.png'); }
  await page.click('[data-act=done]'); const s = await S(); rests.push(s.restMs / 1000);
  if (i === 3) { await page.click('[data-rate=hard]'); assert.equal(await page.evaluate(() => __rz.session.sets[2].rate), 'hard'); await shot('16_pause_bewertung.png'); }
  if (i === 6) { await run(5000); assert.match(await page.textContent('.next'), /Neue Phase: 20 s Pause/); await shot('08_pause.png'); await run(10100); }
  else await run(s.restMs + 100);
}
assert.deepEqual(rests, [15, 15, 15, 15, 15, 15, 20]);
ok('Phasenwechsel nach 6 Runden', 'Pausen ' + rests.join('/') + ' s');
// Teilsatz-Korrektur per Minus
await run(12000); await page.click('[data-act=minus]'); await page.click('[data-act=minus]');
assert.equal(await page.textContent('#t-reps'), '8'); await page.click('[data-act=done]');
let s = await S(); assert.equal(s.total, 78); ok('Korrektur −2 → Satz mit 8 Wdh. gezählt');
// bis Zeitende im Satz
while ((s = await S()).status !== 'partial') {
  if (s.status === 'work') { await run(12000); if ((await S()).status === 'work') await page.click('[data-act=done]'); }
  else await run(1000);
}
await page.waitForSelector('.numgrid'); await page.click('[data-pv="4"]');
await shot('09_zeitende_teilsatz.png');
const before = s.total; await page.click('[data-act=partial-ok]'); await page.waitForSelector('.hero');
const tot1 = +(await page.textContent('.huge')); assert.equal(tot1, before + 4);
await shot('10_ergebnis.png');
ok('Zeitende im Satz → Teilsatz abgefragt', `Ergebnis ${tot1} Wdh.`);
const tune1 = await page.textContent('.panel.tune');
assert.match(tune1, /Ab Runde 8 \(Phase 2\) nicht geschafft/); assert.match(tune1, /Phase 2: 9 statt 10 Wdh\./);
await page.evaluate(() => document.querySelector('.panel.tune').scrollIntoView({ block: 'center' }));
await shot('17_vorschlag_nach_training.png');
ok('Bewertung „knapp“ + Vorschlag nach Fehlschlag in Runde 8: Phase 2 auf 9 Wdh.');

// 2. Einheit schneller → Bestwert + Neutest-Empfehlung
await page.click('[data-act=again]'); await page.click('[data-act=plan-start]'); await run(5100); await page.waitForSelector('[data-act=done]');
for (;;) {
  s = await S(); if (!s || s.status === 'partial') break;
  if (s.status === 'work') { await run(6000); if ((await S())?.status === 'work') await page.click('[data-act=done]'); }
  else await run(1000);
}
if (s) { await page.waitForSelector('.numgrid'); await page.click('[data-pv="6"]'); await page.click('[data-act=partial-ok]'); }
await page.waitForSelector('.hero');
const tot2 = +(await page.textContent('.huge'));
assert.ok(tot2 >= tot1 * 1.1, `${tot2} vs ${tot1}`);
assert.ok(await page.isVisible('.badge.big')); assert.match(await page.textContent('.askcard'), /Neuer Maximaltest empfohlen/);
await shot('11_ergebnis_bestwert_neutest.png');
ok('Neuer Bestwert + Neutest-Vorschlag', `${tot2} vs ${tot1}`);
// Alles geschafft → Phase 2 später; Übernehmen speichert pro Übung
assert.match(await page.textContent('.panel.tune'), /Alle Sätze geschafft\..*Phase 2 ab Runde 9 statt 7.*Pause 15 s statt 20 s/s);
await page.click('[data-act=tune-apply]'); await page.waitForSelector('.tunedone');
const tunes = await page.evaluate(() => JSON.parse(localStorage.getItem('repzeit.tunes')));
assert.deepEqual(tunes['Liegestütze'].phases, [{ reps: 10, restSec: 15, rounds: 8 }, { reps: 10, restSec: 20, rounds: null }]);
await page.evaluate(() => document.querySelector('.panel.tune').scrollIntoView({ block: 'center' }));
await shot('18_vorschlag_uebernommen.png');
await page.click('[data-go=home]'); await page.waitForSelector('.extiles');
assert.match(await page.textContent('.card[data-id="tpl-liegestuetz-5"]'), /Phasen angepasst/);
await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=start]'); await page.waitForSelector('[data-act=plan-start]');
const l2 = await labels(); assert.match(l2[0], /Runden 1–8/); assert.match(l2[1], /Runden 9–/); assert.match(await page.textContent('.planhead'), /gemessen/);
await shot('19_plan_angepasst.png');
await page.click('[data-go=home]');
ok('Übernehmen: Phase 2 ab Runde 9 für nächste Einheit Liegestütze gespeichert', l2.join(' | '));

// Verlauf
await page.click('[data-go=history]'); await page.waitForSelector('.hlist');
assert.equal(await page.$$eval('.hitem', e => e.length), 2); assert.ok(await page.isVisible('.chart .ln'));
assert.match(await page.textContent('.panel'), /Liegestütze\s*25/);
await shot('12_verlauf.png');
ok('Verlauf mit Fortschrittskurve und Maximalwerten');

// Export
await page.click('[data-go=more]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
assert.equal(data.app, 'RepZeit'); assert.equal(data.history.length, 2); assert.equal(data.maxes['Liegestütze'][0].v, 25);
await shot('13_mehr_einstellungen.png');
ok('Export JSON', `${data.history.length} Einheiten, ${data.workouts.length} Workouts`);
// Import in frischen Speicher
await page.evaluate(() => localStorage.clear());
await page.setInputFiles('#f-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
await page.waitForFunction(() => __rz.history.length === 2 && __rz.maxes['Liegestütze']);
ok('Import JSON');

// Offline nach Service-Worker-Installation
await page.clock.resume();
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
await page.reload(); await page.waitForSelector('.tabs');
await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.tabs', { timeout: 8000 });
ok('Offline-Start über Service Worker', `SW aktiv: ${sw}`);
await ctx.setOffline(false);

assert.deepEqual(errors, [], 'Konsolenfehler: ' + errors.join('; '));
ok('Keine JS-Fehler');
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
