import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/week.js';
import * as F from '../src/figures.js';

const WO = { a: { name: 'Liegestütz-EDT 5 min', exercise: 'Liegestütze', limitMin: 5 }, d: { name: 'Dips-EDT 6 min', exercise: 'Dips', limitMin: 6 },
  k: { name: 'Kniebeugen-EDT 10 min', exercise: 'Kniebeugen', limitMin: 10 }, z: { name: 'Klimmzug-EDT 8 min', exercise: 'Klimmzüge', limitMin: 8 } };
const info = id => WO[id];
const resolve = ex => Object.keys(WO).find(k => WO[k].exercise === ex) || null;
const URL0 = 'https://thundertiger187.github.io/edt-timer/';
const unfold = s => s.replace(/\r\n /g, '');

test('Vorlage täglich 3× und Mo/Mi/Fr', () => {
  const p = W.applyTemplate(W.emptyPlan(), 'daily3', resolve);
  assert.equal(p.entries.length, 21);
  assert.deepEqual(W.entriesOn(p, 3).map(e => [e.time, e.workoutId]), [['08:00', 'a'], ['13:00', 'k'], ['19:00', 'z']]);
  const m = W.applyTemplate(p, 'mwf3', resolve);
  assert.deepEqual([...new Set(m.entries.map(e => e.day))], [0, 2, 4]);
  assert.equal(m.removed.length, 21); // alte Einträge werden im Kalender abgesagt
  assert.deepEqual(W.planConflicts(p, info), []);
});
test('Tag kopieren ersetzt Zieltage', () => {
  let p = { ...W.emptyPlan(), entries: [{ id: 'x1', day: 0, time: '07:30', workoutId: 'a' }, { id: 'x2', day: 0, time: '18:00', workoutId: 'z' }, { id: 'x3', day: 2, time: '09:00', workoutId: 'k' }] };
  p = W.copyDay(p, 0, [2, 4, 0]);
  assert.deepEqual(W.entriesOn(p, 2).map(e => e.time), ['07:30', '18:00']);
  assert.deepEqual(W.entriesOn(p, 4).map(e => e.workoutId), ['a', 'z']);
  assert.equal(W.entriesOn(p, 0).length, 2); assert.ok(p.removed.includes('x3'));
  assert.equal(new Set(p.entries.map(e => e.id)).size, p.entries.length);
});
test('Abstandsprüfung: gleiche/überlappende Gruppe zu dicht, andere Gruppe frei', () => {
  const p = { ...W.emptyPlan(), entries: [
    { id: 'e1', day: 1, time: '08:00', workoutId: 'a' }, { id: 'e2', day: 1, time: '08:12', workoutId: 'd' }, // Ende 08:05 → 7 min Pause < 10
    { id: 'e3', day: 1, time: '08:06', workoutId: 'k' }, // Beine: frei
    { id: 'e4', day: 2, time: '08:00', workoutId: 'a' }, { id: 'e5', day: 2, time: '08:15', workoutId: 'a' }, // 10 min Pause: ok
    { id: 'e6', day: 3, time: '12:00', workoutId: 'z' }, { id: 'e7', day: 3, time: '12:05', workoutId: 'z' }] }; // überschneidet sich
  const c = W.planConflicts(p, info, { betweenEdt: 10 });
  assert.deepEqual(c.map(x => [x.day, x.a, x.b, x.gapMin]), [[1, 'e1', 'e2', 7], [3, 'e6', 'e7', -3]]);
  assert.equal(c[0].group, 'Brust/Trizeps/Schulter');
  assert.equal(W.planConflicts(p, info, { betweenEdt: 5 }).length, 1);
});
test('Erledigt-Abgleich und nächste Einheit heute', () => {
  const p = W.applyTemplate(W.emptyPlan(), 'daily3', resolve);
  const day = new Date(2026, 9, 31, 14, 0); // Sa 31.10.2026 14:00
  const hist = [{ total: 80, workoutId: 'a', exercise: 'Liegestütze', date: new Date(2026, 9, 31, 8, 10).toISOString() },
    { total: 0, workoutId: 'k', exercise: 'Kniebeugen', date: new Date(2026, 9, 31, 13, 0).toISOString() },
    { total: 50, workoutId: 'z', exercise: 'Klimmzüge', date: new Date(2026, 9, 30, 19, 0).toISOString() }];
  const done = W.doneOn(p, hist, day, info), today = W.entriesOn(p, 5);
  assert.deepEqual(today.map(e => done.has(e.id)), [true, false, false]);
  assert.equal(W.nextToday(p, hist, day, info).time, '19:00'); // 13:00 vor über 30 min: verpasst
  assert.equal(W.nextToday(p, hist, new Date(2026, 9, 31, 13, 20), info).time, '13:00');
  const ws = W.weekStatus(p, hist, day, info);
  assert.deepEqual(ws.map(d => `${d.done}/${d.total}`), ['0/3', '0/3', '0/3', '0/3', '1/3', '1/3', '0/3']);
  assert.equal(ws[5].today, true); assert.equal(ws[4].past, true);
});
test('ICS: VCALENDAR, TZID Europe/Berlin, wöchentliche RRULE, VALARM, stabile UID, Deeplink', () => {
  const p = { ...W.emptyPlan(), alarmBefore: 15, entries: [{ id: 'e1', day: 0, time: '08:00', workoutId: 'a' }, { id: 'e2', day: 5, time: '19:30', workoutId: 'z' }], removed: ['old1'] };
  const ics = W.buildIcs(p, { info, url: URL0, now: new Date(2026, 9, 31, 9, 0), seq: 3 });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')); assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'nur CRLF');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const u = unfold(ics);
  assert.match(u, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Berlin/); assert.match(u, /TZOFFSETTO:\+0200/); assert.match(u, /BYMONTH=10;BYDAY=-1SU/);
  assert.match(u, /UID:edt-e1@edt-timer\r\nSEQUENCE:3\r\nDTSTAMP:20261031T080000Z\r\nDTSTART;TZID=Europe\/Berlin:20261102T080000\r\nDURATION:PT10M\r\nRRULE:FREQ=WEEKLY;BYDAY=MO/);
  assert.match(u, /DTSTART;TZID=Europe\/Berlin:20261031T193000\r\nDURATION:PT13M\r\nRRULE:FREQ=WEEKLY;BYDAY=SA/); // heute (Samstag)
  assert.match(u, /SUMMARY:EDT Liegestütze · 5 min/);
  assert.match(u, /DESCRIPTION:Liegestütz-EDT 5 min\\nIn der App starten: https:\/\/thundertiger187\.github\.io\/edt-timer\/\?w=a/);
  assert.equal((u.match(/BEGIN:VALARM/g) || []).length, 4);
  assert.equal((u.match(/TRIGGER:PT0M/g) || []).length, 2); assert.equal((u.match(/TRIGGER:-PT15M/g) || []).length, 2);
  assert.match(u, /UID:edt-old1@edt-timer[\s\S]*?STATUS:CANCELLED/);
  // gleiche UID bei erneutem Export, nur zur Startzeit
  const ics2 = unfold(W.buildIcs({ ...p, alarmBefore: 0, removed: [] }, { info, url: URL0, now: new Date(2026, 10, 2, 9, 0), seq: 4 }));
  assert.match(ics2, /UID:edt-e1@edt-timer\r\nSEQUENCE:4/); assert.equal((ics2.match(/BEGIN:VALARM/g) || []).length, 2); assert.ok(!/TRIGGER:-PT/.test(ics2));
  assert.ok(!/CANCELLED/.test(ics2));
});
test('ICS: Sonderzeichen escapen, Faltung ohne Multibyte-Bruch', () => {
  const p = { ...W.emptyPlan(), entries: [{ id: 'e1', day: 2, time: '06:05', workoutId: 'x' }] };
  const ics = W.buildIcs(p, { info: () => ({ name: 'Bein; Po, Rücken\\ ÄÖÜ äöü ß lange Beschreibung für die Faltung über 75 Oktette', exercise: 'Ausfallschritte', limitMin: 7 }), url: URL0, now: new Date(2026, 9, 31) });
  assert.match(unfold(ics), /DESCRIPTION:Bein\\; Po\\, Rücken\\\\ ÄÖÜ/);
  assert.ok(!ics.includes('\uFFFD'));
  assert.equal(W.fold('a'.repeat(160)).split('\r\n ').map(x => x.length).join(), '75,74,11');
});
test('Plan normalisieren verwirft ungültige Einträge', () => {
  const p = W.normalizePlan({ entries: [{ day: 1, time: '25:00', workoutId: 'a' }, { day: 7, time: '08:00', workoutId: 'a' }, { day: 2, time: '08:00', workoutId: 'a' }], alarmBefore: 7 });
  assert.equal(p.entries.length, 1); assert.equal(p.alarmBefore, 10); assert.ok(p.entries[0].id);
});

