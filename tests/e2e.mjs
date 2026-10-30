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
const S = () => page.evaluate(() => { const s = __rz.session; return s && { status: s.status, phaseIdx: s.phaseIdx, round: s.round, setNo: s.setNo, restMs: s.restMs, target: s.target, total: s.sets.reduce((a, x) => a + x.done, 0), sets: s.sets.length, left: s.endsAt - Date.now() }; });
const run = ms => page.clock.runFor(ms);

await page.clock.install({ time: new Date('2026-10-30T12:00:00+01:00') });
const labels = () => page.$$eval('.plabel', e => e.map(x => x.textContent));
const P3 = ['Phase 1 · 0:00–2:20 · 10 Wdh / 15 s Pause, Sätze 1–4', 'Phase 2 · 2:20–3:40 · 10 Wdh / 20 s Pause, Sätze 5–6', 'Phase 3 · 3:40–5:00 · 8 Wdh / 20 s Pause, Sätze 7–9'];

// ---------- Erster Start: Setup / Fitnesstest ----------
await page.goto(base); await page.waitForSelector('.setup');
assert.equal(await page.title(), 'EDT Timer');
assert.match(await page.textContent('.setup .q'), /Fitnesstest: Übung wählen/);
assert.deepEqual(await page.$$eval('.setup .extile .exname', e => e.map(x => x.textContent)), ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge']);
await shot('01_setup_uebung_waehlen.png');
ok('Erster Start ohne Maximum → Setup „Fitnesstest: Übung wählen“', base);
await page.click('[data-act=assess-pick][data-aex="Liegestütze"]'); await page.waitForSelector('.howto');
assert.match(await page.textContent('.howto'), /So viele saubere Wiederholungen wie möglich bis zum Muskelversagen/);
await shot('02_fitnesstest_anleitung.png');
await page.click('[data-act=assess-test]'); await page.waitForSelector('#a-lead');
assert.equal(await page.textContent('#a-lead'), '3');
await shot('03_fitnesstest_countdown.png');
await run(1000); assert.equal(await page.textContent('#a-lead'), '2');
await run(1000); assert.equal(await page.textContent('#a-lead'), '1');
await run(1100); await page.waitForSelector('#a-time');
assert.equal(await page.textContent('.testclock .badge'), 'Start');
await run(49900); assert.equal(await page.textContent('#a-time'), '0:50');
await shot('04_fitnesstest_timer.png');
ok('Countdown 3 → 2 → 1 → „Start“, Timer läuft (0:50)');
await page.click('[data-act=assess-stop]'); await page.waitForSelector('#a-num');
await page.fill('#a-num', '25');
assert.match(await page.textContent('.testres'), /Zeit 0:5[01].*≈ 2 s\/Wdh\./s);
assert.deepEqual(await page.$$eval('#a-plan .pl', e => e.map(x => x.textContent)), P3);
await page.click('[data-act=av][data-d="1"]'); assert.equal(await page.inputValue('#a-num'), '26');
await page.click('[data-act=av][data-d="-1"]'); assert.equal(await page.inputValue('#a-num'), '25');
await shot('05_fitnesstest_eingabe_plan.png');
ok('Stopp → Eingabe 25 (Feld + Stepper) → 3-Phasen-Plan live', P3.join(' | '));
await page.click('[data-act=assess-save]'); await page.waitForSelector('.hero');
assert.equal(await page.textContent('.huge'), '25');
const maxes = await page.evaluate(() => JSON.parse(localStorage.getItem('edt.maxes')));
assert.deepEqual([maxes['Liegestütze'][0].v, maxes['Liegestütze'][0].source], [25, 'test']); assert.ok(Math.abs(maxes['Liegestütze'][0].durMs - 50500) < 1500);
const tpl = await page.evaluate(() => __rz.workouts.find(w => w.id === 'tpl-liegestuetz-5').phases);
assert.deepEqual(tpl, [{ reps: 10, restSec: 15, rounds: 4 }, { reps: 10, restSec: 20, rounds: 2 }, { reps: 8, restSec: 20, rounds: null }]);
await shot('06_fitnesstest_gespeichert.png');
ok('Gespeichert: max 25, Zeit 50 s, Vorlage auf 3 Phasen abgeleitet');
// nächste Übung: Klimmzüge ohne Test per Zahl
await page.click('[data-act=assess-pick][data-aex="Klimmzüge"]'); await page.waitForSelector('.howto');
await page.click('[data-act=assess-direct]'); await page.waitForSelector('#a-num');
await page.fill('#a-num', '8');
const kl = await page.$$eval('#a-plan .pl', e => e.map(x => x.textContent));
assert.match(kl[0], /3 Wdh \/ 25 s Pause/); assert.match(kl[1], /3 Wdh \/ 30 s Pause/); assert.match(kl[2], /2 Wdh \/ 30 s Pause/);
await page.click('[data-act=assess-save]'); await page.waitForSelector('.hero');
await page.click('[data-act=assess-finish]'); await page.waitForSelector('.extiles');
assert.equal(await page.evaluate(() => __rz.settings.setupDone), true);
ok('Nächste Übung: Klimmzüge 8 per Eingabe → 3/25 s, 3/30 s, 2/30 s; Fertig → Startseite');
await page.click('[data-exsel="Liegestütze"]');
assert.match(await page.textContent('.maxbar'), /25.*Fitnesstest wiederholen/s);
await page.waitForTimeout(500);
await shot('07_start_nach_setup.png');

// ---------- Editor ----------
await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=edit]'); await page.waitForSelector('#f-name');
assert.match(await page.textContent('.formula'), /Satz = 40 % × Max 25 = 10 Wdh\..*P3 8 Wdh\.\/20 s bis Ende/s);
await page.click('[data-step="auto.pct"][data-d="1"]'); assert.match(await page.textContent('.formula'), /45 % × Max 25 = 11 Wdh/);
await page.click('[data-step="auto.pct"][data-d="-1"]');
await page.click('[data-seg="auto.phases"][data-v="2"]'); assert.equal(await page.evaluate(() => __rz.draft.phases.length), 2);
await page.click('[data-seg="auto.phases"][data-v="3"]'); assert.equal(await page.evaluate(() => __rz.draft.phases.length), 3);
await page.evaluate(() => document.querySelector('.formula').scrollIntoView({ block: 'center' }));
await shot('08_editor_auto_3_phasen.png');
ok('Editor: Plan aus Fitnesstest, 2/3 Phasen umschaltbar');
await page.click('[data-go=home]');

