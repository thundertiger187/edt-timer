// EDT Timer – Ablauf-Logik (rein, ohne DOM). Alle Zeiten in ms, "now" wird immer übergeben.
// Dadurch driftfrei (Zeitstempel statt Zählen) und deterministisch testbar.

export const EXERCISES = ['Liegestütze', 'Kniebeugen', 'Dips', 'Klimmzüge'];

// ---------- Fitnesstest → EDT-Plan aus Maximalwiederholungen ----------
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
/**
 * EDT-Plan aus dem Maximum (Standard 3 Phasen).
 *  Satz      = pct % vom Maximum (mind. 1)
 *  Pause 1   = Stufenpause × Übungsfaktor (frisch, kurz)
 *  Pause 2   = (Stufenpause + Stufenschritt) × Übungsfaktor
 *  Phase 3   = variant 'reps': 80 % der Wdh. bei Pause 2 · variant 'rest': gleiche Wdh., (Stufenpause + 2 × Schritt) × Faktor
 *  Sätze     = so gewählt, dass Phase 1 ≈ 45 %, Phase 2 ≈ 30 % und Phase 3 ≈ 25 % des Zeitlimits dauert
 *              (Satzdauer = Wdh. × Tempo + Pause, Tempo aus SEC_PER_REP bzw. gemessen), mind. 1 Satz je Phase.
 *  phases: 2 → Phase 1 ≈ 60 %, Phase 2 = Variante (80 % Wdh. bei Pause 1 bzw. Pause 2) bis Zeitende.
 */
export const PHASE_SHARES = { 2: [0.6], 3: [0.45, 0.3] };
export function planFromMax(exercise, max, { pct = 40, variant, phase2, phases: n = 3, limitMin = 5, secPerRep } = {}) {
  max = Math.max(1, Math.round(max)); pct = clamp(Math.round(pct), 20, 80); n = n === 2 ? 2 : 3;
  variant = (variant ?? phase2) === 'rest' ? 'rest' : 'reps';
  const spr = secPerRep ?? secPerRepFor(exercise), T = clamp(+limitMin || 5, 1, 60) * 60;
  const L = levelFor(exercise, max);
  const reps = Math.max(1, Math.round(max * pct / 100)), reps80 = Math.max(1, Math.round(reps * 0.8));
  const rest1 = r5(L.rest * L.factor), rest2 = r5((L.rest + L.step) * L.factor), rest3 = r5((L.rest + 2 * L.step) * L.factor);
  const ph = n === 3
    ? [{ reps, restSec: rest1 }, { reps, restSec: rest2 }, variant === 'reps' ? { reps: reps80, restSec: rest2 } : { reps, restSec: rest3 }]
    : [{ reps, restSec: rest1 }, variant === 'reps' ? { reps: reps80, restSec: rest1 } : { reps, restSec: rest2 }];
  const shares = PHASE_SHARES[n];
  ph.forEach((p, i) => { p.rounds = i < ph.length - 1 ? Math.max(1, Math.round(shares[i] * T / (p.reps * spr + p.restSec))) : null; });
  // Letzte Phase braucht mindestens ein Viertel der Zeit: sonst vordere Phasen kürzen (mind. 1 Satz je Phase)
  const cyc = p => p.reps * spr + p.restSec, used = () => ph.slice(0, -1).reduce((t, p) => t + p.rounds * cyc(p), 0);
  for (let k = ph.length - 2; used() > 0.75 * T && ph.slice(0, -1).some(p => p.rounds > 1); k = k > 0 ? k - 1 : ph.length - 2)
    if (ph[k].rounds > 1) ph[k].rounds--;
  const range = L.idx === 0 ? `unter ${L.th[0]}` : L.idx === 1 ? `${L.th[0]}–${L.th[1] - 1}` : `ab ${L.th[1]}`;
  const desc = ph.map((p, i) => `P${i + 1} ${p.reps} Wdh./${p.restSec} s${p.rounds ? ' × ' + p.rounds : ' bis Ende'}`).join(' · ');
  const explain = `Satz = ${pct} % × Max ${max} = ${reps} Wdh. · Stufe ${L.name} (${range}) · ${desc}`;
  return { phases: ph, level: L, reps, explain, secPerRep: spr };
}
export function applyAutoPlan(w, max, secPerRep) {
  if (!w.auto?.enabled || !max) return w;
  w.phases = planFromMax(w.exercise, max, { ...w.auto, limitMin: w.limitMin, secPerRep }).phases; return w;
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
    auto: { enabled: !!w.auto?.enabled, pct: clamp(int(w.auto?.pct, 40), 20, 80), phases: w.auto?.phases === 2 ? 2 : 3,
      variant: (w.auto?.variant ?? 'reps') === 'rest' ? 'rest' : 'reps' },
    muscle: MUSCLE_GROUPS[w.muscle] ? w.muscle : 'own',
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
    start: s.setStartedAt - s.startedAt, end: at - s.startedAt, partial: false, rate: done < target ? 'fail' : 'ok' };
  s.sets.push(rec);
  events.push({ type: 'set', rec });
  if (done < target && s.adapt.enabled) {
    const m = s.adapt.mode;
    if (m === 'reps' || m === 'both') s.repAdj += s.adapt.reps;
    if (m === 'rest' || m === 'both') s.restAdj += s.adapt.rest;
    events.push({ type: 'adapt', repAdj: s.repAdj, restAdj: s.restAdj });
  }
  if (now >= s.endsAt) { finish(s, now, events, 'time'); return events; }
  const restSec = restSecFor(s); // Pause gehört zum gerade beendeten Satz
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
  if (last.partial) return;
  if (last.done < last.target) last.rate = 'fail'; else if (last.rate === 'fail') last.rate = 'ok';
}
/** Bewertung des letzten Satzes: 'ok' (geschafft) · 'hard' (knapp) · 'fail' (nicht geschafft). */
export function rateLastSet(s, rate) {
  const last = s.sets[s.sets.length - 1];
  if (!last || !RATES.includes(rate)) return;
  last.rate = rate;
}
export const RATES = ['ok', 'hard', 'fail'];
export const rateOf = x => x.rate || (x.done < x.target ? 'fail' : 'ok');

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

