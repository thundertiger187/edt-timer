// E2E v1.4: Wochenplan, Heute-Ansicht, Kalender-Export, In-App-Erinnerung, Strichmännchen. Aufruf: node tests/e2e-week.mjs [BASIS_URL]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCREENS = path.join(ROOT, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
let base = process.argv[2], server;
if (!base) { server = spawn('python3', ['-m', 'http.server', '18735', '--bind', '127.0.0.1', '-d', 'dist'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); base = 'http://127.0.0.1:18735/'; }
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--lang=de-DE'] });
const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin', acceptDownloads: true, permissions: ['notifications'],
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
const ctx = await browser.newContext(opts);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
const log = []; const ok = (n, x = '') => { const l = `✓ ${n}${x ? ' – ' + x : ''}`; log.push(l); console.log(l); };
const shot = async (name, el) => { await page.waitForTimeout(400); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await (el ? page.locator(el).first() : page).screenshot({ path: path.join(SCREENS, name) }); };
const goto = async (u = base) => { for (let i = 0; ; i++) { try { await page.goto(u); return; } catch (e) { if (i >= 2) throw e; await page.waitForTimeout(1500); } } };

await page.clock.install({ time: new Date('2026-10-31T07:50:00+01:00') }); // Samstag
await goto(); await page.waitForSelector('.setup');
await page.evaluate(() => {
  const d = '2026-10-29T18:00:00.000Z';
  localStorage.setItem('edt.maxes', JSON.stringify({ 'Liegestütze': [{ v: 25, date: d, source: 'input' }], 'Kniebeugen': [{ v: 30, date: d, source: 'input' }], 'Klimmzüge': [{ v: 8, date: d, source: 'input' }] }));
  localStorage.setItem('edt.settings', JSON.stringify({ setupDone: true, planVer: 2, exSel: 'Liegestütze', asked: ['Liegestütze', 'Kniebeugen', 'Klimmzüge', 'Dips'], sound: false, voice: false }));
});
await page.reload(); await page.waitForSelector('.extiles');

// ---------- Strichmännchen ----------
assert.equal(await page.$$eval('.extile svg.fig[data-anim]', e => e.length), 4);
const pts = () => page.$eval('.extile svg.fig[data-fig="Liegestütze"] [data-k=arm]', e => e.getAttribute('points'));
const seen = new Set(); for (let i = 0; i < 4; i++) { seen.add(await pts()); await page.clock.runFor(300); }
assert.ok(seen.size >= 3, [...seen].join(' | ')); const [a1, a2] = [...seen];
ok('Startseite: 4 animierte Strichmännchen in den Übungskacheln', `Arm ${a1} → ${a2}`);
const FN = { 'Liegestütze': 'liegestuetze', 'Kniebeugen': 'kniebeugen', 'Dips': 'dips', 'Klimmzüge': 'klimmzuege' };
for (const ex of Object.keys(FN)) {
  await page.click('[data-go=more]'); await page.click(`.maxpanel .mrow:has-text("${ex}") [data-act=assess]`); await page.waitForSelector('.introfig svg.fig');
  for (const [p, n] of [['0', 'start'], ['1', 'ende']]) {
    await page.evaluate(v => { document.documentElement.dataset.figP = v; }, p); await page.clock.runFor(100);
    const g = await page.$eval('.introfig svg.fig', s => { const q = n => s.querySelector(`[data-k=${n}]`).getAttribute('points').split(' ').map(x => x.split(',').map(Number));
      const arm = q('arm'), torso = q('torso'), leg = q('leg'); return { arm, torso, leg }; });
    // verbunden: Arm beginnt an der Schulter, Bein an der Hüfte (= Rumpfpunkte)
    assert.deepEqual(g.arm[0], g.torso[1]); assert.deepEqual(g.leg[0], g.torso[2]);
    await shot(`fig_${FN[ex]}_${n}.png`, '.introfig');
  }
  await page.evaluate(() => { delete document.documentElement.dataset.figP; });
  if (ex === 'Klimmzüge') await shot('33_fitnesstest_anleitung_figur.png');
  await goto(); await page.waitForSelector('.extiles');
}
ok('Strichmännchen je Übung, Start- und Endposition, Gelenke verbunden', Object.values(FN).map(f => `fig_${f}_start/ende.png`).join(', '));

// ---------- Wochenplan ----------
assert.ok(await page.isVisible('.nx .hplan')); // ohne Wochenplan: Hinweis „Wochenplan anlegen“
await page.click('[data-go=week]'); await page.waitForSelector('.week');
await page.click('[data-act=wtpl][data-k=daily3]');
assert.equal(await page.evaluate(() => __rz.week.entries.length), 21);
const sat = '.wday[data-day="5"]';
assert.deepEqual(await page.$$eval(`${sat} .wtime`, e => e.map(x => x.value)), ['08:00', '13:00', '19:00']);
assert.deepEqual(await page.$$eval(`${sat} .wsel`, e => e.map(x => x.selectedOptions[0].textContent)), ['Liegestütz-EDT 5 min', 'Kniebeugen-EDT 10 min', 'Klimmzug-EDT 8 min']);
assert.equal(await page.$$eval('.wwarn', e => e.length), 0);
ok('Vorlage „Täglich 3×“: 08:00 Liegestütze, 13:00 Kniebeugen, 19:00 Klimmzüge an 7 Tagen, keine Konflikte');
await page.click('[data-act=wtpl][data-k=mwf3]'); assert.deepEqual(await page.evaluate(() => [...new Set(__rz.week.entries.map(e => e.day))]), [0, 2, 4]);
await page.click('[data-act=wtpl][data-k=daily3]');
ok('Vorlage „Mo/Mi/Fr 3×“ und zurück');
// Eintrag hinzufügen + Konflikt
await page.click(`${sat} [data-act=wadd]`);
assert.equal(await page.$$eval(`${sat} .wrow`, e => e.length), 4);
await page.locator(`${sat} .wrow .wtime`).nth(3).fill('08:10'); await page.locator(`${sat} .wrow .wtime`).nth(3).dispatchEvent('change');
await page.locator(`${sat} .wrow .wsel`).nth(1).selectOption('tpl-dips-6'); // 08:10 → nach Sortierung Index 1
await page.waitForSelector(`${sat} .wwarn`);
const warn = await page.textContent(`${sat} .wwarn`);
assert.match(warn, /08:00 und 08:10: beide Brust\/Trizeps\/Schulter, nur 5 min Pause \(mind\. 10 min nach Ende der ersten Einheit\)/);
assert.match(await page.textContent('.recbox.wait'), /1 Eintrag liegt zu dicht/);
await page.evaluate(() => document.querySelector('.wday[data-day="5"]').scrollIntoView({ block: 'center' }));
await shot('29_wochenplan.png');
ok('Eintrag 08:10 Dips am Samstag → Warnung „nur 5 min Pause“ gegen 08:00 Liegestütze', warn.trim());
assert.equal(await page.locator(`${sat} .wrow .wsel`).nth(1).inputValue(), 'tpl-dips-6');
await page.locator(`${sat} .wrow [data-act=wdel]`).nth(1).click();
assert.deepEqual(await page.$$eval(`${sat} .wtime`, e => e.map(x => x.value)), ['08:00', '13:00', '19:00']);
assert.equal(await page.$$eval('.wwarn', e => e.length), 0);
// Tag kopieren
const mon = '.wday[data-day="0"]';
await page.locator(`${mon} .wtime`).nth(1).fill('12:00'); await page.locator(`${mon} .wtime`).nth(1).dispatchEvent('change');
await page.click(`${mon} [data-act=wcopy]`); await page.waitForSelector('.daypick');
await page.click('[data-wto="1"]'); await page.click('[data-wto="3"]');
await page.click('[data-act=wcopy-ok]');
assert.deepEqual(await page.$$eval('.wday[data-day="1"] .wtime', e => e.map(x => x.value)), ['08:00', '12:00', '19:00']);
assert.deepEqual(await page.$$eval('.wday[data-day="3"] .wtime', e => e.map(x => x.value)), ['08:00', '12:00', '19:00']);
assert.deepEqual(await page.$$eval('.wday[data-day="2"] .wtime', e => e.map(x => x.value)), ['08:00', '13:00', '19:00']);
ok('Montag (12:00 statt 13:00) auf Di und Do kopiert');

// ---------- Kalender-Export ----------
await page.click('[data-wab="15"]');
await page.evaluate(() => document.querySelector('.remind').scrollIntoView({ block: 'center' }));
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=ics]')]);
assert.equal(dl.suggestedFilename(), 'edt-wochenplan.ics');
const ics = fs.readFileSync(await dl.path(), 'utf8'), u = ics.replace(/\r\n /g, '');
fs.writeFileSync(path.join(ROOT, 'tests', 'beispiel-wochenplan.ics'), ics);
assert.ok(ics.includes('\r\n')); assert.equal((u.match(/BEGIN:VEVENT/g) || []).length, 21); assert.ok(!u.includes('CANCELLED'), 'vor dem ersten Export gelöschte Einträge werden nicht abgesagt');
assert.match(u, /DTSTART;TZID=Europe\/Berlin:20261031T080000\r\nDURATION:PT10M\r\nRRULE:FREQ=WEEKLY;BYDAY=SA/);
assert.match(u, /DTSTART;TZID=Europe\/Berlin:20261102T120000\r\nDURATION:PT15M\r\nRRULE:FREQ=WEEKLY;BYDAY=MO/);
assert.equal((u.match(/TRIGGER:-PT15M/g) || []).length, 21); assert.equal((u.match(/TRIGGER:PT0M/g) || []).length, 21);
assert.match(u, new RegExp(`URL:${base.replace(/[.?]/g, '\\$&')}\\?w=tpl-liegestuetz-5`));
const uid1 = u.match(/UID:(edt-[^\r]+)/)[1];
await page.waitForSelector('.remind .muted.sm >> text=Exportiert am');
await page.evaluate(() => document.querySelector('.remind').scrollIntoView({ block: 'center' }));
await shot('31_export_kalender.png');
ok('Kalender-Export .ics: 21 wöchentliche Termine, TZID Europe/Berlin, VALARM zur Startzeit + 15 min vorher, Link zur App', uid1);
// Änderung → Hinweis neu exportieren, gleiche UID beim nächsten Export
await page.locator(`${sat} .wtime`).nth(2).fill('19:30'); await page.locator(`${sat} .wtime`).nth(2).dispatchEvent('change');
const sunUid = await page.evaluate(() => __rz.week.entries.find(e => e.day === 6 && e.time === '19:00').id);
await page.locator('.wday[data-day="6"] .wrow [data-act=wdel]').nth(2).click();
assert.match(await page.textContent('.remind'), /Plan seit dem Export am 31\.10\. geändert\. Neu exportieren/);
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=ics]')]);
const u2 = fs.readFileSync(await dl2.path(), 'utf8').replace(/\r\n /g, '');
assert.ok(u2.includes(`UID:${uid1}`)); assert.match(u2, /SEQUENCE:2/); assert.match(u2, /20261031T193000/);
assert.equal((u2.match(/BEGIN:VEVENT/g) || []).length, 21); assert.match(u2, new RegExp(`UID:edt-${sunUid}@edt-timer[\\s\\S]*?STATUS:CANCELLED`)); assert.equal((u2.match(/STATUS:CANCELLED/g) || []).length, 1);
ok('Plan geändert (Sa 19:30, So 19:00 gelöscht) → Hinweis „neu exportieren“; Re-Export mit gleicher UID, SEQUENCE 2, gelöschter Termin als STATUS:CANCELLED');