// ---------- Strichmännchen ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
test('Figuren: feste Segmentlängen in allen Phasen, Endlage plausibel', () => {
  for (const ex of F.FIGURES) for (let i = 0; i <= 20; i++) {
    const j = F.poseOf(ex, i / 20);
    assert.ok(Math.abs(dist(j.sh, j.el) - 16) < 0.6, `${ex} Oberarm`); assert.ok(Math.abs(dist(j.el, j.ha) - 15) < 0.6, `${ex} Unterarm`);
    assert.ok(Math.abs(dist(j.hip, j.kn) - 20) < 0.01); assert.ok(Math.abs(dist(j.kn, j.ft) - 19) < 0.01); assert.ok(Math.abs(dist(j.sh, j.hip) - 30) < 0.01);
    for (const k of ['head', 'sh', 'el', 'ha', 'hip', 'kn', 'ft']) assert.ok(Number.isFinite(j[k].x) && Number.isFinite(j[k].y), `${ex} ${k}`);
  }
  const L = F.poseOf('Liegestütze', 1); assert.ok(88 - L.sh.y < 12, 'Brust nahe Boden');
  const K0 = F.poseOf('Kniebeugen', 0), K1 = F.poseOf('Kniebeugen', 1);
  assert.ok(Math.abs(K1.hip.y - K1.kn.y) < 4, 'Oberschenkel ~parallel'); assert.ok(K1.hip.x < K1.ft.x, 'Hüfte nach hinten'); assert.deepEqual(K0.ft, K1.ft);
  const D1 = F.poseOf('Dips', 1); assert.ok(Math.abs(D1.sh.y - D1.el.y) < 6, 'Oberarm ~parallel');
  const Z0 = F.poseOf('Klimmzüge', 0), Z1 = F.poseOf('Klimmzüge', 1);
  assert.ok(dist(Z0.sh, Z0.ha) > 29, 'gestreckt'); assert.ok(Z1.head.y + 5.5 < 14 + 1, 'Kinn über der Stange');
});
test('Figuren: SVG-Markup, Phase und neutrales Icon', () => {
  const svg = F.figureSvg('Dips');
  assert.match(svg, /^<svg class="fig " data-fig="Dips" data-anim="1" viewBox="0 0 120 100"/);
  assert.equal((svg.match(/<polyline/g) || []).length, 3); assert.match(svg, /<circle data-k="head"/);
  assert.match(F.figureSvg('Plank'), /aria-label="Eigene Übung"/); assert.ok(!F.figureSvg('Plank').includes('data-anim'));
  assert.equal(F.phaseAt(0), 0); assert.ok(Math.abs(F.phaseAt(1000) - 1) < 1e-9); assert.ok(Math.abs(F.phaseAt(2000)) < 1e-9);
  assert.ok(!/NaN/.test(F.frameSvg('Klimmzüge', 0.5)));
});

