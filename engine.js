// RepZeit – Ablauf-Logik (rein, ohne DOM). Alle Zeiten in ms, "now" wird immer übergeben.
// Dadurch driftfrei (Zeitstempel statt Zählen) und deterministisch testbar.

export const EXERCISES = ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'];

// ---------- Einstufung: Plan aus Maximalwiederholungen ----------
// Stufengrenzen [Mittel ab, Fortgeschritten ab] je Übung; Pausenfaktor für schwerere Übungen.
export const LEVEL_RULES = {
  'Liegestütze': { th: [15, 35], f: 1 },
  'Kniebeugen': { th: [25, 50], f: 1 },
  'Dips': { th: [8, 20], f: 1.25 },
  'Klimmzüge': { th: [5, 12], f: 1.5 },
  _: { th: [10, 25], f: 1 },
};
export const LEVELS = [
  { key: 'beg', name: 'Einsteiger', rest: 25, step: 10, rounds: 5 },
  { key: 'mid', name: 'Mittel', rest: 15, step: 5, rounds: 6 },
  { key: 'adv', name: 'Fortgeschritten', rest: 10, step: 5, rounds: 8 },
];
const r5 = v => Math.max(5, Math.round(v / 5) * 5);
export function levelFor(exercise, max) {
  const r = LEVEL_RULES[exercise] || LEVEL_RULES._;
  const i = max >= r.th[1] ? 2 : max >= r.th[0] ? 1 : 0;
  return { ...LEVELS[i], idx: i, th: r.th, factor: r.f };
}
/** Satz = pct % vom Maximum (mind. 1). Pause nach Stufe × Übungsfaktor. Phase 2 nach N Runden: längere Pause oder 80 % der Wdh. */
export function planFromMax(exercise, max, { pct = 40, phase2 = 'rest' } = {}) {
  max = Math.max(1, Math.round(max)); pct = clamp(Math.round(pct), 20, 80);
  const L = levelFor(exercise, max);
  const reps = Math.max(1, Math.round(max * pct / 100));
  const rest1 = r5(L.rest * L.factor);
  const p2 = phase2 === 'reps' ? { reps: Math.max(1, Math.round(reps * 0.8)), restSec: rest1, rounds: null }
    : { reps, restSec: r5((L.rest + L.step) * L.factor), rounds: null };
  const phases = [{ reps, restSec: rest1, rounds: L.rounds }, p2];
  const range = L.idx === 0 ? `unter ${L.th[0]}` : L.idx === 1 ? `${L.th[0]}–${L.th[1] - 1}` : `ab ${L.th[1]}`;
  const explain = `Satz = ${pct} % × Max ${max} = ${reps} Wdh. · Stufe ${L.name} (${range}) · Pause ${rest1} s × ${L.rounds} Runden, danach ${p2.reps !== reps ? `${p2.reps} Wdh. bei ` : ''}${p2.restSec} s bis Zeitende`;
  return { phases, level: L, reps, explain };
}
export function applyAutoPlan(w, max) {
  if (!w.auto?.enabled || !max) return w;
  w.phases = planFromMax(w.exercise, max, w.auto).phases; return w;
}
/** Neutest vorschlagen: Bestwert deutlich gestiegen (≥ 10 %) oder letzter Test älter als 28 Tage. */
export function retestAdvice({ total, prevBest, aborted }, lastMax, nowMs) {
  if (aborted) return null;
  if (prevBest != null && prevBest > 0 && total * 10 >= prevBest * 11) return 'pr';
  if (lastMax && nowMs - Date.parse(lastMax.date) > 28 * 864e5) return 'old';
  return null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d) => (Number.isFinite(+v) ? Math.round(+v) : d);

