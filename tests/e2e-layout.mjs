// E2E v1.6.1: Timer-Layout auf mehreren Handy-Größen – Pausenring, Satz, Vorlauf und Fitnesstest dürfen nichts überdecken.
// Aufruf: node tests/e2e-layout.mjs [BASIS_URL] [--report]  (--report: nur messen, nicht abbrechen)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
const args = process.argv.slice(2), REPORT = args.includes('--report');
let base = args.find(a => !a.startsWith('--')), server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18741', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18741/'; }
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
const NOW = Date.parse('2026-10-31T17:30:00+01:00');
const VIEWPORTS = [[360, 640], [375, 667], [390, 844], [412, 915], [844, 390]];
const SHOTS = { '360x640': '60_pause_360.png', '390x844': '61_pause_390.png', '844x390': '62_pause_landscape.png' };
const history = [{ id: 'h1', workoutId: 'tpl-liegestuetz-5', workoutName: 'Liegestütz-EDT 5 min', exercise: 'Liegestütze', date: new Date(NOW - 3 * 86400000).toISOString(), limitMs: 300000, total: 99,
  sets: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, target: 10, done: 10 })), elapsedMs: 300000, aborted: false, perMin: 19.8, prevBest: null }];
const maxes = { 'Liegestütze': [{ v: 28, date: new Date(NOW - 4 * 86400000).toISOString(), source: 'test', durMs: 60000 }] };

// Elemente, die sich je Phase nicht überlappen dürfen (sichtbare, nicht leere Rechtecke)
const GROUPS = {
  lead: ['.ttop', '.leadbox > .lbl:first-child', '.leadnum', '.leadbox > .lbl:last-child'],
  work: ['.ttop', '.clock', '.stats2', '.train > .pos', '.work .lbl', '.adj', '.hit'],
  rest: ['.ttop', '.clock', '.stats2', '.train > .pos', '.ringwrap', '.next', '.restbar .rate', '.restbar .last', '[data-act=skip]'],
  testlead: ['.ttop', '.leadbox > .lbl:first-child', '.leadnum', '.leadbox > .lbl:last-child'],
  testrun: ['.ttop', '.testclock .badge', '#a-time', '.testclock > .lbl', '.hit.stop'],
  // v1.7.0 Kombi: aktuelle Übung groß, nächster Schritt darunter
  cwork: ['.ttop', '.clock', '.stats2', '.train > .pos', '.cwork .cex', '.cwork .lbl', '.adj', '.cwork .cnext', '.hit'],
  crest: ['.ttop', '.clock', '.stats2', '.train > .pos', '.ringwrap', '.next', '.restbar .rate', '.restbar .last', '[data-act=skip]'],
};
const COMBO = [{ id: 'c-lay', name: 'Push & Pull Langname Test', steps: [{ exercise: 'Liegestütze', reps: 12, restSec: 20 }, { exercise: 'Klimmzüge', reps: 4, restSec: 20 }, { exercise: 'Kniebeugen', reps: 15, restSec: 30 }], mode: 'time', limitMin: 10, rounds: 5 }];
const COMBO_SHOTS = { '360x640': '75_kombi_360.png', '844x390': '76_kombi_landscape.png' };
const measure = (page, sels) => page.evaluate(sels => {
  const R = sels.map(s => { const e = document.querySelector(s); if (!e) return { s, missing: true }; const r = e.getBoundingClientRect(); return { s, x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  const bad = [], tol = 0.5, vw = innerWidth, vh = innerHeight;
  for (const a of R) { if (a.missing) { bad.push(`${a.s} fehlt`); continue; } if (a.w < 1 || a.h < 1) bad.push(`${a.s} leer`); if (a.x < -tol || a.y < -tol || a.r > vw + tol || a.b > vh + tol) bad.push(`${a.s} außerhalb (${Math.round(a.x)},${Math.round(a.y)}–${Math.round(a.r)},${Math.round(a.b)})`); }
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.missing || b.missing) continue;
    const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x), oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    if (ox > tol && oy > tol) bad.push(`${a.s} ∩ ${b.s} (${Math.round(ox)}×${Math.round(oy)} px)`); }
  const ring = R.find(x => x.s === '.ringwrap');
  return { bad, ring: ring && !ring.missing ? Math.round(ring.w) : null };
}, sels);
let fails = 0;
// Zahl und „Pause“ liegen innerhalb des Rings und überlappen sich nicht; Ring mindestens 96 px
const inside = async (page, vp) => {
  const m = await page.evaluate(() => { const g = s => document.querySelector(s).getBoundingClientRect(), R = g('.ringwrap'), n = g('#t-rest'), l = g('.ring-in .lbl');
    const inR = q => q.left >= R.left && q.right <= R.right && q.top >= R.top && q.bottom <= R.bottom;
    return { w: R.width, inN: inR(n), inL: inR(l), sep: n.bottom <= l.top + 0.5 }; });
  const bad = []; if (m.w < 96) bad.push(`Ring nur ${Math.round(m.w)} px`); if (!m.inN || !m.inL) bad.push('Inhalt ragt aus dem Ring'); if (!m.sep) bad.push('Zahl ∩ „Pause“');
  if (bad.length) { fails++; console.log(`✗ ${vp} Ring: ${bad.join('; ')}`); if (!REPORT) assert.fail(`${vp} Ring: ${bad.join('; ')}`); }
};
const check = async (page, vp, phase) => {
  const m = await measure(page, GROUPS[phase]);
  if (m.bad.length) { fails++; console.log(`✗ ${vp} ${phase}: ${m.bad.join('; ')}`); if (!REPORT) assert.fail(`${vp} ${phase}: ${m.bad.join('; ')}`); }
  return m;
};

