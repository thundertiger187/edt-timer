import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';

const S = 1000;
const base = () => E.TEMPLATES[0]; // 5 min; 10/15s ×6; 10/20s bis Ende

test('normalize: letzte Phase immer "bis Ende", Grenzen werden eingehalten', () => {
  const w = E.normalizeWorkout({ limitMin: 99, phases: [{ reps: 0, restSec: -3, rounds: null }, { reps: 5, restSec: 10, rounds: 4 }] });
  assert.equal(w.limitMin, 60);
  assert.equal(w.phases[0].reps, 1); assert.equal(w.phases[0].restSec, 0); assert.equal(w.phases[0].rounds, 1);
  assert.equal(w.phases[1].rounds, null);
});

test('Phasenwechsel nach 6 Runden: Pause 15 s → 20 s', () => {
  let now = 0; const { state: s } = E.createSession(base(), now);
  const rests = [];
  for (let i = 0; i < 8; i++) {
    now += 10 * S;
    const ev = E.completeSet(s, 10, now);
    rests.push(ev.find(e => e.type === 'rest').sec);
    now = s.restEndsAt; const ev2 = E.tick(s, now);
    const go = ev2.find(e => e.type === 'go');
    assert.ok(go, 'Satz startet nach Pausenende');
    if (i === 5) { assert.ok(go.phase, 'Phasenwechsel-Ereignis vor Satz 7'); assert.equal(go.phase.restSec, 20); }
    else assert.equal(go.phase, undefined);
  }
  assert.deepEqual(rests, [15, 15, 15, 15, 15, 15, 20, 20]);
  assert.equal(s.phaseIdx, 1); assert.equal(s.setNo, 9); assert.equal(E.total(s), 80);
});

test('Pausen-Countdown meldet 3, 2, 1 genau einmal', () => {
  const { state: s } = E.createSession(base(), 0);
  E.completeSet(s, 10, 10 * S);
  const counts = [];
  for (let t = 10 * S; t < s.restEndsAt; t += 100) for (const e of E.tick(s, t)) if (e.type === 'count') counts.push(e.sec);
  assert.deepEqual(counts, [3, 2, 1]);
});

test('Zeitende während eines Satzes → Teilsatz wird abgefragt und gezählt', () => {
  const { state: s } = E.createSession(base(), 0);
  let now = 0;
  while (s.status !== 'partial') {
    if (s.status === 'work') { now += 20 * S; if (now >= s.endsAt) { E.tick(s, now); break; } E.completeSet(s, 10, now); }
    else { now = s.restEndsAt; E.tick(s, now); }
  }
  assert.equal(s.status, 'partial');
  const before = E.total(s);
  const ev = E.finishPartial(s, 4, now);
  assert.equal(s.status, 'done'); assert.equal(E.total(s), before + 4);
  assert.equal(s.sets.at(-1).partial, true); assert.equal(s.sets.at(-1).end, 5 * 60 * S);
  assert.ok(ev.some(e => e.type === 'done'));
});

test('Zeitende während der Pause → direkt fertig, kein Teilsatz', () => {
  const { state: s } = E.createSession(base(), 0);
  E.completeSet(s, 10, 295 * S); // Pause bis 310 s > 300 s
  const ev = E.tick(s, 300 * S);
  assert.equal(s.status, 'done'); assert.equal(ev[0].type, 'done');
});

test('Tab im Hintergrund: ein später tick() startet den Satz zum korrekten Zeitpunkt', () => {
  const { state: s } = E.createSession(base(), 0);
  E.completeSet(s, 10, 10 * S);
  E.tick(s, 60 * S); // 35 s zu spät aufgeweckt
  assert.equal(s.status, 'work'); assert.equal(s.setStartedAt, 25 * S);
});

test('Auto-Anpassung Wdh.: verfehlter Satz senkt Ziel um X, nicht unter Minimum', () => {
  const w = { ...base(), adapt: { enabled: true, mode: 'reps', reps: 3, minReps: 5 } };
  const { state: s } = E.createSession(w, 0); let now = 0;
  const step = done => { now += 10 * S; const ev = E.completeSet(s, done, now); now = s.restEndsAt; E.tick(s, now); return ev; };
  assert.ok(step(7).some(e => e.type === 'adapt')); assert.equal(s.target, 7);
  step(7); assert.equal(s.target, 7, 'geschafft → keine weitere Senkung');
  step(5); assert.equal(s.target, 5, 'Minimum 5');
  step(2); assert.equal(s.target, 5);
});

test('Auto-Anpassung Pause: verfehlter Satz verlängert Pause um Y s (sofort und danach)', () => {
  const w = { ...base(), adapt: { enabled: true, mode: 'rest', rest: 5 } };
  const { state: s } = E.createSession(w, 0);
  const ev = E.completeSet(s, 8, 10 * S);
  assert.equal(ev.find(e => e.type === 'rest').sec, 20);
  assert.equal(s.target, 10);
  E.tick(s, s.restEndsAt); const ev2 = E.completeSet(s, 10, s.setStartedAt + 10 * S);
  assert.equal(ev2.find(e => e.type === 'rest').sec, 20);
});

test('Auto-Anpassung aus: verfehlter Satz ändert nichts', () => {
  const { state: s } = E.createSession(base(), 0);
  const ev = E.completeSet(s, 3, 10 * S);
  assert.ok(!ev.some(e => e.type === 'adapt')); assert.equal(s.target, 10);
  assert.equal(ev.find(e => e.type === 'rest').sec, 15);
});