// ---------- Heute ----------
await page.click('[data-go=home]'); await page.waitForSelector('.nx');
assert.equal((await page.textContent('.nx .eyebrow')).trim(), 'Als Nächstes · 08:00'); assert.equal((await page.textContent('.nx .hname')).trim(), 'Liegestütze');
assert.deepEqual(await page.$$eval('.nx .trow', e => e.map(x => x.querySelector('.tt').textContent)), ['13:00', '19:30']);
assert.equal(await page.$$eval('.nx .hrec', e => e.length), 0); // erholt: keine Erholungszeile
assert.equal(await page.$$eval('.nx .wk > div', e => e.length), 7); assert.equal(await page.$eval('.nx .wk .today', e => e.title), '0/3');
await shot('30_heute.png');
ok('Startseite „Heute“: Karte „Als Nächstes · 08:00“ Liegestütze, weitere Einheiten als Zeilen, Wochenpunkte');
// Ein-Tipp-Start → kurze Einheit, dann abgehakt
await page.click('.nx .go'); await page.waitForSelector('#t-lead');
await page.clock.runFor(5100); await page.waitForSelector('[data-act=done]');
for (let i = 0; i < 3; i++) { await page.clock.runFor(8000); await page.click('[data-act=done]'); await page.clock.runFor(15500); }
await page.click('[data-act=quit]'); await page.click('[data-act=quit-save]'); await page.waitForSelector('.hero');
await page.click('[data-go=home]'); await page.waitForSelector('.nx');
assert.match(await page.textContent('.nx .trow.done'), /08:00.*✓ erledigt/s);
assert.equal((await page.textContent('.nx .eyebrow')).trim(), 'Als Nächstes · 13:00'); assert.equal((await page.textContent('.nx .hname')).trim(), 'Kniebeugen');
assert.equal(await page.$eval('.nx .wk .today', e => e.title), '1/3');
assert.match(await page.textContent('.extile:has-text("Liegestütze") .exrec'), /Erholung noch/);
await shot('30b_heute_erledigt.png');
ok('Ein-Tipp-Start aus „Heute“ → Einheit gespeichert → 08:00 automatisch abgehakt, Sa 1/3');

