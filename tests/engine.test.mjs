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

// ---------- Phasen-Zeiträume ----------
const mid25 = () => E.normalizeWorkout({ ...E.TEMPLATES[0], phases: E.planFromMax('Liegestütze', 25).phases });

test('Zeiträume: Liegestütze Max 25 (Mittel), 2 s/Wdh. → 0:00–3:30 Runden 1–6, 3:30–5:00 Runden 7–9', () => {
  const tl = E.phaseTimeline(mid25(), E.secPerRepFor('Liegestütze'));
  assert.deepEqual(tl.map(E.phaseLabel), [
    'Phase 1 · 0:00–3:30 · 10 Wdh / 15 s Pause, Runden 1–6',
    'Phase 2 · 3:30–5:00 · 10 Wdh / 20 s Pause, Runden 7–9',
  ]);
  assert.equal(tl[1].end, 5 * 60000); // letzte Phase endet beim Zeitlimit
});

test('Zeiträume: Tempo-Konstanten je Übung; Phase außerhalb des Zeitlimits = nicht erreicht', () => {
  assert.equal(E.secPerRepFor('Liegestütze'), 2); assert.equal(E.secPerRepFor('Kniebeugen'), 2);
  assert.equal(E.secPerRepFor('Dips'), 2.5); assert.equal(E.secPerRepFor('Klimmzüge'), 3);
  const w = E.normalizeWorkout({ exercise: 'Klimmzüge', limitMin: 2, phases: [{ reps: 3, restSec: 30, rounds: 6 }, { reps: 3, restSec: 40 }] });
  const tl = E.phaseTimeline(w, 3); // 6 × (9 s + 30 s) = 3:54 > 2:00
  assert.equal(tl[0].reached, true); assert.equal(tl[0].end, 120000); assert.equal(tl[0].lastRound, 4);
  assert.equal(tl[1].reached, false); assert.match(E.phaseLabel(tl[1]), /nicht erreicht/);
});

test('Zeiträume: drei Phasen, laufende Session nutzt echte Satzzeiten', () => {
  const w = E.normalizeWorkout({ exercise: 'Liegestütze', limitMin: 10, phases: [{ reps: 10, restSec: 15, rounds: 2 }, { reps: 10, restSec: 20, rounds: 2 }, { reps: 8, restSec: 20 }] });
  const tl = E.phaseTimeline(w, 2);
  assert.deepEqual(tl.map(o => [o.start, o.end, o.firstRound]), [[0, 70000, 1], [70000, 150000, 3], [150000, 600000, 5]]);
  const { state: s } = E.createSession(w, 0);
  E.completeSet(s, 10, 30000); // erster Satz dauerte 30 s statt 20 s
  const live = E.phaseTimeline(s, 2, 31000);
  assert.equal(live[1].start, 80000); assert.equal(live[2].start, 160000);
});

test('Gemessenes Tempo: Median der vollen Sätze aus den letzten Einheiten, sonst null', () => {
  const h = [{ exercise: 'Dips', sets: [{ done: 5, start: 0, end: 15000 }, { done: 5, start: 30000, end: 45000 }] }];
  assert.equal(E.measuredSecPerRep(h, 'Dips'), null); // < 3 Sätze
  h.push({ exercise: 'Dips', sets: [{ done: 5, start: 0, end: 10000 }, { done: 2, start: 50000, end: 60000, partial: true }] });
  assert.equal(E.measuredSecPerRep(h, 'Dips'), 3);
  assert.equal(E.measuredSecPerRep(h, 'Liegestütze'), null);
});

// ---------- Anpassungsregel ----------
const P2 = [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 10, restSec: 20, rounds: null }];
const mk = (rates, phases = P2) => {
  const st = E.phaseStartRounds(phases); let n = 0;
  return rates.map(r => { n++; const ph = st.findLastIndex(x => x <= n); return { n, phase: ph, round: n - st[ph] + 1, target: 10, done: r === 'fail' ? 7 : 10, rate: r }; });
};