for (const [w, h] of VIEWPORTS) {
  const vp = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date(NOW) });
  await page.goto(base); await page.waitForSelector('.setup, .extiles');
  await page.evaluate(({ history, maxes }) => {
    localStorage.setItem('edt.history', JSON.stringify(history)); localStorage.setItem('edt.maxes', JSON.stringify(maxes));
    localStorage.setItem('edt.settings', JSON.stringify({ setupDone: true, dayTipSeen: true, exSel: 'Liegestütze', asked: ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'], recNotify: false, sound: false, leadIn: 5 }));
    localStorage.setItem('edt.exercises', JSON.stringify([{ id: 'x-b', name: 'Burpees', muscle: 'own' }, { id: 'x-k', name: 'Kettlebell Swings', muscle: 'glutes' }]));
  }, { history, maxes });
  await page.reload(); await page.waitForSelector('.extiles');
  // v1.8.0 Startseite: 8 Grund- + 2 eigene Kacheln – nichts ragt heraus, nichts überlappt, Namen ohne Überlauf
  await page.clock.runFor(1200); await page.waitForTimeout(100);
  const rvOff = await page.addStyleTag({ content: '.rv{transform:none!important;transition:none!important}' }); // Scroll-Einblendung (translateY 20 px) für die Messung aus
  const home = await page.evaluate(() => {
    const bad = [], vw = innerWidth, tiles = [...document.querySelectorAll('.extiles .extile')], R = e => e.getBoundingClientRect();
    tiles.forEach((t, i) => { const r = R(t), name = t.dataset.exsel;
      if (r.left < -0.5 || r.right > vw + 0.5) bad.push(`${name} außerhalb`);
      for (const s of ['.tf', '.exname', '.tv', '.exmax', '.exbest']) { const e = t.querySelector(s); if (!e) { bad.push(`${name} ${s} fehlt`); continue; } const q = R(e);
        if (q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5) bad.push(`${name} ${s} ragt heraus`); }
      const n = t.querySelector('.exname'); if (n.scrollWidth > n.clientWidth + 1) bad.push(`${name} Name zu breit`);
      if (!t.classList.contains('cust') && n.scrollHeight > n.clientHeight + 1) bad.push(`${name} Name abgeschnitten`);
      for (const v of t.querySelectorAll('.tv b, .tv small')) if (v.scrollWidth > v.clientWidth + 1 || R(v).right > r.right + 0.5) bad.push(`${name} Wert „${v.textContent}“ läuft über`);
      const [m, k] = [R(t.querySelector('.exmax')), R(t.querySelector('.exbest'))]; if (m.bottom > k.top + 0.5) bad.push(`${name} Werte überlappen`);
      const f = R(t.querySelector('.tf')); if (f.bottom > m.top + 0.5) bad.push(`${name} Figur ∩ Werte`);
      tiles.slice(i + 1).forEach(u => { const o = R(u); if (Math.min(r.right, o.right) - Math.max(r.left, o.left) > 0.5 && Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top) > 0.5) bad.push(`${name} ∩ ${u.dataset.exsel}`); }); });
    const add = R(document.querySelector('.extiles .addex')), last = R(tiles.at(-1));
    if (add.top < last.bottom - 0.5 || add.right > vw + 0.5) bad.push(`„+ Eigene Übung“ falsch platziert (${Math.round(add.top)},${Math.round(add.right)} vs ${Math.round(last.bottom)})`);
    if (document.documentElement.scrollWidth > vw + 0.5) bad.push('Seite breiter als Bildschirm');
    return { bad, n: tiles.length, cols: new Set(tiles.map(t => Math.round(R(t).left))).size, h: Math.round(R(tiles[0]).height) };
  });
  await rvOff.evaluate(e => e.remove());
  if (home.bad.length) { fails++; console.log(`✗ ${vp} Startseite: ${home.bad.join('; ')}`); if (!REPORT) assert.fail(`${vp} Startseite: ${home.bad.join('; ')}`); }
  assert.equal(home.n, 10);
  ok(`${vp}: Startseite 10 Kacheln (8 Grund + 2 eigene) ohne Überlauf/Überlappung`, `${home.cols} Spalten, Kachel ${home.h} px`);
  // Training Liegestütz-EDT 5 min
  if (!(await page.$('.extile.open[data-exsel="Liegestütze"]'))) await page.click('[data-exsel="Liegestütze"]');
  await page.waitForSelector('#xp-panel'); await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=start]'); await page.click('[data-act=plan-start]');
  if (await page.$('.recsheet')) await page.click('[data-act=rec-start]');
  await page.waitForSelector('#t-lead'); const r = { lead: await check(page, vp, 'lead') };
  await page.clock.runFor(5100); await page.waitForSelector('[data-act=done]'); await page.waitForTimeout(100);
  r.work = await check(page, vp, 'work');
  await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]');
  await page.clock.runFor(3000); await page.waitForTimeout(100);
  r.rest = await check(page, vp, 'rest'); await inside(page, vp); // 1. Pause: Bewertung „Satz 1“ + „Letzter Satz“ sichtbar
  // 2. Satz → 2. Pause mit Statistik „Hochrechnung“ (ab 2 Sätzen)
  await page.click('[data-act=skip]'); await page.waitForSelector('[data-act=done]'); await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]');
  await page.clock.runFor(2000); await page.waitForTimeout(150);
  r.rest2 = await check(page, vp, 'rest'); await inside(page, vp);
  if (SHOTS[vp]) await page.screenshot({ path: path.join(SCREENS, SHOTS[vp]) });
  // Fitnesstest: Vorlauf + laufender Test
  await page.click('[data-act=quit]'); await page.click('[data-act=quit-discard]'); await page.waitForSelector('.extiles');
  if (!(await page.$('.extile.open[data-exsel="Liegestütze"]'))) await page.click('[data-exsel="Liegestütze"]');
  await page.waitForSelector('#xp-panel [data-act=assess]'); await page.click('#xp-panel [data-act=assess]');
  await page.waitForSelector('[data-act=assess-test]'); await page.click('[data-act=assess-test]'); await page.waitForSelector('#a-lead');
  r.testlead = await check(page, vp, 'testlead');
  await page.clock.runFor(3200); await page.waitForSelector('#a-time'); r.testrun = await check(page, vp, 'testrun');
  // v1.7.0 Kombi-Training: Satz und Pause
  await page.evaluate(c => localStorage.setItem('edt.combos', JSON.stringify(c)), COMBO);
  await page.reload(); await page.waitForSelector('.ccard [data-act=combo-start]'); await page.click('.ccard [data-act=combo-start]');
  await page.waitForSelector('#t-lead'); await page.clock.runFor(5100); await page.waitForSelector('.cwork'); await page.waitForTimeout(100);
  r.cwork = await check(page, vp, 'cwork');
  await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]'); await page.clock.runFor(2000); await page.waitForTimeout(100);
  r.crest = await check(page, vp, 'crest'); await inside(page, vp);
  await page.click('[data-act=skip]'); await page.waitForSelector('.cwork'); await page.waitForTimeout(100); r.cwork2 = await check(page, vp, 'cwork');
  if (COMBO_SHOTS[vp]) await page.screenshot({ path: path.join(SCREENS, COMBO_SHOTS[vp]) });
  if (!REPORT) assert.deepEqual(errors, []);
  ok(`${vp}: Vorlauf, Satz, Pause (Bewertung, Letzter Satz, Hochrechnung), Fitnesstest, Kombi-Satz und -Pause – keine Überlappung, alles im Bildschirm`, `Ring ${r.rest.ring}/${r.rest2.ring}/${r.crest.ring} px`);
  await ctx.close();
}
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-layout-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
if (REPORT && fails) console.log(`${fails} Prüfungen mit Überlappung`);