// ---------- Phasen-Zeiträume ----------
/** Geschätzte Dauer einer Wiederholung in Sekunden je Übung (inkl. kurzer Umkehrpunkte). */
export const SEC_PER_REP = { 'Liegestütze': 2, 'Kniebeugen': 2, 'Dips': 2.5, 'Klimmzüge': 3, _: 2.5 };
export const secPerRepFor = ex => SEC_PER_REP[ex] ?? SEC_PER_REP._;
export const MAX_PHASES = 4;

/** Gemessenes Tempo (s/Wdh.) aus den letzten Einheiten einer Übung: Median über volle Sätze, mind. 3 Sätze. */
export function measuredSecPerRep(history, exercise, lastN = 3) {
  const runs = history.filter(h => h.exercise === exercise && !h.aborted && Array.isArray(h.sets)).slice(-lastN);
  const v = [];
  for (const h of runs) for (const x of h.sets) if (!x.partial && x.done > 0 && x.end > x.start) v.push((x.end - x.start) / 1000 / x.done);
  if (v.length < 3) return null;
  v.sort((a, b) => a - b);
  const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return Math.round(clamp(m, 0.8, 8) * 10) / 10;
}

/**
 * Zeiträume je Phase. Simuliert den Ablauf mit festem Tempo (secPerRep) und der jeweiligen Pause.
 * src = Workout (Vorschau ab 0:00) oder laufende Session (bisherige Sätze + Rest ab "now" geschätzt).
 * Ergebnis je Phase: start/end in ms ab Trainingsbeginn, firstRound/lastRound (fortlaufende Satznummer),
 * reached=false wenn die Phase im Zeitlimit nicht mehr beginnt. Letzte erreichte Phase endet beim Zeitlimit.
 */