test('Tap-Modus: Ziel erreicht → Satz automatisch abgeschlossen', () => {
  const { state: s } = E.createSession({ ...base(), countMode: 'tap' }, 0);
  for (let i = 1; i <= 9; i++) E.tapRep(s, i * S);
  assert.equal(s.status, 'work'); assert.equal(s.tapCount, 9);
  const ev = E.tapRep(s, 10 * S);
  assert.equal(s.status, 'rest'); assert.equal(ev.find(e => e.type === 'set').rec.done, 10);
});

test('"Noch eine Minute" genau einmal; nicht bei 1-Minuten-Workouts', () => {
  const { state: s } = E.createSession(base(), 0);
  let n = 0; for (let t = 0; t < 300 * S; t += 500) { n += E.tick(s, t).filter(e => e.type === 'minute').length; if (s.status !== 'work') break; }
  assert.equal(n, 1);
  const { state: s1 } = E.createSession({ ...base(), limitMin: 1 }, 0);
  assert.equal(E.tick(s1, 1000).filter(e => e.type === 'minute').length, 0);
});

test('Hochrechnung, Vergleich mit Bestwert, Zusammenfassung', () => {
  const { state: s } = E.createSession(base(), 0);
  E.completeSet(s, 10, 30 * S); E.tick(s, s.restEndsAt); E.completeSet(s, 10, 60 * S);
  assert.equal(E.projection(s, 60 * S), 100);
  assert.equal(E.repsAt(s.sets, 45 * S), 10);
  E.abort(s, 60 * S); const sum = E.summary(s);
  assert.equal(sum.total, 20); assert.equal(sum.perMin, 20); assert.ok(sum.aborted);
});

test('Simulation der Beispielvorlage liefert plausiblen Planwert', () => {
  const r = E.simulate(base(), 1.5);
  // 6×(15+15) = 180 s für 60 Wdh., danach 35-s-Runden: 120 s → 3 volle Sätze + Teilsatz
  assert.equal(r.sets, 10); assert.equal(r.total, 60 + 30 + Math.floor(15 / 1.5));
});

test('Abschluss nach Zeitende per completeSet zählt nicht über das Limit hinaus', () => {
  const { state: s } = E.createSession(base(), 0);
  const ev = E.completeSet(s, 10, 301 * S);
  assert.equal(s.status, 'done'); assert.equal(s.sets[0].end, 300 * S); assert.ok(ev.some(e => e.type === 'done'));
});

test('Einstufung: Max 25 Liegestütze → 10 Wdh., 15 s ×6, dann 20 s (Beispiel des Nutzers)', () => {
  const p = E.planFromMax('Liegestütze', 25);
  assert.equal(p.level.name, 'Mittel');
  assert.deepEqual(p.phases, [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 10, restSec: 20, rounds: null }]);
  assert.match(p.explain, /40 % × Max 25 = 10 Wdh/);
});

test('Einstufung: Einsteiger längere Pausen, Fortgeschritten kürzer; mind. 1 Wdh.', () => {
  const beg = E.planFromMax('Liegestütze', 8), adv = E.planFromMax('Liegestütze', 50);
  assert.equal(beg.level.name, 'Einsteiger'); assert.equal(adv.level.name, 'Fortgeschritten');
  assert.ok(beg.phases[0].restSec > adv.phases[0].restSec);
  assert.equal(beg.phases[0].rounds, 5); assert.equal(adv.phases[0].rounds, 8);
  assert.equal(E.planFromMax('Klimmzüge', 1).reps, 1);
  assert.equal(E.planFromMax('Liegestütze', 50).reps, 20);
});

test('Einstufung: Klimmzüge/Dips mit Pausenfaktor, Phase 2 wahlweise weniger Wdh.', () => {
  const k = E.planFromMax('Klimmzüge', 8); // Mittel: 15 s × 1,5 → 25 s (auf 5 s gerundet)
  assert.equal(k.phases[0].restSec, 25); assert.equal(k.phases[1].restSec, 30);
  const r = E.planFromMax('Liegestütze', 25, { pct: 50, phase2: 'reps' });
  assert.deepEqual(r.phases.map(p => [p.reps, p.restSec]), [[13, 15], [10, 15]]);
});

test('Auto-Plan wird nur bei aktivierter Option auf ein Workout angewendet', () => {
  const w = E.normalizeWorkout({ exercise: 'Liegestütze', phases: [{ reps: 3, restSec: 60 }], auto: { enabled: false } });
  E.applyAutoPlan(w, 40); assert.equal(w.phases[0].reps, 3);
  w.auto.enabled = true; E.applyAutoPlan(w, 40); assert.equal(w.phases[0].reps, 16); assert.equal(w.phases.length, 2);
});

test('Neutest-Empfehlung: +10 % über Bestwert oder Test älter als 28 Tage', () => {
  const t = Date.parse('2026-10-30T12:00:00Z');
  assert.equal(E.retestAdvice({ total: 110, prevBest: 100 }, { date: '2026-10-29T00:00:00Z' }, t), 'pr');
  assert.equal(E.retestAdvice({ total: 105, prevBest: 100 }, { date: '2026-10-29T00:00:00Z' }, t), null);
  assert.equal(E.retestAdvice({ total: 50, prevBest: 100 }, { date: '2026-09-01T00:00:00Z' }, t), 'old');
  assert.equal(E.retestAdvice({ total: 200, prevBest: 100, aborted: true }, null, t), null);
});
