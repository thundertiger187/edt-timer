// E2E v1.6.0/1.6.1: Leuchtpunkt, Ziffern-Effekt, Karten beim Scrollen, fließender Hintergrund; reduzierte Bewegung; ohne IntersectionObserver.
// Aufruf: node tests/e2e-fx.mjs [BASIS_URL] [--video]
import { chromium, webkit, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
const args = process.argv.slice(2), VIDEO = args.includes('--video');
let base = args.find(a => !a.startsWith('--')), server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18739', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18739/'; }
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const CTX = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' };
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
const NOW = Date.parse('2026-10-31T17:30:00+01:00');
const at = (daysAgo, hh, mm = 0) => { const d = new Date(NOW - daysAgo * 86400000); d.setHours(hh, mm, 0, 0); return d.toISOString(); };
const S = (id, exercise, workoutId, workoutName, date, limitMin, total, extra = {}) => ({ id, workoutId, workoutName, exercise, date, limitMs: limitMin * 60000, total, sets: Array.from({ length: Math.round(total / 5) }, (_, i) => ({ n: i + 1, target: 5, done: 5 })), elapsedMs: limitMin * 60000, aborted: false, perMin: Math.round(total / limitMin * 10) / 10, prevBest: null, ...extra });
const L = [[28, 84], [24, 86], [21, 93], [17, 99], [14, 98], [12, 104], [10, 106], [7, 108], [5, 112], [3, 110], [1, 117]];
const history = [
  ...L.map(([d, t], i) => S('l' + i, 'Liegestütze', 'tpl-liegestuetz-5', 'Liegestütz-EDT 5 min', at(d, 18, 10), 5, t, { prevBest: i ? Math.max(...L.slice(0, i).map(x => x[1])) : null })),
  ...[[20, 25], [13, 27], [6, 30], [2, 34]].map(([d, t], i) => S('k' + i, 'Klimmzüge', 'tpl-klimmzug-8', 'Klimmzug-EDT 8 min', at(d, 19), 8, t)),
  S('rec', 'Liegestütze', 'tpl-liegestuetz-5', 'Liegestütz-EDT 5 min', at(0, 8, 5), 5, 123, { prevBest: 117 }), // neuer Rekord 5 min
];
const maxes = { 'Liegestütze': [{ v: 28, date: at(4, 17), source: 'test' }], 'Klimmzüge': [{ v: 10, date: at(9, 17), source: 'test' }], 'Kniebeugen': [{ v: 35, date: at(26, 17), source: 'input' }] };
const plan = { entries: [{ id: 'p1', day: 5, time: '08:00', workoutId: 'tpl-liegestuetz-5' }, { id: 'p3', day: 5, time: '19:00', workoutId: 'tpl-klimmzug-8' }, { id: 'p4', day: 0, time: '18:00', workoutId: 'tpl-liegestuetz-5' }], alarmBefore: 10, remind: false, removed: [], exported: [], seq: 3 };
async function open(opts = {}, init, settings = {}, br = browser) {
  const ctx = await br.newContext({ ...CTX, ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: new Date(NOW) });
  await page.goto(base); await page.waitForSelector('.setup, .extiles');
  await page.evaluate(({ history, maxes, plan, settings }) => {
    localStorage.setItem('edt.history', JSON.stringify(history)); localStorage.setItem('edt.maxes', JSON.stringify(maxes)); localStorage.setItem('edt.plan', JSON.stringify(plan));
    const s = JSON.parse(localStorage.getItem('edt.settings') || '{}');
    localStorage.setItem('edt.settings', JSON.stringify({ ...s, setupDone: true, dayTipSeen: true, exSel: 'Liegestütze', asked: ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'], recNotify: false, sound: false, ...settings }));
  }, { history, maxes, plan, settings });
  await page.reload(); await page.waitForSelector('.extiles');
  return { ctx, page, errors };
}
const shot = (page, n) => page.screenshot({ path: path.join(SCREENS, n) });

// ===== normale Bewegung =====
{
  const { ctx, page, errors } = await open();
  // 4. Hintergrund Startseite
  const bg = await page.evaluate(() => { const b = document.querySelector('#fxbg'), i = b.querySelector('.fxl.g i'); return { mode: b.dataset.mode, anim: getComputedStyle(i).animationName, dur: getComputedStyle(i).animationDuration, op: getComputedStyle(b).opacity, z: getComputedStyle(b).zIndex, aria: b.getAttribute('aria-hidden') }; });
  assert.equal(bg.mode, 'home'); assert.equal(bg.anim, 'fxa'); assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'full'); assert.ok(parseFloat(bg.dur) >= 20 && parseFloat(bg.dur) <= 40); assert.equal(bg.aria, 'true');
  // 3. Startseite: sichtbarer Bereich spätestens nach 300 ms sichtbar
  await page.waitForTimeout(320);
  const vis = await page.evaluate(() => [...document.querySelectorAll('.rv')].filter(e => e.getBoundingClientRect().top < innerHeight * 0.9).map(e => +getComputedStyle(e).opacity));
  assert.ok(vis.length >= 2 && vis.every(o => o > 0.99), `oben sichtbar: ${vis}`);
  const below = await page.evaluate(() => [...document.querySelectorAll('.rv')].filter(e => e.getBoundingClientRect().top > innerHeight + 40).map(e => e.classList.contains('rv-in')));
  assert.ok(below.length && below.every(x => !x), 'unten noch nicht eingeblendet');
  await page.$eval('.scroll', e => e.scrollTo(0, e.scrollHeight)); await page.waitForTimeout(500);
  assert.equal(await page.$$eval('.rv:not(.rv-in)', e => e.length), 0);
  ok('Startseite: Hintergrund „home“ (fxa, 20–40 s), oben sichtbar ≤ 300 ms, Karten unten blenden beim Scrollen ein', `${bg.dur}, ${below.length} Elemente unten`);
  await page.$eval('.scroll', e => e.scrollTo(0, 0)); await page.waitForTimeout(400);
  await shot(page, '65_start_hintergrund_neu.png');
  // 1. Leuchtpunkt beim pointerdown (Maus gedrückt halten, damit kein Klick auslöst)
  const box = await page.locator('.extile[data-exsel="Liegestütze"]').boundingBox();
  await page.mouse.move(box.x + 60, box.y + 50); await page.mouse.down();
  const g = await page.evaluate(() => { const e = document.querySelector('.fx-layer .fx-glow'); return e && { cls: e.className, gx: e.style.left, gy: e.style.top, w: getComputedStyle(e).width, pe: getComputedStyle(e).pointerEvents }; });
  assert.ok(g, 'Glow-Element nach pointerdown'); assert.equal(g.cls, 'fx-glow cyan'); assert.ok(g.gx.endsWith('px') && g.gy.endsWith('px')); assert.equal(g.w, '84px', 'punktuell, nicht Kachelform'); assert.equal(g.pe, 'none');
  await page.waitForTimeout(150); await shot(page, '64_glow_neu.png');
  await page.mouse.up(); await page.waitForSelector('#xp-panel'); // Tippen funktioniert weiter
  await page.waitForTimeout(800);
  assert.equal(await page.$$eval('.fx-glow', e => e.length), 0, 'Glow verschwindet');
  const gb = await page.locator('.nx .go').boundingBox();
  await page.mouse.move(gb.x + 30, gb.y + 20); await page.mouse.down();
  assert.equal(await page.$eval('.fx-glow', e => e.className), 'fx-glow green filled'); await page.mouse.move(gb.x + 30, gb.y - 300); await page.mouse.up();
  // echter Touch (hasTouch/isMobile): touchscreen.tap auf eine Karte → Glow
  await page.waitForTimeout(700);
  const tb = await page.locator('.extile[data-exsel="Kniebeugen"]').boundingBox();
  await page.touchscreen.tap(tb.x + 40, tb.y + 30);
  const tg = await page.evaluate(() => { const e = document.querySelector('.fx-layer .fx-glow'); return e && { cls: e.className, gx: e.style.left, a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration }; });
  assert.ok(tg, 'Glow nach touchscreen.tap'); assert.equal(tg.cls, 'fx-glow cyan'); assert.ok(tg.gx.endsWith('px')); assert.equal(tg.a, 'fxglow'); assert.equal(tg.d, '0.5s');
  await page.waitForSelector('#xp-panel[data-panel="Kniebeugen"]');
  ok('Leuchtpunkt bei echtem Touch (touchscreen.tap, Chromium mobil): Glow 0,5 s punktuell, Panel öffnet', `--gx ${tg.gx}`);
  ok('Leuchtpunkt: Element bei pointerdown an der Tippposition (cyan Kachel, grün Start-Button), pointer-events none, Tippen klappt Panel auf, Glow nach 0,9 s entfernt', `--gx ${g.gx} --gy ${g.gy}`);
  // 2. Ziffern-Effekt im Ergebnis (Verlauf → neueste Einheit, neuer Rekord 5 min)
  await page.click('.tab[data-go=history]'); await page.waitForSelector('.hitem');
  // Zufall nur für den Test auf Ziffern 4–9 begrenzen (Zielwert 123 enthält sie nicht), damit das Einrasten eindeutig messbar ist
  await page.evaluate(() => { const r = Math.random; Math.random = () => 0.4 + r() * 0.6; });
  const t = await page.evaluate(() => Date.now()); await page.clock.pauseAt(t + 50);
  await page.click('.hitem[data-hist="rec"]'); await page.waitForSelector('.hero .huge');
  await page.clock.runFor(450);
  const mid = await page.evaluate(() => { const h = document.querySelector('.hero .huge'); return { text: h.textContent, scr: h.getAttribute('data-scr'), cls: h.className, after: getComputedStyle(h, '::after').content }; });
  assert.equal(mid.text, '123'); assert.ok(mid.cls.includes('scr')); assert.match(mid.scr, /^[4-9]{3}$/);
  const aria = await page.locator('.hero .huge').ariaSnapshot();
  assert.match(aria, /123/); assert.ok(!mid.scr || mid.scr === '123' || !aria.includes(mid.scr), 'Screenreader bekommt nicht die Zufallsziffern');
  await shot(page, '54_scramble_mitte.png');
  const seq = [];
  for (let i = 0; i < 12; i++) { await page.clock.runFor(60); seq.push(await page.$eval('.hero .huge', h => h.getAttribute('data-scr'))); }
  await page.clock.runFor(400);
  const end = await page.evaluate(() => { const h = document.querySelector('.hero .huge'); return { text: h.textContent, scr: h.getAttribute('data-scr'), cls: h.className, hero: document.querySelector('.hero').className, badge: document.querySelector('.badge.big')?.textContent, grid: [...document.querySelectorAll('.grid3 b')].map(b => b.textContent + (b.hasAttribute('data-scr') ? '*' : '')) }; });
  assert.equal(end.text, '123'); assert.equal(end.scr, null); assert.equal(end.cls, 'huge');
  assert.match(end.badge, /^Neuer Rekord · 5 min · vorher 117$/); assert.match(end.hero, /flash/);
  assert.deepEqual(end.grid, ['25', '24,6', '5:00']);
  // Einrasten links → rechts: sobald eine Stelle fest ist, bleiben die Stellen links davon fest
  const fixed = seq.filter(Boolean).map(s => { const k = [...s].findIndex((c, i) => c !== '123'[i]); return k < 0 ? 3 : k; });
  assert.ok(fixed.every((k, i) => !i || k >= fixed[i - 1]) && fixed.at(-1) >= 2, `Einrasten links → rechts: ${fixed}`);
  ok('Ziffern-Effekt: Text/aria bleibt 123, Zufallsziffern nur als Pseudo-Inhalt, endet exakt auf 123, „Neuer Rekord“ + Leuchten', `Mitte ${mid.scr}, Folge ${seq.map(s => s ?? '–').join(' ')}`);
  await page.clock.resume(); await page.waitForTimeout(300);
  await shot(page, '52_ergebnis_rekord.png');
  // Verlauf-Einblendung
  await page.click('[data-go=history]'); await page.waitForSelector('.hitem');
  assert.ok(await page.$$eval('.rv', e => e.length) > 3); await page.waitForTimeout(350);
  assert.equal(await page.$eval('.dev', e => getComputedStyle(e).opacity), '1');
  ok('Verlauf: Panels/Einträge mit Einblendung, oben sofort sichtbar');
  // Seite verborgen → Hintergrund pausiert
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.$eval('#fxbg', b => b.classList.contains('paused') && getComputedStyle(b.querySelector('.fxl i')).animationPlayState), 'paused');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.$eval('#fxbg', b => b.classList.contains('paused')), false);
  ok('Seite verborgen → Hintergrund pausiert, danach weiter');
  // Timer: Hintergrund grün im Satz, cyan in der Pause
  await page.click('.tab[data-go=home]'); await page.waitForSelector('.nx .go'); await page.click('.nx .go');
  if (await page.$('.recsheet')) await page.click('[data-act=rec-start]');
  await page.waitForSelector('#t-lead'); assert.equal(await page.$eval('#fxbg', b => b.dataset.mode), 'off');
  await page.clock.runFor(5100); await page.waitForSelector('[data-act=done]');
  assert.equal(await page.$eval('#fxbg', b => b.dataset.mode), 'work');
  const c0 = await page.$eval('#t-clock', e => e.textContent);
  await page.waitForTimeout(1300); await shot(page, '53_timer_hintergrund.png');
  await page.clock.runFor(10000); const c1 = await page.$eval('#t-clock', e => e.textContent);
  await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]');
  const rest = await page.evaluate(() => { const b = document.querySelector('#fxbg'); return { mode: b.dataset.mode, g: getComputedStyle(b.querySelector('.fxl.g')).transitionDuration }; });
  assert.equal(rest.mode, 'rest'); assert.equal(rest.g, '1.2s');
  ok('Timer: Hintergrund „work“ im Satz, „rest“ in der Pause (Überblendung 1,2 s), Uhr läuft genau', `${c0} → ${c1} nach 10 s`);
  assert.deepEqual(errors, []); ok('Keine JS-Fehler');
  await ctx.close();
}

