// E2E v1.6.3: Sprachansage in der Pause – nächste Übung und Wiederholungen, danach Countdown.
// Aufruf: node tests/e2e-layout.mjs [BASIS_URL] [--report]  (--report: nur messen, nicht abbrechen)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
const args = process.argv.slice(2);
let base = args.find(a => !a.startsWith('--')), server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18743', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18743/'; }
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
const NOW = Date.parse('2026-10-31T17:30:00+01:00');
// = [[360, 640], [375, 667], [390, 844], [412, 915], [844, 390]];
// = { '360x640': '60_pause_360.png', '390x844': '61_pause_390.png', '844x390': '62_pause_landscape.png' };
const history = [{ id: 'h1', workoutId: 'tpl-liegestuetz-5', workoutName: 'Liegestütz-EDT 5 min', exercise: 'Liegestütze', date: new Date(NOW - 3 * 86400000).toISOString(), limitMs: 300000, total: 99,
  sets: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, target: 10, done: 10 })), elapsedMs: 300000, aborted: false, perMin: 19.8, prevBest: null }];
const maxes = { 'Liegestütze': [{ v: 28, date: new Date(NOW - 4 * 86400000).toISOString(), source: 'test', durMs: 60000 }] };


const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
await ctx.addInitScript(() => { window.__said = []; const real = window.speechSynthesis;
  Object.defineProperty(window, 'speechSynthesis', { value: { speak: u => window.__said.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {} } }); });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.clock.install({ time: new Date(NOW) });
await page.goto(base); await page.waitForSelector('.setup, .extiles');
await page.evaluate(({ history, maxes }) => {
  localStorage.setItem('edt.history', JSON.stringify(history)); localStorage.setItem('edt.maxes', JSON.stringify(maxes));
  localStorage.setItem('edt.settings', JSON.stringify({ setupDone: true, dayTipSeen: true, exSel: 'Liegestütze', asked: ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'], recNotify: false, sound: true, voice: true, leadIn: 5 }));
}, { history, maxes });
await page.reload(); await page.waitForSelector('.extiles');
if (!(await page.$('.extile.open[data-exsel="Liegestütze"]'))) await page.click('[data-exsel="Liegestütze"]');
await page.waitForSelector('#xp-panel'); await page.click('.card[data-id="tpl-liegestuetz-5"] [data-act=start]'); await page.click('[data-act=plan-start]');
if (await page.$('.recsheet')) await page.click('[data-act=rec-start]');
await page.clock.runFor(5100); await page.waitForSelector('[data-act=done]');
await page.evaluate(() => { window.__said.length = 0; });
await page.click('[data-act=done]'); await page.waitForSelector('[data-act=skip]');
await page.clock.runFor(30000); await page.waitForTimeout(150);
const said = (await page.evaluate(() => window.__said)).filter(t => t.trim());
const i = said.findIndex(t => /^Pause \d+ Sekunden\. Nächster Satz: \d+ Liegestütze$/.test(t));
assert.ok(i >= 0, 'Pausen-Ansage fehlt: ' + JSON.stringify(said));
const c = said.indexOf('Noch 3'); assert.ok(c > i, 'Countdown nach Ansage: ' + JSON.stringify(said));
assert.deepEqual(errors, []);
ok('Pause: Ansage nächster Satz mit Übung und Wiederholungen, danach Countdown', said.slice(i, c + 3).join(' | '));
await browser.close(); server?.kill();