// ---------- In-App-Erinnerung ----------
await page.click('[data-go=week]'); await page.click('[data-wset=remind]');
assert.equal(await page.evaluate(() => __rz.week.remind), true);
assert.match(await page.textContent('.remind'), /Nur solange die App geöffnet ist oder im Hintergrund läuft/);
await page.click('[data-go=home]');
await page.evaluate(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList?.contains('toast') && __toasts.push(n.textContent)))).observe(document.body, { childList: true, subtree: true }); });
const msTo = await page.evaluate(() => new Date(2026, 9, 31, 12, 44, 30) - Date.now());
await page.clock.fastForward(msTo); await page.clock.runFor(60000);
let toasts = await page.evaluate(() => __toasts);
assert.ok(toasts.includes('In 15 min: 13:00 Kniebeugen'), toasts.join('|'));
await page.clock.fastForward(14 * 60000); await page.clock.runFor(30000);
toasts = await page.evaluate(() => __toasts);
assert.ok(toasts.includes('Jetzt: Kniebeugen (Kniebeugen-EDT 10 min)'), toasts.join('|'));
const notes = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (await r.getNotifications()).map(n => n.body + ' ' + n.data?.url) : ['kein SW']; });
assert.ok(notes.some(n => n.startsWith('Jetzt: Kniebeugen') && n.includes('?w=tpl-kniebeugen-10')), notes.join('|'));
assert.equal(toasts.filter(t => t.includes('Kniebeugen')).length, 2, 'jede Erinnerung nur einmal');
ok('In-App-Erinnerung um 12:45 (15 min vorher) und 13:00 als Toast + System-Benachrichtigung über den Service Worker (gleicher Tag ersetzt die Vorwarnung)', notes.join(' | '));