// ===== System „Bewegung reduzieren“: Einstellung An (Standard) / Automatisch (sanft) / Aus =====
const tapTile = async (page, ex) => { const b = await page.locator(`.extile[data-exsel="${ex}"]`).boundingBox(); await page.touchscreen.tap(b.x + 40, b.y + 40); return page.evaluate(() => { const e = document.querySelector('.fx-glow'); return e ? getComputedStyle(e).animationName : null; }); };
const resultState = async page => {
  await page.click('.tab[data-go=history]'); await page.waitForSelector('.hitem');
  const rv = await page.$$eval('.rv', e => e.length), rvT = await page.$$eval('.rv', e => e.length ? getComputedStyle(e[0]).transform : null);
  await page.click('.hitem[data-hist="rec"]'); await page.waitForSelector('.hero .huge');
  const h = await page.evaluate(() => ({ scr: document.querySelectorAll('.scr').length, text: document.querySelector('.hero .huge').textContent }));
  return { rv, rvT, ...h };
};
{ // Standard „An“ + System reduziert → volle Effekte (Einstellung überstimmt)
  const { ctx, page, errors } = await open({ reducedMotion: 'reduce' });
  const st = await page.evaluate(() => ({ m: document.documentElement.dataset.motion, a: getComputedStyle(document.querySelector('#fxbg .fxl i')).animationName }));
  assert.deepEqual([st.m, st.a], ['full', 'fxa']);
  assert.equal(await tapTile(page, 'Kniebeugen'), 'fxglow');
  const r = await resultState(page); assert.ok(r.rv > 3); assert.notEqual(r.rvT, 'none'); assert.equal(r.scr, 4); assert.equal(r.text, '123');
  assert.deepEqual(errors, []);
  ok('System „Bewegung reduzieren“ + Einstellung An (Standard): alle Effekte aktiv', `motion ${st.m}`);
  await ctx.close();
}
{ // Automatisch + System reduziert → nur Überblendungen
  const { ctx, page, errors } = await open({ reducedMotion: 'reduce' }, null, { anim: 'auto' });
  const st = await page.evaluate(() => { const i = document.querySelector('#fxbg .fxl i'); return { m: document.documentElement.dataset.motion, a: getComputedStyle(i).animationName, t: getComputedStyle(i).transform, fig: document.querySelectorAll('svg.fig.static').length, anyFig: document.querySelectorAll('svg.fig').length }; });
  assert.equal(st.m, 'gentle'); assert.equal(st.a, 'fxbreath'); assert.equal(st.t, 'none'); assert.equal(st.fig, st.anyFig);
  assert.equal(await tapTile(page, 'Kniebeugen'), 'fxglowfade');
  const r = await resultState(page); assert.ok(r.rv > 3); assert.equal(r.rvT, 'none'); assert.equal(r.scr, 4); assert.equal(r.text, '123');
  await page.clock.runFor(1500); assert.equal(await page.$$eval('.scr', e => e.length), 0);
  assert.deepEqual(errors, []);
  ok('Automatisch + System reduziert: sanfte Stufe – Glow nur Überblendung, Einblenden ohne Versatz, Hintergrund atmet statt zu wandern, Figuren statisch, Ziffern-Effekt läuft');
  await ctx.close();
}
{ // Automatisch ohne Systemvorgabe → volle Effekte
  const { ctx, page } = await open({ reducedMotion: 'no-preference' }, null, { anim: 'auto' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'full');
  ok('Automatisch ohne Systemvorgabe: volle Effekte'); await ctx.close();
}
{ // Aus → keine Effekte
  const { ctx, page, errors } = await open({ reducedMotion: 'no-preference' }, null, { anim: 'off' });
  const st = await page.evaluate(() => ({ m: document.documentElement.dataset.motion, a: getComputedStyle(document.querySelector('#fxbg .fxl i')).animationName, rv: document.querySelectorAll('.rv').length }));
  assert.deepEqual(st, { m: 'off', a: 'none', rv: 0 });
  assert.equal(await tapTile(page, 'Kniebeugen'), null);
  const r = await resultState(page); assert.equal(r.rv, 0); assert.equal(r.scr, 0); assert.equal(r.text, '123');
  await page.clock.runFor(1500); assert.equal(await page.$eval('.hero', h => h.classList.contains('flash')), false);
  assert.deepEqual(errors, []);
  ok('Aus: kein Glow, keine Einblendung, kein Ziffern-Effekt/Leuchten, Hintergrund statisch (animation none)');
  await ctx.close();
}
{ // Einstellung unter Mehr → Animationen
  const { ctx, page, errors } = await open({ reducedMotion: 'reduce' });
  await page.click('.tab[data-go=more]'); await page.waitForSelector('.animpanel');
  const opts = await page.$$eval('[data-anim]', e => e.map(b => [b.dataset.anim, b.textContent, b.getAttribute('aria-checked')]));
  assert.deepEqual(opts, [['auto', 'Automatisch', 'false'], ['on', 'An', 'true'], ['off', 'Aus', 'false']]);
  assert.match(await page.textContent('#anim-info'), /überstimmt/);
  assert.match(await page.textContent('#app-ver'), /^1\.6\.3-[0-9a-f]{8}$/);
  await page.click('[data-anim=auto]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'gentle');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('edt.settings')).anim), 'auto');
  assert.match(await page.textContent('#anim-info'), /nur sanfte Überblendungen/);
  await page.click('[data-anim=off]'); assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'off');
  await page.click('[data-anim=on]'); assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'full');
  await page.reload(); await page.waitForSelector('.extiles'); assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'full');
  await page.click('.tab[data-go=more]'); await page.waitForSelector('.animpanel');
  await page.locator('.animpanel').scrollIntoViewIfNeeded(); await page.evaluate(() => document.querySelector('.scroll').scrollBy(0, 120)); await page.waitForTimeout(400);
  await shot(page, '63_animationen_einstellung.png');
  assert.deepEqual(errors, []);
  ok('Einstellung Mehr → Animationen: Automatisch/An/Aus, Standard An, wirkt sofort, bleibt nach Neuladen; Version sichtbar', await page.textContent('#app-ver'));
  await ctx.close();
}
{ // Kontrast: hellster Hintergrund-Punkt über die ganze Schleife (Startseite, Satz, Pause) – grauer Text bleibt ≥ 4,5:1 (WCAG AA)
  const { ctx, page } = await open();
  const lin = c => (c /= 255, c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4), Lum = ([r, g, b]) => .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
  const res = [];
  for (const mode of ['home', 'work', 'rest']) {
    await page.evaluate(m => { document.getElementById('app').style.visibility = 'hidden'; const b = document.getElementById('fxbg'); b.dataset.mode = m; b.style.transition = 'none'; b.querySelectorAll('.fxl').forEach(l => l.style.transition = 'none'); }, mode);
    let worst = [11, 13, 16];
    for (let t = 0; t < 76000; t += 4000) {
      await page.evaluate(t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; }), t);
      const out = execFileSync('python3', ['-c', 'import sys,io\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB")\nc=im.getcolors(1<<24)\nprint(" ".join("%d,%d,%d"%p for n,p in c))'], { input: await page.screenshot(), maxBuffer: 1 << 26 }).toString().trim().split(' ').map(x => x.split(',').map(Number));
      for (const px of out) if (Lum(px) > Lum(worst)) worst = px;
    }
    const cr = hex => { const n = parseInt(hex, 16); return (Lum([n >> 16, n >> 8 & 255, n & 255]) + .05) / (Lum(worst) + .05); };
    const mut = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mut').trim().slice(1));
    res.push(`${mode}: hellster Punkt rgb(${worst}) → grau ${cr(mut).toFixed(2)}:1, weiß ${cr('f2f5f7').toFixed(2)}:1`);
    assert.ok(cr(mut) >= 4.5, `${mode}: ${cr(mut)}`);
    assert.ok(Lum(worst) > Lum([11, 13, 16]) * 3, `${mode}: Hintergrund sichtbar`);
  }
  ok('Kontrast über die ganze Hintergrund-Schleife ≥ 4,5:1 für grauen Text', res.join(' | '));
  await ctx.close();
}
{ // WebKit (iPhone-Emulation): Touch-Glow, Einblendung, Hintergrund
  let wk = null; try { wk = await webkit.launch(); } catch (e) { console.log('WebKit nicht verfügbar: ' + e.message.split('\n')[0]); }
  if (wk) {
    const dev = devices['iPhone 13'];
    const { ctx, page, errors } = await open({ ...dev, deviceScaleFactor: 2 }, null, {}, wk);
    const st = await page.evaluate(() => ({ m: document.documentElement.dataset.motion, mode: document.querySelector('#fxbg').dataset.mode, a: getComputedStyle(document.querySelector('#fxbg .fxl i')).animationName, rv: document.querySelectorAll('.rv').length }));
    assert.deepEqual([st.m, st.mode, st.a], ['full', 'home', 'fxa']); assert.ok(st.rv > 3);
    const b = await page.locator('.extile[data-exsel="Kniebeugen"]').boundingBox(); await page.touchscreen.tap(b.x + 30, b.y + 30);
    assert.equal(await page.evaluate(() => document.querySelector('.fx-glow')?.className), 'fx-glow cyan');
    await page.waitForSelector('#xp-panel[data-panel="Kniebeugen"]');
    await page.click('.tab[data-go=history]'); await page.waitForSelector('.hitem'); await page.click('.hitem[data-hist="rec"]'); await page.waitForSelector('.hero .huge');
    assert.equal(await page.textContent('.hero .huge'), '123');
    assert.deepEqual(errors, []);
    ok('WebKit/iPhone 13 (Safari-Engine): Touch-Glow bei tap, Einblendung, Hintergrund, Ergebnis exakt', dev.userAgent.match(/OS [\d_]+/)?.[0]);
    await ctx.close(); await wk.close();
  }
}

