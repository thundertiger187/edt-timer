import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';

const S = 1000;
// Fester 2-Phasen-Plan für die Ablauf-Tests (5 min; 10/15 s ×6; 10/20 s bis Ende)
const base = () => E.normalizeWorkout({ id: 't', name: 'Test', exercise: 'Liegestütze', limitMin: 5, phases: [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 10, restSec: 20 }] });

test('normalize: letzte Phase immer "bis Ende", Grenzen werden eingehalten', () => {
  const w = E.normalizeWorkout({ limitMin: 99, phases: [{ reps: 0, restSec: -3, rounds: null }, { reps: 5, restSec: 10, rounds: 4 }] });
  assert.equal(w.limitMin, 60);
  assert.equal(w.phases[0].reps, 1); assert.equal(w.phases[0].restSec, 0); assert.equal(w.phases[0].rounds, 1);
  assert.equal(w.phases[1].rounds, null);
});

test('Phasenwechsel nach 6 Sätzen: Pause 15 s → 20 s', () => {
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

test('Fitnesstest: Max 25 Liegestütze → 3 Phasen 10/15 s ×4, 10/20 s ×2, 8/20 s bis Ende', () => {
  const p = E.planFromMax('Liegestütze', 25);
  assert.equal(p.level.name, 'Mittel');
  assert.deepEqual(p.phases, [{ reps: 10, restSec: 15, rounds: 4 }, { reps: 10, restSec: 20, rounds: 2 }, { reps: 8, restSec: 20, rounds: null }]);
  assert.match(p.explain, /40 % × Max 25 = 10 Wdh/);
});

test('Fitnesstest: Einsteiger längere Pausen, Fortgeschritten kürzer; mind. 1 Wdh.', () => {
  const beg = E.planFromMax('Liegestütze', 8), adv = E.planFromMax('Liegestütze', 50);
  assert.equal(beg.level.name, 'Einsteiger'); assert.equal(adv.level.name, 'Fortgeschritten');
  assert.ok(beg.phases[0].restSec > adv.phases[0].restSec);
  assert.equal(beg.phases.length, 3); assert.equal(adv.phases[2].reps, 16);
  assert.equal(E.planFromMax('Klimmzüge', 1).reps, 1);
  assert.equal(E.planFromMax('Liegestütze', 50).reps, 20);
});

test('Fitnesstest: Klimmzüge/Dips mit Pausenfaktor; Variante Pause länger; 2 Phasen wählbar', () => {
  const k = E.planFromMax('Klimmzüge', 8); // Mittel: 15 s × 1,5 → 25 s (auf 5 s gerundet)
  assert.deepEqual(k.phases.map(p => p.restSec), [25, 30, 30]);
  assert.deepEqual(E.planFromMax('Liegestütze', 25, { variant: 'rest' }).phases.map(p => [p.reps, p.restSec]), [[10, 15], [10, 20], [10, 25]]);
  const r = E.planFromMax('Liegestütze', 25, { pct: 50, phases: 2 });
  assert.deepEqual(r.phases.map(p => [p.reps, p.restSec]), [[13, 15], [10, 15]]);
});

test('Fitnesstest: alle 3 Phasen werden im Zeitlimit erreicht (Übungen × Maxima × Zeitlimits)', () => {
  for (const ex of E.EXERCISES) for (const max of [1, 3, 8, 12, 25, 40, 60]) for (const limitMin of [3, 5, 8, 10, 20]) {
    const p = E.planFromMax(ex, max, { limitMin });
    if (p.reps * E.secPerRepFor(ex) > limitMin * 60 / 5) continue; // ein Satz > 1/5 des Limits: drei Phasen nicht sinnvoll (z. B. 60 Klimmzüge in 3 min)
    const w = E.normalizeWorkout({ exercise: ex, limitMin, phases: p.phases });
    const tl = E.phaseTimeline(w, E.secPerRepFor(ex));
    assert.equal(tl.length, 3);
    assert.ok(tl.every(o => o.reached), `${ex} max ${max} ${limitMin} min: ${tl.map(E.phaseLabel).join(' | ')}`);
    if (p.phases[0].rounds > 1 || p.phases[1].rounds > 1) assert.ok(tl[2].end - tl[2].start >= limitMin * 60000 * 0.15, `${ex} ${max} ${limitMin}: Phase 3 zu kurz`);
  }
});

test('Fitnesstest: Tempo aus dem Test verschiebt die Satzzahlen, Vorlagen sind 3-phasig', () => {
  const slow = E.planFromMax('Liegestütze', 25, { secPerRep: 3.5 }), fast = E.planFromMax('Liegestütze', 25, { secPerRep: 1.2 });
  assert.ok(slow.phases[0].rounds < fast.phases[0].rounds);
  for (const t of E.TEMPLATES) {
    assert.equal(t.phases.length, 3, t.name);
    assert.ok(E.phaseTimeline(t, E.secPerRepFor(t.exercise)).every(o => o.reached), t.name);
  }
});

test('Auto-Plan wird nur bei aktivierter Option auf ein Workout angewendet', () => {
  const w = E.normalizeWorkout({ exercise: 'Liegestütze', phases: [{ reps: 3, restSec: 60 }], auto: { enabled: false } });
  E.applyAutoPlan(w, 40); assert.equal(w.phases[0].reps, 3);
  w.auto.enabled = true; E.applyAutoPlan(w, 40); assert.equal(w.phases[0].reps, 16); assert.equal(w.phases.length, 3);
  w.auto.phases = 2; E.applyAutoPlan(w, 40); assert.equal(w.phases.length, 2);
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

test('Zeiträume: Liegestütze Max 25 (Mittel), 2 s/Wdh., 5 min → drei Phasen bis 5:00', () => {
  const tl = E.phaseTimeline(mid25(), E.secPerRepFor('Liegestütze'));
  assert.deepEqual(tl.map(E.phaseLabel), [
    'Phase 1 · 0:00–2:20 · 10 Wdh / 15 s Pause, Sätze 1–4',
    'Phase 2 · 2:20–3:40 · 10 Wdh / 20 s Pause, Sätze 5–6',
    'Phase 3 · 3:40–5:00 · 8 Wdh / 20 s Pause, Sätze 7–9',
  ]);
  assert.equal(tl[2].end, 5 * 60000); // letzte Phase endet beim Zeitlimit
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

test('Anpassung: alles geschafft → Phase 2 zwei Sätze später oder Pause Phase 2 −5 s', () => {
  const sg = E.suggestTune({ sets: mk(Array(9).fill('ok')), phases: P2 });
  assert.equal(sg.kind, 'easier');
  assert.deepEqual(sg.options.map(o => o.key), ['later', 'rest2']);
  assert.equal(sg.options[0].phases[0].rounds, 8); assert.equal(sg.options[0].text, 'Phase 2 ab Satz 9 statt 7');
  assert.equal(sg.options[1].phases[1].restSec, 15);
  // Phase 2 nicht erreicht → Pause Phase 1 kürzer
  const sg2 = E.suggestTune({ sets: mk(Array(5).fill('ok')), phases: P2 });
  assert.deepEqual(sg2.options.map(o => [o.key, o.phases[0].restSec]), [['rest1', 10]]);
});

test('Anpassung: ab Satz X nicht geschafft → Phase 2 ab Satz X−1 oder Wdh. dort senken', () => {
  const sg = E.suggestTune({ sets: mk(['ok', 'ok', 'ok', 'hard', 'fail', 'fail', 'ok']), phases: P2 });
  assert.equal(sg.kind, 'harder'); assert.equal(sg.round, 5);
  assert.equal(sg.options[0].key, 'earlier'); assert.equal(sg.options[0].phases[0].rounds, 3); // Phase 2 ab Satz 4
  assert.equal(E.phaseStartRounds(sg.options[0].phases)[1], 4);
  assert.equal(sg.options[1].key, 'reps'); assert.equal(sg.options[1].phases[0].reps, 9);
  // Fehler in der letzten Phase → dort Wdh. senken
  const sg2 = E.suggestTune({ sets: mk([...Array(7).fill('ok'), 'fail']), phases: P2 });
  assert.deepEqual(sg2.options.map(o => [o.key, o.phases[1].reps]), [['reps', 9]]);
  // nur eine Phase → ab Satz X−1 neue Phase 2 mit 80 %
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
  const { state: s } = E.createSession(base(), 0);
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

test('Migration RepZeit → EDT Timer: repzeit.* wird nach edt.* kopiert, vorhandene edt.* bleiben', async () => {
  const { migrateLegacy } = await import('../src/store.js');
  const m = new Map([['repzeit.maxes', '{"Liegestütze":[{"v":25}]}'], ['repzeit.history', '[{"id":"x"}]'], ['edt.settings', '{"sound":false}'], ['repzeit.settings', '{"sound":true}']]);
  const ls = { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) };
  assert.deepEqual(migrateLegacy(ls), ['history', 'maxes']);
  assert.equal(m.get('edt.maxes'), '{"Liegestütze":[{"v":25}]}'); assert.equal(m.get('edt.settings'), '{"sound":false}');
  assert.ok(m.has('repzeit.maxes')); assert.ok(m.has('edt.migrated'));
  assert.deepEqual(migrateLegacy(ls), []); // nur einmal
});

// ---------- v1.3 Erholung ----------
test('Muskelgruppen: Überschneidung Liegestütze/Dips, getrennt von Beinen und Zug', () => {
  const m = E.musclesOf;
  assert.equal(E.overlaps(m('Liegestütze'), m('Dips')), true);
  assert.equal(E.overlaps(m('Liegestütze'), m('Kniebeugen')), false);
  assert.equal(E.overlaps(m('Klimmzüge'), m('Dips')), false);
  assert.equal(E.overlaps(m('Ausfallschritte', 'legs'), m('Kniebeugen')), true);
  assert.equal(E.overlaps(m('Plank', 'own'), m('Liegestütze')), false);
  assert.equal(E.overlaps(m('Plank', 'own'), m('Plank', 'own')), true);
  assert.equal(E.overlaps(m('Plank', 'own'), m('Burpees', 'own')), false);
  assert.equal(m('Dips').name, 'Brust/Trizeps/Schulter');
});
test('Erholung: Restzeit nach Test bzw. EDT, nur für überlappende Gruppen', () => {
  const T0 = 1_000_000, min = 60000;
  const ev = [{ type: 'test', exercise: 'Liegestütze', at: T0 }];
  let r = E.recoveryLeft(ev, { exercise: 'Dips', kind: 'edt' }, null, T0 + 3 * min);
  assert.equal(r.leftMs, 7 * min); assert.equal(r.needMs, 10 * min); assert.equal(r.until, T0 + 10 * min);
  assert.equal(E.recoveryLeft(ev, { exercise: 'Kniebeugen' }, null, T0 + min).leftMs, 0);
  assert.equal(E.recoveryLeft(ev, { exercise: 'Liegestütze' }, null, T0 + 10 * min).leftMs, 0);
  // eigene Zeiten
  r = E.recoveryLeft(ev, { exercise: 'Liegestütze', kind: 'edt' }, { afterTest: 20 }, T0 + 5 * min);
  assert.equal(r.leftMs, 15 * min);
  r = E.recoveryLeft(ev, { exercise: 'Liegestütze', kind: 'test' }, { betweenTests: 4 }, T0 + min);
  assert.equal(r.leftMs, 3 * min);
  // spätestes Ereignis zählt
  const ev2 = [...ev, { type: 'edt', exercise: 'Dips', at: T0 + 2 * min }];
  r = E.recoveryLeft(ev2, { exercise: 'Liegestütze' }, { afterTest: 10, betweenEdt: 15 }, T0 + 3 * min);
  assert.equal(r.until, T0 + 17 * min); assert.equal(r.cause.type, 'edt');
});
test('Reduktion bei verkürzter Erholung: linear bis −20 %, mindestens 1 Wdh.', () => {
  assert.equal(E.shortRestFactor(0, 600000), 1);
  assert.equal(E.shortRestFactor(600000, 600000), 0.8);
  assert.ok(Math.abs(E.shortRestFactor(300000, 600000) - 0.9) < 1e-9);
  assert.ok(Math.abs(E.shortRestFactor(480000, 600000) - 0.84) < 1e-9);
  assert.equal(E.shortRestFactor(900000, 600000), 0.8);
  assert.deepEqual(E.reducePhases([{ reps: 10, restSec: 15 }, { reps: 1, restSec: 20 }], 0.8).map(p => p.reps), [8, 1]);
  assert.deepEqual(E.reducePhases([{ reps: 10 }], 0.84).map(p => p.reps), [8]);
});
test('suggestTune ignoriert Einheiten mit verkürzter Erholung', () => {
  const w = E.normalizeWorkout({ exercise: 'Liegestütze', limitMin: 5, phases: [{ reps: 10, restSec: 15, rounds: 3 }, { reps: 8, restSec: 20, rounds: null }] });
  const sets = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, target: 10, done: 10, phase: 0, startMs: i * 30000, endMs: i * 30000 + 20000, restSec: 15 }));
  assert.equal(E.suggestTune({ sets, phases: w.phases, aborted: false, shortRec: { pct: 16 } }), null);
});
test('normalizeWorkout behält Muskelgruppe', () => {
  assert.equal(E.normalizeWorkout({ exercise: 'Plank', muscle: 'legs' }).muscle, 'legs');
  assert.equal(E.normalizeWorkout({ exercise: 'Plank', muscle: 'xx' }).muscle, 'own');
});

// ---------- v1.4.1: Rekord 5 min ----------
const H = (id, exercise, limitMin, total, extra = {}) => ({ id, workoutId: 'w-' + exercise, exercise, date: `2026-10-2${id.length}T10:00:00.000Z`, limitMs: limitMin * 60000, total, sets: [], aborted: false, ...extra });
test('Rekord 5 min: ohne Verlauf / ohne 5-min-Einheit → null', () => {
  assert.equal(E.bestForLimit([], 'Liegestütze', 5), null);
  assert.equal(E.bestForLimit(undefined, 'Liegestütze', 5), null);
  assert.equal(E.bestForLimit([H('a', 'Liegestütze', 10, 150), H('b', 'Kniebeugen', 5, 90)], 'Liegestütze', 5), null);
});
test('Rekord 5 min: nach einer 5-min-Einheit = deren Summe', () => {
  assert.deepEqual(E.bestForLimit([H('a', 'Liegestütze', 5, 88)], 'Liegestütze', 5), { total: 88, date: '2026-10-21T10:00:00.000Z', id: 'a' });
});
test('Rekord 5 min: höchste Summe, verkürzte Erholung zählt, andere Dauer/abgebrochen/0 nicht', () => {
  const h = [H('a', 'Liegestütze', 5, 96), H('bb', 'Liegestütze', 5, 112, { shortRec: { pct: 12 } }), H('ccc', 'Liegestütze', 10, 180), H('dddd', 'Liegestütze', 6, 130),
    H('eeeee', 'Liegestütze', 5, 140, { aborted: true }), H('f', 'Liegestütze', 5, 0), H('g', 'Dips', 5, 200)];
  assert.equal(E.bestForLimit(h, 'Liegestütze', 5).total, 112);
  assert.equal(E.bestForLimit(h, 'Liegestütze', 10).total, 180);
});
test('Rekord 5 min: ältere Einträge (limitMin statt limitMs, nur workoutId, ungerade limitMs)', () => {
  const info = id => ({ 'own-b': { exercise: 'Burpees', limitMin: 5 }, 'w-lang': { exercise: 'Burpees', limitMin: 8 } })[id];
  const h = [{ id: 'x', exercise: 'Dips', limitMin: 5, total: 41 }, { id: 'y', workoutId: 'own-b', total: 63 }, { id: 'z', workoutId: 'w-lang', total: 99 },
    { id: 'v', exercise: 'Dips', limitMs: 300400, total: '45' }, { id: 'u', exercise: 'Dips', total: 70 }, null];
  assert.equal(E.bestForLimit(h, 'Dips', 5).total, 45);
  assert.equal(E.bestForLimit(h, 'Burpees', 5, info).total, 63);
  assert.equal(E.bestForLimit(h, 'Burpees', 5), null); // ohne Workout-Info: Übung unbekannt
  assert.equal(E.sessionLimitMin({ limitMs: 300000 }), 5); assert.equal(E.sessionLimitMin({ limitMin: 5 }), 5);
  assert.equal(E.sessionLimitMin({ workoutId: 'w-lang' }, info), 8); assert.equal(E.sessionLimitMin({}), null);
});

// ---------- v1.5.0: Entwicklung · 30 Tage ----------
test('devSeries: nur gleiche Zeitvorgabe, beste Einheit pro Tag, abgebrochene/alte ignoriert', () => {
  const now = Date.parse('2026-10-31T17:00:00+01:00'), D = 86400000;
  const h = (id, d, total, lim, ex = 'Liegestütze', extra = {}) => ({ id, workoutId: 'w' + lim, workoutName: `W ${lim}`, exercise: ex, date: new Date(now - d * D).toISOString(), limitMs: lim * 60000, total, ...extra });
  const hist = [h('a', 40, 50, 5), h('b', 20, 80, 5), h('c', 20, 85, 5), h('d', 19, 200, 10), h('e', 10, 90, 5), h('f', 5, 99, 5, 'Liegestütze', { aborted: true }), h('g', 1, 100, 5), h('k', 2, 30, 5, 'Dips')];
  const maxes = { 'Liegestütze': [{ v: 20, date: new Date(now - 50 * D).toISOString() }, { v: 25, date: new Date(now - 15 * D).toISOString(), source: 'test' }] };
  const r = E.devSeries(hist, maxes, { exercise: 'Liegestütze', now });
  assert.equal(r.limitMin, 5); assert.deepEqual(r.limits, [5, 10]);
  assert.deepEqual(r.points.map(p => p.value), [85, 90, 100]);
  assert.equal(r.points[0].bestId, 'c'); assert.equal(r.points[0].sessions.length, 2);
  assert.deepEqual(r.tests.map(t => t.value), [25]);
  assert.equal(r.trend.length, 1); assert.ok(Math.abs(r.trend[0].value - 275 / 3) < 1e-9);
  assert.equal(r.summary.pct, Math.round((100 / 85 - 1) * 100));
  const r10 = E.devSeries(hist, maxes, { exercise: 'Liegestütze', limitMin: 10, now });
  assert.deepEqual(r10.points.map(p => p.value), [200]); assert.equal(r10.summary, null);
});
test('devSeries: „Alle“ summiert pro Tag, keine Testmarker; leer ohne Daten', () => {
  const now = Date.parse('2026-10-31T17:00:00+01:00'), D = 86400000;
  const hist = [{ id: 'a', exercise: 'Liegestütze', date: new Date(now - D).toISOString(), limitMs: 300000, total: 100 }, { id: 'b', exercise: 'Dips', date: new Date(now - D + 3600000).toISOString(), limitMs: 300000, total: 40 }];
  const r = E.devSeries(hist, { 'Dips': [{ v: 9, date: new Date(now).toISOString() }] }, { exercise: null, now });
  assert.deepEqual(r.points.map(p => p.value), [140]); assert.deepEqual(r.tests, []);
  const e = E.devSeries([], {}, { exercise: 'Dips', now });
  assert.deepEqual(e.points, []); assert.equal(e.summary, null); assert.equal(e.limitMin, null);
});
test('niceTicks: runde Achsenwerte, deckt Bereich ab', () => {
  assert.deepEqual(E.niceTicks(78, 118), [70, 80, 90, 100, 110, 120]);
  assert.deepEqual(E.niceTicks(0, 9, 3), [0, 5, 10]);
  const t = E.niceTicks(5, 5); assert.ok(t[0] <= 5 && t.at(-1) >= 5);
});