test('v1.7.0 musclesOfInfo: Kombi umfasst alle Muskelgruppen ihrer Übungen', () => {
  const g = W.musclesOfInfo({ exercise: 'Kombi', exercises: ['Liegestütze', 'Klimmzüge'], combo: true });
  const names = [].concat(g).map(x => x.name ?? x).join(' ');
  assert.match(names, /Brust/); assert.match(names, /Rücken/);
});

test('v1.8.0 Figuren der neuen Grundübungen: Bewegung plausibel', () => {
  for (const ex of ['Ausfallschritte', 'Beckenheben', 'Superman', 'Sit-ups']) assert.ok(F.FIGURES.includes(ex), ex);
  const A0 = F.poseOf('Ausfallschritte', 0), A1 = F.poseOf('Ausfallschritte', 1);
  assert.ok(A1.hip.y - A0.hip.y > 10, 'Hüfte senkt sich'); assert.deepEqual(A0.ft, A1.ft); assert.deepEqual(A0.ft2, A1.ft2);
  assert.ok(Math.abs(dist(A1.hip, A1.kn2) - 20) < 0.01 && Math.abs(dist(A1.kn2, A1.ft2) - 19) < 0.01, 'hinteres Bein feste Längen');
  assert.ok(A1.kn2.y > 80, 'hinteres Knie Richtung Boden');
  assert.equal((F.figureSvg('Ausfallschritte').match(/<polyline/g) || []).length, 4, 'zwei Beine');
  const B0 = F.poseOf('Beckenheben', 0), B1 = F.poseOf('Beckenheben', 1);
  assert.ok(B0.hip.y - B1.hip.y > 10, 'Hüfte hebt sich'); assert.deepEqual(B0.sh, B1.sh); assert.deepEqual(B0.ft, B1.ft);
  const S0 = F.poseOf('Superman', 0), S1 = F.poseOf('Superman', 1);
  assert.deepEqual(S0.hip, S1.hip); assert.ok(S0.ha.y - S1.ha.y > 8, 'Arme heben'); assert.ok(S0.ft.y - S1.ft.y > 6, 'Beine heben');
  const U0 = F.poseOf('Sit-ups', 0), U1 = F.poseOf('Sit-ups', 1);
  assert.ok(U0.sh.y - U1.sh.y > 20, 'Oberkörper richtet sich auf'); assert.deepEqual(U0.hip, U1.hip); assert.ok(U0.sh.y > 80, 'start liegend');
  for (const ex of ['Beckenheben', 'Superman', 'Sit-ups']) for (const p of [0, 0.5, 1]) { const j = F.poseOf(ex, p); for (const k of ['head', 'sh', 'hip', 'kn', 'ft', 'el', 'ha']) assert.ok(j[k].y <= 91, `${ex} ${k} über dem Boden`); }
});
