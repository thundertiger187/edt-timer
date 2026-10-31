// E2E v1.5.0: Startseite „Training“ (Heute/Übungen/Zuletzt), Aufklapp-Panel, Tabs, Timer-Tönung, Verlauf-Entwicklung.
// Aufruf: node tests/e2e-redesign.mjs [BASIS_URL]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
let base = process.argv[2], server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18738', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18738/'; }
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
const shot = async n => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SCREENS, n) }); };
const NOW = Date.parse('2026-10-31T17:30:00+01:00'); // Samstag
await page.clock.install({ time: new Date(NOW) });
await page.goto(base); await page.waitForSelector('.setup, .extiles');

const at = (daysAgo, hh, mm = 0) => { const d = new Date(NOW - daysAgo * 86400000); d.setHours(hh, mm, 0, 0); return d.toISOString(); };
const S = (id, exercise, workoutId, workoutName, date, limitMin, total, extra = {}) => ({ id, workoutId, workoutName, exercise, date, limitMs: limitMin * 60000, total, sets: Array.from({ length: Math.round(total / 5) }, (_, i) => ({ n: i + 1, target: 5, done: 5 })), elapsedMs: limitMin * 60000, aborted: false, perMin: Math.round(total / limitMin * 10) / 10, prevBest: null, ...extra });
// Beispieldaten: 30 Tage Liegestütze (5 min), Klimmzüge (8 min), Kniebeugen (10 min)
const L = [[28, 84], [26, 88], [24, 86], [21, 93], [19, 95], [17, 99], [14, 98], [12, 104], [10, 106], [7, 108], [5, 112], [3, 110], [1, 117]];
const history = [
  S('old1', 'Liegestütze', 'tpl-liegestuetz-5', 'Liegestütz-EDT 5 min', at(40, 18), 5, 70),
  ...L.map(([d, t], i) => S('l' + i, 'Liegestütze', 'tpl-liegestuetz-5', 'Liegestütz-EDT 5 min', at(d, 18, 10), 5, t)),
  S('l3b', 'Liegestütze', 'tpl-liegestuetz-5b', 'Liegestütze 5 min – Pausen steigen', at(21, 20), 5, 89),
  S('lab', 'Liegestütze', 'tpl-liegestuetz-5', 'Liegestütz-EDT 5 min', at(2, 18), 5, 40, { aborted: true }),
  ...[[27, 22], [20, 25], [13, 27], [6, 30], [2, 34]].map(([d, t], i) => S('k' + i, 'Klimmzüge', 'tpl-klimmzug-8', 'Klimmzug-EDT 8 min', at(d, 19), 8, t)),
  ...[[25, 150], [11, 166]].map(([d, t], i) => S('q' + i, 'Kniebeugen', 'tpl-kniebeugen-10', 'Kniebeugen-EDT 10 min', at(d, 7), 10, t)),
  S('today1', 'Liegestütze', 'tpl-liegestuetz-5', 'Liegestütz-EDT 5 min', at(0, 8, 5), 5, 115),
];
const maxes = {
  'Liegestütze': [{ v: 22, date: at(29, 17), source: 'test' }, { v: 25, date: at(15, 17), source: 'test' }, { v: 28, date: at(4, 17), source: 'test' }],
  'Klimmzüge': [{ v: 8, date: at(26, 17), source: 'test' }, { v: 10, date: at(9, 17), source: 'test' }],
  'Kniebeugen': [{ v: 35, date: at(26, 17), source: 'input' }],
};
const plan = { entries: [
  { id: 'p1', day: 5, time: '08:00', workoutId: 'tpl-liegestuetz-5' }, { id: 'p2', day: 5, time: '12:00', workoutId: 'tpl-kniebeugen-10' },
  { id: 'p3', day: 5, time: '19:00', workoutId: 'tpl-klimmzug-8' }, { id: 'p4', day: 0, time: '18:00', workoutId: 'tpl-liegestuetz-5' },
  { id: 'p5', day: 2, time: '18:00', workoutId: 'tpl-klimmzug-8' }, { id: 'p6', day: 4, time: '18:00', workoutId: 'tpl-liegestuetz-5' } ], alarmBefore: 10, remind: false, removed: [], exported: [], seq: 6 };
