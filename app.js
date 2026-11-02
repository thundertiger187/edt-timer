import * as E from './engine.js?v=4a49562c';
import * as A from './audio.js?v=4a49562c';
import { store, migrated } from './store.js?v=4a49562c';
import { figureSvg, animateFigures } from './figures.js?v=4a49562c';
import * as W from './week.js?v=4a49562c';
import * as FX from './fx.js?v=4a49562c';

const VERSION = '1.7.0-4a49562c';
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
  tunes: store.tunes(), plan: null, tuneSel: 0, week: W.normalizePlan(store.plan()), wcopy: null,
  combos: store.combos(), cdraft: null, crec: null, devMode: 'reg',
};
window.__rz = st;

function applySettings() { Object.assign(A.cfg, { sound: st.settings.sound, voice: st.settings.voice, vibrate: st.settings.vibrate, wake: st.settings.wake }); }
applySettings();

const bestOf = id => st.history.filter(h => h.workoutId === id && !h.aborted).reduce((b, h) => (!b || h.total > b.total ? h : b), null);
const workoutById = id => st.workouts.find(w => w.id === id);
const comboById = id => st.combos.find(c => c.id === id);
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
  for (const h of st.history) if (h.total > 0) {
    const at = Date.parse(h.date) + (h.elapsedMs || 0);
    if (E.isCombo(h)) { for (const ex of h.exercises || Object.keys(h.perEx || {})) if ((h.perEx?.[ex] ?? 1) > 0) ev.push({ type: 'edt', exercise: ex, muscle: muscleFor(ex), at }); } // v1.7.0: jede Übung der Kombi
    else ev.push({ type: 'edt', exercise: h.exercise, muscle: h.muscle ?? muscleFor(h.exercise), at });
  }
  return ev;
}
const recOf = (exercise, kind = 'edt', muscle = muscleFor(exercise)) => E.recoveryLeft(recEvents(), { exercise, muscle, kind }, recCfg(), now());
const left = ms => fmt(ms); // m:ss, aufgerundet
// Live-Countdown: Elemente mit data-until werden jede Sekunde aktualisiert
const cd = (until, pre = '', done = 'erholt') => `<span class="cd" data-until="${until}" data-pre="${esc(pre)}" data-done="${esc(done)}">${pre}${left(until - now())}</span>`;
// Übungskacheln (tile): nur laufende Erholung als Countdown, kein „erholt“; nach Ablauf verschwindet die Zeile beim nächsten Rendern.
const recState = (ex, muscle, tile = false) => { const r = recOf(ex, 'edt', muscle);
  return r.leftMs > 0 ? `<span class="exrec wait">${cd(r.until, 'Erholung noch ', tile ? '' : 'erholt')}</span>` : tile ? '' : `<span class="exrec ok">erholt</span>`; };
// Rekord: meiste Wdh. in einer abgeschlossenen 5-min-Einheit dieser Übung (Verlauf)
const REC_MIN = 5;
const best5Of = ex => E.bestForLimit(st.history, ex, REC_MIN, id => workoutById(id));
const best5Html = ex => { const b = best5Of(ex); return `<span class="exbest">Rekord ${REC_MIN} min <b>${b ? b.total : '–'}</b></span>`; };
const DAY_TIP = 'EDT über den Tag verteilen: z. B. morgens Liegestütze, mittags Kniebeugen, abends Klimmzüge. So trainiert jede Muskelgruppe erholt.';
const causeText = r => r.cause ? (r.cause.type === 'test' ? `Fitnesstest ${esc(r.cause.exercise)} um ${hhmm(r.cause.at)}` : `EDT ${esc(r.cause.exercise)} bis ${hhmm(r.cause.at)}`) : '';
// v1.7.0: mehrere Muskelgruppen gleichzeitig beobachten (Kombi); ein Eintrag bleibt ein Objekt wie bisher
const recWatches = () => [].concat(st.settings.recWatch || []).filter(w => w && Number.isFinite(w.until));
function watchRecovery(until, group) {
  const list = recWatches(), cur = list.find(w => w.group === group);
  if (cur) cur.until = Math.max(cur.until, until); else list.push({ until, group });
  st.settings.recWatch = list.length === 1 ? list[0] : list;
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
  const ws = recWatches(), due = ws.filter(w => t >= w.until);
  if (due.length) { const rest = ws.filter(w => t < w.until); st.settings.recWatch = rest.length > 1 ? rest : rest[0] || null; store.saveSettings(st.settings); due.forEach(w => recNotify(w.group)); ended = true; }
  if (ended && ['home', 'plan', 'result', 'assess'].includes(st.view) && !(st.view === 'assess' && st.assess && ['lead', 'run', 'input'].includes(st.assess.step))) {
    if (st.view === 'plan' && st.sheet === 'rec') st.sheet = null;
    render();
  }
}
setInterval(() => { recTick(); remindTick(); }, 1000);
const dLong = iso => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dShort = iso => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on')); setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, 2600);
}

const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--acc)"/><path d="M36 8 18 36h12l-4 20 20-30H34l2-18z" fill="#0b0d10"/></svg>`;

function tabs(active) {
  const t = [['home', 'Training', 'M4 10h3v4H4zM17 10h3v4h-3zM7 8h2v8H7zM15 8h2v8h-2zM9 11h6v2H9z'], ['week', 'Woche', 'M7 3h1.6v2h6.8V3H17v2h2.5A1.5 1.5 0 0 1 21 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 5H7zM4.6 9.5v9.9h14.8V9.5zM7 12h3v3H7z'], ['history', 'Verlauf', 'M4 19h16v1.5H4zM6 16l4-5 3 3 5-7 1.2.9-6 8.3-3-3-3.3 4z'], ['more', 'Mehr', 'M5 11h3v3H5zM10.5 11h3v3h-3zM16 11h3v3h-3z']];
  return `<nav class="tabs">${t.map(([v, l, d]) => `<button class="tab ${active === v ? 'on' : ''}" data-go="${v}" ${active === v ? 'aria-current="page"' : ''}><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg></span><span>${l}</span></button>`).join('')}</nav>`;
}