export function phaseTimeline(src, secPerRep = 2, now = null) {
  const live = !!src.status;
  const s = live ? structuredClone(src) : createSession(src, 0).state;
  let t = live ? (now ?? s.startedAt) : 0;
  const starts = []; // {phase, n, start}
  for (const x of s.sets) starts.push({ phase: x.phase, n: x.n, start: x.start });
  const spr = secPerRep * 1000;
  for (let guard = 0; guard < 10000 && s.status !== 'done'; guard++) {
    if (s.status === 'work' || s.status === 'partial') {
      const fin = Math.max(t, s.setStartedAt + s.target * spr);
      if (s.status === 'partial' || fin >= s.endsAt) { starts.push({ phase: s.phaseIdx, n: s.setNo, start: s.setStartedAt - s.startedAt }); break; }
      t = fin; completeSet(s, s.target, t);
      const x = s.sets[s.sets.length - 1]; starts.push({ phase: x.phase, n: x.n, start: x.start });
    } else if (s.status === 'rest') { t = Math.max(t, Math.min(s.restEndsAt, s.endsAt)); tick(s, t); }
    else break;
  }
  const out = s.phases.map((p, i) => ({ idx: i, reps: p.reps, restSec: p.restSec, rounds: p.rounds, reached: false, start: null, end: null, firstRound: null, lastRound: null }));
  for (const x of starts) {
    const o = out[x.phase];
    if (!o.reached) Object.assign(o, { reached: true, start: x.start, firstRound: x.n, lastRound: x.n });
    else { o.start = Math.min(o.start, x.start); o.firstRound = Math.min(o.firstRound, x.n); o.lastRound = Math.max(o.lastRound, x.n); }
  }
  if (out[0].reached) out[0].start = 0;
  for (let i = 0; i < out.length; i++) {
    if (!out[i].reached) continue;
    const nx = out.slice(i + 1).find(o => o.reached);
    out[i].end = nx ? nx.start : s.limitMs;
  }
  return out;
}
export const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/** "Phase 1 · 0:00–2:20 · 10 Wdh / 15 s Pause, Sätze 1–4" */
export function phaseLabel(o) {
  if (!o.reached) return `Phase ${o.idx + 1} · nicht erreicht · ${o.reps} Wdh / ${o.restSec} s Pause`;
  const r = o.firstRound === o.lastRound ? `Satz ${o.firstRound}` : `Sätze ${o.firstRound}–${o.lastRound}`;
  return `Phase ${o.idx + 1} · ${mmss(o.start)}–${mmss(o.end)} · ${o.reps} Wdh / ${o.restSec} s Pause, ${r}`;
}
/** Erste fortlaufende Satznummer jeder Phase (aus den Satzzahlen). */
export function phaseStartRounds(phases) {
  const r = []; let n = 1;
  for (const p of phases) { r.push(n); n += p.rounds ?? 0; }
  return r;
}

// ---------- Anpassung nach dem Training ----------
/**
 * Regel (pro Übung, für die nächste Einheit):
 *  - Abgebrochen oder < 3 volle Sätze → kein Vorschlag.
 *  - Erster nicht geschaffter Satz (Satz X, Teilsatz am Zeitende zählt nicht) in Phase k:
 *      A) gibt es eine Folgephase und X−1 > Start(k): Phase k+1 beginnt ab Satz X−1 (Phase k hat X−1−Start(k) Sätze).
 *      B) sonst bzw. als Alternative: Wdh. in Phase k um 10 % senken (mind. −1, mind. 1 Wdh.).
 *      Nur eine Phase und X−1 ≥ 2: A) = ab Satz X−1 neue Phase 2 mit 80 % der Wdh.
 *  - Alle Sätze „geschafft“ (kein „knapp“, kein „nicht geschafft“):
 *      Phase 2 erreicht: A) Phase 2 startet 2 Sätze später, B) Pause der Phase 2 um 5 s kürzer (nicht unter Pause Phase 1).
 *      Phase 2 nicht erreicht oder nur eine Phase: Pause Phase 1 um 5 s kürzer (mind. 5 s).
 *  - Sonst (einzelne „knapp“): Plan beibehalten.
 */
