import * as E from './engine.js';
import * as A from './audio.js';
import { store, migrated } from './store.js';

const VERSION = '__VERSION__';
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const de = (n, d = 1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });
const now = () => Date.now();
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const st = {
  view: 'home', workouts: store.workouts(), history: store.history(), settings: store.settings(),
  session: null, lead: null, draft: null, result: null, resultFrom: 'home', histFilter: null,
  adj: 0, layoutKey: '', sheet: null, partialVal: 0, installEvt: null, maxes: store.maxes(), assess: null,
  tunes: store.tunes(), plan: null, tuneSel: 0,
};
window.__rz = st;

function applySettings() { Object.assign(A.cfg, { sound: st.settings.sound, voice: st.settings.voice, vibrate: st.settings.vibrate, wake: st.settings.wake }); }
applySettings();

const bestOf = id => st.history.filter(h => h.workoutId === id && !h.aborted).reduce((b, h) => (!b || h.total > b.total ? h : b), null);
const workoutById = id => st.workouts.find(w => w.id === id);
const maxOf = ex => { const l = st.maxes[ex]; return l && l.length ? l[l.length - 1] : null; };
// Tempo-Schätzung: gemessen aus den letzten Einheiten, sonst Standardwert der Übung
const testPace = mx => mx && mx.source === 'test' && mx.durMs > 0 && mx.v > 0 ? Math.round(Math.min(8, Math.max(0.8, mx.durMs / 1000 / mx.v)) * 10) / 10 : null;
const tempoOf = ex => {
  const m = E.measuredSecPerRep(st.history, ex); if (m) return { spr: m, measured: true, src: 'gemessen, letzte Einheiten' };
  const t = testPace(maxOf(ex)); if (t) return { spr: t, measured: true, src: 'aus Fitnesstest' };
  return { spr: E.secPerRepFor(ex), measured: false, src: 'Schätzung' };
};
// Für die nächste Einheit gespeicherte Phasen-Anpassung (pro Übung), Wdh. auf aktuelles Maximum umgerechnet
const tuneOf = ex => { const t = st.tunes[ex]; if (!t) return null; const m = maxOf(ex); return t.max && m ? E.scaleTune(t, m.v) : t; };
const phasesOf = w => { const t = tuneOf(w.exercise); return structuredClone(t ? E.normalizeWorkout({ ...w, phases: t.phases }).phases : w.phases); };
const samePhases = (a, b) => JSON.stringify(E.normalizeWorkout({ phases: a }).phases) === JSON.stringify(E.normalizeWorkout({ phases: b }).phases);
const sec = v => `${de(v)} s`;
// ---------- Erholung je Muskelgruppe ----------
const hhmm = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const muscleFor = ex => st.workouts.find(w => w.exercise === ex)?.muscle;
const recCfg = () => ({ afterTest: st.settings.recAfterTest, betweenEdt: st.settings.recEdt, betweenTests: st.settings.recTests });
function recEvents() {
  const ev = [];
  for (const [ex, l] of Object.entries(st.maxes)) for (const m of l || []) if (m.source === 'test') ev.push({ type: 'test', exercise: ex, muscle: muscleFor(ex), at: Date.parse(m.date) });
  for (const h of st.history) if (h.total > 0) ev.push({ type: 'edt', exercise: h.exercise, muscle: h.muscle ?? muscleFor(h.exercise), at: Date.parse(h.date) + (h.elapsedMs || 0) });
  return ev;
}
const recOf = (exercise, kind = 'edt', muscle = muscleFor(exercise)) => E.recoveryLeft(recEvents(), { exercise, muscle, kind }, recCfg(), now());
const left = ms => fmt(ms); // m:ss, aufgerundet
// Live-Countdown: Elemente mit data-until werden jede Sekunde aktualisiert
const cd = (until, pre = '', done = 'erholt') => `<span class="cd" data-until="${until}" data-pre="${esc(pre)}" data-done="${esc(done)}">${pre}${left(until - now())}</span>`;
const recState = (ex, muscle) => { const r = recOf(ex, 'edt', muscle);
  return r.leftMs > 0 ? `<span class="exrec wait">${cd(r.until, 'Erholung noch ')}</span>` : `<span class="exrec ok">erholt</span>`; };
const DAY_TIP = 'EDT über den Tag verteilen: z. B. morgens Liegestütze, mittags Kniebeugen, abends Klimmzüge. So trainiert jede Muskelgruppe erholt.';
const causeText = r => r.cause ? (r.cause.type === 'test' ? `Fitnesstest ${esc(r.cause.exercise)} um ${hhmm(r.cause.at)}` : `EDT ${esc(r.cause.exercise)} bis ${hhmm(r.cause.at)}`) : '';
function watchRecovery(until, group) {
  const cur = st.settings.recWatch;
  st.settings.recWatch = cur && cur.until > until && cur.group === group ? cur : { until, group };
  store.saveSettings(st.settings);
}
function notifyRow() {
  const N = 'Notification' in window ? Notification.permission : 'none';
  return `<label class="toggle"><span>Melden, wenn erholt<small>${N === 'granted' ? 'Benachrichtigung, Ton und Sprache' : N === 'denied' || N === 'none' ? 'Ton und Sprache in der App (Benachrichtigungen nicht verfügbar)' : 'Ton und Sprache in der App'}</small></span><input type="checkbox" class="switch" data-set="recNotify" ${st.settings.recNotify ? 'checked' : ''}></label>
    ${N === 'default' && st.settings.recNotify ? `<button class="btn ghost wide sm" data-act="notify-ask">Benachrichtigung erlauben</button>` : ''}`;
}
async function recNotify(group) {
  const body = `${group} erholt. EDT kann starten.`;
  toast(body);
  if (!st.settings.recNotify) return;
  A.cue.done(); A.say(`${group} erholt`);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) reg.showNotification('EDT Timer', { body, tag: 'edt-rec' }); else new Notification('EDT Timer', { body, tag: 'edt-rec' });
    }
  } catch { /* nur In-App */ }
}
function recTick() {
  const t = now();
  let ended = false;
  document.querySelectorAll('[data-until]').forEach(el => {
    const l = +el.dataset.until - t;
    const v = l > 0 ? el.dataset.pre + left(l) : el.dataset.done;
    if (l <= 0 && !el.classList.contains('over')) { el.classList.add('over'); ended = true; }
    if (el.textContent !== v) el.textContent = v;
  });
  const w = st.settings.recWatch;
  if (w && t >= w.until) { st.settings.recWatch = null; store.saveSettings(st.settings); recNotify(w.group); ended = true; }
  if (ended && ['home', 'plan', 'result', 'assess'].includes(st.view) && !(st.view === 'assess' && st.assess && ['lead', 'run', 'input'].includes(st.assess.step))) {
    if (st.view === 'plan' && st.sheet === 'rec') st.sheet = null;
    render();
  }
}
setInterval(recTick, 1000);
const dLong = iso => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dShort = iso => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on')); setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, 2600);
}

const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--acc)"/><path d="M36 8 18 36h12l-4 20 20-30H34l2-18z" fill="#0b0d10"/></svg>`;

function tabs(active) {
  const t = [['home', 'Workouts', 'M4 10h3v4H4zM17 10h3v4h-3zM7 8h2v8H7zM15 8h2v8h-2zM9 11h6v2H9z'], ['history', 'Verlauf', 'M4 19h16v1.5H4zM6 16l4-5 3 3 5-7 1.2.9-6 8.3-3-3-3.3 4z'], ['more', 'Mehr', 'M5 11h3v3H5zM10.5 11h3v3h-3zM16 11h3v3h-3z']];
  return `<nav class="tabs">${t.map(([v, l, d]) => `<button class="tab ${active === v ? 'on' : ''}" data-go="${v}"><svg viewBox="0 0 24 24"><path d="${d}" fill="currentColor"/></svg><span>${l}</span></button>`).join('')}</nav>`;
}

// ---------- Startseite ----------
function viewHome() {
  const sel = st.settings.exSel || E.EXERCISES[0], own = sel === '__own';
  const list = st.workouts.filter(w => own ? !E.EXERCISES.includes(w.exercise) : w.exercise === sel);
  const m = own ? null : maxOf(sel);
  const tiles = E.EXERCISES.map(ex => { const mx = maxOf(ex);
    return `<button class="extile ${ex === sel ? 'on' : ''}" data-exsel="${ex}"><span class="exname">${ex}</span><span class="exmax ${mx ? '' : 'need'}">${mx ? `Max <b>${mx.v}</b>` : 'Test offen'}</span>${recState(ex)}</button>`; }).join('');
  const cards = list.map(w => {
    const tn = tuneOf(w.exercise), ew = tn ? { ...w, phases: phasesOf(w) } : w;
    const b = bestOf(w.id), plan = E.simulate(ew, tempoOf(w.exercise).spr).total, wm = w.auto.enabled ? maxOf(w.exercise) : null;
    return `<article class="card" data-id="${w.id}">
      <div class="card-head"><span class="tag">${esc(w.exercise)}</span><span class="dur">${w.limitMin} min</span></div>
      <h3>${esc(w.name)}</h3>
      ${E.EXERCISES.includes(w.exercise) ? '' : `<div class="cardrec">${esc(E.musclesOf(w.exercise, w.muscle).name)}: ${recState(w.exercise, w.muscle)}</div>`}
      <div class="phases">${ew.phases.map((p, i) => `<span class="ph"><b>${p.reps}</b> Wdh · ${p.restSec} s · ${p.rounds == null ? 'bis Ende' : '×' + p.rounds}</span>${i < ew.phases.length - 1 ? '<span class="arr">→</span>' : ''}`).join('')}</div>
      <div class="meta">${tn ? `<span class="pill acc">Phasen angepasst ${dShort(tn.date)}</span>` : wm ? `<span class="pill acc">aus Max ${wm.v}</span>` : ''}${w.adapt.enabled ? `<span class="pill">Auto-Anpassung</span>` : ''}${w.countMode === 'tap' ? '<span class="pill">Tap-Zählung</span>' : ''}</div>
      <div class="card-foot">
        <div class="best"><small>Bestwert</small><b>${b ? b.total : '–'}</b></div>
        <div class="best"><small>Plan ≈</small><b class="dim">${plan}</b></div>
        <button class="btn ghost" data-act="edit">Bearbeiten</button>
        <button class="btn primary" data-act="start">Start</button>
      </div></article>`;
  }).join('');
  const maxBox = own ? '' : m
    ? `<div class="maxbar"><div><small>Fitnesstest · Maximum</small><b>${m.v}</b> ${esc(sel)} <span class="muted">· ${dShort(m.date)}${m.source === 'test' ? ' · getestet' : ' · eingegeben'}</span></div><button class="btn ghost sm" data-act="assess" data-aex="${sel}">Fitnesstest wiederholen</button></div>`
    : `<div class="askcard"><b>Fitnesstest ${esc(sel)}</b><p>Maximale saubere Wiederholungen bis zum Muskelversagen. Daraus entstehen Satzgröße, Pausen und 3 Phasen.</p><button class="btn primary wide" data-act="assess" data-aex="${sel}">Fitnesstest starten</button></div>`;
  return `<header class="top"><div class="brand">${LOGO}<span>EDT Timer</span></div><div class="ver">Escalating Density Training</div></header>
  <main class="scroll">
    <div class="extiles">${tiles}</div>
    <button class="chip own ${own ? 'on' : ''}" data-exsel="__own">Eigene Übungen</button>
    ${maxBox}
    ${cards || `<p class="muted">Noch kein Workout für diese Auswahl.</p>`}
    <button class="btn add" data-act="new">+ Neues Workout</button>
  </main>${tabs('home')}`;
}