export function normalizeWorkout(w) {
  const phases = (Array.isArray(w.phases) && w.phases.length ? w.phases : [{ reps: 10, restSec: 15, rounds: null }])
    .map(p => ({ reps: clamp(int(p.reps, 10), 1, 999), restSec: clamp(int(p.restSec, 15), 0, 600),
      rounds: p.rounds == null ? null : clamp(int(p.rounds, 1), 1, 999) }));
  phases[phases.length - 1].rounds = null; // letzte Phase läuft immer bis Zeitende
  for (let i = 0; i < phases.length - 1; i++) if (phases[i].rounds == null) phases[i].rounds = 1;
  const a = w.adapt || {};
  return {
    id: w.id || 'w' + Math.random().toString(36).slice(2, 10),
    name: String(w.name || 'Workout').slice(0, 60),
    exercise: String(w.exercise || 'Liegestütze').slice(0, 40),
    limitMin: clamp(int(w.limitMin, 5), 1, 60),
    phases,
    adapt: { enabled: !!a.enabled, mode: ['reps', 'rest', 'both'].includes(a.mode) ? a.mode : 'reps',
      reps: clamp(int(a.reps, 2), 1, 50), rest: clamp(int(a.rest, 5), 1, 120), minReps: clamp(int(a.minReps, 1), 1, 999) },
    countMode: w.countMode === 'tap' ? 'tap' : 'set',
    auto: { enabled: !!w.auto?.enabled, pct: clamp(int(w.auto?.pct, 40), 20, 80), phase2: w.auto?.phase2 === 'reps' ? 'reps' : 'rest' },
    template: !!w.template,
  };
}

export function createSession(workout, now) {
  const w = normalizeWorkout(workout);
  const s = {
    v: 1, workoutId: w.id, workoutName: w.name, exercise: w.exercise, countMode: w.countMode,
    phases: w.phases, adapt: w.adapt, limitMs: w.limitMin * 60000,
    status: 'work', startedAt: now, endsAt: now + w.limitMin * 60000,
    phaseIdx: 0, round: 1, setNo: 1, repAdj: 0, restAdj: 0,
    target: 0, setStartedAt: now, restEndsAt: null, restMs: 0, tapCount: 0,
    pendingPhase: false, lastCountSec: null, minuteCued: false, sets: [], endedAt: null,
  };
  s.target = targetFor(s);
  return { state: s, events: [{ type: 'go', target: s.target, first: true }] };
}

export function targetFor(s) {
  const p = s.phases[s.phaseIdx];
  return Math.max(Math.min(p.reps, s.adapt.minReps), p.reps - s.repAdj, 1);
}
export const restSecFor = s => Math.max(0, s.phases[s.phaseIdx].restSec + s.restAdj);
export const total = s => s.sets.reduce((a, x) => a + x.done, 0);

function startSet(s, at, events) {
  s.status = 'work'; s.setStartedAt = at; s.tapCount = 0; s.restEndsAt = null; s.lastCountSec = null;
  const ev = { type: 'go', target: s.target };
  if (s.pendingPhase) { const p = s.phases[s.phaseIdx]; ev.phase = { idx: s.phaseIdx, reps: s.target, restSec: restSecFor(s), prevReps: s.phases[s.phaseIdx - 1].reps, prevRest: s.phases[s.phaseIdx - 1].restSec, rounds: p.rounds }; }
  s.pendingPhase = false;
  events.push(ev);
}

function finish(s, at, events, reason) {
  s.status = 'done'; s.endedAt = Math.min(at, s.endsAt); s.restEndsAt = null;
  events.push({ type: 'done', reason, total: total(s) });
}