// ---------- Startseite (v1.5: Training) ----------
const phaseChips = ph => ph.map(p => `<span class="ph"><b>${p.reps}</b> Wdh · ${p.restSec} s · ${p.rounds == null ? 'bis Ende' : '×' + p.rounds}</span>`).join('');
const DAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const todayLabel = () => { const d = new Date(now()); return `${DAYS_DE[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };
// Offenes Übungs-Panel (nur für diese Sitzung): Übungsname, '__own' oder null
const openKey = () => st.openEx ?? null;
function exTile(ex, open) {
  const mx = maxOf(ex), b = best5Of(ex), r = recOf(ex, 'edt');
  return `<button class="extile ${open ? 'open' : ''}" data-exsel="${ex}" aria-expanded="${open}" aria-controls="xp-panel">
    <span class="tf">${figureSvg(ex, 'tilefig')}</span>
    <span class="exname">${ex}</span>
    <span class="tv"><span class="exmax ${mx ? '' : 'need'}"><small>Max am Stück</small> <b>${mx ? mx.v : 'Test offen'}</b></span><span class="exbest"><small>Rekord ${REC_MIN} min</small> <b>${b ? b.total : '–'}</b></span></span>
    ${r.leftMs > 0 ? `<span class="exrec wait">${cd(r.until, 'Erholung noch ', '')}</span>` : '<span class="exrec ph" aria-hidden="true">&nbsp;</span>'}</button>`;
}
function workoutCard(w) {
  const tn = tuneOf(w.exercise), ew = tn ? { ...w, phases: phasesOf(w) } : w;
  const b = bestOf(w.id), plan = E.simulate(ew, tempoOf(w.exercise).spr).total, wm = w.auto.enabled ? maxOf(w.exercise) : null;
  const own = !E.EXERCISES.includes(w.exercise), rs = own ? recState(w.exercise, w.muscle, true) : '';
  return `<article class="card" data-id="${w.id}">
      <div class="card-head"><h3>${esc(w.name)}</h3><span class="dur">${w.limitMin} min</span></div>
      ${own ? `<div class="cardrec"><span class="tag">${esc(w.exercise)}</span>${best5Html(w.exercise)}${rs ? ` · ${esc(E.musclesOf(w.exercise, w.muscle).name)}: ${rs}` : ''}</div>` : ''}
      <div class="phases">${phaseChips(ew.phases)}</div>
      <div class="meta">${tn ? `<span class="pill">Phasen angepasst ${dShort(tn.date)}</span>` : wm ? `<span class="pill">aus Max ${wm.v}</span>` : ''}${w.adapt.enabled ? `<span class="pill">Auto-Anpassung</span>` : ''}${w.countMode === 'tap' ? '<span class="pill">Tap-Zählung</span>' : ''}</div>
      <div class="card-foot">
        <div class="best"><small>Bestwert</small><b>${b ? b.total : '–'}</b></div>
        <div class="best"><small>Plan ≈</small><b class="dim">${plan}</b></div>
        <button class="btn ghost" data-act="edit">Bearbeiten</button>
        <button class="btn primary" data-act="start">Start</button>
      </div></article>`;
}
function exPanel(key, anim) {
  const own = key === '__own', list = st.workouts.filter(w => own ? !E.EXERCISES.includes(w.exercise) : w.exercise === key);
  const m = own ? null : maxOf(key), col = own ? 'own' : E.EXERCISES.indexOf(key) % 2 ? 'r' : 'l';
  // Fitnesstest-Box ohne die Max-Zahl (steht schon auf der Kachel)
  const box = own ? '' : m
    ? `<div class="maxbar"><div><small>Fitnesstest</small><span>${dShort(m.date)} · ${m.source === 'test' ? 'getestet' : 'eingegeben'}</span></div><button class="btn ghost sm" data-act="assess" data-aex="${key}">Test wiederholen</button></div>`
    : `<div class="askcard"><b>Fitnesstest ${esc(key)}</b><p>Maximale saubere Wiederholungen bis zum Muskelversagen. Daraus entstehen Satzgröße, Pausen und 3 Phasen.</p><button class="btn primary wide" data-act="assess" data-aex="${key}">Fitnesstest starten</button></div>`;
  return `<div class="xpanel col-${col} ${anim ? 'anim' : ''}" id="xp-panel" data-panel="${esc(key)}"><div class="xp-in"><div class="xp-body">
    <div class="xp-h"><b>${own ? 'Eigene Übungen' : esc(key)}</b><span>${list.length} ${list.length === 1 ? 'Workout' : 'Workouts'}</span></div>
    ${box}
    ${list.map(workoutCard).join('') || `<p class="muted">Noch kein Workout für diese Auswahl.</p>`}
    <button class="btn add" data-act="new">+ Neues Workout</button></div></div></div>`;
}
function weekDots() {
  const ws = W.weekStatus(st.week, st.history, new Date(now()), winfo);
  return `<div class="wk">${ws.map(d => `<div class="${d.today ? 'today' : ''} ${d.total && d.done >= d.total ? 'full' : d.done ? 'part' : d.past && d.total ? 'miss' : ''}" title="${d.total ? `${d.done}/${d.total}` : 'frei'}">${W.DAYS[d.day]}<i></i></div>`).join('')}</div>`;
}
function heroCard() {
  const d = new Date(now()), hasPlan = st.week.entries.length > 0;
  const list = hasPlan ? W.entriesOn(st.week, W.dayIdx(d)) : [], done = hasPlan ? W.doneOn(st.week, st.history, d, winfo) : new Set();
  const nx = hasPlan ? W.nextToday(st.week, st.history, d, winfo) : null, mins = d.getHours() * 60 + d.getMinutes();
  if (nx && comboById(nx.workoutId)) return comboHero(comboById(nx.workoutId), `${toMin(nx.time) + 30 < mins ? 'Verpasst' : 'Als Nächstes'} · ${nx.time}`, list, done, nx, mins);
  let w = nx && workoutById(nx.workoutId), eyebrow;
  if (w) eyebrow = `${toMin(nx.time) + 30 < mins ? 'Verpasst' : 'Als Nächstes'} · ${nx.time}`;
  else {
    const last = [...st.history].reverse().find(h => workoutById(h.workoutId));
    w = last ? workoutById(last.workoutId) : st.workouts[0];
    eyebrow = list.length ? 'Heute erledigt · zuletzt trainiert' : last ? 'Zuletzt trainiert' : 'Vorschlag';
  }
  if (!w) return `<button class="card2 nx empty" data-go="week"><b>Wochenplan anlegen</b><span>Einheiten über die Woche verteilen, mit Kalender-Erinnerung</span></button>`;
  const ph = tuneOf(w.exercise) ? phasesOf(w) : w.phases, b = bestOf(w.id), r = recOf(w.exercise, 'edt', w.muscle);
  const rows = heroRows(list, done, nx, mins);
  return `<div class="card2 nx" data-wid="${w.id}">
    <div class="eyebrow">${eyebrow}</div>
    <div class="hrow">${figureSvg(w.exercise, 'hfig')}<div class="hmain"><div class="hname">${esc(w.exercise)}</div><div class="hsub">${esc(w.name)}${b ? ` · Bestwert ${b.total}` : ''}</div></div></div>
    <div class="phases hchips">${phaseChips(ph)}</div>
    ${r.leftMs > 0 ? `<div class="hrec">${esc(r.group)}: ${cd(r.until, 'Erholung noch ', 'erholt')}</div>` : ''}
    <button class="go" data-act="plan-go" data-wid="${w.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>${esc(w.exercise)} starten</button>
    ${rows ? `<div class="mini">${rows}</div>` : ''}
    ${hasPlan ? weekDots() : `<button class="hplan" data-go="week">Wochenplan anlegen ›</button>`}
  </div>`;
}
function heroRows(list, done, nx, mins) {
  return list.filter(e => !nx || e.id !== nx.id).map(e => { const i = winfo(e.workoutId); if (!i) return '';
    const isDone = done.has(e.id), late = !isDone && toMin(e.time) + 30 < mins;
    return `<div class="mr trow ${isDone ? 'done' : late ? 'late' : ''}" data-eid="${e.id}"><span class="tm tt">${e.time}</span><span class="nm" title="${esc(i.name)}">${esc(i.combo ? i.name : i.exercise)}</span>
      ${isDone ? '<span class="st ok">✓ erledigt</span>' : `<button class="st ${late ? 'late' : 'lnk'}" data-act="plan-go" data-wid="${e.workoutId}">${late ? 'verpasst · ' : ''}Start ›</button>`}</div>`; }).join('');
}
function comboHero(c, eyebrow, list, done, nx, mins) {
  const b = bestOf(c.id), rows = heroRows(list, done, nx, mins), rec = comboRec(c).filter(x => x.r.leftMs > 0);
  return `<div class="card2 nx" data-cid="${c.id}">
    <div class="eyebrow">${eyebrow}</div>
    <div class="hrow">${figureSvg(c.steps[0].exercise, 'hfig')}<div class="hmain"><div class="hname">${esc(c.name)}</div><div class="hsub">Kombi · ${comboMode(c)}${b ? ` · Bestwert ${b.total}` : ''}</div></div></div>
    <div class="phases hchips">${stepChips(c)}</div>
    ${rec.map(x => `<div class="hrec">${esc(x.r.group)}: ${cd(x.r.until, 'Erholung noch ', 'erholt')}</div>`).join('')}
    <button class="go" data-act="combo-start" data-cid="${c.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>Kombi starten</button>
    ${rows ? `<div class="mini">${rows}</div>` : ''}
    ${weekDots()}
  </div>`;
}
function recentList() {
  const last = [...st.history].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 2);
  if (!last.length) return `<div class="card2 list"><p class="muted">Noch keine Einheiten.</p></div>`;
  return `<div class="card2 list">${last.map(h => { const b = bestOf(h.workoutId), pr = b && b.id === h.id, d = new Date(h.date);
    return `<button class="lr ${E.isCombo(h) ? 'lcombo' : ''}" data-hist="${h.id}"><div><b>${esc(h.workoutName)}${E.isCombo(h) ? '<span class="ktag">Kombi</span>' : ''}</b><small>${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${h.sets.length} Sätze · ${de(h.perMin)}/min${h.aborted ? ' · abgebrochen' : ''}</small></div><span class="n ${pr ? 'pr' : ''}">${h.total}${pr ? '<span class="pr-tag">BEST</span>' : ''}</span></button>`; }).join('')}</div>`;
}
function viewHome() {
  const open = openKey(), anim = st.panelAnim; st.panelAnim = false;
  const tiles = E.EXERCISES.map(ex => exTile(ex, open === ex));
  let grid = '';
  for (let i = 0; i < tiles.length; i += 2) {
    grid += tiles[i] + (tiles[i + 1] || '');
    if (open && E.EXERCISES.slice(i, i + 2).includes(open)) grid += exPanel(open, anim);
  }
  grid += `<button class="extile own ${open === '__own' ? 'open' : ''}" data-exsel="__own" aria-expanded="${open === '__own'}"><span>Eigene Übungen</span><span class="chev">›</span></button>`;
  if (open === '__own') grid += exPanel('__own', anim);
  return `<header class="hd"><h1>Training</h1><span>${todayLabel()}</span></header>
  <main class="scroll home">
    <section class="sec"><div class="sh"><h2>Heute</h2><button class="lk" data-go="week">Wochenplan ›</button></div>${heroCard()}</section>
    <section class="sec"><div class="sh"><h2>Übungen</h2><button class="lk" data-act="fitness" data-then="home">Fitnesstest ›</button></div><div class="extiles">${grid}</div></section>
    <section class="sec kombi"><div class="sh"><h2>Kombi</h2>${st.combos.length ? '<button class="lk" data-act="combo-new" aria-label="Neue Kombi anlegen">+ Kombi</button>' : ''}</div>${comboList()}</section>
    <section class="sec"><div class="sh"><h2>Zuletzt</h2><button class="lk" data-go="history">Verlauf ›</button></div>${recentList()}</section>
  </main>${tabs('home')}${comboEditSheet()}${comboRecSheet()}`;
}
// Auf-/Zuklappen der Übungs-Panels (eines offen); Animation nur ohne prefers-reduced-motion
const reducedMotion = () => FX.reduced(); // v1.6.1: Einstellung „Animationen“ + System
function toggleEx(key) {
  const cur = openKey(), el = $('#xp-panel');
  const apply = () => { st.openEx = cur === key ? null : key; if (st.openEx && st.openEx !== '__own') { st.settings.exSel = key; store.saveSettings(st.settings); } else if (st.openEx === '__own') { st.settings.exSel = '__own'; store.saveSettings(st.settings); }
    st.panelAnim = !!st.openEx && !reducedMotion(); render();
    if (st.openEx) requestAnimationFrame(() => { const t = $(`[data-exsel="${CSS.escape(st.openEx)}"]`); t?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); }); };
  // Zuklappen animiert; Wechsel auf eine andere Kachel sofort (öffnet dort animiert)
  if (el && cur === key && !reducedMotion()) { el.classList.add('closing'); el.addEventListener('animationend', apply, { once: true }); setTimeout(() => st.openEx === cur && apply(), 400); } else apply();
}

// ---------- Kombi-Training (v1.7.0): 2–4 Übungen im Wechsel, Bearbeiten im Sheet auf der Startseite ----------
const saveCombos = () => store.saveCombos(st.combos);
const comboMode = c => c.mode === 'rounds' ? `${c.rounds} ${c.rounds === 1 ? 'Runde' : 'Runden'}` : `${c.limitMin} min`;
const stepChips = c => c.steps.map(x => `<span class="ph"><b>${x.reps}</b> ${esc(x.exercise)} · ${x.restSec} s</span>`).join('<span class="arr" aria-hidden="true">→</span>');
/** Erholung je beteiligter Muskelgruppe (eine Zeile pro Gruppe, längste Restzeit). */
function comboRec(c) {
  const m = new Map();
  for (const ex of E.comboExercises(c)) { const r = recOf(ex, 'edt'), cur = m.get(r.group); if (!cur || r.leftMs > cur.r.leftMs) m.set(r.group, { ex, r }); }
  return [...m.values()];
}
function comboList() {
  if (!st.combos.length) return `<div class="card2 cempty"><p class="muted">Noch keine Kombi. Mehrere Übungen abwechselnd in einer Einheit, z. B. Liegestütze und Klimmzüge mit kurzer Pause dazwischen.</p>
    <button class="btn ghost wide" data-act="combo-new">Kombi anlegen</button></div>`;
  return `<div class="combos">${st.combos.map(comboCard).join('')}</div>`;
}
function comboCard(c) {
  const b = bestOf(c.id), rec = comboRec(c).filter(x => x.r.leftMs > 0);
  return `<article class="card2 ccard" data-cid="${c.id}">
    <div class="ch"><b class="cname">${esc(c.name)}</b><span class="dur">${comboMode(c)}</span></div>
    <div class="phases csteps">${stepChips(c)}</div>
    ${rec.map(x => `<span class="exrec wait">${esc(x.r.group)}: ${cd(x.r.until, 'Erholung noch ', 'erholt')}</span>`).join('')}
    <div class="card-foot"><div class="best"><small>Bestwert</small><b>${b ? b.total : '–'}</b></div>
      <button class="btn ghost" data-act="combo-edit" data-cid="${c.id}" aria-label="${esc(c.name)} bearbeiten">Bearbeiten</button>
      <button class="btn primary" data-act="combo-start" data-cid="${c.id}" aria-label="${esc(c.name)} starten">Start</button></div>
  </article>`;
}
function newCombo() {
  const steps = ['Liegestütze', 'Klimmzüge'].map(ex => ({ exercise: ex, reps: E.comboReps(maxOf(ex)?.v), restSec: 20 }));
  return { ...E.normalizeCombo({ id: uid('c'), name: 'Push & Pull', steps, mode: 'time', limitMin: 10, rounds: 5 }), isNew: true };
}
const cstepper = (f, i, v, unit, label) => `<div class="stepper"><button data-cst="${f}" data-ci="${i}" data-d="-1" aria-label="${label} weniger">−</button><output>${v}${unit ? `<small> ${unit}</small>` : ''}</output><button data-cst="${f}" data-ci="${i}" data-d="1" aria-label="${label} mehr">+</button></div>`;
function comboEditSheet() {
  if (st.sheet !== 'cedit' || !st.cdraft) return '';
  const c = st.cdraft, anim = st.cAnim; st.cAnim = false;
  const pl = E.comboPlan(c, ex => tempoOf(ex).spr);
  const steps = c.steps.map((x, i) => { const mx = maxOf(x.exercise), n = i + 1;
    return `<div class="cstep" data-ci="${i}"><div class="cstep-h"><b>Schritt ${n}</b><span></span>
        ${i > 0 ? `<button class="icon sm" data-act="cstep-up" data-ci="${i}" aria-label="Schritt ${n} nach oben">↑</button>` : ''}
        ${c.steps.length > E.COMBO_MIN_STEPS ? `<button class="icon sm" data-act="cstep-del" data-ci="${i}" aria-label="Schritt ${n} entfernen">✕</button>` : ''}</div>
      <div class="chips cexs" role="radiogroup" aria-label="Übung für Schritt ${n}">${E.EXERCISES.map(ex => `<button class="chip ${ex === x.exercise ? 'on' : ''}" role="radio" aria-checked="${ex === x.exercise}" data-act="cstep-ex" data-ci="${i}" data-cex="${ex}">${ex}</button>`).join('')}</div>
      <div class="cstep-v"><div class="cfield"><small>Wiederholungen</small>${cstepper('reps', i, x.reps, '', `Wiederholungen Schritt ${n}`)}</div><div class="cfield"><small>Pause danach</small>${cstepper('restSec', i, x.restSec, 's', `Pause Schritt ${n}`)}</div></div>
      <p class="muted sm chint">${mx ? `Vorschlag ${E.comboReps(mx.v)} = 40 % von Max ${mx.v}` : 'Ohne Fitnesstest: Vorschlag 5'}</p></div>`; }).join('');
  const limChips = [...new Set([...E.COMBO_LIMITS, ...(E.COMBO_LIMITS.includes(c.limitMin) ? [] : [c.limitMin])])].sort((a, b) => a - b);
  const on = l => (l === 0 ? c.mode === 'rounds' : c.mode === 'time' && c.limitMin === l);
  return `<div class="sheet-bg ${anim ? '' : 'noanim'}"><div class="sheet cedit ${anim ? '' : 'noanim'}" role="dialog" aria-label="Kombi bearbeiten">
    <h3>${c.isNew ? 'Neue Kombi' : 'Kombi bearbeiten'}</h3>
    <label class="cfield"><small>Name</small><input id="c-name" type="text" maxlength="60" value="${esc(c.name)}" placeholder="${esc(E.comboAutoName(c.steps))}" aria-label="Name der Kombi"></label>
    ${steps}
    ${c.steps.length < E.COMBO_MAX_STEPS ? `<button class="btn ghost wide sm" data-act="cstep-add">+ Schritt</button>` : ''}
    <div class="cfield"><small>Dauer</small><div class="chips cmode" role="radiogroup" aria-label="Zeitlimit oder ohne Limit">${limChips.map(l => `<button class="chip ${on(l) ? 'on' : ''}" role="radio" aria-checked="${on(l)}" data-act="cmode" data-clim="${l}">${l} min</button>`).join('')}<button class="chip ${on(0) ? 'on' : ''}" role="radio" aria-checked="${on(0)}" data-act="cmode" data-clim="0">Ohne Limit</button></div></div>
    ${c.mode === 'rounds' ? `<div class="prow"><span>Runden</span>${cstepper('rounds', -1, c.rounds, '', 'Runden')}</div>` : ''}
    <p class="muted sm cplan">Runde ≈ ${fmt(pl.roundSec * 1000)} · ${c.mode === 'time' ? `≈ ${de(pl.rounds)} Runden in ${c.limitMin} min` : `Dauer ≈ ${fmt(pl.durSec * 1000)}`} (Tempo geschätzt)</p>
    <button class="btn primary wide big" data-act="combo-save">Speichern</button>
    ${c.isNew ? '' : '<button class="btn ghost wide danger" data-act="combo-del">Kombi löschen</button>'}
    <button class="btn ghost wide" data-act="combo-cancel">Abbrechen</button>
  </div></div>`;
}
function comboReduced(c) {
  const steps = c.steps.map(x => { const r = recOf(x.exercise, 'edt'); return r.leftMs > 0 ? { ...x, reps: Math.max(1, Math.round(x.reps * cutOf(r).f)) } : { ...x }; });
  const groups = comboRec(c).filter(x => x.r.leftMs > 0).map(x => ({ group: x.r.group, pct: cutOf(x.r).pct }));
  return { steps, groups };
}
function comboRecSheet() {
  if (st.sheet !== 'crec' || !st.crec) return '';
  const c = comboById(st.crec); if (!c) return '';
  const wait = comboRec(c).filter(x => x.r.leftMs > 0); if (!wait.length) return '';
  const red = comboReduced(c), ch = c.steps.map((x, i) => x.reps !== red.steps[i].reps ? `${x.reps} → ${red.steps[i].reps} ${esc(x.exercise)}` : '').filter(Boolean);
  return `<div class="sheet-bg"><div class="sheet recsheet crecsheet"><h3>Noch nicht erholt</h3>
    <p>${wait.map(x => `${esc(x.r.group)}: ${causeText(x.r)}`).join('. ')}. Mit erschöpften Muskeln passen die Satzgrößen nicht.</p>
    <div class="crecs">${wait.map(x => `<div class="recclock"><small>${esc(x.r.group)}</small><b>${cd(x.r.until, '', '0:00')}</b><small>ab ${hhmm(x.r.until)} Uhr</small></div>`).join('')}</div>
    <button class="btn primary wide big" data-act="crec-wait">Warten</button>
    <button class="btn ghost wide" data-act="crec-force">Trotzdem starten</button>
    <p class="cutnote">Trotzdem starten: ${ch.length ? `${ch.join(', ')} Wdh.` : 'Satzgrößen unverändert'} nur für diese Einheit.</p>
    <p class="tip"><b>Oder später am Tag trainieren.</b> ${DAY_TIP}</p>
  </div></div>`;
}
function comboStart(id, force = false) {
  const c = comboById(id); if (!c) return;
  const wait = comboRec(c).filter(x => x.r.leftMs > 0);
  if (wait.length && !force) { st.crec = id; st.sheet = 'crec'; return st.view === 'home' ? render() : go('home'); }
  const run = E.comboWorkout(c); let shortRec = null;
  if (force && wait.length) {
    const red = comboReduced(c); run.combo.steps = red.steps; run.phases[0].reps = red.steps[0].reps;
    shortRec = { pct: Math.max(...red.groups.map(g => g.pct)), groups: red.groups, group: red.groups.map(g => g.group).join(' + ') };
  }
  st.crec = null; st.sheet = null; startWorkout(run, shortRec);
}
function comboSave() {
  const n = $('#c-name'); if (n) st.cdraft.name = n.value;
  const { isNew, ...raw } = st.cdraft, c = E.normalizeCombo(raw), i = st.combos.findIndex(x => x.id === c.id);
  if (i >= 0) st.combos[i] = c; else st.combos.push(c);
  saveCombos(); st.cdraft = null; st.sheet = null; toast(isNew ? 'Kombi angelegt' : 'Gespeichert'); render();
}

// ---------- Wochenplan ----------
const winfo = id => { const w = workoutById(id); if (w) return { name: w.name, exercise: w.exercise, muscle: w.muscle, limitMin: w.limitMin };
  const c = comboById(id); // v1.7.0 Kombi im Wochenplan: Dauer = Zeitlimit bzw. geschätzt
  return c && { name: c.name, exercise: 'Kombi', exercises: E.comboExercises(c), combo: true, limitMin: c.mode === 'time' ? c.limitMin : Math.max(1, Math.ceil(E.comboPlan(c, ex => tempoOf(ex).spr).durSec / 60)) }; };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const ymdL = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function saveWeek() { store.savePlan(st.week); }
function weekStrip() {
  const ws = W.weekStatus(st.week, st.history, new Date(now()), winfo);
  return `<div class="wstrip">${ws.map(d => `<div class="wd ${d.today ? 'today' : ''} ${d.total && d.done >= d.total ? 'full' : d.past && d.total ? 'miss' : ''}"><b>${W.DAYS[d.day]}</b><small>${d.total ? `${d.done}/${d.total}` : '–'}</small></div>`).join('')}</div>`;
}
function viewWeek() {
  const conf = W.planConflicts(st.week, winfo, recCfg()), byId = Object.fromEntries(st.week.entries.map(e => [e.id, e]));
  const opts = sel => st.workouts.map(w => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${esc(w.name)}</option>`).join('')
    + (st.combos.length ? `<optgroup label="Kombi">${st.combos.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>Kombi: ${esc(c.name)}</option>`).join('')}</optgroup>` : '');
  const changed = st.week.exportedSig && st.week.exportedSig !== W.planSig(st.week);
  const days = W.DAYS_LONG.map((name, d) => {
    const list = W.entriesOn(st.week, d), cf = conf.filter(c => c.day === d);
    return `<div class="wday" data-day="${d}"><div class="wday-h"><b>${name}</b><span class="muted">${list.length ? `${list.length} ${list.length > 1 ? 'Einheiten' : 'Einheit'}` : 'frei'}</span>${list.length ? `<button class="link" data-act="wcopy" data-day="${d}">Kopieren</button>` : ''}</div>
      ${list.map(e => { const i = winfo(e.workoutId), bad = cf.some(c => c.a === e.id || c.b === e.id);
        return `<div class="wrow ${bad ? 'bad' : ''}" data-eid="${e.id}"><input type="time" class="wtime" value="${e.time}" aria-label="Uhrzeit">${i ? figureSvg(i.exercise, 'rowfig') : ''}<select class="wsel" aria-label="Workout">${opts(e.workoutId)}</select><button class="icon sm" data-act="wdel" aria-label="Eintrag löschen">✕</button></div>`; }).join('')}
      ${cf.map(c => `<div class="wwarn">${byId[c.a].time} und ${byId[c.b].time}: beide ${esc(c.group)}, ${c.gapMin < 0 ? 'überschneiden sich' : `nur ${c.gapMin} min Pause`} (mind. ${c.needMin} min nach Ende der ersten Einheit)</div>`).join('')}
      <button class="btn ghost sm addrow" data-act="wadd" data-day="${d}">+ Eintrag</button></div>`;
  }).join('');
  const N = 'Notification' in window ? Notification.permission : 'none';
  return `<header class="top"><h2>Wochenplan</h2><span class="ver">${st.week.entries.length} Einträge</span></header>
  <main class="scroll form week">
    ${weekStrip()}
    <div class="field"><span>Vorlagen</span><div class="chips">${Object.entries(W.PLAN_TEMPLATES).map(([k, t]) => `<button class="chip" data-act="wtpl" data-k="${k}">${t.name}</button>`).join('')}${st.week.entries.length ? '<button class="chip" data-act="wclear">Leeren</button>' : ''}</div>
      <p class="tip">${W.TEMPLATE_SLOTS.map(([t, ex]) => `${t} ${ex}`).join(', ')}. Verschiedene Muskelgruppen über den Tag verteilen; gleiche Gruppe mit mindestens ${st.settings.recEdt} min Pause.</p></div>
    ${conf.length ? `<div class="recbox wait">${conf.length} ${conf.length > 1 ? 'Einträge liegen' : 'Eintrag liegt'} zu dicht an derselben Muskelgruppe. Muskeln sind dann nicht erholt.</div>` : ''}
    ${days}
    <h3 class="h3">Erinnerungen</h3>
    <div class="panel remind">
      <p class="rmain">Für Erinnerungen bei geschlossener App: In den Kalender übernehmen.</p>
      <div class="prow col"><span>Kalender-Erinnerung</span><div class="seg">${[0, 5, 10, 15, 30].map(v => `<button data-wab="${v}" class="${st.week.alarmBefore === v ? 'on' : ''}">${v ? `${v} min vorher` : 'zur Startzeit'}</button>`).join('')}</div></div>
      <p class="muted sm">${st.week.alarmBefore ? `Zur Startzeit und ${st.week.alarmBefore} min vorher.` : 'Zur Startzeit.'} Wöchentlich wiederkehrend, Zeitzone Europe/Berlin, mit Link zur App.</p>
      <button class="btn primary wide" data-act="ics" ${st.week.entries.length ? '' : 'disabled'}>In den Kalender übernehmen (.ics)</button>
      ${changed ? `<div class="recbox wait">Plan seit dem Export am ${dShort(st.week.exportedAt)} geändert. Neu exportieren; gleiche Einträge werden im Kalender aktualisiert, sofern der Kalender das unterstützt.</div>` : st.week.exportedAt ? `<p class="muted sm">Exportiert am ${dShort(st.week.exportedAt)} ${hhmm(st.week.exportedAt)} Uhr.</p>` : ''}
      <label class="toggle"><span>In-App-Erinnerung<small>Nur solange die App geöffnet ist oder im Hintergrund läuft: ${N === 'granted' ? 'Benachrichtigung, ' : ''}Ton und Sprache</small></span><input type="checkbox" class="switch" data-wset="remind" ${st.week.remind ? 'checked' : ''}></label>
      ${st.week.remind && N === 'default' ? `<button class="btn ghost wide sm" data-act="notify-ask">Benachrichtigung erlauben</button>` : ''}
      ${st.week.remind && N === 'denied' ? '<p class="muted sm">Benachrichtigungen sind im Browser blockiert. Erinnerung nur in der App.</p>' : ''}
    </div>
  </main>${tabs('week')}${weekSheet()}`;
}
function weekSheet() {
  if (st.sheet !== 'wcopy' || !st.wcopy) return '';
  const c = st.wcopy;
  return `<div class="sheet-bg"><div class="sheet"><h3>${W.DAYS_LONG[c.from]} kopieren</h3><p>Einträge der Zieltage werden ersetzt.</p>
    <div class="chips daypick">${W.DAYS.map((n, d) => d === c.from ? '' : `<button class="chip ${c.to.includes(d) ? 'on' : ''}" data-wto="${d}">${n}</button>`).join('')}</div>
    <div class="chips"><button class="chip" data-act="wto-all">Alle Tage</button><button class="chip" data-act="wto-week">Mo–Fr</button></div>
    <button class="btn primary wide big" data-act="wcopy-ok" ${c.to.length ? '' : 'disabled'}>Auf ${c.to.length} ${c.to.length === 1 ? 'Tag' : 'Tage'} kopieren</button>
    <button class="btn ghost wide" data-act="wcopy-cancel">Abbrechen</button></div></div>`;
}
function weekAdd(day) {
  const list = W.entriesOn(st.week, day), last = list.at(-1);
  const time = last ? `${String(Math.min(21, Math.floor(toMin(last.time) / 60) + 4)).padStart(2, '0')}:00` : '08:00';
  const used = list.map(e => winfo(e.workoutId)).filter(Boolean).map(W.musclesOfInfo);
  const w = st.workouts.find(x => !used.some(u => E.overlaps(u, E.musclesOf(x.exercise, x.muscle)))) || st.workouts[0];
  if (!w) return;
  st.week.entries.push({ id: W.newId(), day, time, workoutId: w.id }); saveWeek();
}
const resolveEx = ex => (st.workouts.find(w => w.exercise === ex && w.auto.enabled) || st.workouts.find(w => w.exercise === ex))?.id || null;
async function exportIcs() {
  st.week.seq = (st.week.seq || 0) + 1;
  // Absagen nur für Termine, die schon einmal im Kalender gelandet sind
  const cancel = st.week.removed.filter(id => st.week.exported.includes(id) && !st.week.entries.some(e => e.id === id));
  const ics = W.buildIcs({ ...st.week, removed: cancel }, { info: winfo, url: new URL('./', location.href).href, now: new Date(now()) });
  st.week.exportedSig = W.planSig(st.week); st.week.exportedAt = new Date(now()).toISOString(); st.week.removed = [];
  st.week.exported = st.week.entries.map(e => e.id); saveWeek();
  const name = 'edt-wochenplan.ics', file = new File([ics], name, { type: 'text/calendar' });
  window.__lastIcs = ics; // für Tests
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'EDT Wochenplan' }); render(); return; } }
  catch (e) { if (e.name === 'AbortError') { render(); return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Kalenderdatei gespeichert. Öffnen, um die Termine zu übernehmen.'); render();
}
// In-App-Erinnerung (nur bei geöffneter App / im Hintergrund)
function remindTick() {
  if (!st.week.remind || !st.week.entries.length) return;
  const d = new Date(now()), mins = d.getHours() * 60 + d.getMinutes(), done = W.doneOn(st.week, st.history, d, winfo);
  const fired = st.settings.reminded || (st.settings.reminded = []);
  for (const e of W.entriesOn(st.week, W.dayIdx(d))) {
    if (done.has(e.id)) continue;
    const t = toMin(e.time), i = winfo(e.workoutId); if (!i) continue;
    for (const [kind, at] of [['pre', st.week.alarmBefore ? t - st.week.alarmBefore : null], ['now', t]]) {
      if (at == null || mins < at || mins >= at + 3) continue;
      const key = `${ymdL(d)}|${e.id}|${kind}`; if (fired.includes(key)) continue;
      fired.push(key); if (fired.length > 60) fired.splice(0, fired.length - 60); store.saveSettings(st.settings);
      const what = i.combo ? `Kombi ${i.name}` : i.exercise;
      const msg = kind === 'pre' ? `In ${st.week.alarmBefore} min: ${e.time} ${what}` : i.combo ? `Jetzt: ${what}` : `Jetzt: ${i.exercise} (${i.name})`;
      toast(msg); A.cue.alert(); A.say(kind === 'pre' ? `In ${st.week.alarmBefore} Minuten ${what}` : `Zeit für ${what}`);
      if ('Notification' in window && Notification.permission === 'granted') {
        const url = `./?w=${encodeURIComponent(e.workoutId)}`;
        navigator.serviceWorker?.getRegistration?.().then(r => r ? r.showNotification('EDT Timer', { body: msg, tag: 'edt-' + e.id, data: { url } }) : new Notification('EDT Timer', { body: msg })).catch(() => {});
      }
      if (st.view === 'home') render();
    }
  }
}
function planGo(w) {
  if (!w) return;
  if (E.EXERCISES.includes(w.exercise) && !maxOf(w.exercise) && w.auto.enabled) return openAssess(w.exercise, 'start:' + w.id);
  openPlan(w); planStart();
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
      <div class="introfig">${figureSvg(a.ex, 'big')}</div>
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
    <div class="planhead">${figureSvg(w.exercise, 'planfig')}<b>${esc(w.name)}</b><span class="muted">${esc(w.exercise)} · Tempo ${sec(tempo.spr)}/Wdh. (${tempo.src}) + Pause</span></div>
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
  if (s.combo) return '';
  const tl = E.phaseTimeline(s, s.spr || E.secPerRepFor(s.exercise), now());
  return tl.slice(1).filter(o => o.reached).map(o => `<span class="mk" style="left:${(100 * o.start / s.limitMs).toFixed(2)}%"></span>`).join('');
}
function phaseStrip(s) {
  if (s.phases.length < 2) return '';
  const tl = E.phaseTimeline(s, s.spr || E.secPerRepFor(s.exercise), now());
  return `<div class="pstrip">${tl.map(o => `<span class="${o.idx === s.phaseIdx ? 'on' : ''} ${o.reached ? '' : 'off'}">P${o.idx + 1} ${o.reached ? `${E.mmss(o.start)}–${E.mmss(o.end)}` : '–'}</span>`).join('')}</div>`;
}
function posText(s) {
  if (s.combo) { const c = s.combo; return `Runde ${s.cRound}${c.rounds ? '/' + c.rounds : ''} · Schritt ${s.stepIdx + 1}/${c.steps.length} · gesamt ${s.setNo}`; }
  const p = s.phases[s.phaseIdx];
  return `Phase ${s.phaseIdx + 1}/${s.phases.length} · Satz ${s.round}${p.rounds ? '/' + p.rounds : ''} · gesamt ${s.setNo}`;
}
const leadText = w => w.combo ? `Kombi · ${w.combo.rounds ? `${w.combo.rounds} Runden` : `${w.limitMin} min`} · zuerst ${w.combo.steps[0].reps} ${esc(w.combo.steps[0].exercise)}`
  : `${esc(w.exercise)} · ${w.limitMin} min · Ziel ${w.phases[0].reps} Wdh.`;
// Kombi: aktueller Schritt groß, darunter der folgende (am Ende der letzten Runde: „Ende“)
const comboNext = s => { const c = s.combo, last = c.rounds && s.cRound >= c.rounds && s.stepIdx === c.steps.length - 1; return last ? null : c.steps[(s.stepIdx + 1) % c.steps.length]; };
const clockText = (s, t) => s.limitMs ? fmt(s.endsAt - t) : fmt(t - s.startedAt);
const barFrac = (s, t) => s.limitMs ? Math.min(1, (t - s.startedAt) / s.limitMs) : Math.min(1, s.sets.length / (s.combo.rounds * s.combo.steps.length));
function viewTrain() {
  const s = st.session;
  if (st.lead) return `<div class="train lead"><header class="ttop"><button class="icon" data-act="cancel-lead" aria-label="Abbrechen">✕</button><div class="tname">${esc(st.lead.workout.name)}</div><span></span></header>
    <div class="leadbox"><div class="lbl">Gleich geht's los</div><div id="t-lead" class="leadnum">${st.settings.leadIn}</div><div class="lbl">${leadText(st.lead.workout)}</div>${st.lead.shortRec ? `<div class="srbadge">Verkürzte Erholung · Sätze −${st.lead.shortRec.pct} %</div>` : ''}</div></div>`;
  const tap = s.countMode === 'tap', next = s.phases[s.phaseIdx];
  const top = `<header class="ttop"><button class="icon" data-act="quit" aria-label="Beenden">✕</button><div class="tname">${esc(s.workoutName)}</div><button class="icon" data-act="mute" aria-label="Ton">${st.settings.sound ? '🔊' : '🔇'}</button></header>
    <section class="clock"><div id="t-clock" class="bigclock" ${s.limitMs ? '' : 'aria-label="Dauer bisher"'}>${clockText(s, now())}</div><div class="bar"><i id="t-bar"></i>${phaseMarks(s)}</div>${phaseStrip(s)}</section>
    <section class="stats2"><div class="stat smain"><div id="t-total" class="num">${E.total(s)}</div><div class="lbl">Wdh. gesamt</div></div>
      <div class="sside"><div class="stat"><span class="lbl">vs. Bestwert</span><span id="t-vs" class="num sm">–</span></div>
      ${s.sets.length >= 2 ? `<div class="stat"><span class="lbl">Hochrechnung</span><span id="t-proj" class="num sm">–</span></div>` : ''}</div></section>
    <div class="pos">${s.status === 'rest' ? 'Nächster: ' : ''}${posText(s)}${s.shortRec ? ` · <span class="srtag">verkürzte Erholung −${s.shortRec.pct} %</span>` : ''}</div>`;
  let body = '';
  if (s.status === 'work' || s.status === 'partial') {
    body = tap
      ? `<section class="work"><div class="lbl">Satz ${s.setNo} · Ziel ${s.target} Wdh.</div><div class="reps"><span id="t-tap">${s.tapCount}</span><small>/${s.target}</small></div>
          <button class="btn ghost" data-act="tap-done">Satz beenden (Teilsatz)</button></section>
         <button class="hit tap" data-act="tap"><span>TIPPEN</span><small>jedes Tippen = 1 Wiederholung</small></button>`
      : s.combo ? `<section class="work cwork"><div class="cex" aria-live="polite"><b>${s.target}</b> ${esc(s.combo.steps[s.stepIdx].exercise)}</div><div class="lbl">tatsächlich geschafft:</div>
          <div class="adj"><button class="round" data-act="minus" aria-label="minus">−</button><div id="t-reps" class="reps ${st.adj < s.target ? 'less' : ''}">${st.adj}</div><button class="round" data-act="plus" aria-label="plus">+</button></div>
          <div class="cnext">${comboNext(s) ? `Danach: <b>${comboNext(s).reps} ${esc(comboNext(s).exercise)}</b> · ${s.combo.steps[s.stepIdx].restSec} s Pause dazwischen` : 'Letzter Satz'}</div></section>
         <button class="hit" data-act="done"><svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg><span>Satz geschafft</span></button>`
      : `<section class="work"><div class="lbl">Ziel <b>${s.target}</b> Wdh. · tatsächlich geschafft:</div>
          <div class="adj"><button class="round" data-act="minus" aria-label="minus">−</button><div id="t-reps" class="reps ${st.adj < s.target ? 'less' : ''}">${st.adj}</div><button class="round" data-act="plus" aria-label="plus">+</button></div></section>
         <button class="hit" data-act="done"><svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg><span>Satz geschafft</span></button>`;
  } else if (s.status === 'rest') {
    const last = s.sets.at(-1);
    body = `<section class="rest"><div class="ringbox"><div class="ringwrap"><svg class="ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="rbg"/><circle id="t-ring" cx="100" cy="100" r="88" class="rfg" pathLength="1000"/></svg>
        <div class="ring-in"><div id="t-rest" class="restnum">${Math.ceil((s.restEndsAt - now()) / 1000)}</div><div class="lbl">Pause</div></div></div></div>
        <div class="next">Als Nächstes: <b>${s.combo ? `${s.target} ${esc(s.combo.steps[s.stepIdx].exercise)}` : `${s.target} Wdh.`}</b>${s.pendingPhase ? `<span class="badge">${phaseBadge(s)}</span>` : ''}${s.combo && comboNext(s) ? `<small class="cthen">danach ${comboNext(s).reps} ${esc(comboNext(s).exercise)}</small>` : ''}</div></section>
      <div class="restbar compact"><div class="rc">${last && !last.partial ? `<div class="rate"><span>Satz ${last.n}</span><div class="seg">${[['ok', 'geschafft'], ['hard', 'knapp'], ['fail', 'nicht geschafft']].map(([v, l]) => `<button data-rate="${v}" class="r-${v} ${E.rateOf(last) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
        <div class="last"><span>Letzter Satz</span><span class="lastadj"><button class="round sm" data-act="last-minus" aria-label="minus">−</button><b id="t-last">${last ? last.done : 0}</b><button class="round sm" data-act="last-plus" aria-label="plus">+</button></span></div></div>
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
    return `<div class="sheet-bg"><div class="sheet"><h3>Zeit abgelaufen</h3><p>Wie viele Wiederholungen hast du im letzten Satz geschafft? (Ziel ${s.target}${s.combo ? ' ' + esc(s.combo.steps[s.stepIdx].exercise) : ''})</p>${nums}
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
function restSpeech(e, s) {
  const next = `Nächster Satz: ${e.nextTarget} ${e.nextEx || s?.exercise || 'Wiederholungen'}`;
  return e.sec >= 6 ? `Pause ${e.sec} Sekunden. ${next}` : next;
}
function handle(events) {
  if (!events.length) return;
  const s = st.session; let adapted = null;
  for (const e of events) {
    switch (e.type) {
      case 'go': st.adj = e.target; A.cue.go(); A.say(e.ex ? `Los: ${e.target} ${e.ex}` : e.phase ? 'Los! ' + phaseSpeech(e.phase) : 'Los'); break;
      case 'set': A.cue.set(); break;
      case 'adapt': adapted = e; break;
      case 'rest': if (e.sec > 0) A.say(restSpeech(e, s)); break; // v1.6.3: nächste Übung + Wiederholungen ansagen
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
  if (s.combo) return finishCombo(s, sum, prevBest);
  const entry = { id: uid('s'), workoutId: s.workoutId, workoutName: s.workoutName, exercise: s.exercise, date: new Date(s.startedAt).toISOString(),
    limitMs: s.limitMs, total: sum.total, sets: s.sets, phases: s.phases, spr: s.spr, elapsedMs: sum.elapsedMs, aborted: sum.aborted, perMin: sum.perMin,
    prevBest: prevBest ? prevBest.total : null, muscle: s.muscle, shortRec: s.shortRec || null };
  st.history.push(entry); store.saveHistory(st.history);
  if (entry.total > 0) { const r = recOf(entry.exercise, 'edt', entry.muscle); if (r.leftMs > 0) watchRecovery(r.until, r.group); }
  st.result = entry; st.resultFrom = 'home'; go('result');
}

// v1.7.0: ein Verlaufseintrag pro Kombi-Einheit; exercise bleibt leer, damit Einzel-Rekorde und Tempo unberührt bleiben
function finishCombo(s, sum, prevBest) {
  const c = s.combo, perEx = E.comboTotals(s.sets, c.steps), exercises = Object.keys(perEx);
  const entry = { id: uid('s'), type: 'combo', comboId: s.workoutId, workoutId: s.workoutId, workoutName: s.workoutName, name: s.workoutName, exercise: null, exercises,
    date: new Date(s.startedAt).toISOString(), mode: c.rounds ? 'rounds' : 'time', limitMs: s.limitMs || null, rounds: c.rounds,
    roundsDone: s.sets.filter(x => x.step === c.steps.length - 1 && !x.partial).length, total: sum.total, perEx, steps: c.steps, sets: s.sets, phases: s.phases,
    elapsedMs: sum.elapsedMs, aborted: sum.aborted, perMin: sum.perMin, prevBest: prevBest ? prevBest.total : null, shortRec: s.shortRec || null };
  st.history.push(entry); store.saveHistory(st.history);
  if (entry.total > 0) for (const ex of exercises) if (perEx[ex] > 0) { const r = recOf(ex, 'edt'); if (r.leftMs > 0) watchRecovery(r.until, r.group); }
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
  set('t-clock', clockText(s, t));
  const bar = $('#t-bar'); if (bar) bar.style.transform = `scaleX(${barFrac(s, t)})`;
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
function viewComboResult(r, isNew) {
  const best = bestOf(r.workoutId), pr = !r.aborted && r.total > 0 && (r.prevBest == null || r.total > r.prevBest);
  const full = r.sets.filter(x => x.done >= x.target).length, d = new Date(r.date), c = comboById(r.comboId);
  const per = Object.entries(r.perEx || {});
  return `<header class="top"><button class="icon" data-go="${isNew ? 'home' : 'history'}" aria-label="Zurück">‹</button><h2>Ergebnis</h2><span></span></header>
  <main class="scroll">
    <section class="hero ${pr ? 'pr' : ''}">
      ${pr ? '<div class="badge big">Neuer Bestwert</div>' : ''}
      <div class="huge">${r.total}</div><div class="lbl">Wiederholungen gesamt · Kombi</div>
      <div class="sub">${esc(r.workoutName)} · ${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${r.aborted ? ' · abgebrochen' : ''}</div>
      ${!pr && best ? `<div class="sub">Bestwert ${best.total}${best.id !== r.id ? ` (${r.total - best.total >= 0 ? '+' : ''}${r.total - best.total})` : ''}</div>` : ''}
    </section>
    <section class="ctot" aria-label="Wiederholungen je Übung">${per.map(([ex, n]) => `<div data-cex="${esc(ex)}"><b>${n}</b><small>${esc(ex)}</small></div>`).join('')}<div class="sum"><b>${r.total}</b><small>Gesamt</small></div></section>
    <section class="grid3"><div><b>${r.sets.length}</b><small>Sätze (${full} voll)</small></div><div><b>${r.roundsDone ?? 0}</b><small>Runden${r.rounds ? ` von ${r.rounds}` : ''}</small></div><div><b>${fmt(r.elapsedMs)}</b><small>Dauer</small></div></section>
    ${r.shortRec ? `<div class="recbox wait"><b>Verkürzte Erholung</b>: Satzgrößen bis −${r.shortRec.pct} %.</div>` : ''}
    ${isNew ? comboRecCard(r) : ''}
    <p class="muted sm cnote">Kombi-Einheiten zählen nicht für Rekorde und Bestwerte der einzelnen Übungen.</p>
    <h3 class="h3">Wiederholungen pro Satz</h3>
    <div class="panel">${barChart(r.sets)}</div>
    <div class="row-actions">
      ${c ? `<button class="btn primary big" data-act="combo-start" data-cid="${c.id}">Nochmal</button>` : ''}
      ${isNew ? `<button class="btn ghost big" data-go="history">Zum Verlauf</button>` : `<button class="btn ghost danger" data-act="delsession">Eintrag löschen</button>`}
    </div>
  </main>`;
}
function comboRecCard(r) {
  if (!(r.total > 0)) return '';
  const seen = new Set(), rows = [];
  for (const ex of r.exercises || []) { const rr = recOf(ex, 'edt'); if (seen.has(rr.group)) continue; seen.add(rr.group);
    rows.push(rr.leftMs > 0 ? `<p class="nx">Nächstes EDT für ${esc(rr.group)} ab <b>${hhmm(rr.until)} Uhr</b> <span class="muted">(${cd(rr.until, 'noch ', 'erholt')})</span></p>` : `<p class="nx">${esc(rr.group)} erholt.</p>`); }
  return `<div class="panel nextrec crec"><div class="panel-h"><span>Erholung</span><span>${seen.size} ${seen.size === 1 ? 'Muskelgruppe' : 'Muskelgruppen'}</span></div>${rows.join('')}</div>`;
}
function viewResult() {
  const r = st.result, isNew = st.resultFrom === 'home';
  if (E.isCombo(r)) return viewComboResult(r, isNew);
  const best = bestOf(r.workoutId);
  const pr = !r.aborted && r.total > 0 && (r.prevBest == null || r.total > r.prevBest);
  const full = r.sets.filter(x => x.done >= x.target).length;
  const d = new Date(r.date), info = id => workoutById(id);
  // „Neuer Rekord“: beste abgeschlossene 5-min-Einheit der Übung, verglichen mit allen früheren
  const prev5 = E.bestForLimit(st.history.filter(h => h.id !== r.id && Date.parse(h.date) < Date.parse(r.date)), r.exercise, REC_MIN, info);
  const rec5 = !r.aborted && r.total > 0 && E.sessionLimitMin(r, info) === REC_MIN && (!prev5 || r.total > prev5.total);
  return `<header class="top"><button class="icon" data-go="${isNew ? 'home' : 'history'}" aria-label="Zurück">‹</button><h2>Ergebnis</h2><span></span></header>
  <main class="scroll">
    <section class="hero ${pr || rec5 ? 'pr' : ''}">
      ${rec5 ? `<div class="badge big rec">Neuer Rekord<small> · ${REC_MIN} min${prev5 ? ` · vorher ${prev5.total}` : ''}</small></div>` : pr ? '<div class="badge big">Neuer Bestwert</div>' : ''}
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
// Entwicklung · 30 Tage: nur Einheiten mit gleicher Zeitvorgabe (Dauer-Auswahl), je Tag die beste Einheit (bei „Alle“ Summe des Tages)
const ddmm = t => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };
// v1.7.0 Umschalter Regulär | Kombi | Gesamt: Regulär = nur Einzel-EDT (wie bisher), Kombi = nur Kombi-Einheiten
// (Übungsfilter = Wdh. dieser Übung innerhalb der Kombis), Gesamt = beide Methoden, Summe je Tag, Dauer egal.
const DEV_MODES = [['reg', 'Regulär'], ['combo', 'Kombi'], ['all', 'Gesamt']];
const DEV_EMPTY = { reg: 'Noch keine Einheiten in den letzten 30 Tagen', combo: 'Noch keine Kombi-Einheiten in den letzten 30 Tagen', all: 'Noch keine Einzel- oder Kombi-Einheiten in den letzten 30 Tagen' };
function devData(exSel) {
  return E.devSeries(st.history, st.maxes, { exercise: exSel, limitMin: st.devLim ?? null, now: now(), days: 30, info: id => workoutById(id), mode: st.devMode });
}
function devChart(sr, exSel, anim) {
  if (!sr.points.length) return `<p class="muted devempty">${DEV_EMPTY[sr.mode] || DEV_EMPTY.reg}</p>`;
  const W = 340, H = 190, pl = 30, pr = sr.tests.length ? 28 : 10, pt = 12, pb = 24, DAY = 86400000;
  const vals = sr.points.map(p => p.value).concat(sr.trend.map(p => p.value));
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(2, (hi - lo) * 0.12); lo = Math.max(0, lo - pad); hi += pad;
  const yt = E.niceTicks(lo, hi, 4); lo = yt[0]; hi = yt.at(-1);
  const x0 = sr.start + DAY / 2, x1 = sr.end - DAY / 2;
  const x = t => pl + ((t + DAY / 2 - x0) / (x1 - x0)) * (W - pl - pr), y = v => pt + (1 - (v - lo) / (hi - lo || 1)) * (H - pt - pb);
  let tt = [], ty = null;
  if (sr.tests.length) { const tv = sr.tests.map(t => t.value); tt = E.niceTicks(Math.max(0, Math.min(...tv) - 2), Math.max(...tv) + 2, 3); ty = v => pt + (1 - (v - tt[0]) / (tt.at(-1) - tt[0] || 1)) * (H - pt - pb); }
  const xt = [0, 7, 14, 21, 29].map(i => sr.start + i * DAY);
  const xy = sr.points.map(p => [x(p.day), y(p.value)]);
  const len = Math.ceil(xy.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - xy[i][0], q[1] - xy[i][1]), 0)) + 1;
  const path = xy.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('');
  const trend = sr.trend.length >= 2 ? `<path class="tr" d="${sr.trend.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join('')}"/>` : '';
  return `<svg class="devc" data-mode="${sr.mode}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${sr.mode === 'reg' ? 'Wiederholungen pro Einheit' : sr.mode === 'combo' ? 'Kombi-Wiederholungen' : 'Wiederholungen gesamt pro Tag'}, letzte 30 Tage">
    ${yt.map(v => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 5}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('')}
    ${ty ? tt.map(v => `<text class="ax r" x="${W - pr + 5}" y="${ty(v) + 3.5}">${v}</text>`).join('') : ''}
    ${xt.map((t, i) => `<text class="ax" x="${x(t)}" y="${H - 7}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${ddmm(t)}</text>`).join('')}
    ${trend}
    ${sr.points.length > 1 ? `<path class="wl ${anim ? 'draw' : ''}" style="--len:${len}" d="${path}"/>` : ''}
    ${ty ? sr.tests.map(t => `<rect class="tm" x="${x(t.day) - 4.5}" y="${ty(t.value) - 4.5}" width="9" height="9" rx="1.5" transform="rotate(45 ${x(t.day)} ${ty(t.value)})"><title>Fitnesstest ${ddmm(t.t)}: ${t.value}</title></rect>`).join('') : ''}
    ${xy.map((q, i) => `<circle class="wp ${st.devPt === i ? 'on' : ''}" data-ptc="${i}" cx="${q[0]}" cy="${q[1]}" r="4.5"/>`).join('')}
    ${xy.map((q, i) => `<circle class="hit" data-pt="${i}" cx="${q[0]}" cy="${q[1]}" r="14"><title>${ddmm(sr.points[i].day)}: ${sr.points[i].value}</title></circle>`).join('')}
  </svg>`;
}
function devInfo(sr, i) {
  const p = sr.points[i]; if (!p) return '';
  const names = [...new Set(p.sessions.map(x => x.name))].map(esc).join(', ');
  const more = p.sessions.length > 1 ? (sr.sum ? ` · Summe aus ${p.sessions.length} Einheiten` : ` · beste von ${p.sessions.length} Einheiten`) : '';
  return `<b>${new Date(p.day).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</b> · <b>${p.value}</b> Wdh. · ${names}${more}`;
}
function devPanel(defEx) {
  const mode = st.devMode || 'reg';
  const exList = mode === 'combo' ? [...E.EXERCISES] : [...new Set([...E.EXERCISES, ...st.history.map(h => h.exercise).filter(Boolean)])];
  let exSel = st.devEx === undefined ? defEx : st.devEx;
  if (exSel != null && !exList.includes(exSel)) exSel = null;
  const sr = devData(exSel), anim = st.devAnim && !reducedMotion(); st.devAnim = false;
  st.devSr = sr; if (st.devPt != null && !sr.points[st.devPt]) st.devPt = null;
  const sm = sr.summary, pct = sm ? sm.pct : null;
  const sum = !sr.points.length ? '' : sm
    ? `<p class="devsum ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}">${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)} % ${mode === 'combo' ? 'Kombi-Wdh.' : mode === 'all' ? 'Wdh. gesamt' : 'Wdh.'} ggü. erster Woche <span class="muted">(Ø ${Math.round(sm.first)} → ${Math.round(sm.last)}${sr.sum ? ' pro Tag' : ''})</span></p>`
    : `<p class="devsum flat">Wochenvergleich ab zwei Wochen mit ${mode === 'combo' ? 'Kombi-Einheiten' : 'Einheiten'}</p>`;
  const limLabel = mode === 'all' ? 'alle Dauern' : sr.limitMin ? `${sr.limitMin}-min-${mode === 'combo' ? 'Kombis' : 'Einheiten'}` : mode === 'combo' && sr.limitMin === 0 ? 'Kombis ohne Limit' : '';
  return `<div class="panel dev"><div class="panel-h"><span>Entwicklung · 30 Tage</span>${limLabel ? `<span>${limLabel}</span>` : ''}</div>
    <div class="chips devmode" role="radiogroup" aria-label="Trainingsart im Diagramm">${DEV_MODES.map(([v, l]) => `<button class="chip ${mode === v ? 'on' : ''}" role="radio" aria-checked="${mode === v}" data-dmode="${v}">${l}</button>`).join('')}</div>
    <div class="chips scrollx devex"><button class="chip ${exSel == null ? 'on' : ''}" data-dex="__all">Alle</button>${exList.map(ex => `<button class="chip ${ex === exSel ? 'on' : ''}" data-dex="${esc(ex)}">${esc(ex)}</button>`).join('')}</div>
    ${sr.limits.length > 1 ? `<div class="chips devlim">${sr.limits.slice().sort((a, b) => (a || 1e9) - (b || 1e9)).map(l => `<button class="chip ${l === sr.limitMin ? 'on' : ''}" data-dlim="${l}">${l ? `${l} min` : 'Ohne Limit'}</button>`).join('')}</div>` : ''}
    ${devChart(sr, exSel, anim)}
    ${sr.points.length ? `<div class="legend"><span><i class="wll"></i>${sr.sum ? (mode === 'all' ? 'Wdh. pro Tag (Summe, Einzel + Kombi)' : 'Wdh. pro Tag (Summe)') : mode === 'combo' ? `${esc(exSel)} pro Kombi-Einheit` : 'Wdh. pro Einheit'}</span>${sr.trend.length >= 2 ? '<span><i class="trl"></i>Trend (Ø 3)</span>' : ''}${sr.tests.length ? '<span><i class="tml"></i>Fitnesstest (rechte Achse)</span>' : ''}</div>
    <div class="devinfo ${st.devPt == null ? 'hint' : ''}" id="devinfo">${st.devPt == null ? 'Punkt antippen: Datum, Wiederholungen, Workout' : devInfo(sr, st.devPt)}</div>` : ''}
    ${sum}${mode === 'all' ? '<p class="muted sm devnote">Gesamt: Einzel- und Kombi-Einheiten aller Dauern, Wiederholungen je Tag addiert.</p>' : ''}</div>`;
}
function selectDevPoint(i) {
  st.devPt = i; const inf = $('#devinfo'); if (!inf || !st.devSr) return;
  inf.classList.remove('hint'); inf.innerHTML = devInfo(st.devSr, i);
  app.querySelectorAll('.devc .wp').forEach(c => c.classList.toggle('on', +c.dataset.ptc === i));
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
    return `<button class="hitem" data-hist="${h.id}"><div><b>${esc(h.workoutName)}${E.isCombo(h) ? '<span class="ktag">Kombi</span>' : ''}</b><small>${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })} · ${h.sets.length} Sätze · ${de(h.perMin)}/min${h.aborted ? ' · abgebrochen' : ''}</small></div><div class="htot ${best && h.id === best.id ? 'pr' : ''}">${h.total}</div></button>`;
  }).join('');
  return `<header class="top"><h2>Verlauf</h2><span class="ver">${st.history.length} Einheiten</span></header>
  <main class="scroll">
    ${maxPanel()}
    ${st.history.length ? `<div class="chips scrollx">${ids.map(id => `<button class="chip ${id === f ? 'on' : ''}" data-hf="${id}">${esc(nameOf(id))}</button>`).join('')}</div>
    ${devPanel((st.history.find(h => h.workoutId === f) || {}).exercise ?? workoutById(f)?.exercise ?? null)}
    <div class="panel"><div class="panel-h"><span>Fortschritt</span>${best ? `<span>Bestwert <b class="acc">${best.total}</b></span>` : ''}</div>${lineChart(sel)}</div>
    <div class="hlist">${items}</div>` : `<div class="empty"><p>Noch keine Einheiten.</p><button class="btn primary" data-go="home">Workout wählen</button></div>${devPanel(null)}`}
  </main>${tabs('history')}`;
}

// ---------- Mehr ----------
function animInfo() {
  const a = st.settings.anim || 'on', sys = FX.systemReduced();
  if (a === 'off') return 'Keine Effekte. Werte und Timer bleiben gleich.';
  if (a === 'on') return `Alle Effekte: Leuchten beim Tippen, Ziffern im Ergebnis, Einblenden, bewegter Hintergrund.${sys ? ' Hinweis: Am Gerät ist „Bewegung reduzieren“ bzw. „Animationen entfernen“ an. Diese Einstellung überstimmt das für EDT Timer.' : ''}`;
  return sys ? 'Am Gerät ist „Bewegung reduzieren“ bzw. „Animationen entfernen“ an, deshalb nur sanfte Überblendungen ohne Bewegung.'
    : 'Folgt der Systemeinstellung „Bewegung reduzieren“. Derzeit aus, deshalb alle Effekte.';
}
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
    <h3 class="h3">Animationen</h3>
    <div class="panel animpanel"><div class="prow"><span>Effekte</span><div class="seg" role="radiogroup" aria-label="Animationen">${[['auto', 'Automatisch'], ['on', 'An'], ['off', 'Aus']].map(([v, l]) => `<button role="radio" aria-checked="${(s.anim || 'on') === v}" data-anim="${v}" class="${(s.anim || 'on') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="muted" id="anim-info">${animInfo()}</p></div>
    <h3 class="h3">Daten</h3>
    <div class="panel"><p class="muted">Alles bleibt auf diesem Gerät (localStorage). Kein Konto, kein Server, keine Tracker.</p>
      <button class="btn ghost wide" data-act="export">Export als JSON</button>
      <button class="btn ghost wide" data-act="import">Import aus JSON</button><input type="file" id="f-import" accept="application/json,.json" hidden>
      <button class="btn ghost wide" data-act="templates">Vorlagen wiederherstellen</button>
      <button class="btn ghost wide danger" data-act="wipe">Alle Daten löschen</button></div>
    <h3 class="h3">Installieren</h3>
    <div class="panel"><p class="muted">${standalone ? 'Läuft als installierte App. Funktioniert offline.' : ios ? 'Safari: Teilen-Symbol → „Zum Home-Bildschirm“. Danach offline nutzbar.' : 'Chrome: Menü → „App installieren“ oder Knopf unten.'}</p>
      ${st.installEvt ? '<button class="btn primary wide" data-act="install">App installieren</button>' : ''}
      <div class="prow verrow"><span>Version</span><b id="app-ver">${VERSION}</b></div>
      <button class="btn ghost wide" data-act="sw-check">Nach neuer Version suchen</button></div>
    <p class="muted center">EDT Timer · Escalating Density Training</p>
  </main>${tabs('more')}`;
}

// ---------- Render & Navigation ----------
function render() {
  const v = { home: viewHome, edit: viewEdit, train: viewTrain, result: viewResult, history: viewHistory, more: viewMore, assess: viewAssess, plan: viewPlan, week: viewWeek }[st.view];
  const keep = st.view !== 'train' && $('.scroll') ? $('.scroll').scrollTop : 0, keepSheet = $('.sheet.cedit')?.scrollTop || 0;
  FX.stopScrambles();
  app.innerHTML = v(); app.dataset.view = st.view;
  animateFigures(app);
  applyFx();
  // vorausgewählten Chip in den sichtbaren Bereich der horizontalen Leiste holen
  app.querySelectorAll('.chips.scrollx').forEach(c => { const on = c.querySelector('.chip.on'); if (on && c.scrollWidth > c.clientWidth) c.scrollLeft = Math.max(0, on.offsetLeft - c.offsetLeft - (c.clientWidth - on.offsetWidth) / 2); });
  if (keep && st.view === st._lastView && $('.scroll')) $('.scroll').scrollTop = keep;
  if (keepSheet && $('.sheet.cedit')) $('.sheet.cedit').scrollTop = keepSheet;
  st._lastView = st.view;
}
// v1.6 Effekte: Hintergrund je Ansicht/Phase, Karten-Einblendung einmal pro Ansichtswechsel, Ziffern-Effekt beim Öffnen des Ergebnisses
const REVEAL_SEL = { home: '.sec, .extile, .ccard, .lr', week: '.scroll > *', history: '.scroll > .panel, .chips, .hitem' };
function applyFx() {
  const s = st.session, mode = st.view === 'home' ? 'home' : st.view === 'train' && s && !st.lead ? (s.status === 'rest' ? 'rest' : 'work') : 'off';
  FX.background(mode);
  if (st.fxReveal && REVEAL_SEL[st.view]) FX.reveal(app, REVEAL_SEL[st.view]);
  st.fxReveal = false;
  if (st.view === 'result' && st.fxScramble) {
    st.fxScramble = false;
    const big = $('.hero .huge'), hero = $('.hero');
    FX.scramble(big, { dur: 1200, onDone: () => { if (hero?.classList.contains('pr') && FX.mode() !== 'off') hero.classList.add('flash'); } });
    app.querySelectorAll('.grid3 b, .ctot b').forEach((b, i) => FX.scramble(b, { dur: 900 + i * 120 }));
  }
}
function go(view) {
  if (view === 'result' && st.view !== 'result') { st.tuneSel = 0; st.fxScramble = true; }
  if (view !== st.view) st.fxReveal = true;
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
  const pt = e.target.closest('[data-pt]'); if (pt) return selectDevPoint(+pt.dataset.pt);
  const b = e.target.closest('button,[data-hist]'); if (!b) return;
  const d = b.dataset, s = st.session;
  if (d.go) { if (d.go === 'history') { st.devAnim = true; st.devPt = null; } return go(d.go); }
  if (d.step) {
    const [lo, hi, step] = LIM[d.lim]; const cur = getPath(st.draft, d.step);
    setPath(st.draft, d.step, Math.min(hi, Math.max(lo, cur + step * +d.d)));
    if (d.step.startsWith('phases.')) manualPhases(); if (d.step.startsWith('auto.') || d.step === 'limitMin') reauto();
    const n = $('#f-name'); if (n) st.draft.name = n.value; return render();
  }
  if (d.seg) { setPath(st.draft, d.seg, d.seg === 'auto.phases' ? +d.v : d.v); if (d.seg.startsWith('auto.')) reauto(); const n = $('#f-name'); if (n) st.draft.name = n.value; return render(); }
  if (d.ex) { const n = $('#f-name'); if (n) st.draft.name = n.value; st.draft.exercise = d.ex === '__custom' ? (E.EXERCISES.includes(st.draft.exercise) ? '' : st.draft.exercise) : d.ex; reauto(); render(); if (d.ex === '__custom') $('#f-ex')?.focus(); return; }
  if (d.exsel) {
    if (d.exsel !== '__own' && openKey() !== d.exsel && !maxOf(d.exsel) && !st.settings.asked.includes(d.exsel)) { st.openEx = d.exsel; st.settings.exSel = d.exsel; store.saveSettings(st.settings); return openAssess(d.exsel); }
    return toggleEx(d.exsel);
  }
  if (d.hist) { st.result = st.history.find(h => h.id === d.hist); st.resultFrom = 'history'; return go('result'); }
  if (d.hf) { st.histFilter = d.hf; st.devEx = undefined; st.devLim = null; st.devPt = null; st.devAnim = true; return render(); }
  if (d.dex) { st.devEx = d.dex === '__all' ? null : d.dex; st.devLim = null; st.devPt = null; st.devAnim = true; return render(); }
  if (d.dlim) { st.devLim = +d.dlim; st.devPt = null; st.devAnim = true; return render(); }
  if (d.dmode) { st.devMode = d.dmode; st.devLim = null; st.devPt = null; st.devAnim = true; return render(); }
  if (d.cst) { // Kombi-Editor: Stepper
    const c = st.cdraft, i = +d.ci, n = $('#c-name'); if (n) c.name = n.value;
    if (d.cst === 'rounds') c.rounds = Math.min(99, Math.max(1, c.rounds + +d.d));
    else { const [lo, hi, stp] = LIM[d.cst]; c.steps[i][d.cst] = Math.min(hi, Math.max(lo, c.steps[i][d.cst] + stp * +d.d)); }
    return render();
  }
  if (d.lead) { st.settings.leadIn = +d.lead; store.saveSettings(st.settings); return render(); }
  if (d.anim) { st.settings.anim = d.anim; store.saveSettings(st.settings); FX.setPref(d.anim); return render(); }
  if (d.pv != null) { st.partialVal = +d.pv; return render(); }
  if (d.pst) { planStep(d.pst, +d.i, +d.d); return render(); }
  if (d.rate) { E.rateLastSet(s, d.rate); store.saveActive(s); A.cue.tap(); return render(); }
  if (d.tsel != null) { st.tuneSel = +d.tsel; return render(); }
  if (d.wab != null) { st.week.alarmBefore = +d.wab; saveWeek(); return render(); }
  if (d.wto != null) { const k = +d.wto, t = st.wcopy.to; st.wcopy.to = t.includes(k) ? t.filter(x => x !== k) : [...t, k]; return render(); }
  if (d.rec) { st.settings[d.rec] = Math.max(0, Math.min(60, (st.settings[d.rec] ?? 10) + +d.d)); store.saveSettings(st.settings); return render(); }
  const card = b.closest('.card'), w = card && workoutById(card.dataset.id);
  switch (d.act) {
    case 'start':
      if (E.EXERCISES.includes(w.exercise) && !maxOf(w.exercise) && w.auto.enabled) return openAssess(w.exercise, 'start:' + w.id);
      return openPlan(w);
    case 'plan-start': return planStart();
    case 'plan-go': return comboById(d.wid) ? comboStart(d.wid) : planGo(workoutById(d.wid));
    // Kombi
    case 'combo-new': st.cdraft = newCombo(); st.sheet = 'cedit'; st.cAnim = true; return render();
    case 'combo-edit': { const c = comboById(d.cid); if (!c) return; st.cdraft = structuredClone(c); st.sheet = 'cedit'; st.cAnim = true; return render(); }
    case 'combo-cancel': st.cdraft = null; st.sheet = null; return render();
    case 'combo-save': return comboSave();
    case 'combo-del': if (confirm('Kombi löschen? Der Verlauf bleibt erhalten.')) { const id = st.cdraft.id; st.combos = st.combos.filter(x => x.id !== id); saveCombos();
      const gone = st.week.entries.filter(e => e.workoutId === id).map(e => e.id); if (gone.length) { st.week.entries = st.week.entries.filter(e => !gone.includes(e.id)); st.week.removed.push(...gone); saveWeek(); }
      st.cdraft = null; st.sheet = null; toast('Kombi gelöscht'); render(); } return;
    case 'cstep-ex': { const c = st.cdraft, x = c.steps[+d.ci], n = $('#c-name'); if (n) c.name = n.value; if (x.exercise !== d.cex) { x.exercise = d.cex; x.reps = E.comboReps(maxOf(d.cex)?.v); } return render(); }
    case 'cstep-add': { const c = st.cdraft, n = $('#c-name'); if (n) c.name = n.value; if (c.steps.length >= E.COMBO_MAX_STEPS) return;
      const used = c.steps.map(x => x.exercise), ex = E.EXERCISES.find(e => !used.includes(e)) || E.EXERCISES[0];
      c.steps.push({ exercise: ex, reps: E.comboReps(maxOf(ex)?.v), restSec: c.steps.at(-1).restSec }); return render(); }
    case 'cstep-del': { const c = st.cdraft, n = $('#c-name'); if (n) c.name = n.value; if (c.steps.length > E.COMBO_MIN_STEPS) c.steps.splice(+d.ci, 1); return render(); }
    case 'cstep-up': { const c = st.cdraft, i = +d.ci, n = $('#c-name'); if (n) c.name = n.value; if (i > 0) [c.steps[i - 1], c.steps[i]] = [c.steps[i], c.steps[i - 1]]; return render(); }
    case 'cmode': { const c = st.cdraft, l = +d.clim, n = $('#c-name'); if (n) c.name = n.value; if (l) { c.mode = 'time'; c.limitMin = l; } else c.mode = 'rounds'; return render(); }
    case 'combo-start': return comboStart(d.cid);
    case 'crec-wait': st.sheet = null; st.crec = null; return render();
    case 'crec-force': return comboStart(st.crec, true);
    case 'wadd': weekAdd(+d.day); return render();
    case 'wdel': { const id = b.closest('[data-eid]').dataset.eid; st.week.entries = st.week.entries.filter(e => e.id !== id); st.week.removed.push(id); saveWeek(); return render(); }
    case 'wtpl': st.week = W.applyTemplate(st.week, d.k, resolveEx); saveWeek(); toast(`Vorlage „${W.PLAN_TEMPLATES[d.k].name}“ übernommen`); return render();
    case 'wclear': st.week.removed.push(...st.week.entries.map(e => e.id)); st.week.entries = []; saveWeek(); return render();
    case 'wcopy': st.wcopy = { from: +d.day, to: [] }; st.sheet = 'wcopy'; return render();
    case 'wto-all': st.wcopy.to = [0, 1, 2, 3, 4, 5, 6].filter(x => x !== st.wcopy.from); return render();
    case 'wto-week': st.wcopy.to = [0, 1, 2, 3, 4].filter(x => x !== st.wcopy.from); return render();
    case 'wcopy-ok': st.week = W.copyDay(st.week, st.wcopy.from, st.wcopy.to); saveWeek(); toast(`${W.DAYS_LONG[st.wcopy.from]} auf ${st.wcopy.to.length} ${st.wcopy.to.length === 1 ? 'Tag' : 'Tage'} kopiert`); st.sheet = null; st.wcopy = null; return render();
    case 'wcopy-cancel': st.sheet = null; st.wcopy = null; return render();
    case 'ics': return exportIcs();
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
    case 'fitness': return openAssess(null, d.then || 'more');
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
    case 'delw': if (confirm('Workout löschen? Der Verlauf bleibt erhalten.')) { st.workouts = st.workouts.filter(x => x.id !== st.draft.id); store.saveWorkouts(st.workouts);
      const gone = st.week.entries.filter(e => e.workoutId === st.draft.id).map(e => e.id); if (gone.length) { st.week.entries = st.week.entries.filter(e => !gone.includes(e.id)); st.week.removed.push(...gone); saveWeek(); }
      go('home'); } return;
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
    case 'wipe': if (confirm('Alle Workouts und den gesamten Verlauf löschen?')) { store.wipe(); st.workouts = store.workouts(); st.history = []; st.combos = []; st.maxes = {}; st.tunes = {}; st.settings = store.settings(); st.week = W.normalizePlan(null); applySettings(); toast('Gelöscht'); render(); } return;
    case 'install': st.installEvt?.prompt(); st.installEvt = null; return render();
    case 'sw-check': return checkUpdate(true);
  }
});
app.addEventListener('input', e => {
  if (e.target.id === 'a-num') { st.assess.val = Math.max(0, Math.min(999, Math.round(+e.target.value || 0))); return updateAssessInput(); }
  if (e.target.id === 'f-lim') { st.draft.limitMin = +e.target.value; reauto(); const n = $('#f-name'); if (n) st.draft.name = n.value; const ex = $('#f-ex'); if (ex) st.draft.exercise = ex.value; render(); $('#f-lim')?.focus(); }
  if (e.target.id === 'f-ex') st.draft.exercise = e.target.value;
  if (e.target.id === 'f-name') st.draft.name = e.target.value;
  if (e.target.id === 'c-name' && st.cdraft) st.cdraft.name = e.target.value;
});
app.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'f-auto') { st.draft.auto.enabled = t.checked; reauto(); return render(); }
  if (t.id === 'f-adapt') { st.draft.adapt.enabled = t.checked; return render(); }
  if (t.classList.contains('wtime') || t.classList.contains('wsel')) {
    const e = st.week.entries.find(x => x.id === t.closest('[data-eid]').dataset.eid); if (!e) return;
    if (t.classList.contains('wtime')) { if (!W.validTime(t.value)) return render(); e.time = t.value; } else e.workoutId = t.value;
    saveWeek(); return render();
  }
  if (t.dataset.wset) { st.week[t.dataset.wset] = t.checked; saveWeek(); return render(); }
  if (t.dataset.set) { st.settings[t.dataset.set] = t.checked; store.saveSettings(st.settings); applySettings(); if (t.dataset.set === 'recNotify') render(); return; }
  if (t.id === 'f-import' && t.files[0]) {
    try { const r = store.importAll(JSON.parse(await t.files[0].text())); st.workouts = store.workouts(); st.history = store.history(); st.maxes = store.maxes(); st.tunes = store.tunes(); st.settings = store.settings(); st.week = W.normalizePlan(store.plan()); st.combos = store.combos(); applySettings();
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
FX.setPref(st.settings.anim || 'on'); FX.initGlow(); st.fxReveal = true;
const needSetup = () => !st.settings.setupDone && !Object.values(st.maxes).some(l => l && l.length);

// Laufendes Training nach Neuladen fortsetzen
const active = store.active();
if (active && active.status !== 'done' && now() < active.endsAt + 30 * 60000) { st.session = active; st.adj = active.target; if (active.status === 'partial') { st.sheet = 'partial'; st.partialVal = active.target; } go('train'); A.keepAwake(true); }
else {
  store.saveActive(null);
  const dl = new URLSearchParams(location.search).get('w'); // Link aus Kalender/Benachrichtigung
  if (dl) history.replaceState(null, '', location.pathname);
  if (needSetup()) openAssess(null, 'home', { setup: true });
  else if (dl && workoutById(dl)) openPlan(workoutById(dl));
  else { render(); if (dl && comboById(dl)) $(`.ccard[data-cid="${CSS.escape(dl)}"]`)?.scrollIntoView({ block: 'center' }); }
}

// v1.6.1 Updates: neuer Service Worker übernimmt sofort (skipWaiting + clients.claim). Danach automatisch neu laden,
// außer während Training/Test/Bearbeiten – dort Hinweis „Neue Version verfügbar – neu laden“. Beim Zurückkehren in die
// App (auch iOS-Home-Bildschirm, der die Seite im Speicher hält) wird nach Updates gesucht.
const swOk = 'serviceWorker' in navigator && location.protocol !== 'file:';
let swReg = null, swReloading = false;
const busy = () => ['train', 'assess', 'edit', 'plan'].includes(st.view) || !!st.session;
function updateBanner() {
  if (document.querySelector('.updbar')) return;
  const b = document.createElement('div'); b.className = 'updbar'; b.setAttribute('role', 'status');
  b.innerHTML = '<span>Neue Version verfügbar</span><button class="btn primary sm" data-upd="reload">Neu laden</button>';
  b.querySelector('button').addEventListener('click', () => { swReloading = true; location.reload(); });
  document.body.appendChild(b);
}
function onNewVersion() { if (swReloading) return; if (busy()) updateBanner(); else { swReloading = true; location.reload(); } }
async function checkUpdate(manual) {
  if (!swReg) { if (manual) toast('Service Worker nicht aktiv'); return; }
  try { await swReg.update(); } catch { if (manual) toast('Keine Verbindung'); return; }
  if (manual && !swReg.installing && !swReg.waiting) toast(`Aktuell: ${VERSION}`);
}
st.checkUpdate = checkUpdate;
if (swOk) {
  const hadCtrl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(r => { swReg = r; }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtrl) onNewVersion(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(false); });
  window.addEventListener('pageshow', e => { if (e.persisted) checkUpdate(false); });
}