await page.evaluate(({ history, maxes, plan }) => {
  localStorage.setItem('edt.history', JSON.stringify(history)); localStorage.setItem('edt.maxes', JSON.stringify(maxes)); localStorage.setItem('edt.plan', JSON.stringify(plan));
  const s = JSON.parse(localStorage.getItem('edt.settings') || '{}');
  localStorage.setItem('edt.settings', JSON.stringify({ ...s, setupDone: true, dayTipSeen: true, exSel: 'Liegestütze', asked: ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'], recNotify: false }));
}, { history, maxes, plan });
await page.reload(); await page.waitForSelector('.extiles');

// --- Startseite
assert.equal((await page.textContent('.hd h1')).trim(), 'Training');
assert.equal((await page.textContent('.hd span')).trim(), 'Samstag, 31.10.');
assert.doesNotMatch(await page.textContent('body'), /Escalating Density Training/);
assert.deepEqual(await page.$$eval('.sh h2', e => e.map(x => x.textContent)), ['Heute', 'Übungen', 'Zuletzt']);
assert.deepEqual(await page.$$eval('.sh .lk', e => e.map(x => x.textContent)), ['Wochenplan ›', 'Fitnesstest ›', 'Verlauf ›']);
assert.equal((await page.textContent('.nx .eyebrow')).trim(), 'Als Nächstes · 19:00');
assert.equal((await page.textContent('.nx .hname')).trim(), 'Klimmzüge');
assert.equal((await page.textContent('.nx .hsub')).trim(), 'Klimmzug-EDT 8 min · Bestwert 34');
assert.equal(await page.$$eval('.nx .go', e => e.length), 1);
assert.match(await page.textContent('.nx .go'), /Klimmzüge starten$/);
const mini = await page.$$eval('.nx .mr', e => e.map(x => x.className.replace('mr trow', '').trim() + ':' + x.textContent.replace(/\s+/g, ' ').trim()));
assert.equal(mini.length, 2); assert.match(mini[0], /^done:08:00\s*Liegestütze\s*.*✓ erledigt$/); assert.match(mini[1], /^late:12:00\s*Kniebeugen.*verpasst · Start ›$/);
assert.equal(await page.$$eval('.nx .wk > div', e => e.length), 7);
ok('Heute: Header „Training“ + Datum, Karte „Als Nächstes · 19:00“ Klimmzüge, ein Start-Button, Zeilen erledigt/verpasst, Wochenpunkte', mini.join(' | '));
const tiles = await page.$$eval('.extiles .extile:not(.own)', e => e.map(x => ({ n: x.querySelector('.exname').textContent, m: x.querySelector('.exmax').textContent, b: x.querySelector('.exbest').textContent, h: Math.round(x.getBoundingClientRect().height), fig: !!x.querySelector('.tf .tilefig'), txt: x.textContent })));
assert.equal(tiles.length, 4); assert.equal(new Set(tiles.map(t => t.h)).size, 1, 'gleiche Kachelhöhe');
const T = Object.fromEntries(tiles.map(t => [t.n, t]));
assert.equal(T['Liegestütze'].m, 'Max am Stück 28'); assert.equal(T['Liegestütze'].b, 'Rekord 5 min 117');
assert.equal(T['Dips'].m, 'Max am Stück Test offen'); assert.equal(T['Kniebeugen'].b, 'Rekord 5 min –');
for (const t of tiles) { assert.ok(t.fig); assert.doesNotMatch(t.txt, /erholt/); }
assert.equal(await page.$$eval('.extile.own', e => e.length), 1);
assert.equal(await page.$$eval('#xp-panel', e => e.length), 0, 'anfangs zugeklappt');
ok('Übungen: 2×2 Kacheln gleich hoch, Figur in eigener Box, „Max am Stück“/„Rekord 5 min“, Zeile „Eigene Übungen“', tiles.map(t => `${t.n}: ${t.m} · ${t.b}`).join(' | '));
const recent = await page.$$eval('.list .lr', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
assert.equal(recent.length, 2); assert.match(recent[0], /^Liegestütz-EDT 5 min\s*Sa\., 31\.10\. · 23 Sätze · 23\/min\s*115$/);
ok('Zuletzt: zwei letzte Einheiten', recent.join(' | '));
assert.deepEqual(await page.$$eval('.tabs .tab', e => e.map(x => x.textContent.trim())), ['Training', 'Woche', 'Verlauf', 'Mehr']);
assert.equal(await page.$$eval('.tab.on .ic', e => e.length), 1);
ok('Tabs: Training / Woche / Verlauf / Mehr, aktive Pill');
await shot('40_start.png');
await page.screenshot({ path: path.join(SCREENS, '42_start_ganz.png'), fullPage: true });
const sc = await page.$eval('.scroll', e => e.scrollHeight);
await page.setViewportSize({ width: 390, height: sc + 140 }); await shot('42_start_ganz.png'); await page.setViewportSize({ width: 390, height: 844 });

// --- Aufklappen
await page.click('[data-exsel="Liegestütze"]'); await page.waitForSelector('#xp-panel');
const pos = await page.evaluate(() => { const p = document.querySelector('#xp-panel'), t = [...document.querySelectorAll('.extiles > *')]; return { idx: t.indexOf(p), panel: p.dataset.panel, cards: p.querySelectorAll('.card').length, open: document.querySelector('.extile.open .exname')?.textContent, w: Math.round(p.getBoundingClientRect().width), gw: Math.round(document.querySelector('.extiles').getBoundingClientRect().width), txt: p.textContent, box: p.querySelector('.maxbar')?.textContent ?? '' }; });
assert.equal(pos.idx, 2, 'Panel direkt unter der ersten Kachelreihe'); assert.equal(pos.panel, 'Liegestütze'); assert.equal(pos.open, 'Liegestütze'); assert.equal(pos.w, pos.gw);
assert.ok(pos.cards >= 2); assert.match(pos.txt, /Fitnesstest/); assert.match(pos.txt, /\+ Neues Workout/); assert.match(pos.box, /Fitnesstest/); assert.doesNotMatch(pos.box, /Max|28/);
const bg = await page.$eval('.extile.open', e => getComputedStyle(e).backgroundColor); assert.equal(bg, 'rgb(26, 31, 39)', 'keine grüne Füllung');
await page.waitForTimeout(400);
await page.$eval('.extile.open', e => e.scrollIntoView({ block: 'start' })); await page.$eval('.scroll', e => e.scrollBy(0, -60));
await shot('41_aufgeklappt.png');
ok('Aufklappen: Panel volle Breite unter der Reihe, Fitnesstest-Box ohne doppeltes Max, Workouts, „+ Neues Workout“, Rahmen statt grüner Füllung', `${pos.cards} Workouts`);
await page.click('[data-exsel="Klimmzüge"]'); await page.waitForTimeout(400);
let p2 = await page.evaluate(() => { const p = document.querySelectorAll('#xp-panel'); return { n: p.length, panel: p[0]?.dataset.panel, idx: [...document.querySelectorAll('.extiles > *')].indexOf(p[0]) }; });
assert.deepEqual(p2, { n: 1, panel: 'Klimmzüge', idx: 4 }); ok('Nur ein Panel offen, Klimmzüge unter zweiter Reihe');
await page.click('[data-exsel="Klimmzüge"]'); await page.waitForTimeout(400);
assert.equal(await page.$$eval('#xp-panel', e => e.length), 0); ok('Zweites Tippen klappt zu');
await page.click('[data-exsel="__own"]'); await page.waitForSelector('#xp-panel[data-panel="__own"]');
assert.match(await page.textContent('#xp-panel'), /\+ Neues Workout/); await page.click('[data-exsel="__own"]'); await page.waitForTimeout(400);
ok('Eigene Übungen klappt auf/zu');

// --- Kein Wochenplan: letzte Einheit + Hinweis
await page.evaluate(() => localStorage.setItem('edt.plan', JSON.stringify({ entries: [], alarmBefore: 10, remind: false, removed: [], exported: [], seq: 0 })));
await page.reload(); await page.waitForSelector('.nx');
assert.equal((await page.textContent('.nx .eyebrow')).trim(), 'Zuletzt trainiert'); assert.equal((await page.textContent('.nx .hname')).trim(), 'Liegestütze');
assert.equal((await page.textContent('.nx .hplan')).trim(), 'Wochenplan anlegen ›');
ok('Ohne Wochenplan: zuletzt trainiertes Workout + „Wochenplan anlegen“');
await page.evaluate(p => localStorage.setItem('edt.plan', JSON.stringify(p)), plan); await page.reload(); await page.waitForSelector('.nx');

// --- Timer
await page.click('.nx .go');
if (await page.$('.recsheet')) await page.click('[data-act=rec-start]');
await page.waitForSelector('#t-lead'); await page.clock.runFor(5100); await page.waitForSelector('[data-act=done]');
assert.equal(await page.$eval('.train', e => e.className), 'train st-work');
assert.equal(await page.$$eval('#t-proj', e => e.length), 0, 'Hochrechnung erst ab Satz 3');
for (let i = 0; i < 2; i++) { await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]'); await page.clock.runFor(4000); await page.click('[data-act=skip]'); await page.waitForSelector('[data-act=done]'); }
assert.equal(await page.$$eval('#t-proj', e => e.length), 1);
const tw = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector('.train')).backgroundImage, tot: getComputedStyle(document.querySelector('#t-total')).fontSize, vs: getComputedStyle(document.querySelector('#t-vs')).fontSize }));
assert.match(tw.bg, /198, 255, 61/); assert.ok(parseFloat(tw.tot) > parseFloat(tw.vs) * 2);
await shot('43_timer_satz.png');
ok('Timer Satz: grünliche Tönung, „Wdh. gesamt“ groß, „vs. Bestwert“ klein, Hochrechnung ab Satz 3', `${tw.tot} vs ${tw.vs}`);
await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]'); await page.clock.runFor(3000);
const tr = await page.evaluate(() => ({ cls: document.querySelector('.train').className, bg: getComputedStyle(document.querySelector('.train')).backgroundImage, rc: !!document.querySelector('.restbar.compact .rc .rate') && !!document.querySelector('.restbar.compact .rc .last') }));
assert.equal(tr.cls, 'train st-rest'); assert.match(tr.bg, /56, 217, 255/); assert.ok(tr.rc);
await shot('44_timer_pause.png');
ok('Timer Pause: cyan Tönung, Bewertung + „Letzter Satz“ kompakt in einer Box');
await page.click('[data-act=quit]'); await page.waitForTimeout(300);
for (const sel of ['[data-act=quit-discard]', '[data-act=discard]', '[data-act=quit-confirm]']) if (await page.$(sel)) { await page.click(sel); break; }
await page.waitForTimeout(300);