// ---------- Plan-Vorschau ----------
await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=start]'); await page.waitForSelector('[data-act=plan-start]');
assert.deepEqual(await labels(), P3);
assert.match(await page.textContent('.origin'), /Aus Fitnesstest: max 25 Liegestütze am 30\.10\.2026 · Stufe Mittel/);
assert.match(await page.textContent('.planhead'), /2 s\/Wdh\. \(aus Fitnesstest\)/);
await shot('14_plan_vorschau.png');
ok('Plan-Vorschau mit 3 Phasen + Herkunft „Aus Fitnesstest: max 25 … am 30.10.2026“');
await page.click('[data-pst=start][data-i="1"][data-d="1"]');
assert.match((await labels())[0], /0:00–2:55 .* Sätze 1–5/);
await page.click('[data-act=plan-add]'); assert.equal(await page.$$eval('.pcard', e => e.length), 4);
assert.equal(await page.$$eval('[data-act=plan-add]', e => e.length), 0); // max. 4 Phasen
await page.evaluate(() => document.querySelector('.pcard[data-phase="1"]').scrollIntoView());
await shot('15_phasen_editor.png');
await page.click('[data-act=plan-del][data-i="3"]'); await page.click('[data-act=plan-reset]');
assert.deepEqual(await labels(), P3);
ok('Phasen-Editor: „Start ab Satz 6“ → Phase 1 0:00–2:55, 4. Phase, Zurücksetzen');