// ---------- Fitnesstest (Setup beim ersten Start, jederzeit wiederholbar) ----------
// Ablauf: Übung wählen → Anleitung → Countdown 3, 2, 1 → „Start“ + laufende Zeit → Stopp → Wdh. eingeben → speichern → nächste Übung oder fertig
function openAssess(ex, then = 'home', { setup = false } = {}) {
  st.assess = { ex: ex || null, pickFirst: !ex, step: ex ? 'intro' : 'pick', val: 0, source: 'input', durMs: 0, then, setup, t0: 0, leadEnd: 0, last: null, saved: [] };
  if (ex) prepAssess(ex);
  go('assess');
}
function prepAssess(ex) {
  const a = st.assess, m = maxOf(ex);
  Object.assign(a, { ex, step: 'intro', val: m ? m.v : (E.LEVEL_RULES[ex] || E.LEVEL_RULES._).th[0], source: 'input', durMs: 0 });
  if (!st.settings.asked.includes(ex)) { st.settings.asked.push(ex); store.saveSettings(st.settings); }
}
const assessPlan = a => { const w = { exercise: a.ex, limitMin: 5, auto: { pct: 40 } };
  const spr = a.source === 'test' && a.durMs && a.val ? Math.min(8, Math.max(0.8, a.durMs / 1000 / a.val)) : tempoOf(a.ex).spr;
  const p = E.planFromMax(a.ex, Math.max(1, a.val), { limitMin: 5, secPerRep: Math.round(spr * 10) / 10 });
  return { p, tl: E.phaseTimeline(E.normalizeWorkout({ ...w, phases: p.phases }), p.secPerRep) }; };
const planBoxHtml = a => { const { p, tl } = assessPlan(a);
  return `<b>EDT-Plan für 5 min · Stufe ${p.level.name}</b>${tl.map(o => `<div class="pl">${esc(E.phaseLabel(o))}</div>`).join('')}<small>${esc(p.explain)} · Tempo ${sec(p.secPerRep)}/Wdh.</small>`; };