/** Satz abschließen mit tatsächlich geschafften Wiederholungen. */
export function completeSet(s, done, now) {
  if (s.status !== 'work') return [];
  const events = [];
  const target = s.target;
  done = clamp(int(done, target), 0, 999);
  const at = Math.min(now, s.endsAt);
  const rec = { n: s.setNo, phase: s.phaseIdx, round: s.round, target, done,
    start: s.setStartedAt - s.startedAt, end: at - s.startedAt, partial: false };
  s.sets.push(rec);
  events.push({ type: 'set', rec });
  if (done < target && s.adapt.enabled) {
    const m = s.adapt.mode;
    if (m === 'reps' || m === 'both') s.repAdj += s.adapt.reps;
    if (m === 'rest' || m === 'both') s.restAdj += s.adapt.rest;
    events.push({ type: 'adapt', repAdj: s.repAdj, restAdj: s.restAdj });
  }
  if (now >= s.endsAt) { finish(s, now, events, 'time'); return events; }
  const restSec = restSecFor(s); // Pause gehört zur Runde des gerade beendeten Satzes
  const p = s.phases[s.phaseIdx];
  s.round++; s.setNo++;
  if (p.rounds != null && s.round > p.rounds && s.phaseIdx < s.phases.length - 1) {
    s.phaseIdx++; s.round = 1; s.pendingPhase = true;
  }
  s.target = targetFor(s);
  s.status = 'rest'; s.restMs = restSec * 1000; s.restEndsAt = now + s.restMs; s.lastCountSec = null;
  events.push({ type: 'rest', sec: restSec, nextTarget: s.target, phaseNext: s.pendingPhase });
  return events.concat(tick(s, now));
}

/** Zeitfortschritt verarbeiten. Darf beliebig selten aufgerufen werden (Tab im Hintergrund). */
export function tick(s, now) {
  const events = [];
  if (s.status !== 'work' && s.status !== 'rest') return events;
  const left = s.endsAt - now;
  if (!s.minuteCued && left <= 60000) {
    s.minuteCued = true;
    if (s.limitMs > 60000 && left > 55000) events.push({ type: 'minute' });
  }
  if (s.status === 'rest') {
    if (now >= s.endsAt) { finish(s, now, events, 'time'); return events; }
    if (now >= s.restEndsAt) { startSet(s, s.restEndsAt, events); }
    else {
      const sec = Math.ceil((s.restEndsAt - now) / 1000);
      if (sec <= 3 && sec !== s.lastCountSec && s.restEndsAt <= s.endsAt) { s.lastCountSec = sec; events.push({ type: 'count', sec }); }
    }
  }
  if (s.status === 'work' && now >= s.endsAt) {
    s.status = 'partial';
    events.push({ type: 'timeup', target: s.target, tapCount: s.tapCount });
  }
  return events;
}

/** Tap-Modus: jedes Tippen = 1 Wdh.; bei Erreichen des Ziels wird der Satz automatisch abgeschlossen. */
export function tapRep(s, now) {
  const ev = tick(s, now);
  if (s.status !== 'work') return ev;
  s.tapCount++;
  ev.push({ type: 'tap', count: s.tapCount });
  if (s.tapCount >= s.target) return ev.concat(completeSet(s, s.tapCount, now));
  return ev;
}

/** Zeit lief während eines Satzes ab: Teilsatz eintragen. */
export function finishPartial(s, done, now) {
  if (s.status !== 'partial') return [];
  done = clamp(int(done, 0), 0, 999);
  const events = [];
  if (done > 0) {
    const rec = { n: s.setNo, phase: s.phaseIdx, round: s.round, target: s.target, done,
      start: s.setStartedAt - s.startedAt, end: s.limitMs, partial: true };
    s.sets.push(rec); events.push({ type: 'set', rec });
  }
  finish(s, now, events, 'time');
  return events;
}

/** Wiederholungen des letzten Satzes nachträglich korrigieren (z.B. in der Pause). */
export function editLastSet(s, done) {
  const last = s.sets[s.sets.length - 1];
  if (!last) return;
  last.done = clamp(int(done, last.done), 0, 999);
}

export function skipRest(s, now) {
  if (s.status !== 'rest') return [];
  const ev = [];
  if (now >= s.endsAt) { finish(s, now, ev, 'time'); return ev; }
  startSet(s, now, ev); return ev;
}

export function abort(s, now) {
  if (s.status === 'done') return [];
  s.status = 'done'; s.aborted = true; s.endedAt = Math.min(now, s.endsAt);
  return [{ type: 'done', reason: 'abort', total: total(s) }];
}