// ---------- Training (3 Phasen) ----------
await page.click('[data-act=plan-start]'); await page.waitForSelector('#t-lead');
await run(5100); await page.waitForSelector('[data-act=done]');
const rests = [];
for (let i = 1; i <= 7; i++) {
  await run(12000);
  if (i === 3) { assert.match(await page.textContent('.pstrip'), /P1 0:00–.*P3 \d:\d\d–5:00/); assert.match(await page.textContent('.train'), /Phase 1\/3 · Satz 3\/4 · gesamt 3/); await shot('09_training_satz.png'); }
  await page.click('[data-act=done]'); const s = await S(); rests.push(s.restMs / 1000);
  if (i === 3) { await page.click('[data-rate=hard]'); assert.equal(await page.evaluate(() => __rz.session.sets[2].rate), 'hard'); await shot('16_pause_bewertung.png'); }
  if (i === 4) { await run(5000); assert.match(await page.textContent('.next'), /Neue Phase 2: 20 s Pause/); await shot('10_pause_neue_phase.png'); await run(15100); }
  else if (i === 6) { await run(2000); assert.match(await page.textContent('.next'), /8 Wdh\..*Neue Phase 3: 8 Wdh\./s); await run(18100); }
  else await run(s.restMs + 100);
}
assert.deepEqual(rests, [15, 15, 15, 15, 20, 20, 20]);
ok('Drei Phasen im Training', 'Pausen ' + rests.join('/') + ' s, Phase 3 mit 8 Wdh.');
await run(12000); assert.equal(await page.textContent('#t-reps'), '8');
await page.click('[data-act=minus]'); await page.click('[data-act=minus]');
assert.equal(await page.textContent('#t-reps'), '6'); await page.click('[data-act=done]');
let s = await S(); assert.equal(s.total, 74); ok('Phase 3 Ziel 8, Korrektur −2 → 6 Wdh. gezählt (Summe 74)');
while ((s = await S()).status !== 'partial') {
  if (s.status === 'work' && s.left < 40000) await run(s.left + 300); // letzter Satz läuft ins Zeitende
  else if (s.status === 'work') { await run(12000); if ((await S()).status === 'work') await page.click('[data-act=done]'); }
  else await run(1000);
}
await page.waitForSelector('.numgrid'); await page.click('[data-pv="4"]');
await shot('11_zeitende_teilsatz.png');
const before = s.total; await page.click('[data-act=partial-ok]'); await page.waitForSelector('.hero');
const tot1 = +(await page.textContent('.huge')); assert.equal(tot1, before + 4);
await shot('12_ergebnis.png');
ok('Zeitende im Satz → Teilsatz abgefragt', `Ergebnis ${tot1} Wdh.`);
const tune1 = await page.textContent('.panel.tune');
assert.match(tune1, /Ab Satz 8 \(Phase 3\) nicht geschafft/); assert.match(tune1, /Phase 3: 7 statt 8 Wdh\./);
await page.evaluate(() => document.querySelector('.panel.tune').scrollIntoView({ block: 'center' }));
await shot('17_vorschlag_nach_training.png');
ok('Vorschlag nach Fehlschlag in Satz 8: Phase 3 auf 7 Wdh.');