export function suggestTune({ sets, phases, aborted, shortRec }) {
  if (aborted || shortRec || !Array.isArray(phases) || !phases.length) return null;
  const P = phases.map(p => ({ ...p }));
  const full = sets.filter(x => !x.partial);
  if (full.length < 3) return null;
  const starts = phaseStartRounds(P);
  const fail = full.find(x => rateOf(x) === 'fail');
  const opts = [];
  const cl = () => P.map(p => ({ ...p }));
  if (fail) {
    const X = fail.n, k = fail.phase;
    if (k < P.length - 1 && X - 1 > starts[k]) {
      const q = cl(); q[k].rounds = X - 1 - starts[k];
      opts.push({ key: 'earlier', phases: q, text: `Phase ${k + 2} ab Satz ${X - 1} statt ${starts[k + 1]}` });
    } else if (P.length === 1 && X - 1 >= 2 && P.length < MAX_PHASES) {
      const q = cl(); q[0].rounds = X - 2; q.push({ reps: Math.max(1, Math.round(P[0].reps * 0.8)), restSec: P[0].restSec, rounds: null });
      opts.push({ key: 'split', phases: q, text: `Ab Satz ${X - 1} neue Phase 2 mit ${q[1].reps} Wdh.` });
    }
    if (P[k].reps > 1) {
      const q = cl(); q[k].reps = Math.max(1, P[k].reps - Math.max(1, Math.round(P[k].reps * 0.1)));
      opts.push({ key: 'reps', phases: q, text: `Phase ${k + 1}: ${q[k].reps} statt ${P[k].reps} Wdh.` });
    }
    if (!opts.length) return { kind: 'keep', round: X, phase: k, text: `Satz ${X} nicht geschafft, Plan ist bereits am Minimum.`, options: [] };
    return { kind: 'harder', round: X, phase: k, text: `Ab Satz ${X} (Phase ${k + 1}) nicht geschafft.`, options: opts };
  }
  if (full.every(x => rateOf(x) === 'ok')) {
    const reached2 = P.length > 1 && full.some(x => x.phase >= 1);
    if (reached2) {
      const q = cl(); q[0].rounds = Math.min(99, P[0].rounds + 2);
      opts.push({ key: 'later', phases: q, text: `Phase 2 ab Satz ${starts[1] + 2} statt ${starts[1]}` });
      if (P[1].restSec - 5 >= P[0].restSec && P[1].restSec >= 5) {
        const q2 = cl(); q2[1].restSec = P[1].restSec - 5;
        opts.push({ key: 'rest2', phases: q2, text: `Phase 2: Pause ${q2[1].restSec} s statt ${P[1].restSec} s` });
      }
    } else if (P[0].restSec - 5 >= 5) {
      const q = cl(); q[0].restSec = P[0].restSec - 5;
      opts.push({ key: 'rest1', phases: q, text: `Phase 1: Pause ${q[0].restSec} s statt ${P[0].restSec} s` });
    }
    if (!opts.length) return { kind: 'keep', text: 'Alle Sätze geschafft, Pausen bereits am Minimum.', options: [] };
    return { kind: 'easier', text: 'Alle Sätze geschafft.', options: opts };
  }
  const hard = full.filter(x => rateOf(x) === 'hard').length;
  return { kind: 'keep', text: `Alle Sätze geschafft, ${hard} knapp. Plan bleibt.`, options: [] };
}

/** Gespeicherte Anpassung auf ein anderes Maximum umrechnen (Wdh. proportional). */
export function scaleTune(tune, max) {
  if (!tune || !tune.max || !max || tune.max === max) return tune;
  return { ...tune, max, phases: tune.phases.map(p => ({ ...p, reps: Math.max(1, Math.round(p.reps * max / tune.max)) })) };
}