function assessTop(title, back = 'assess-back') {
  return `<header class="top"><button class="icon" data-act="${back}" aria-label="Zurück">‹</button><h2>${title}</h2><span></span></header>`;
}
function viewAssess() {
  const a = st.assess;
  if (a.step === 'lead' || a.step === 'run') {
    const lead = a.step === 'lead';
    return `<div class="train assess st-work"><header class="ttop"><button class="icon" data-act="assess-cancel-test" aria-label="Abbrechen">✕</button><div class="tname">Fitnesstest · ${esc(a.ex)}</div><span></span></header>
      ${lead ? `<div class="leadbox"><div class="lbl">Gleich geht's los</div><div id="a-lead" class="leadnum">3</div><div class="lbl">Saubere Wiederholungen bis zum Muskelversagen</div></div>`
      : `<section class="clock testclock"><div class="badge">Start</div><div id="a-time" class="bigclock">0:00</div><div class="lbl">${esc(a.ex)} · bis zum Muskelversagen</div></section>
         <button class="hit stop" data-act="assess-stop"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg><span>Stopp</span></button>`}</div>`;
  }
  if (a.step === 'pick') {
    return `${a.setup ? `<header class="top"><div class="brand">${LOGO}<span>EDT Timer</span></div><div class="ver">Einrichtung</div></header>` : assessTop('Fitnesstest')}
    <main class="scroll setup">
      <h2 class="q">${a.setup ? 'Fitnesstest: Übung wählen' : 'Übung für den Fitnesstest'}</h2>
      <p class="muted">Der Test misst deine maximalen sauberen Wiederholungen am Stück. Daraus berechnet der Timer Satzgröße, Pausen und 3 Phasen.</p>
      <div class="extiles">${E.EXERCISES.map(ex => { const mx = maxOf(ex), done = a.saved.includes(ex);
        return `<button class="extile ${done ? 'on' : ''}" data-act="assess-pick" data-aex="${ex}"><span class="exname">${ex}</span><span class="exmax ${mx ? '' : 'need'}">${mx ? `Max <b>${mx.v}</b>${done ? ' · neu' : ''}` : 'Test offen'}</span></button>`; }).join('')}</div>
      ${a.setup ? `<button class="btn ghost wide" data-act="setup-skip">Überspringen</button>` : ''}
    </main>`;
  }
  if (a.step === 'intro') {
    const prev = maxOf(a.ex);
    return `${assessTop('Fitnesstest')}
    <main class="scroll">
      <h2 class="q">${esc(a.ex)}</h2>
      <ol class="howto">
        <li><b>So viele saubere Wiederholungen wie möglich bis zum Muskelversagen.</b> Ohne Absetzen, volle Bewegung.</li>
        <li>Countdown 3, 2, 1, dann läuft die Zeit.</li>
        <li>Nach der letzten Wiederholung „Stopp“ tippen und die Zahl eingeben.</li>
      </ol>
      ${prev ? `<p class="muted">Bisher: ${prev.v} am ${dLong(prev.date)}${prev.source === 'test' ? '' : ' (eingegeben)'}</p>` : ''}
      ${(r => r.leftMs > 0 ? `<div class="recbox wait">${esc(r.group)} noch nicht erholt (${causeText(r)}): ${cd(r.until, 'noch ')}. Mit müden Muskeln fällt das Maximum zu niedrig aus.</div>` : '')(recOf(a.ex, 'test'))}
      <button class="btn primary wide big" data-act="assess-test">Test starten</button>
      <button class="btn ghost wide" data-act="assess-direct">Ohne Test: Maximum eingeben</button>
      ${a.then.startsWith('start:') ? `<button class="btn ghost wide" data-act="assess-skip">Ohne Fitnesstest trainieren</button>` : ''}
    </main>`;
  }
  if (a.step === 'input') {
    return `${assessTop('Fitnesstest', 'assess-intro')}
    <main class="scroll">
      <h2 class="q">Wie viele saubere ${esc(a.ex)} hast du geschafft?</h2>
      ${a.source === 'test' ? `<div class="testres"><span>Zeit <b>${E.mmss(Math.floor(a.durMs / 1000) * 1000)}</b></span><span id="a-pace">${a.val ? `≈ ${sec(Math.round(a.durMs / 100 / a.val) / 10)}/Wdh.` : ''}</span></div>` : ''}
      <div class="adj center-adj"><button class="round" data-act="av" data-d="-1" aria-label="minus">−</button>
        <input id="a-num" class="numin" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="999" value="${a.val || ''}" aria-label="Wiederholungen">
        <button class="round" data-act="av" data-d="1" aria-label="plus">+</button></div>
      <div class="quick">${[-5, 5, 10].map(d => `<button class="chip" data-act="av" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`).join('')}</div>
      <div class="planbox" id="a-plan">${planBoxHtml(a)}</div>
      <button class="btn primary wide big" data-act="assess-save">Speichern${a.then.startsWith('start:') ? ' & weiter' : ''}</button>
      ${a.source === 'test' ? `<button class="btn ghost wide" data-act="assess-test">Test wiederholen</button>` : ''}
    </main>`;
  }
  // done
  const m = maxOf(a.ex), rest = E.EXERCISES.filter(x => x !== a.ex);
  return `${a.setup ? `<header class="top"><div class="brand">${LOGO}<span>EDT Timer</span></div><div class="ver">Einrichtung</div></header>` : assessTop('Fitnesstest', 'assess-finish')}
  <main class="scroll">
    <div class="hero pr"><div class="badge big">Gespeichert</div><div class="huge">${m.v}</div><div class="lbl">${esc(a.ex)} · Maximum${m.durMs ? ` in ${E.mmss(Math.floor(m.durMs / 1000) * 1000)}` : ''}</div></div>
    ${m.source === 'test' ? recHint(a.ex) : ''}
    <div class="planbox">${planBoxHtml({ ...a, val: m.v })}</div>
    <h3 class="h3">Nächste Übung testen</h3>
    <div class="chips">${rest.map(x => { const r = recOf(x, 'test');
      return `<button class="chip ${maxOf(x) ? '' : 'need'}" data-act="assess-pick" data-aex="${x}">${x}${maxOf(x) ? ` · ${maxOf(x).v}` : ''}${r.leftMs > 0 ? ` · ${cd(r.until, 'Erholung ', 'erholt')}` : ''}</button>`; }).join('')}</div>
    <button class="btn primary wide big" data-act="assess-finish">Fertig</button>
  </main>`;
}
function recHint(ex) {
  const r = recOf(ex, 'edt'), mins = st.settings.recAfterTest;
  return `<div class="rechint">
    <p class="rh-main">Dein Maximum gilt für erholte Muskeln. Mach mindestens ${mins} min Pause, bevor du das EDT für ${esc(r.group)} startest.</p>
    ${r.leftMs > 0 ? `<div class="recclock"><small>Erholung</small><b>${cd(r.until, '', 'erholt')}</b><small>EDT ${esc(r.group)} ab ${hhmm(r.until)} Uhr</small></div>` : `<div class="recclock ok"><b>erholt</b></div>`}
    ${notifyRow()}
    <p class="tip">${DAY_TIP}</p>
    <p class="tip">Beste Grundlage: Test am Vortag, vor allem vor intensiven Trainingstagen.</p>
  </div>`;
}
function updateAssessInput() {
  const a = st.assess, el = $('#a-plan'); if (el) el.innerHTML = planBoxHtml(a);
  const p = $('#a-pace'); if (p) p.textContent = a.val ? `≈ ${sec(Math.round(a.durMs / 100 / a.val) / 10)}/Wdh.` : '';
}
function saveAssess() {
  const a = st.assess, v = Math.max(1, Math.min(999, Math.round(+a.val || 0)));
  if (!(+a.val >= 1)) { toast('Bitte Anzahl eingeben'); return; }
  st.maxes = store.addMax(a.ex, v, a.source, a.source === 'test' ? a.durMs : 0);
  if (a.source === 'test') { const r = recOf(a.ex, 'edt'); if (r.leftMs > 0) watchRecovery(r.until, r.group); }
  const spr = tempoOf(a.ex).spr;
  let n = 0;
  for (const w of st.workouts) if (w.exercise === a.ex && w.auto.enabled) { E.applyAutoPlan(w, v, spr); n++; }
  store.saveWorkouts(st.workouts);
  st.settings.setupDone = true; store.saveSettings(st.settings);
  A.say(`Maximum ${v} gespeichert`);
  const tn = st.tunes[a.ex];
  toast(`Maximum ${v} ${a.ex} gespeichert${n ? ` · ${n} Plan${n > 1 ? 'e' : ''} neu berechnet` : ''}${tn && tn.max && tn.max !== v ? ' · Anpassung umgerechnet' : ''}`);
  a.saved.push(a.ex);
  const then = a.then;
  if (then.startsWith('start:')) { st.assess = null; return openPlan(workoutById(then.slice(6))); }
  if (then === 'edit' && st.draft) { st.assess = null; if (st.draft.exercise === a.ex) E.applyAutoPlan(st.draft, v, spr); return go('edit'); }
  a.step = 'done'; go('assess');
}
function finishAssess() {
  const t = st.assess?.then || 'home'; st.assess = null; A.keepAwake(false);
  go(['history', 'more', 'edit'].includes(t) ? t : 'home');
}

// ---------- Editor ----------
function reauto() { const m = maxOf(st.draft.exercise); if (st.draft.auto.enabled && m) E.applyAutoPlan(st.draft, m.v, tempoOf(st.draft.exercise).spr); }
function manualPhases() { if (st.draft.auto.enabled) { st.draft.auto.enabled = false; toast('Auto-Plan aus – Phasen manuell angepasst'); } }
const LIM = { limitMin: [1, 60, 1], reps: [1, 999, 1], restSec: [0, 600, 5], rounds: [1, 99, 1], 'adapt.reps': [1, 20, 1], 'adapt.rest': [1, 60, 5], 'adapt.minReps': [1, 50, 1], 'auto.pct': [20, 80, 5] };
function stepper(path, val, unit, limKey) {
  return `<div class="stepper"><button data-step="${path}" data-lim="${limKey}" data-d="-1" aria-label="weniger">−</button><output>${val}<small>${unit}</small></output><button data-step="${path}" data-lim="${limKey}" data-d="1" aria-label="mehr">+</button></div>`;
}
function viewEdit() {
  const w = st.draft, custom = !E.EXERCISES.includes(w.exercise);
  const tempo = tempoOf(w.exercise), plan = E.simulate(w, tempo.spr), tl = E.phaseTimeline(w, tempo.spr), tn = tuneOf(w.exercise);
  const seg = (name, val, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-seg="${name}" data-v="${v}" class="${val === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<header class="top"><button class="icon" data-go="home" aria-label="Zurück">‹</button><h2>${st.workouts.some(x => x.id === w.id) ? 'Workout bearbeiten' : 'Neues Workout'}</h2><button class="btn primary sm" data-act="save">Speichern</button></header>
  <main class="scroll form">
    <label class="field"><span>Name</span><input id="f-name" value="${esc(w.name)}" maxlength="60" autocomplete="off"></label>
    <div class="field"><span>Übung</span><div class="chips">${E.EXERCISES.map(x => `<button data-ex="${x}" class="chip ${w.exercise === x ? 'on' : ''}">${x}</button>`).join('')}<button data-ex="__custom" class="chip ${custom ? 'on' : ''}">Eigene …</button></div>
      ${custom ? `<input id="f-ex" value="${esc(w.exercise)}" placeholder="z. B. Ausfallschritte" maxlength="40">` : ''}</div>
    ${custom ? `<div class="field"><span>Muskelgruppe <small class="muted">für die Erholung</small></span>${seg('muscle', w.muscle, [['push', 'Brust/Trizeps/Schulter'], ['legs', 'Beine'], ['pull', 'Rücken/Bizeps'], ['own', 'eigene']])}</div>` : ''}
    ${autoPanel(w)}
    <div class="field"><span>Zeitlimit</span><div class="row2">${stepper('limitMin', w.limitMin, ' min', 'limitMin')}<input type="range" id="f-lim" min="1" max="60" value="${w.limitMin}"></div></div>
    <div class="field"><span>Phasen</span>
      ${tn ? `<div class="tunenote">Nächste Einheit ${esc(w.exercise)} nutzt die angepassten Phasen vom ${dShort(tn.date)}. <button class="link" data-act="tune-drop" data-tex="${esc(w.exercise)}">Anpassung verwerfen</button></div>` : ''}
      ${w.phases.map((p, i) => `<div class="phase"><div class="phase-h"><b>Phase ${i + 1} <span class="ptime">${tlRange(tl[i])}</span></b>${w.phases.length > 1 ? `<button class="link danger" data-act="delphase" data-i="${i}">Entfernen</button>` : ''}</div>
        <div class="prow"><span>Wdh. pro Satz</span>${stepper(`phases.${i}.reps`, p.reps, '', 'reps')}</div>
        <div class="prow"><span>Pause</span>${stepper(`phases.${i}.restSec`, p.restSec, ' s', 'restSec')}</div>
        <div class="prow"><span>Sätze</span>${i === w.phases.length - 1 ? '<div class="untilend">bis Zeitende</div>' : stepper(`phases.${i}.rounds`, p.rounds, '×', 'rounds')}</div></div>`).join('')}
      ${w.phases.length < E.MAX_PHASES ? `<button class="btn ghost wide" data-act="addphase">+ Phase hinzufügen</button>` : ''}</div>
    <div class="field"><span>Zählweise</span>${seg('countMode', w.countMode, [['set', 'Satz bestätigen'], ['tap', 'Jede Wdh. tippen']])}</div>
    <div class="field"><label class="toggle"><span>Auto-Anpassung<small>Wenn ein Satz nicht geschafft wird</small></span><input type="checkbox" class="switch" id="f-adapt" ${w.adapt.enabled ? 'checked' : ''}></label>
      ${w.adapt.enabled ? `${seg('adapt.mode', w.adapt.mode, [['reps', 'Wdh. senken'], ['rest', 'Pause länger'], ['both', 'Beides']])}
        ${w.adapt.mode !== 'rest' ? `<div class="prow"><span>Wdh. senken um</span>${stepper('adapt.reps', w.adapt.reps, '', 'adapt.reps')}</div><div class="prow"><span>Mindestens</span>${stepper('adapt.minReps', w.adapt.minReps, ' Wdh', 'adapt.minReps')}</div>` : ''}
        ${w.adapt.mode !== 'reps' ? `<div class="prow"><span>Pause länger um</span>${stepper('adapt.rest', w.adapt.rest, ' s', 'adapt.rest')}</div>` : ''}` : ''}</div>
    <div class="planbox">Planwert bei ${sec(tempo.spr)} pro Wdh. (${tempo.measured ? 'gemessen' : 'Schätzung'}) ohne Ausfälle: <b>${plan.total} Wdh.</b> in ${plan.sets} Sätzen</div>
    <div class="row-actions">${st.workouts.some(x => x.id === w.id) ? `<button class="btn ghost" data-act="dup">Duplizieren</button><button class="btn ghost danger" data-act="delw">Löschen</button>` : ''}</div>
  </main>`;
}
function setPath(obj, path, v) { const k = path.split('.'); let o = obj; while (k.length > 1) o = o[k.shift()]; o[k[0]] = v; }
function getPath(obj, path) { return path.split('.').reduce((o, k) => o[k], obj); }