// 2. Einheit schneller → Bestwert, Neutest-Empfehlung, Vorschlag „später“
await page.click('[data-act=again]'); await page.click('[data-act=plan-start]'); await run(5100); await page.waitForSelector('[data-act=done]');
for (;;) {
  s = await S(); if (!s || s.status === 'partial') break;
  if (s.status === 'work' && s.left < 25000) await run(s.left + 300);
  else if (s.status === 'work') { await run(6000); if ((await S())?.status === 'work') await page.click('[data-act=done]'); }
  else await run(1000);
}
if (s) { await page.waitForSelector('.numgrid'); await page.click('[data-pv="6"]'); await page.click('[data-act=partial-ok]'); }
await page.waitForSelector('.hero');
const tot2 = +(await page.textContent('.huge'));
assert.ok(tot2 >= tot1 * 1.1, `${tot2} vs ${tot1}`);
assert.ok(await page.isVisible('.badge.big')); assert.match(await page.textContent('.askcard'), /Neuer Fitnesstest empfohlen/);
await shot('13_ergebnis_bestwert_neutest.png');
ok('Neuer Bestwert + Fitnesstest-Empfehlung', `${tot2} vs ${tot1}`);
assert.match(await page.textContent('.panel.tune'), /Alle Sätze geschafft\..*Phase 2 ab Satz 7 statt 5.*Pause 15 s statt 20 s/s);
await page.click('[data-act=tune-apply]'); await page.waitForSelector('.tunedone');
const tunes = await page.evaluate(() => JSON.parse(localStorage.getItem('edt.tunes')));
assert.deepEqual(tunes['Liegestütze'].phases, [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 10, restSec: 20, rounds: 2 }, { reps: 8, restSec: 20, rounds: null }]);
await page.evaluate(() => document.querySelector('.panel.tune').scrollIntoView({ block: 'center' }));
await shot('18_vorschlag_uebernommen.png');
await page.click('[data-go=home]'); await page.waitForSelector('.extiles');
assert.match(await page.textContent('.card[data-id="tpl-liegestuetz-5"]'), /Phasen angepasst/);
await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=start]'); await page.waitForSelector('[data-act=plan-start]');
const l2 = await labels(); assert.match(l2[0], /Sätze 1–6/); assert.match(l2[1], /Sätze 7–/); assert.match(await page.textContent('.planhead'), /gemessen/);
await shot('19_plan_angepasst.png');
await page.click('[data-go=home]');
ok('Übernehmen: Phase 2 ab Satz 7 gespeichert', l2.join(' | '));

// ---------- Fitnesstest manuell wiederholen (Mehr) ----------
await page.click('[data-go=more]'); await page.waitForSelector('.maxpanel');
await shot('20_mehr_fitnesstest.png');
await page.click('.maxpanel .mrow:has-text("Liegestütze") [data-act=assess]'); await page.waitForSelector('.howto');
assert.match(await page.textContent('main'), /Bisher: 25 am 30\.10\.2026/);
await page.click('[data-act=assess-test]'); await run(3100); await page.waitForSelector('#a-time'); await run(57000);
await page.click('[data-act=assess-stop]'); await page.fill('#a-num', '30');
await page.click('[data-act=assess-save]'); await page.waitForSelector('.hero');
await page.click('[data-act=assess-finish]'); await page.waitForSelector('.maxpanel');
assert.match(await page.textContent('.maxpanel'), /Liegestütze\s*30\s*\+5/);
const mx2 = await page.evaluate(() => JSON.parse(localStorage.getItem('edt.maxes'))['Liegestütze']);
assert.deepEqual(mx2.map(m => m.v), [25, 30]);
await page.click('[data-go=home]'); await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=start]'); await page.waitForSelector('[data-act=plan-start]');
const l3 = await labels();
assert.match(l3[0], /12 Wdh \/ 15 s Pause, Sätze 1–6/); assert.match(l3[2], /^Phase 3 .* 10 Wdh \/ 20 s/);
assert.match(await page.textContent('.origin'), /Aus Fitnesstest: max 30 Liegestütze/);
await shot('21_plan_nach_neutest.png');
await page.click('[data-go=home]');
ok('Fitnesstest wiederholt (Mehr): max 30 → Anpassung auf 12/12/10 Wdh. umgerechnet', l3.join(' | '));

// Verlauf
await page.click('[data-go=history]'); await page.waitForSelector('.hlist');
assert.equal(await page.$$eval('.hitem', e => e.length), 2); assert.ok(await page.isVisible('.chart .ln'));
assert.match(await page.textContent('.panel'), /Liegestütze\s*30/);
await shot('22_verlauf.png');
ok('Verlauf mit Fortschrittskurve und Maximalwerten');

