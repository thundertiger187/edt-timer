// Live-Prüfung der Umbenennung RepZeit → EDT Timer mit echtem Browserprofil.
// node tests/live-redirect.mjs prep   – alte App unter /repzeit/ öffnen (SW installiert), Testdaten unter repzeit.* anlegen
// node tests/live-redirect.mjs check  – /repzeit/ (mit altem SW) und Unterpfade müssen auf /edt-timer/ landen, Daten migriert
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const PROFILE = process.env.PROFILE || '/tmp/edt-redirect-profile';
const HOST = 'https://thundertiger187.github.io';
const mode = process.argv[2];
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, locale: 'de-DE' });
const page = ctx.pages()[0] || await ctx.newPage();
if (mode === 'prep') {
  await page.goto(HOST + '/repzeit/'); await page.waitForSelector('.tabs');
  await page.evaluate(() => {
    localStorage.setItem('repzeit.maxes', JSON.stringify({ 'Liegestütze': [{ v: 25, date: '2026-10-20T10:00:00.000Z', source: 'test' }] }));
    localStorage.setItem('repzeit.history', JSON.stringify([{ id: 'sMIG1', workoutId: 'tpl-liegestuetz-5', workoutName: 'Liegestütz-Dichte 5 min', exercise: 'Liegestütze', date: '2026-10-21T10:00:00.000Z', limitMs: 300000, total: 99, sets: [{ n: 1, phase: 0, round: 1, target: 10, done: 10, start: 0, end: 20000 }], elapsedMs: 300000, aborted: false, perMin: 19.8, prevBest: null }]));
    localStorage.setItem('repzeit.tunes', JSON.stringify({ 'Liegestütze': { phases: [{ reps: 10, restSec: 15, rounds: 8 }, { reps: 10, restSec: 20, rounds: null }], max: 25, date: '2026-10-21T10:10:00.000Z', source: 'auto', text: 'Phase 2 ab Runde 9 statt 7' } }));
  });
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  console.log('alte App geladen, SW aktiv:', sw, '· Version', await page.evaluate(() => document.querySelector('.ver')?.textContent));
} else {
  const regsBefore = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope)).catch(() => []);
  console.log('SW-Registrierungen vorher:', regsBefore);
  await page.goto(HOST + '/repzeit/');
  await page.waitForURL(u => u.pathname.startsWith('/edt-timer/'), { timeout: 30000 });
  await page.waitForSelector('.tabs, .setup, .extiles', { timeout: 15000 });
  console.log('✓ /repzeit/ (mit altem SW) →', page.url());
  for (const sub of ['/repzeit/index.html', '/repzeit/irgendwas/tief?x=1#h']) {
    await page.goto(HOST + sub); await page.waitForURL(u => u.pathname.startsWith('/edt-timer/'), { timeout: 20000 });
    await page.waitForSelector('.tabs, .extiles', { timeout: 15000 });
    console.log('✓', sub, '→', page.url());
  }
  const d = await page.evaluate(() => ({ title: document.title, maxes: JSON.parse(localStorage.getItem('edt.maxes')), hist: JSON.parse(localStorage.getItem('edt.history')), tunes: JSON.parse(localStorage.getItem('edt.tunes')), rz: __rz.history.length }));
  assert.equal(d.maxes['Liegestütze'][0].v, 25); assert.ok(d.hist.some(h => h.id === 'sMIG1')); assert.ok(d.tunes['Liegestütze']);
  console.log('✓ Daten migriert:', d.title, '· Max', d.maxes['Liegestütze'].at(-1).v, '· Einheiten', d.rz, '· Anpassung', !!d.tunes['Liegestütze']);
  const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope));
  assert.ok(!regs.some(s => s.endsWith('/repzeit/')), 'alter SW noch registriert: ' + regs);
  console.log('✓ SW-Registrierungen jetzt:', regs);
}
await ctx.close();