// --- Verlauf: Chip sichtbar + Entwicklung
await page.goto(base); await page.waitForSelector('.extiles');
await page.click('.tab[data-go=history]'); await page.waitForSelector('.dev');
const chipVis = await page.$eval('.chips.scrollx:not(.devex) .chip.on', e => { const r = e.getBoundingClientRect(), c = e.parentElement.getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1; });
assert.ok(chipVis, 'vorausgewählter Workout-Chip sichtbar'); ok('Verlauf: vorausgewählter Chip in den sichtbaren Bereich gescrollt');
await page.click('[data-hf="tpl-liegestuetz-5"]'); await page.waitForTimeout(900);
assert.equal(await page.textContent('.devex .chip.on'), 'Liegestütze'); // Diagramm folgt der Auswahl im Verlauf
const dv = await page.evaluate(() => ({ pts: document.querySelectorAll('.devc .wp').length, tests: document.querySelectorAll('.devc .tm').length, trend: !!document.querySelector('.devc .tr'), ax: [...document.querySelectorAll('.devc .ax')].map(t => t.textContent), sum: document.querySelector('.devsum')?.textContent, lim: document.querySelector('.dev .panel-h span:last-child')?.textContent }));
assert.equal(dv.pts, 14, '14 Tage mit 5-min-Einheiten (Tag mit zwei Einheiten = beste, abgebrochen zählt nicht)');
assert.equal(dv.tests, 3); assert.ok(dv.trend); assert.ok(dv.ax.includes('01.10.') || dv.ax.some(a => /^\d\d\.\d\d\.$/.test(a)));
assert.equal(dv.lim, '5-min-Einheiten');
// Ø erste Woche (84,88,86) = 86, letzte 7 Tage (112,110,117,115) = 113,5 → +32 %
assert.match(dv.sum, /^\+32 % Wdh\. ggü\. erster Woche/);
ok('Entwicklung Liegestütze: 14 Punkte, 3 Fitnesstests (rechte Achse), Trend, Zusammenfassung', dv.sum);
await page.locator('.devc .hit').nth(13).dispatchEvent('click');
const info = await page.textContent('#devinfo'); assert.match(info, /31\.10\..*115 Wdh\. · Liegestütz-EDT 5 min/);
ok('Punkt antippen → Datum, Wdh., Workout', info);
await page.$eval('.dev', e => e.scrollIntoView({ block: 'start' })); await page.$eval('.scroll', e => e.scrollBy(0, -70));
await shot('45_verlauf_diagramm.png');
await page.click('[data-dex="__all"]'); await page.waitForTimeout(300);
assert.ok(await page.$$eval('.devlim .chip', e => e.length) >= 3, 'Dauer-Auswahl bei mehreren Zeitvorgaben');
await page.click('[data-dlim="8"]'); await page.waitForTimeout(300);
assert.equal(await page.$$eval('.devc .wp', e => e.length), 5); ok('Alle + Dauer 8 min → 5 Punkte (Klimmzüge)');
await page.click('[data-dex="Dips"]'); await page.waitForTimeout(300);
assert.equal((await page.textContent('.devempty')).trim(), 'Noch keine Einheiten in den letzten 30 Tagen'); ok('Leerer Zustand');
assert.deepEqual(errors, []); ok('Keine JS-Fehler');
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-redesign-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