// Export
await page.click('[data-go=more]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
assert.equal(data.app, 'EDT Timer'); assert.match(dl.suggestedFilename(), /^edt-timer-/); assert.equal(data.history.length, 2); assert.equal(data.maxes['Liegestütze'][0].v, 25);
await shot('23_mehr_einstellungen.png');
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

// ---------- Migration alter RepZeit-Daten + Setup überspringen ----------
{
  await ctx.close(); // Offline-Umschaltung oben kann gepoolte Verbindungen schließen
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' }); const p2 = await c2.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  for (let i = 0; ; i++) { try { await p2.goto(base); break; } catch (e) { if (i >= 2) throw e; await p2.waitForTimeout(1500); } } await p2.waitForSelector('.setup');
  await p2.click('[data-act=setup-skip]'); await p2.waitForSelector('.extiles');
  await p2.reload(); await p2.waitForSelector('.extiles'); // kein Setup mehr nach Überspringen
  ok('Setup überspringbar, erscheint danach nicht erneut');
  await p2.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('repzeit.maxes', JSON.stringify({ 'Liegestütze': [{ v: 25, date: '2026-10-20T10:00:00.000Z', source: 'test' }] }));
    localStorage.setItem('repzeit.history', JSON.stringify([{ id: 'sMIG', workoutId: 'tpl-liegestuetz-5', name: 'Liegestütze 5 min', exercise: 'Liegestütze', date: '2026-10-21T10:00:00.000Z', limitMs: 300000, total: 88, sets: [], perMin: 17.6, elapsedMs: 300000 }]));
    localStorage.setItem('repzeit.workouts', JSON.stringify([{ id: 'tpl-liegestuetz-5', template: true, name: 'Liegestütze 5 min', exercise: 'Liegestütze', limitMin: 5, phases: [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 10, restSec: 20, rounds: null }], auto: { enabled: true, pct: 40, phase2: 'rest' } }]));
    localStorage.setItem('repzeit.tunes', JSON.stringify({ 'Liegestütze': { max: 25, date: '2026-10-21T10:00:00.000Z', source: 'vorschlag', phases: [{ reps: 10, restSec: 15, rounds: 8 }, { reps: 10, restSec: 20, rounds: null }] } }));
    localStorage.setItem('repzeit.settings', JSON.stringify({ sound: false, exSel: 'Liegestütze', asked: ['Liegestütze'] }));
  });
  await p2.reload(); await p2.waitForSelector('.maxbar');
  const m = await p2.evaluate(() => ({ maxes: JSON.parse(localStorage.getItem('edt.maxes')), hist: JSON.parse(localStorage.getItem('edt.history')), tunes: JSON.parse(localStorage.getItem('edt.tunes')), set: JSON.parse(localStorage.getItem('edt.settings')), mig: JSON.parse(localStorage.getItem('edt.migrated')), old: localStorage.getItem('repzeit.history'), w: __rz.workouts.find(w => w.id === 'tpl-liegestuetz-5') }));
  assert.equal(m.maxes['Liegestütze'][0].v, 25); assert.equal(m.hist[0].id, 'sMIG'); assert.equal(m.tunes['Liegestütze'].phases[0].rounds, 8);
  assert.equal(m.set.sound, false); assert.ok(m.mig && m.mig.keys.includes('history')); assert.ok(m.old);
  assert.equal(m.w.phases.length, 3); assert.equal(m.w.name, 'Liegestütz-EDT 5 min');
  assert.match(await p2.textContent('.maxbar'), /25/);
  await p2.click('[data-go=history]'); await p2.waitForSelector('.hitem'); assert.match(await p2.textContent('.hlist'), /88/);
  await c2.close();
  ok('Migration repzeit.* → edt.*: Maximum, Verlauf, Anpassung, Einstellungen übernommen; Vorlage auf 3 Phasen');
}

assert.deepEqual(errors, [], 'Konsolenfehler: ' + errors.join('; '));
ok('Keine JS-Fehler');
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