// ---------- Deeplink aus Kalender ----------
await goto(base + '?w=tpl-klimmzug-8'); await page.waitForSelector('[data-act=plan-start]');
assert.match(await page.textContent('.planhead'), /Klimmzug-EDT 8 min/); assert.ok(!page.url().includes('?w='));
ok('Link aus dem Kalendertermin öffnet den Plan des Workouts');

// Export/Import enthält den Plan
await page.click('[data-go=home]'); await page.click('[data-go=more]');
const [dj] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
const data = JSON.parse(fs.readFileSync(await dj.path(), 'utf8'));
assert.equal(data.plan.entries.length, 20);
await page.evaluate(() => localStorage.removeItem('edt.plan'));
await page.setInputFiles('#f-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
await page.waitForFunction(() => __rz.week.entries.length === 20);
ok('Wochenplan in Export/Import enthalten');

// ---------- reduzierte Bewegung ----------
{
  const c2 = await browser.newContext({ ...opts, reducedMotion: 'reduce' }); const p2 = await c2.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  for (let i = 0; ; i++) { try { await p2.goto(base); break; } catch (e) { if (i >= 2) throw e; await p2.waitForTimeout(1500); } }
  await p2.waitForSelector('.setup');
  await p2.evaluate(() => localStorage.setItem('edt.settings', JSON.stringify({ setupDone: true, planVer: 2, exSel: 'Liegestütze', asked: ['Liegestütze'], anim: 'auto' })));
  await p2.reload(); await p2.waitForSelector('.extiles'); // v1.6.1: Einstellung „Automatisch“ folgt dem System
  assert.equal(await p2.$$eval('.extile svg.fig.static', e => e.length), 4);
  assert.equal(await p2.$$eval('svg.fig[data-anim]', e => e.length), 0);
  assert.equal(await p2.$$eval('.extile svg.fig.static .fbody.ghost', e => e.length), 4);
  await p2.screenshot({ path: path.join(SCREENS, '34_reduced_motion_start.png') });
  await p2.goto(base + '?w=tpl-liegestuetz-5'); await p2.waitForSelector('svg.fig.planfig.static');
  assert.equal(await p2.$$eval('svg.fig[data-anim]', e => e.length), 0);
  await c2.close();
  ok('prefers-reduced-motion + Animationen „Automatisch“: statisch Start (blass) + Endposition, keine Figuren-Animation');
}

assert.deepEqual(errors, [], 'Konsolenfehler: ' + errors.join('; '));
ok('Keine JS-Fehler');
fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-week-ergebnis.txt'), `${new Date().toISOString()} ${base}\n${log.join('\n')}\n`);
await browser.close(); server?.kill();