// ===== ohne IntersectionObserver =====
{
  const { ctx, page, errors } = await open({}, () => { delete window.IntersectionObserver; });
  assert.equal(await page.evaluate(() => typeof IntersectionObserver), 'undefined');
  const r = await page.evaluate(() => ({ rv: document.querySelectorAll('.rv').length, op: [...document.querySelectorAll('.sec, .extile, .lr')].map(e => getComputedStyle(e).opacity) }));
  assert.equal(r.rv, 0); assert.ok(r.op.every(o => o === '1'));
  await page.click('.tab[data-go=history]'); await page.waitForSelector('.hitem');
  assert.ok((await page.$$eval('.hitem, .panel', e => e.map(x => getComputedStyle(x).opacity))).every(o => o === '1'));
  assert.deepEqual(errors, []);
  ok('Ohne IntersectionObserver: nichts versteckt, alle Karten sichtbar', `${r.op.length} Elemente`);
  await ctx.close();
}

// ===== Demo-Video (optional) =====
if (VIDEO) {
  const dir = fs.mkdtempSync('/tmp/edtvid-');
  const { ctx, page } = await open({ recordVideo: { dir, size: { width: 390, height: 844 } } });
  await page.waitForTimeout(1200);
  const tap = async sel => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(300); const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width * 0.4, b.y + b.height * 0.5); };
  await tap('.extile[data-exsel="Liegestütze"]'); await page.waitForTimeout(900);
  await tap('.extile[data-exsel="Liegestütze"]'); await page.waitForTimeout(600);
  await page.$eval('.scroll', e => e.scrollTo({ top: e.scrollHeight, behavior: 'smooth' })); await page.waitForTimeout(1200);
  await page.$eval('.scroll', e => e.scrollTo({ top: 0, behavior: 'smooth' })); await page.waitForTimeout(900);
  await tap('.tab[data-go=history]'); await page.waitForTimeout(1300);
  await tap('.tab[data-go=home]'); await page.waitForTimeout(900);
  await tap('.lr[data-hist="rec"]'); await page.waitForTimeout(2800);
  const v = page.video(); await ctx.close();
  const webm = await v.path(), out = path.join(SCREENS, '1.6.1_demo.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'scale=390:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  ok('Demo-Video', path.relative(ROOT, out));
}
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-fx-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