function autoPanel(w) {
  const m = maxOf(w.exercise), seg = (name, val, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-seg="${name}" data-v="${v}" class="${val === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const p = m ? E.planFromMax(w.exercise, m.v, { ...w.auto, limitMin: w.limitMin, secPerRep: tempoOf(w.exercise).spr }) : null;
  return `<div class="field"><span>Plan aus Fitnesstest</span><div class="panel autoplan">
    <label class="toggle"><span>Automatisch berechnen<small>${w.auto.enabled ? 'Phasen folgen deinem Maximum' : 'Aus, Phasen manuell'}</small></span><input type="checkbox" class="switch" id="f-auto" ${w.auto.enabled ? 'checked' : ''}></label>
    <div class="maxline">${m ? `Maximum: <b>${m.v}</b> ${esc(w.exercise)} <span class="muted">(${dShort(m.date)})</span>` : `Noch kein Fitnesstest für ${esc(w.exercise || 'diese Übung')}.`}<button class="btn ghost sm" data-act="assess" data-aex="${esc(w.exercise)}" data-then="edit">${m ? 'Test wiederholen' : 'Fitnesstest'}</button></div>
    <div class="prow"><span>Satzgröße</span>${stepper('auto.pct', w.auto.pct, ' % v. Max', 'auto.pct')}</div>
    <div class="prow col"><span>Phasen</span>${seg('auto.phases', String(w.auto.phases), [['3', '3 Phasen'], ['2', '2 Phasen']])}</div>
    <div class="prow col"><span>Letzte Phase</span>${seg('auto.variant', w.auto.variant, [['reps', 'Weniger Wdh. (80 %)'], ['rest', 'Pause länger']])}</div>
    ${p ? `<div class="formula">${esc(p.explain)}</div>` : ''}
    ${p && !w.auto.enabled ? `<button class="btn ghost wide" data-act="applyauto">Plan aus Fitnesstest übernehmen</button>` : ''}
  </div></div>`;
}

// ---------- Plan-Vorschau mit Phasen-Editor ----------
const tlRange = o => o.reached ? `${E.mmss(o.start)}–${E.mmss(o.end)}` : 'nicht erreicht';
const tlRounds = o => !o.reached ? '' : o.firstRound === o.lastRound ? `Satz ${o.firstRound}` : `Sätze ${o.firstRound}–${o.lastRound}`;
function timelineBar(tl, limitMs, cur = -1) {
  return `<div class="tlbar">${tl.filter(o => o.reached).map(o => `<div class="tlseg p${o.idx % 4} ${o.idx === cur ? 'cur' : ''}" style="flex:${Math.max(1, o.end - o.start)}"><b>P${o.idx + 1}</b><small>${E.mmss(o.start)}</small></div>`).join('')}</div>
    <div class="tlends"><span>0:00</span><span>${E.mmss(limitMs)}</span></div>`;
}
function openPlan(w) {
  if (!w) return go('home');
  const phases = phasesOf(w);
  st.plan = { workoutId: w.id, phases, base: structuredClone(phases) }; st.sheet = null;
  go('plan');
}
const planWorkout = () => { const w = workoutById(st.plan.workoutId); return { ...w, phases: st.plan.phases }; };
function viewPlan() {
  const w = planWorkout(), P = st.plan.phases, tempo = tempoOf(w.exercise), tn = tuneOf(w.exercise);
  const tl = E.phaseTimeline(w, tempo.spr), starts = E.phaseStartRounds(P), sim = E.simulate(w, tempo.spr);
  const last = P.length - 1;
  const st2 = (f, i, val, unit) => `<div class="stepper"><button data-pst="${f}" data-i="${i}" data-d="-1" aria-label="weniger">−</button><output>${val}<small>${unit}</small></output><button data-pst="${f}" data-i="${i}" data-d="1" aria-label="mehr">+</button></div>`;
  const cards = P.map((p, i) => { const o = tl[i];
    return `<div class="phase pcard p${i % 4} ${o.reached ? '' : 'off'}" data-phase="${i}">
      <div class="phase-h"><b>Phase ${i + 1}</b>${P.length > 1 ? `<button class="link danger" data-act="plan-del" data-i="${i}">Entfernen</button>` : ''}</div>
      <div class="prange"><span class="ptime big">${tlRange(o)}</span><span class="muted">${tlRounds(o)}</span></div>
      <div class="plabel">${esc(E.phaseLabel(o))}</div>
      ${i > 0 ? `<div class="prow"><span>Start ab Satz</span>${st2('start', i, starts[i], '')}</div>` : ''}
      <div class="prow"><span>Wdh. pro Satz</span>${st2('reps', i, p.reps, '')}</div>
      <div class="prow"><span>Pause</span>${st2('restSec', i, p.restSec, ' s')}</div>
      ${i === last ? '<div class="prow"><span>Dauer</span><div class="untilend">bis Zeitende</div></div>' : ''}
    </div>`; }).join('');
  const dirty = !samePhases(P, st.plan.base);
  return `<header class="top"><button class="icon" data-go="home" aria-label="Zurück">‹</button><h2>Plan</h2><span class="ver">${w.limitMin} min</span></header>
  <main class="scroll form">
    <div class="planhead"><b>${esc(w.name)}</b><span class="muted">${esc(w.exercise)} · Tempo ${sec(tempo.spr)}/Wdh. (${tempo.src}) + Pause</span></div>
    ${planOrigin(w)}
    ${planRec(w)}
    ${timelineBar(tl, w.limitMin * 60000)}
    ${tn && !dirty ? `<div class="tunenote">Angepasst am ${dShort(tn.date)}${tn.text ? `: ${esc(tn.text)}` : ''}. <button class="link" data-act="tune-drop" data-tex="${esc(w.exercise)}">Workout-Plan verwenden</button></div>` : ''}
    ${dirty ? `<div class="tunenote">Geändert. Wird beim Start für die nächsten Einheiten ${esc(w.exercise)} gespeichert. <button class="link" data-act="plan-reset">Zurücksetzen</button></div>` : ''}
    <div class="field"><span>Phasen</span>${cards}
      ${P.length < E.MAX_PHASES ? `<button class="btn ghost wide" data-act="plan-add">+ Phase hinzufügen</button>` : `<p class="muted">Maximal ${E.MAX_PHASES} Phasen.</p>`}</div>
    <div class="planbox">Planwert: <b>${sim.total} Wdh.</b> in ${sim.sets} Sätzen, ohne Ausfälle</div>
  </main>
  <div class="dock"><button class="btn primary wide big" data-act="plan-start">Training starten</button></div>${recSheet(w)}`;
}
function planRec(w) {
  const r = recOf(w.exercise, 'edt', w.muscle);
  if (r.leftMs <= 0) return `<div class="recbox ok"><b>${esc(r.group)}</b> erholt</div>`;
  return `<div class="recbox wait ${st.plan.waiting ? 'big' : ''}"><div><b>${esc(r.group)}</b>: Erholung noch ${cd(r.until, '', '0:00')}</div><small>nach ${causeText(r)} · Start ab ${hhmm(r.until)} Uhr</small></div>`;
}
const cutOf = r => { const f = E.shortRestFactor(r.leftMs, r.needMs); return { f, pct: Math.round((1 - f) * 100) }; };
function recSheet(w) {
  if (st.sheet !== 'rec') return '';
  const r = recOf(w.exercise, 'edt', w.muscle); if (r.leftMs <= 0) return '';
  const { f, pct } = cutOf(r), red = E.reducePhases(w.phases, f);
  return `<div class="sheet-bg"><div class="sheet recsheet"><h3>Noch nicht erholt</h3>
    <p>${esc(r.group)}: ${causeText(r)}. Mit erschöpften Muskeln passen die Satzgrößen aus dem Fitnesstest nicht.</p>
    <div class="recclock"><small>Erholung</small><b>${cd(r.until, '', '0:00')}</b><small>Start ab ${hhmm(r.until)} Uhr</small></div>
    <button class="btn primary wide big" data-act="rec-wait">Warten</button>
    <button class="btn ghost wide" data-act="rec-force">Trotzdem starten</button>
    <p class="cutnote">Trotzdem starten: Satzgrößen −${pct} % nur für diese Einheit (${w.phases.map((p, i) => `${p.reps} → ${red[i].reps}`).join(', ')} Wdh.). Zählt nicht für die Phasen-Anpassung.</p>
    <p class="tip"><b>Oder später am Tag trainieren.</b> ${DAY_TIP}</p>
  </div></div>`;
}
function planOrigin(w) {
  const m = maxOf(w.exercise);
  if (!m) return `<div class="origin">Noch kein Fitnesstest für ${esc(w.exercise)}, Werte aus der Vorlage. <button class="link" data-act="assess" data-aex="${esc(w.exercise)}" data-then="start:${w.id}">Fitnesstest</button></div>`;
  const src = m.source === 'test' ? 'Aus Fitnesstest' : 'Aus Eingabe';
  const L = E.levelFor(w.exercise, m.v);
  return `<div class="origin">${w.auto.enabled ? src : 'Manuell festgelegt, Bezug'}: max <b>${m.v}</b> ${esc(w.exercise)} am ${dLong(m.date)} · Stufe ${L.name}${w.auto.enabled ? ` · ${w.auto.pct} % pro Satz` : ''}</div>`;
}
function planStep(f, i, d) {
  const P = st.plan.phases, last = P.length - 1;
  if (f === 'reps') P[i].reps = Math.min(999, Math.max(1, P[i].reps + d));
  if (f === 'restSec') P[i].restSec = Math.min(600, Math.max(0, P[i].restSec + 5 * d));
  if (f === 'start' && i > 0) {
    const prev = P[i - 1];
    if (prev.rounds + d < 1 || prev.rounds + d > 99) return;
    if (i < last && P[i].rounds - d < 1) return; // folgende Phasen behalten ihren Start
    prev.rounds += d; if (i < last) P[i].rounds -= d;
  }
}
function planAdd() {
  const P = st.plan.phases; if (P.length >= E.MAX_PHASES) return;
  const tl = E.phaseTimeline(planWorkout(), tempoOf(workoutById(st.plan.workoutId).exercise).spr), o = tl.at(-1), last = P.at(-1);
  last.rounds = o.reached ? Math.max(1, Math.ceil((o.lastRound - o.firstRound + 1) / 2)) : 3;
  P.push({ reps: last.reps, restSec: last.restSec + 5, rounds: null });
}
function planDel(i) {
  const P = st.plan.phases; if (P.length < 2) return;
  if (i > 0 && i < P.length - 1) P[i - 1].rounds += P[i].rounds; // nachfolgende Phase behält ihren Start
  P.splice(i, 1); P.at(-1).rounds = null;
}
function planStart(force = false) {
  const w = planWorkout(), ex = w.exercise, r = recOf(ex, 'edt', w.muscle);
  if (r.leftMs > 0 && !force) { st.sheet = 'rec'; return render(); }
  if (!samePhases(st.plan.phases, st.plan.base)) {
    const m = maxOf(ex);
    st.tunes = store.setTune(ex, { phases: E.normalizeWorkout(w).phases, max: m ? m.v : null, date: new Date(now()).toISOString(), source: 'manuell', text: 'Phasen im Plan geändert' });
  }
  let run = w, shortRec = null;
  if (force && r.leftMs > 0) { // temporär reduziert, nicht in Max/Anpassung gespeichert
    const { f, pct } = cutOf(r);
    run = { ...w, phases: E.reducePhases(w.phases, f) };
    shortRec = { pct, f: Math.round(f * 1000) / 1000, leftMs: r.leftMs, needMs: r.needMs, group: r.group };
  }
  st.plan = null; st.sheet = null; startWorkout(run, shortRec);
}

// ---------- Training ----------
function startWorkout(w, shortRec = null) {
  A.unlock(); A.keepAwake(true);
  st.session = null; st.sheet = null;
  st.lead = { workout: w, shortRec, endsAt: now() + st.settings.leadIn * 1000, last: null };
  go('train');
}
function beginSession() {
  const { state, events } = E.createSession(st.lead.workout, now());
  state.spr = tempoOf(state.exercise).spr;
  state.muscle = st.lead.workout.muscle; state.shortRec = st.lead.shortRec || null;
  st.lead = null; st.session = state; st.adj = state.target;
  handle(events); store.saveActive(state);
}
function phaseMarks(s) {
  const tl = E.phaseTimeline(s, s.spr || E.secPerRepFor(s.exercise), now());
  return tl.slice(1).filter(o => o.reached).map(o => `<span class="mk" style="left:${(100 * o.start / s.limitMs).toFixed(2)}%"></span>`).join('');
}
function phaseStrip(s) {
  if (s.phases.length < 2) return '';
  const tl = E.phaseTimeline(s, s.spr || E.secPerRepFor(s.exercise), now());
  return `<div class="pstrip">${tl.map(o => `<span class="${o.idx === s.phaseIdx ? 'on' : ''} ${o.reached ? '' : 'off'}">P${o.idx + 1} ${o.reached ? `${E.mmss(o.start)}–${E.mmss(o.end)}` : '–'}</span>`).join('')}</div>`;
}
function posText(s) {
  const p = s.phases[s.phaseIdx];
  return `Phase ${s.phaseIdx + 1}/${s.phases.length} · Satz ${s.round}${p.rounds ? '/' + p.rounds : ''} · gesamt ${s.setNo}`;
}
function viewTrain() {
  const s = st.session;
  if (st.lead) return `<div class="train lead"><header class="ttop"><button class="icon" data-act="cancel-lead" aria-label="Abbrechen">✕</button><div class="tname">${esc(st.lead.workout.name)}</div><span></span></header>
    <div class="leadbox"><div class="lbl">Gleich geht's los</div><div id="t-lead" class="leadnum">${st.settings.leadIn}</div><div class="lbl">${esc(st.lead.workout.exercise)} · ${st.lead.workout.limitMin} min · Ziel ${st.lead.workout.phases[0].reps} Wdh.</div>${st.lead.shortRec ? `<div class="srbadge">Verkürzte Erholung · Sätze −${st.lead.shortRec.pct} %</div>` : ''}</div></div>`;
  const tap = s.countMode === 'tap', next = s.phases[s.phaseIdx];
  const top = `<header class="ttop"><button class="icon" data-act="quit" aria-label="Beenden">✕</button><div class="tname">${esc(s.workoutName)}</div><button class="icon" data-act="mute" aria-label="Ton">${st.settings.sound ? '🔊' : '🔇'}</button></header>
    <section class="clock"><div id="t-clock" class="bigclock">${fmt(s.endsAt - now())}</div><div class="bar"><i id="t-bar"></i>${phaseMarks(s)}</div>${phaseStrip(s)}</section>
    <section class="stats"><div class="stat main"><div id="t-total" class="num">${E.total(s)}</div><div class="lbl">Wdh. gesamt</div></div>
      <div class="stat"><div id="t-proj" class="num sm">–</div><div class="lbl">Hochrechnung</div></div>
      <div class="stat"><div id="t-vs" class="num sm">–</div><div class="lbl">vs. Bestwert</div></div></section>
    <div class="pos">${s.status === 'rest' ? 'Nächster: ' : ''}${posText(s)}${s.shortRec ? ` · <span class="srtag">verkürzte Erholung −${s.shortRec.pct} %</span>` : ''}</div>`;
  let body = '';
  if (s.status === 'work' || s.status === 'partial') {
    body = tap
      ? `<section class="work"><div class="lbl">Satz ${s.setNo} · Ziel ${s.target} Wdh.</div><div class="reps"><span id="t-tap">${s.tapCount}</span><small>/${s.target}</small></div>
          <button class="btn ghost" data-act="tap-done">Satz beenden (Teilsatz)</button></section>
         <button class="hit tap" data-act="tap"><span>TIPPEN</span><small>jedes Tippen = 1 Wiederholung</small></button>`
      : `<section class="work"><div class="lbl">Ziel <b>${s.target}</b> Wdh. · tatsächlich geschafft:</div>
          <div class="adj"><button class="round" data-act="minus" aria-label="minus">−</button><div id="t-reps" class="reps ${st.adj < s.target ? 'less' : ''}">${st.adj}</div><button class="round" data-act="plus" aria-label="plus">+</button></div></section>
         <button class="hit" data-act="done"><svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg><span>Satz geschafft</span></button>`;
  } else if (s.status === 'rest') {
    const last = s.sets.at(-1);
    body = `<section class="rest"><div class="ringwrap"><svg class="ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="rbg"/><circle id="t-ring" cx="100" cy="100" r="88" class="rfg" pathLength="1000"/></svg>
        <div class="ring-in"><div id="t-rest" class="restnum">${Math.ceil((s.restEndsAt - now()) / 1000)}</div><div class="lbl">Pause</div></div></div>
        <div class="next">Als Nächstes: <b>${s.target} Wdh.</b>${s.pendingPhase ? `<span class="badge">${phaseBadge(s)}</span>` : ''}</div></section>
      <div class="restbar">${last && !last.partial ? `<div class="rate"><span>Satz ${last.n}</span><div class="seg">${[['ok', 'geschafft'], ['hard', 'knapp'], ['fail', 'nicht geschafft']].map(([v, l]) => `<button data-rate="${v}" class="r-${v} ${E.rateOf(last) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
        <div class="last"><span>Letzter Satz</span><button class="round sm" data-act="last-minus">−</button><b id="t-last">${last ? last.done : 0}</b><button class="round sm" data-act="last-plus">+</button></div>
        <button class="btn ghost wide" data-act="skip">Pause überspringen</button></div>`;
  }
  return `<div class="train st-${s.status}">${top}${body}</div>${sheetHtml()}`;
}
function sheetHtml() {
  const s = st.session;
  if (st.sheet === 'partial') {
    const max = Math.max(s.target, s.tapCount);
    const nums = max <= 24 ? `<div class="numgrid">${Array.from({ length: max + 1 }, (_, i) => `<button data-pv="${i}" class="${st.partialVal === i ? 'on' : ''}">${i}</button>`).join('')}</div>`
      : `<div class="adj"><button class="round" data-act="pv-minus">−</button><div class="reps">${st.partialVal}</div><button class="round" data-act="pv-plus">+</button></div>`;
    return `<div class="sheet-bg"><div class="sheet"><h3>Zeit abgelaufen</h3><p>Wie viele Wiederholungen hast du im letzten Satz geschafft? (Ziel ${s.target})</p>${nums}
      <button class="btn primary wide big" data-act="partial-ok">Speichern · ${st.partialVal} Wdh.</button></div></div>`;
  }
  if (st.sheet === 'quit') return `<div class="sheet-bg"><div class="sheet"><h3>Training beenden?</h3><p>Bisher ${E.total(s)} Wdh. in ${s.sets.length} Sätzen.</p>
      <button class="btn primary wide big" data-act="resume">Weiter trainieren</button><button class="btn ghost wide" data-act="quit-save">Beenden &amp; speichern</button><button class="btn ghost wide danger" data-act="quit-discard">Verwerfen</button></div></div>`;
  return '';
}

function phaseBadge(s) {
  const p = s.phases[s.phaseIdx], q = s.phases[s.phaseIdx - 1], parts = [];
  if (p.reps !== q.reps) parts.push(`${s.target} Wdh.`);
  if (p.restSec !== q.restSec || !parts.length) parts.push(`${E.restSecFor(s)} s Pause`);
  return `Neue Phase ${s.phaseIdx + 1}: ${parts.join(', ')}`;
}
function phaseSpeech(ph) {
  return ph.reps !== ph.prevReps && ph.restSec !== ph.prevRest ? `Neue Phase: ${ph.reps} Wiederholungen, ${ph.restSec} Sekunden Pause`
    : ph.reps !== ph.prevReps ? `Neue Phase: ${ph.reps} Wiederholungen` : `Neue Phase: ${ph.restSec} Sekunden Pause`;
}
function handle(events) {
  if (!events.length) return;
  const s = st.session; let adapted = null;
  for (const e of events) {
    switch (e.type) {
      case 'go': st.adj = e.target; A.cue.go(); A.say(e.phase ? 'Los! ' + phaseSpeech(e.phase) : 'Los'); break;
      case 'set': A.cue.set(); break;
      case 'adapt': adapted = e; break;
      case 'rest': if (e.sec > 0) A.say(`Pause ${e.sec} Sekunden` + (adapted && adapted.repAdj ? `. Nächster Satz ${e.nextTarget}` : '')); break;
      case 'count': A.cue.count(e.sec); A.say(e.sec === 3 ? 'Noch 3' : String(e.sec)); break;
      case 'minute': A.beep(740, 0.2); A.say('Noch eine Minute', { interrupt: false }); break;
      case 'tap': A.cue.tap(); break;
      case 'timeup': A.cue.alert(); A.say('Zeit! Wie viele im letzten Satz?');
        st.partialVal = s.countMode === 'tap' ? s.tapCount : Math.min(st.adj, s.target); st.sheet = 'partial'; break;
      case 'done': A.cue.done(); A.say(`Fertig. ${e.total} Wiederholungen`); finishSession(); return;
    }
  }
  if (st.session) store.saveActive(st.session);
  if (st.view === 'train') { if (events.some(e => !['tap', 'count', 'minute'].includes(e.type))) st.layoutKey = ''; frame(); }
}
function finishSession(discard = false) {
  const s = st.session; st.session = null; st.sheet = null; store.saveActive(null); A.keepAwake(false);
  if (discard || !s) { go('home'); return; }
  const sum = E.summary(s), prevBest = bestOf(s.workoutId);
  const entry = { id: uid('s'), workoutId: s.workoutId, workoutName: s.workoutName, exercise: s.exercise, date: new Date(s.startedAt).toISOString(),
    limitMs: s.limitMs, total: sum.total, sets: s.sets, phases: s.phases, spr: s.spr, elapsedMs: sum.elapsedMs, aborted: sum.aborted, perMin: sum.perMin,
    prevBest: prevBest ? prevBest.total : null, muscle: s.muscle, shortRec: s.shortRec || null };
  st.history.push(entry); store.saveHistory(st.history);
  if (entry.total > 0) { const r = recOf(entry.exercise, 'edt', entry.muscle); if (r.leftMs > 0) watchRecovery(r.until, r.group); }
  st.result = entry; st.resultFrom = 'home'; go('result');
}

function frameAssess() {
  const a = st.assess; if (!a) return; const t = now();
  if (a.step === 'lead') {
    const sec = Math.ceil((a.leadEnd - t) / 1000);
    if (sec <= 0) { a.step = 'run'; a.t0 = t; A.cue.go(); A.say('Start'); return render(); }
    if (sec !== a.last) { a.last = sec; A.cue.count(sec); A.say(String(sec)); }
    const el = $('#a-lead'); if (el && el.textContent !== String(sec)) el.textContent = sec;
  } else if (a.step === 'run') { const el = $('#a-time'); const v = E.mmss(Math.floor((t - a.t0) / 1000) * 1000); if (el && el.textContent !== v) el.textContent = v; }
}
function frame() {
  if (st.view === 'assess') return frameAssess();
  if (st.view !== 'train') return;
  const t = now();
  if (st.lead) {
    const left = st.lead.endsAt - t;
    if (left <= 0) { beginSession(); return; }
    const sec = Math.ceil(left / 1000);
    if (sec !== st.lead.last) { st.lead.last = sec; if (sec <= 3) { A.cue.count(sec); A.say(String(sec)); } }
    const el = $('#t-lead'); if (el) el.textContent = sec;
    return;
  }
  const s = st.session; if (!s) return;
  const ev = E.tick(s, t);
  if (ev.length) { handle(ev); return; }
  const key = `${s.status}|${s.setNo}|${st.sheet}`;
  if (key !== st.layoutKey) { st.layoutKey = key; render(); }
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== String(v)) el.textContent = v; };
  set('t-clock', fmt(s.endsAt - t));
  const bar = $('#t-bar'); if (bar) bar.style.transform = `scaleX(${Math.min(1, (t - s.startedAt) / s.limitMs)})`;
  const tot = E.total(s); set('t-total', tot); set('t-tap', s.tapCount);
  const pr = E.projection(s, t); set('t-proj', pr ?? '–');
  const best = bestOf(s.workoutId);
  if (best) { const d = tot - E.repsAt(best.sets, Math.min(t, s.endsAt) - s.startedAt); set('t-vs', (d > 0 ? '+' : '') + d); const el = $('#t-vs'); if (el) el.className = 'num sm ' + (d >= 0 ? 'pos' : 'neg'); }
  if (s.status === 'rest') {
    set('t-rest', Math.max(0, Math.ceil((s.restEndsAt - t) / 1000)));
    const r = $('#t-ring'); if (r) r.style.strokeDashoffset = String(1000 * (1 - Math.max(0, s.restEndsAt - t) / Math.max(1, s.restMs)));
  }
}
let raf = 0;
function loop() { cancelAnimationFrame(raf); const f = () => { frame(); if (st.view === 'train' || st.view === 'assess') raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
setInterval(frame, 250); // läuft weiter, wenn rAF im Hintergrund pausiert
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') frame(); else if (st.session) store.saveActive(st.session); });

// ---------- Ergebnis ----------
function barChart(sets) {
  if (!sets.length) return '<p class="muted">Keine Sätze.</p>';
  const W = 340, H = 170, pad = 22, maxV = Math.max(...sets.map(x => Math.max(x.done, x.target)), 1);
  const bw = (W - pad) / sets.length, y = v => H - pad - (v / maxV) * (H - pad - 14);
  const bars = sets.map((x, i) => {
    const cls = x.partial ? 'partial' : E.rateOf(x) === 'fail' || x.done < x.target ? 'miss' : E.rateOf(x) === 'hard' ? 'hard' : 'full', bx = pad + i * bw + bw * 0.15, w = bw * 0.7;
    return `<rect class="b ${cls}" x="${bx}" y="${y(x.done)}" width="${w}" height="${H - pad - y(x.done)}" rx="${Math.min(4, w / 3)}"/>
      <line class="tg" x1="${bx - 1}" x2="${bx + w + 1}" y1="${y(x.target)}" y2="${y(x.target)}"/>
      ${sets.length <= 20 ? `<text x="${bx + w / 2}" y="${y(x.done) - 4}" class="v">${x.done}</text>` : ''}
      ${sets.length <= 20 || i % 5 === 4 ? `<text x="${bx + w / 2}" y="${H - 6}" class="ax">${i + 1}</text>` : ''}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wiederholungen pro Satz"><text x="0" y="${y(maxV) + 4}" class="ax l">${maxV}</text><line class="base" x1="${pad}" x2="${W}" y1="${H - pad}" y2="${H - pad}"/>${bars}</svg>
    <div class="legend"><span><i class="full"></i>geschafft</span><span><i class="hard"></i>knapp</span><span><i class="miss"></i>nicht geschafft</span><span><i class="partial"></i>Teilsatz</span><span><i class="tgl"></i>Ziel</span></div>`;
}
function viewResult() {
  const r = st.result, isNew = st.resultFrom === 'home';
  const best = bestOf(r.workoutId);
  const pr = !r.aborted && r.total > 0 && (r.prevBest == null || r.total > r.prevBest);
  const full = r.sets.filter(x => x.done >= x.target).length;
  const d = new Date(r.date);
  return `<header class="top"><button class="icon" data-go="${isNew ? 'home' : 'history'}" aria-label="Zurück">‹</button><h2>Ergebnis</h2><span></span></header>
  <main class="scroll">
    <section class="hero ${pr ? 'pr' : ''}">
      ${pr ? '<div class="badge big">Neuer Bestwert</div>' : ''}
      <div class="huge">${r.total}</div><div class="lbl">Wiederholungen · ${esc(r.exercise)}</div>
      <div class="sub">${esc(r.workoutName)} · ${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${r.aborted ? ' · abgebrochen' : ''}</div>
      ${!pr && best ? `<div class="sub">Bestwert ${best.total}${best.id !== r.id ? ` (${r.total - best.total >= 0 ? '+' : ''}${r.total - best.total})` : ''}</div>` : ''}
    </section>
    <section class="grid3"><div><b>${r.sets.length}</b><small>Sätze (${full} voll)</small></div><div><b>${de(r.perMin)}</b><small>Wdh./Minute</small></div><div><b>${fmt(r.elapsedMs)}</b><small>Dauer</small></div></section>
    ${r.shortRec ? `<div class="recbox wait"><b>Verkürzte Erholung</b>: Satzgrößen −${r.shortRec.pct} %. Zählt nicht für die Phasen-Anpassung und den Fitnesstest-Vergleich.</div>` : ''}
    ${isNew ? nextCard(r) : ''}
    ${isNew && !r.shortRec ? tuneCard(r) : ''}
    ${r.shortRec ? '' : retestCard(r)}
    <h3 class="h3">Wiederholungen pro Satz</h3>
    <div class="panel">${barChart(r.sets)}</div>
    <div class="row-actions">
      ${workoutById(r.workoutId) ? `<button class="btn primary big" data-act="again">Nochmal</button>` : ''}
      ${isNew ? `<button class="btn ghost big" data-go="history">Zum Verlauf</button>` : `<button class="btn ghost danger" data-act="delsession">Eintrag löschen</button>`}
    </div>
  </main>`;
}

function nextCard(r) {
  if (!(r.total > 0)) return '';
  const me = E.musclesOf(r.exercise, r.muscle), rr = recOf(r.exercise, 'edt', r.muscle);
  const free = st.workouts.filter(w => !E.overlaps(me, E.musclesOf(w.exercise, w.muscle)) && recOf(w.exercise, 'edt', w.muscle).leftMs <= 0)
    .sort((a, b) => (maxOf(b.exercise) ? 1 : 0) - (maxOf(a.exercise) ? 1 : 0) || (b.limitMin === 10) - (a.limitMin === 10))[0];
  const tip = !st.settings.dayTipSeen;
  if (tip) { st.settings.dayTipSeen = true; store.saveSettings(st.settings); r._tip = true; }
  return `<div class="panel nextrec"><div class="panel-h"><span>Erholung</span><span>${esc(me.name)}</span></div>
    ${rr.leftMs > 0 ? `<p class="nx">Nächstes EDT für ${esc(me.name)} ab <b>${hhmm(rr.until)} Uhr</b> <span class="muted">(${cd(rr.until, 'noch ', 'erholt')})</span></p>` : `<p class="nx">${esc(me.name)} erholt.</p>`}
    ${free ? `<button class="btn ghost wide freebtn" data-act="rec-other" data-wid="${free.id}">Jetzt frei: ${esc(free.exercise)} · ${esc(free.name)}</button>` : ''}
    ${r._tip ? `<p class="tip">${DAY_TIP}</p>` : ''}</div>`;
}
function tuneCard(r) {
  const sg = E.suggestTune(r);
  if (!sg) return '';
  const head = `<div class="panel-h"><span>Phasen für die nächste Einheit</span><span>${esc(r.exercise)}</span></div>`;
  if (r.tuned) return `<div class="panel tune">${head}<p class="tunedone">Übernommen: ${esc(r.tuned)}</p></div>`;
  if (!sg.options.length) return `<div class="panel tune">${head}<p>${esc(sg.text)}</p></div>`;
  const sel = Math.min(st.tuneSel, sg.options.length - 1), opt = sg.options[sel];
  const w = workoutById(r.workoutId) || { exercise: r.exercise, limitMin: Math.round(r.limitMs / 60000) };
  const spr = tempoOf(r.exercise).spr;
  const tl = E.phaseTimeline({ ...w, phases: opt.phases }, spr);
  return `<div class="panel tune">${head}<p class="why ${sg.kind}">${esc(sg.text)}</p>
    <div class="opts">${sg.options.map((o, i) => `<button class="opt ${i === sel ? 'on' : ''}" data-tsel="${i}"><i></i>${esc(o.text)}</button>`).join('')}</div>
    <div class="tlist">${tl.map(o => `<div>${esc(E.phaseLabel(o))}</div>`).join('')}</div>
    <button class="btn primary wide" data-act="tune-apply">Übernehmen</button></div>`;
}
function applyTune() {
  const r = st.result, sg = E.suggestTune(r); if (!sg || !sg.options.length) return;
  const opt = sg.options[Math.min(st.tuneSel, sg.options.length - 1)], m = maxOf(r.exercise);
  st.tunes = store.setTune(r.exercise, { phases: opt.phases, max: m ? m.v : null, date: new Date(now()).toISOString(), source: 'auto', text: opt.text, from: r.id });
  r.tuned = opt.text; store.saveHistory(st.history);
  toast(`Gespeichert für die nächste Einheit ${r.exercise}`); render();
}
function retestCard(r) {
  const why = E.retestAdvice(r, maxOf(r.exercise), now());
  if (!why) return '';
  const txt = why === 'pr' ? `Bestwert deutlich gestiegen (+${Math.round((r.total / r.prevBest - 1) * 100)} %).` : 'Letzter Fitnesstest ist älter als 4 Wochen.';
  return `<div class="askcard"><b>Neuer Fitnesstest empfohlen</b><p>${txt} Mit aktuellem Maximum stimmen Satzgröße und Phasen.</p><button class="btn primary wide" data-act="assess" data-aex="${esc(r.exercise)}" data-then="home">Fitnesstest wiederholen</button></div>`;
}
function maxPanel(then = 'history') {
  const exs = [...new Set([...E.EXERCISES, ...Object.keys(st.maxes)])];
  return `<div class="panel maxpanel"><div class="panel-h"><span>Fitnesstest · Maximum am Stück</span></div>${exs.map(ex => {
    const l = st.maxes[ex] || [], m = l.at(-1), p = l.at(-2);
    if (!m && !E.EXERCISES.includes(ex)) return '';
    const dlt = m && p ? m.v - p.v : null;
    return `<div class="mrow"><span>${esc(ex)}</span><span class="mv">${m ? `<b>${m.v}</b>${dlt ? `<i class="${dlt > 0 ? 'up' : 'down'}">${dlt > 0 ? '+' : ''}${dlt}</i>` : ''}<small>${dShort(m.date)}${l.length > 1 ? ` · ${l.length} Tests` : ''}</small>` : '<small>noch nicht getestet</small>'}</span><button class="btn ghost sm" data-act="assess" data-aex="${esc(ex)}" data-then="${then}">${m ? 'Wiederholen' : 'Testen'}</button></div>`;
  }).join('')}</div>`;
}

// ---------- Verlauf ----------
function lineChart(list) {
  if (list.length < 2) return `<p class="muted">Ab zwei Einheiten erscheint hier die Fortschrittskurve.</p>`;
  const W = 340, H = 170, pl = 30, pb = 22, vals = list.map(x => x.total);
  const lo = Math.max(0, Math.min(...vals) - 5), hi = Math.max(...vals) + 5;
  const x = i => pl + (i / (list.length - 1)) * (W - pl - 10), y = v => H - pb - ((v - lo) / (hi - lo || 1)) * (H - pb - 10);
  const pts = list.map((h, i) => `${x(i)},${y(h.total)}`).join(' ');
  const bi = vals.indexOf(Math.max(...vals));
  const dt = h => new Date(h.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fortschritt">
    <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".35"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs>
    <text x="0" y="${y(hi - 5) + 4}" class="ax l">${hi - 5}</text><text x="0" y="${y(lo + 5) + 4}" class="ax l">${lo + 5}</text>
    <line class="base" x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}"/>
    <polygon points="${x(0)},${H - pb} ${pts} ${x(list.length - 1)},${H - pb}" fill="url(#lg)"/>
    <polyline points="${pts}" class="ln"/>
    ${list.map((h, i) => `<circle cx="${x(i)}" cy="${y(h.total)}" r="${i === bi ? 6 : 3.5}" class="${i === bi ? 'dot best' : 'dot'}"/>`).join('')}
    <text x="${x(0)}" y="${H - 5}" class="ax">${dt(list[0])}</text><text x="${x(list.length - 1)}" y="${H - 5}" class="ax e">${dt(list.at(-1))}</text></svg>`;
}
function viewHistory() {
  const ids = [...new Set(st.history.map(h => h.workoutId))];
  if (st.histFilter && !ids.includes(st.histFilter)) st.histFilter = null;
  const f = st.histFilter || ids.at(-1) || null;
  const nameOf = id => (workoutById(id) || st.history.find(h => h.workoutId === id)).name || st.history.find(h => h.workoutId === id).workoutName;
  const sel = st.history.filter(h => h.workoutId === f && !h.aborted);
  const best = f ? bestOf(f) : null;
  const items = [...st.history].reverse().map(h => {
    const d = new Date(h.date);
    return `<button class="hitem" data-hist="${h.id}"><div><b>${esc(h.workoutName)}</b><small>${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })} · ${h.sets.length} Sätze · ${de(h.perMin)}/min${h.aborted ? ' · abgebrochen' : ''}</small></div><div class="htot ${best && h.id === best.id ? 'pr' : ''}">${h.total}</div></button>`;
  }).join('');
  return `<header class="top"><h2>Verlauf</h2><span class="ver">${st.history.length} Einheiten</span></header>
  <main class="scroll">
    ${maxPanel()}
    ${st.history.length ? `<div class="chips scrollx">${ids.map(id => `<button class="chip ${id === f ? 'on' : ''}" data-hf="${id}">${esc(nameOf(id))}</button>`).join('')}</div>
    <div class="panel"><div class="panel-h"><span>Fortschritt</span>${best ? `<span>Bestwert <b class="acc">${best.total}</b></span>` : ''}</div>${lineChart(sel)}</div>
    <div class="hlist">${items}</div>` : `<div class="empty"><p>Noch keine Einheiten.</p><button class="btn primary" data-go="home">Workout wählen</button></div>`}
  </main>${tabs('history')}`;
}

// ---------- Mehr ----------
function viewMore() {
  const s = st.settings, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const tg = (k, l, sub) => `<label class="toggle"><span>${l}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" class="switch" data-set="${k}" ${s[k] ? 'checked' : ''}></label>`;
  return `<header class="top"><h2>Mehr</h2><span class="ver">v${VERSION}</span></header>
  <main class="scroll form">
    <h3 class="h3 first">Fitnesstest</h3>
    ${maxPanel('more')}
    <h3 class="h3">Erholung</h3>
    <div class="panel recpanel">${[['recAfterTest', 'Fitnesstest → EDT'], ['recEdt', 'EDT → EDT'], ['recTests', 'Fitnesstest → Fitnesstest']].map(([k, l]) => `<div class="prow"><span>${l}</span><div class="stepper"><button data-rec="${k}" data-d="-1" aria-label="weniger">−</button><output>${s[k]}<small> min</small></output><button data-rec="${k}" data-d="1" aria-label="mehr">+</button></div></div>`).join('')}
      <p class="muted">Gilt je Muskelgruppe. Liegestütze und Dips teilen sich Brust/Trizeps/Schulter; andere Gruppen sind sofort frei.</p>
      ${notifyRow()}
      <p class="tip">${DAY_TIP}</p></div>
    <h3 class="h3">Ton & Anzeige</h3>
    <div class="panel">${tg('sound', 'Ton', 'Pieptöne und Ansagen')}${tg('voice', 'Sprachansagen', '„Los“, „Pause 15 Sekunden“, „Noch 3, 2, 1“')}${tg('vibrate', 'Vibration', navigator.vibrate ? 'Android' : 'auf diesem Gerät nicht verfügbar')}${tg('wake', 'Bildschirm wach halten', A.wakeSupported() ? 'Wake Lock' : 'auf diesem Gerät nicht verfügbar')}
      <div class="prow"><span>Vorlauf vor Start</span><div class="seg">${[3, 5, 10].map(v => `<button data-lead="${v}" class="${s.leadIn === v ? 'on' : ''}">${v} s</button>`).join('')}</div></div>
      <button class="btn ghost wide" data-act="testsound">Ton testen</button></div>
    <h3 class="h3">Daten</h3>
    <div class="panel"><p class="muted">Alles bleibt auf diesem Gerät (localStorage). Kein Konto, kein Server, keine Tracker.</p>
      <button class="btn ghost wide" data-act="export">Export als JSON</button>
      <button class="btn ghost wide" data-act="import">Import aus JSON</button><input type="file" id="f-import" accept="application/json,.json" hidden>
      <button class="btn ghost wide" data-act="templates">Vorlagen wiederherstellen</button>
      <button class="btn ghost wide danger" data-act="wipe">Alle Daten löschen</button></div>
    <h3 class="h3">Installieren</h3>
    <div class="panel"><p class="muted">${standalone ? 'Läuft als installierte App. Funktioniert offline.' : ios ? 'Safari: Teilen-Symbol → „Zum Home-Bildschirm“. Danach offline nutzbar.' : 'Chrome: Menü → „App installieren“ oder Knopf unten.'}</p>
      ${st.installEvt ? '<button class="btn primary wide" data-act="install">App installieren</button>' : ''}</div>
    <p class="muted center">EDT Timer · Escalating Density Training</p>
  </main>${tabs('more')}`;
}

// ---------- Render & Navigation ----------
function render() {
  const v = { home: viewHome, edit: viewEdit, train: viewTrain, result: viewResult, history: viewHistory, more: viewMore, assess: viewAssess, plan: viewPlan }[st.view];
  const keep = st.view !== 'train' && $('.scroll') ? $('.scroll').scrollTop : 0;
  app.innerHTML = v(); app.dataset.view = st.view;
  if (keep && st.view === st._lastView && $('.scroll')) $('.scroll').scrollTop = keep;
  st._lastView = st.view;
}
function go(view) {
  if (view === 'result' && st.view !== 'result') st.tuneSel = 0;
  st.view = view; st.layoutKey = ''; render();
  if (view === 'train' || view === 'assess') { loop(); frame(); } else window.scrollTo(0, 0);
  if (view !== 'train' && $('.scroll')) $('.scroll').scrollTop = 0;
}

function saveDraft() {
  const name = $('#f-name'); if (name) st.draft.name = name.value.trim() || 'Workout';
  const ex = $('#f-ex'); if (ex) st.draft.exercise = ex.value.trim() || 'Übung';
  const w = E.normalizeWorkout(st.draft); w.template = false;
  const i = st.workouts.findIndex(x => x.id === w.id);
  if (i >= 0) st.workouts[i] = w; else st.workouts.push(w);
  store.saveWorkouts(st.workouts); toast('Gespeichert'); go('home');
}

app.addEventListener('click', e => {
  const b = e.target.closest('button,[data-hist]'); if (!b) return;
  const d = b.dataset, s = st.session;
  if (d.go) return go(d.go);
  if (d.step) {
    const [lo, hi, step] = LIM[d.lim]; const cur = getPath(st.draft, d.step);
    setPath(st.draft, d.step, Math.min(hi, Math.max(lo, cur + step * +d.d)));
    if (d.step.startsWith('phases.')) manualPhases(); if (d.step.startsWith('auto.') || d.step === 'limitMin') reauto();
    const n = $('#f-name'); if (n) st.draft.name = n.value; return render();
  }
  if (d.seg) { setPath(st.draft, d.seg, d.seg === 'auto.phases' ? +d.v : d.v); if (d.seg.startsWith('auto.')) reauto(); const n = $('#f-name'); if (n) st.draft.name = n.value; return render(); }
  if (d.ex) { const n = $('#f-name'); if (n) st.draft.name = n.value; st.draft.exercise = d.ex === '__custom' ? (E.EXERCISES.includes(st.draft.exercise) ? '' : st.draft.exercise) : d.ex; reauto(); render(); if (d.ex === '__custom') $('#f-ex')?.focus(); return; }
  if (d.exsel) {
    st.settings.exSel = d.exsel; store.saveSettings(st.settings);
    if (d.exsel !== '__own' && !maxOf(d.exsel) && !st.settings.asked.includes(d.exsel)) return openAssess(d.exsel);
    return render();
  }
  if (d.hist) { st.result = st.history.find(h => h.id === d.hist); st.resultFrom = 'history'; return go('result'); }
  if (d.hf) { st.histFilter = d.hf; return render(); }
  if (d.lead) { st.settings.leadIn = +d.lead; store.saveSettings(st.settings); return render(); }
  if (d.pv != null) { st.partialVal = +d.pv; return render(); }
  if (d.pst) { planStep(d.pst, +d.i, +d.d); return render(); }
  if (d.rate) { E.rateLastSet(s, d.rate); store.saveActive(s); A.cue.tap(); return render(); }
  if (d.tsel != null) { st.tuneSel = +d.tsel; return render(); }
  if (d.rec) { st.settings[d.rec] = Math.max(0, Math.min(60, (st.settings[d.rec] ?? 10) + +d.d)); store.saveSettings(st.settings); return render(); }
  const card = b.closest('.card'), w = card && workoutById(card.dataset.id);
  switch (d.act) {
    case 'start':
      if (E.EXERCISES.includes(w.exercise) && !maxOf(w.exercise) && w.auto.enabled) return openAssess(w.exercise, 'start:' + w.id);
      return openPlan(w);
    case 'plan-start': return planStart();
    case 'rec-wait': st.sheet = null; st.plan.waiting = true; return render();
    case 'rec-force': return planStart(true);
    case 'rec-other': { const w2 = workoutById(d.wid); return w2 ? openPlan(w2) : undefined; }
    case 'notify-ask': try { Notification.requestPermission().then(render, render); } catch { /* nicht unterstützt */ } return;
    case 'plan-add': planAdd(); return render();
    case 'plan-del': planDel(+d.i); return render();
    case 'plan-reset': st.plan.phases = structuredClone(st.plan.base); return render();
    case 'tune-drop': st.tunes = store.setTune(d.tex, null); toast('Anpassung verworfen');
      if (st.plan) { const w0 = workoutById(st.plan.workoutId); st.plan.phases = structuredClone(w0.phases); st.plan.base = structuredClone(w0.phases); } return render();
    case 'tune-apply': return applyTune();
    case 'assess': return openAssess(d.aex, d.then || st.view);
    case 'fitness': return openAssess(null, 'more');
    case 'applyauto': st.draft.auto.enabled = true; reauto(); return render();
    case 'av': st.assess.val = Math.max(1, Math.min(999, (+st.assess.val || 0) + +d.d)); { const el = $('#a-num'); if (el) el.value = st.assess.val; } return updateAssessInput();
    case 'assess-save': return saveAssess();
    case 'assess-pick': prepAssess(d.aex); return go('assess');
    case 'assess-direct': Object.assign(st.assess, { step: 'input', source: 'input', durMs: 0 }); go('assess'); $('#a-num')?.select(); return;
    case 'assess-skip': { const id = st.assess.then.slice(6); st.assess = null; return openPlan(workoutById(id)); }
    case 'assess-back': { const a = st.assess; if (a.step === 'intro' && (a.pickFirst || a.saved.length)) { a.step = 'pick'; return go('assess'); } return finishAssess(); }
    case 'assess-intro': st.assess.step = 'intro'; return go('assess');
    case 'assess-finish': return finishAssess();
    case 'setup-skip': st.settings.setupDone = true; store.saveSettings(st.settings); st.assess = null; return go('home');
    case 'assess-test': A.unlock(); A.keepAwake(true); Object.assign(st.assess, { step: 'lead', leadEnd: now() + 3000, last: null, source: 'test' }); A.cue.count(3); A.say('3'); st.assess.last = 3; go('assess'); return;
    case 'assess-stop': { const a = st.assess; A.keepAwake(false); A.cue.done(); A.say('Stopp. Wie viele?');
      Object.assign(a, { step: 'input', durMs: now() - a.t0, source: 'test', val: maxOf(a.ex)?.v || a.val }); go('assess'); $('#a-num')?.select(); return; }
    case 'assess-cancel-test': A.keepAwake(false); st.assess.step = 'intro'; return go('assess');
    case 'edit': st.draft = structuredClone(w); return go('edit');
    case 'new': { const ex = st.settings.exSel === '__own' ? 'Eigene Übung' : st.settings.exSel || 'Liegestütze';
      st.draft = E.normalizeWorkout({ id: uid('w'), name: `${ex} EDT 5 min`, exercise: ex, limitMin: 5, phases: E.planFromMax(ex, 25).phases, auto: { enabled: E.EXERCISES.includes(ex) } });
      reauto(); return go('edit'); }
    case 'save': return saveDraft();
    case 'addphase': { if (st.draft.phases.length >= E.MAX_PHASES) return; manualPhases(); const last = st.draft.phases.at(-1); st.draft.phases.at(-1).rounds = 5; st.draft.phases.push({ reps: last.reps, restSec: last.restSec + 5, rounds: null }); return render(); }
    case 'delphase': manualPhases(); st.draft.phases.splice(+d.i, 1); st.draft.phases.at(-1).rounds = null; return render();
    case 'dup': { const c = E.normalizeWorkout({ ...structuredClone(st.draft), id: uid('w'), name: st.draft.name + ' (Kopie)' }); st.workouts.push(c); store.saveWorkouts(st.workouts); toast('Kopie angelegt'); return go('home'); }
    case 'delw': if (confirm('Workout löschen? Der Verlauf bleibt erhalten.')) { st.workouts = st.workouts.filter(x => x.id !== st.draft.id); store.saveWorkouts(st.workouts); go('home'); } return;
    // Training
    case 'cancel-lead': st.lead = null; A.keepAwake(false); return go('home');
    case 'minus': st.adj = Math.max(0, st.adj - 1); A.cue.tap(); return frame(), render();
    case 'plus': st.adj = Math.min(999, st.adj + 1); A.cue.tap(); return render();
    case 'done': A.unlock(); return handle(E.completeSet(s, st.adj, now()));
    case 'tap': return handle(E.tapRep(s, now())) , frame();
    case 'tap-done': return handle(E.completeSet(s, s.tapCount, now()));
    case 'skip': return handle(E.skipRest(s, now()));
    case 'last-minus': case 'last-plus': { const l = s.sets.at(-1); if (l) { E.editLastSet(s, l.done + (d.act === 'last-plus' ? 1 : -1)); store.saveActive(s); const el = $('#t-last'); if (el) el.textContent = s.sets.at(-1).done; frame(); } return; }
    case 'mute': st.settings.sound = !st.settings.sound; store.saveSettings(st.settings); applySettings(); if (!st.settings.sound) speechSynthesis?.cancel(); return render();
    case 'quit': st.sheet = 'quit'; return render();
    case 'resume': st.sheet = null; return render();
    case 'quit-save': return handle(E.abort(s, now()));
    case 'quit-discard': return finishSession(true);
    case 'pv-minus': st.partialVal = Math.max(0, st.partialVal - 1); return render();
    case 'pv-plus': st.partialVal++; return render();
    case 'partial-ok': st.sheet = null; return handle(E.finishPartial(s, st.partialVal, now()));
    // Ergebnis
    case 'again': return openPlan(workoutById(st.result.workoutId));
    case 'delsession': if (confirm('Eintrag löschen?')) { st.history = st.history.filter(h => h.id !== st.result.id); store.saveHistory(st.history); go('history'); } return;
    // Mehr
    case 'testsound': A.unlock(); A.cue.go(); A.say('Pause 15 Sekunden'); return;
    case 'export': {
      const blob = new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `edt-timer-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return toast('Export erstellt');
    }
    case 'import': return $('#f-import').click();
    case 'templates': st.workouts = store.restoreTemplates(); return toast('Vorlagen wiederhergestellt');
    case 'wipe': if (confirm('Alle Workouts und den gesamten Verlauf löschen?')) { store.wipe(); st.workouts = store.workouts(); st.history = []; st.maxes = {}; st.tunes = {}; st.settings = store.settings(); applySettings(); toast('Gelöscht'); render(); } return;
    case 'install': st.installEvt?.prompt(); st.installEvt = null; return render();
  }
});
app.addEventListener('input', e => {
  if (e.target.id === 'a-num') { st.assess.val = Math.max(0, Math.min(999, Math.round(+e.target.value || 0))); return updateAssessInput(); }
  if (e.target.id === 'f-lim') { st.draft.limitMin = +e.target.value; reauto(); const n = $('#f-name'); if (n) st.draft.name = n.value; const ex = $('#f-ex'); if (ex) st.draft.exercise = ex.value; render(); $('#f-lim')?.focus(); }
  if (e.target.id === 'f-ex') st.draft.exercise = e.target.value;
  if (e.target.id === 'f-name') st.draft.name = e.target.value;
});
app.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'f-auto') { st.draft.auto.enabled = t.checked; reauto(); return render(); }
  if (t.id === 'f-adapt') { st.draft.adapt.enabled = t.checked; return render(); }
  if (t.dataset.set) { st.settings[t.dataset.set] = t.checked; store.saveSettings(st.settings); applySettings(); if (t.dataset.set === 'recNotify') render(); return; }
  if (t.id === 'f-import' && t.files[0]) {
    try { const r = store.importAll(JSON.parse(await t.files[0].text())); st.workouts = store.workouts(); st.history = store.history(); st.maxes = store.maxes(); st.tunes = store.tunes(); st.settings = store.settings(); applySettings();
      toast(`Importiert: ${r.workouts} Workouts, ${r.sessions} Einheiten`); render(); }
    catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); st.installEvt = e; if (st.view === 'more') render(); });

// v1.2: Vorlagen und Auto-Pläne einmalig auf 3 Phasen umstellen (Anpassungen bleiben, werden skaliert)
if ((st.settings.planVer || 0) < 2) {
  const tpl = Object.fromEntries(E.TEMPLATES.map(t => [t.id, t]));
  st.workouts = st.workouts.map(w => {
    if (w.template && tpl[w.id]) w = E.normalizeWorkout(structuredClone(tpl[w.id]));
    const m = maxOf(w.exercise); if (w.auto.enabled && m) E.applyAutoPlan(w, m.v, tempoOf(w.exercise).spr);
    return w;
  });
  store.saveWorkouts(st.workouts); st.settings.planVer = 2; store.saveSettings(st.settings);
}
if (migrated.length) setTimeout(() => toast('Daten aus RepZeit übernommen'), 400);
const needSetup = () => !st.settings.setupDone && !Object.values(st.maxes).some(l => l && l.length);

// Laufendes Training nach Neuladen fortsetzen
const active = store.active();
if (active && active.status !== 'done' && now() < active.endsAt + 30 * 60000) { st.session = active; st.adj = active.target; if (active.status === 'partial') { st.sheet = 'partial'; st.partialVal = active.target; } go('train'); A.keepAwake(true); }
else { store.saveActive(null); if (needSetup()) openAssess(null, 'home', { setup: true }); else render(); }

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