test('Anpassung: alles geschafft → Phase 2 zwei Runden später oder Pause Phase 2 −5 s', () => {
  const sg = E.suggestTune({ sets: mk(Array(9).fill('ok')), phases: P2 });
  assert.equal(sg.kind, 'easier');
  assert.deepEqual(sg.options.map(o => o.key), ['later', 'rest2']);
  assert.equal(sg.options[0].phases[0].rounds, 8); assert.equal(sg.options[0].text, 'Phase 2 ab Runde 9 statt 7');
  assert.equal(sg.options[1].phases[1].restSec, 15);
  // Phase 2 nicht erreicht → Pause Phase 1 kürzer
  const sg2 = E.suggestTune({ sets: mk(Array(5).fill('ok')), phases: P2 });
  assert.deepEqual(sg2.options.map(o => [o.key, o.phases[0].restSec]), [['rest1', 10]]);
});

test('Anpassung: ab Runde X nicht geschafft → Phase 2 ab Runde X−1 oder Wdh. dort senken', () => {
  const sg = E.suggestTune({ sets: mk(['ok', 'ok', 'ok', 'hard', 'fail', 'fail', 'ok']), phases: P2 });
  assert.equal(sg.kind, 'harder'); assert.equal(sg.round, 5);
  assert.equal(sg.options[0].key, 'earlier'); assert.equal(sg.options[0].phases[0].rounds, 3); // Phase 2 ab Runde 4
  assert.equal(E.phaseStartRounds(sg.options[0].phases)[1], 4);
  assert.equal(sg.options[1].key, 'reps'); assert.equal(sg.options[1].phases[0].reps, 9);
  // Fehler in der letzten Phase → dort Wdh. senken
  const sg2 = E.suggestTune({ sets: mk([...Array(7).fill('ok'), 'fail']), phases: P2 });
  assert.deepEqual(sg2.options.map(o => [o.key, o.phases[1].reps]), [['reps', 9]]);
  // nur eine Phase → ab Runde X−1 neue Phase 2 mit 80 %
  const one = [{ reps: 10, restSec: 15, rounds: null }];
  const sg3 = E.suggestTune({ sets: mk(['ok', 'ok', 'ok', 'ok', 'fail'], one), phases: one });
  assert.deepEqual(sg3.options[0].phases, [{ reps: 10, restSec: 15, rounds: 3 }, { reps: 8, restSec: 15, rounds: null }]);
});

test('Anpassung: knapp → beibehalten; abgebrochen, Teilsatz und < 3 Sätze → kein Vorschlag bzw. ignoriert', () => {
  assert.equal(E.suggestTune({ sets: mk(['ok', 'hard', 'ok', 'ok']), phases: P2 }).kind, 'keep');
  assert.equal(E.suggestTune({ sets: mk(['ok', 'ok', 'ok']), phases: P2, aborted: true }), null);
  assert.equal(E.suggestTune({ sets: mk(['ok', 'ok']), phases: P2 }), null);
  const sets = mk(Array(8).fill('ok')); sets.push({ n: 9, phase: 1, round: 3, target: 10, done: 3, partial: true });
  assert.equal(E.suggestTune({ sets, phases: P2 }).kind, 'easier');
});

test('Satz-Bewertung: Standard aus Wdh., manuell überschreibbar, Korrektur aktualisiert', () => {
  const { state: s } = E.createSession(E.TEMPLATES[0], 0);
  E.completeSet(s, 10, 20000); assert.equal(s.sets[0].rate, 'ok');
  E.rateLastSet(s, 'hard'); assert.equal(s.sets[0].rate, 'hard');
  E.editLastSet(s, 8); assert.equal(s.sets[0].rate, 'fail');
  E.editLastSet(s, 10); assert.equal(s.sets[0].rate, 'ok');
  assert.equal(E.rateOf({ done: 3, target: 5 }), 'fail');
});

test('Gespeicherte Anpassung wird auf neues Maximum umgerechnet', () => {
  const t = { max: 25, phases: [{ reps: 10, restSec: 15, rounds: 8 }, { reps: 9, restSec: 20, rounds: null }] };
  assert.deepEqual(E.scaleTune(t, 30).phases.map(p => p.reps), [12, 11]);
  assert.equal(E.scaleTune(t, 25), t);
});