// ---------- Erholung nach Fitnesstest / EDT (je Muskelgruppe) ----------
/** Muskeln je Gruppe. Erholung gilt, wenn sich die Muskeln zweier Übungen überschneiden. */
export const MUSCLE_GROUPS = {
  push: { name: 'Brust/Trizeps/Schulter', muscles: ['Brust', 'Trizeps', 'Schulter'] },
  legs: { name: 'Beine', muscles: ['Beine'] },
  pull: { name: 'Rücken/Bizeps', muscles: ['Rücken', 'Bizeps'] },
  own: { name: 'eigene', muscles: [] }, // eigene Übung: überschneidet sich nur mit sich selbst
};
export const EXERCISE_MUSCLES = {
  'Liegestütze': { group: 'push', muscles: ['Brust', 'Trizeps', 'Schulter'] },
  'Dips': { group: 'push', muscles: ['Brust', 'Trizeps', 'Schulter'] },
  'Kniebeugen': { group: 'legs', muscles: ['Beine'] },
  'Klimmzüge': { group: 'pull', muscles: ['Rücken', 'Bizeps'] },
};
/** { group, name, muscles } einer Übung; eigene Übungen über die im Editor gewählte Gruppe. */
export function musclesOf(exercise, muscle) {
  const k = EXERCISE_MUSCLES[exercise];
  if (k) return { group: k.group, name: MUSCLE_GROUPS[k.group].name, muscles: k.muscles };
  const g = MUSCLE_GROUPS[muscle] && muscle !== 'own' ? muscle : 'own';
  return { group: g, name: g === 'own' ? String(exercise || 'eigene Übung') : MUSCLE_GROUPS[g].name,
    muscles: g === 'own' ? ['eigen:' + String(exercise || '').toLowerCase()] : MUSCLE_GROUPS[g].muscles };
}
export const overlaps = (a, b) => a.muscles.some(m => b.muscles.includes(m));
/** Standard-Erholung in Minuten (in den Einstellungen änderbar). */
export const RECOVERY_DEFAULTS = { afterTest: 10, betweenEdt: 10, betweenTests: 10 };
const recMin = (rec, evType, kind) => {
  const r = { ...RECOVERY_DEFAULTS, ...(rec || {}) };
  if (kind === 'test') return evType === 'test' ? r.betweenTests : r.betweenEdt;
  return evType === 'test' ? r.afterTest : r.betweenEdt;
};
/**
 * Restliche Erholung für eine geplante Einheit.
 * events: [{ type: 'test'|'edt', exercise, muscle?, at (ms, Ende der Belastung) }]
 * target: { exercise, muscle?, kind: 'edt'|'test' }
 * → { leftMs, needMs, until, cause } (leftMs 0 = erholt; cause = Ereignis mit dem spätesten Ende)
 */
export function recoveryLeft(events, target, rec, now) {
  const tm = musclesOf(target.exercise, target.muscle);
  let best = { leftMs: 0, needMs: 0, until: 0, cause: null, group: tm.name };
  for (const ev of events || []) {
    if (!ev || !Number.isFinite(ev.at) || !overlaps(tm, musclesOf(ev.exercise, ev.muscle))) continue;
    const needMs = Math.max(0, recMin(rec, ev.type, target.kind || 'edt')) * 60000, until = ev.at + needMs;
    if (until > now && until > best.until) best = { leftMs: until - now, needMs, until, cause: ev, group: tm.name };
  }
  return best;
}
/** Reduktion bei verkürzter Erholung: linear von 0 % (erholt) bis maxCut (0 min Erholung). */
export function shortRestFactor(leftMs, needMs, maxCut = 0.2) {
  if (!(needMs > 0) || !(leftMs > 0)) return 1;
  return 1 - maxCut * Math.min(1, leftMs / needMs);
}
export const reducePhases = (phases, f) => phases.map(p => ({ ...p, reps: Math.max(1, Math.round(p.reps * f)) }));

// Vorlagen: Phasen = Plan aus einem typischen Mittel-Maximum (werden nach dem Fitnesstest neu berechnet).
const tpl = (id, name, exercise, limitMin, max, auto, adapt) =>
  ({ id, template: true, name, exercise, limitMin, phases: planFromMax(exercise, max, { ...auto, limitMin }).phases, adapt, auto: { enabled: true, ...auto } });
export const TEMPLATES = [
  tpl('tpl-liegestuetz-5', 'Liegestütz-EDT 5 min', 'Liegestütze', 5, 25, { pct: 40, variant: 'reps' }, { enabled: false }),
  tpl('tpl-liegestuetz-5b', 'Liegestütze 5 min – Pausen steigen', 'Liegestütze', 5, 25, { pct: 40, variant: 'rest' }, { enabled: true, mode: 'reps', reps: 2, minReps: 4 }),
  tpl('tpl-kniebeugen-10', 'Kniebeugen-EDT 10 min', 'Kniebeugen', 10, 35, { pct: 40, variant: 'reps' }, { enabled: true, mode: 'rest', rest: 5 }),
  tpl('tpl-dips-6', 'Dips-EDT 6 min', 'Dips', 6, 12, { pct: 40, variant: 'reps' }, { enabled: true, mode: 'reps', reps: 1, minReps: 2 }),
  tpl('tpl-klimmzug-8', 'Klimmzug-EDT 8 min', 'Klimmzüge', 8, 8, { pct: 40, variant: 'reps' }, { enabled: true, mode: 'both', reps: 1, rest: 10, minReps: 1 }),
].map(normalizeWorkout);