export function summary(s) {
  const t = total(s);
  const elapsed = Math.max(1, (s.endedAt ?? s.endsAt) - s.startedAt);
  return { total: t, sets: s.sets.length, fullSets: s.sets.filter(x => x.done >= x.target).length,
    perMin: t / (elapsed / 60000), elapsedMs: elapsed, aborted: !!s.aborted };
}

/** Hochrechnung auf Zeitende anhand des bisherigen Tempos. */
export function projection(s, now) {
  const el = Math.min(now, s.endsAt) - s.startedAt; const t = total(s);
  if (t === 0 || el < 10000) return null;
  return Math.round(t * s.limitMs / el);
}

/** Wiederholungen einer früheren Einheit bis zum Zeitpunkt t (ms ab Start). */
export function repsAt(sets, t) { let r = 0; for (const x of sets) if (x.end <= t) r += x.done; return r; }

/** Planwert: simuliert das Workout bei festem Tempo (s pro Wdh.), ohne Ausfälle. */
export function simulate(workout, secPerRep = 1.5) {
  let now = 0; const { state: s } = createSession(workout, 0);
  for (let guard = 0; guard < 10000 && s.status !== 'done'; guard++) {
    if (s.status === 'work') {
      const fin = now + s.target * secPerRep * 1000;
      if (fin > s.endsAt) { now = s.endsAt; tick(s, now);
        finishPartial(s, Math.floor((s.endsAt - s.setStartedAt) / 1000 / secPerRep), now); break; }
      now = fin; completeSet(s, s.target, now);
    } else if (s.status === 'rest') { now = Math.min(s.restEndsAt, s.endsAt); tick(s, now); }
    else break;
  }
  return { total: total(s), sets: s.sets.length, s };
}

export function describe(w) {
  return w.phases.map(p => `${p.reps}×/${p.restSec}s ${p.rounds == null ? '→ Ende' : '×' + p.rounds}`).join('  ·  ');
}

export const TEMPLATES = [
  { id: 'tpl-liegestuetz-5', template: true, name: 'Liegestütz-Dichte 5 min', exercise: 'Liegestütze', limitMin: 5,
    phases: [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 10, restSec: 20, rounds: null }], adapt: { enabled: false }, auto: { enabled: true, pct: 40, phase2: 'rest' } },
  { id: 'tpl-liegestuetz-5b', template: true, name: 'Liegestütze 5 min – Wdh. sinken', exercise: 'Liegestütze', limitMin: 5,
    phases: [{ reps: 10, restSec: 15, rounds: 6 }, { reps: 8, restSec: 15, rounds: null }], adapt: { enabled: true, mode: 'reps', reps: 2, minReps: 4 }, auto: { enabled: true, pct: 40, phase2: 'reps' } },
  { id: 'tpl-kniebeugen-10', template: true, name: 'Kniebeugen-Dichte 10 min', exercise: 'Kniebeugen', limitMin: 10,
    phases: [{ reps: 15, restSec: 15, rounds: 6 }, { reps: 15, restSec: 20, rounds: null }], adapt: { enabled: true, mode: 'rest', rest: 5 }, auto: { enabled: true, pct: 40, phase2: 'rest' } },
  { id: 'tpl-dips-6', template: true, name: 'Dips-Dichte 6 min', exercise: 'Dips', limitMin: 6,
    phases: [{ reps: 5, restSec: 20, rounds: 6 }, { reps: 5, restSec: 25, rounds: null }], adapt: { enabled: true, mode: 'reps', reps: 1, minReps: 2 }, auto: { enabled: true, pct: 40, phase2: 'rest' } },
  { id: 'tpl-klimmzug-8', template: true, name: 'Klimmzug-EDT 8 min', exercise: 'Klimmzüge', limitMin: 8,
    phases: [{ reps: 3, restSec: 30, rounds: 6 }, { reps: 3, restSec: 40, rounds: null }], adapt: { enabled: true, mode: 'both', reps: 1, rest: 10, minReps: 1 }, auto: { enabled: true, pct: 40, phase2: 'rest' } },
].map(normalizeWorkout);
