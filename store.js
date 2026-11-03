// Lokale Speicherung (localStorage). Kein Server.
import { TEMPLATES, normalizeWorkout, normalizeCombo, EXERCISES, NEW_EXERCISES_180, mergeCustomExercises, renameExercises, baseRenames, normalizeCustomEx } from './engine.js?v=f87084c0';
const NAMES = { w: 'workouts', h: 'history', s: 'settings', a: 'active', m: 'maxes', t: 'tunes', p: 'plan', c: 'combos', x: 'exercises' };
const K = Object.fromEntries(Object.entries(NAMES).map(([k, n]) => [k, 'edt.' + n]));
/** Umbenennung RepZeit → EDT Timer: alte Schlüssel repzeit.* (gleiche Origin) einmalig nach edt.* kopieren.
 *  Die alten Einträge bleiben als Sicherung stehen. Gibt zurück, welche Schlüssel übernommen wurden. */
export function migrateLegacy(ls = localStorage) {
  const moved = [];
  try {
    for (const n of Object.values(NAMES)) {
      const old = ls.getItem('repzeit.' + n);
      if (old != null && ls.getItem('edt.' + n) == null) { ls.setItem('edt.' + n, old); moved.push(n); }
    }
    if (moved.length) ls.setItem('edt.migrated', JSON.stringify({ from: 'repzeit', keys: moved, at: new Date().toISOString() }));
  } catch { /* Speicher nicht verfügbar */ }
  return moved;
}
export const migrated = typeof localStorage !== 'undefined' ? migrateLegacy() : [];
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const DEFAULT_SETTINGS = { anim: 'on', sound: true, voice: true, vibrate: true, wake: true, leadIn: 5, exSel: 'Liegestütze', asked: [], setupDone: false, planVer: 0, exVer: 0,
  recAfterTest: 10, recEdt: 10, recTests: 10, recNotify: true, recWatch: null, dayTipSeen: false };

export const store = {
  workouts() { const w = read(K.w, null); if (!w) { write(K.w, TEMPLATES); return structuredClone(TEMPLATES); } return w.map(normalizeWorkout); },
  saveWorkouts(list) { write(K.w, list); },
  history() { return read(K.h, []); },
  saveHistory(list) { write(K.h, list); },
  settings() { return { ...DEFAULT_SETTINGS, ...read(K.s, {}) }; },
  saveSettings(s) { write(K.s, s); },
  maxes() { return read(K.m, {}); },
  latestMax(ex) { const l = this.maxes()[ex]; return l && l.length ? l[l.length - 1] : null; },
  addMax(ex, v, source, durMs) { const m = this.maxes(); (m[ex] ||= []).push({ v, date: new Date().toISOString(), source, ...(durMs ? { durMs } : {}) }); write(K.m, m); return m; },
  // Phasen-Anpassung pro Übung für die nächste Einheit: { [Übung]: { phases, max, date, source: 'auto'|'manuell', text } }
  tunes() { return read(K.t, {}); },
  tuneOf(ex) { return this.tunes()[ex] || null; },
  setTune(ex, t) { const all = this.tunes(); if (t) all[ex] = t; else delete all[ex]; write(K.t, all); return all; },
  // Wochenplan { entries: [{ id, day 0=Mo…6=So, time 'HH:MM', workoutId }], alarmBefore, remind, removed, seq, exportedSig, exportedAt }
  plan() { return read(K.p, null); },
  // v1.7.0 Kombi-Training: [{ id, name, steps: [{ exercise, reps, restSec }], mode: 'time'|'rounds', limitMin, rounds }]
  combos() { const l = read(K.c, []); return Array.isArray(l) ? l.filter(Boolean).map(normalizeCombo) : []; },
  saveCombos(list) { write(K.c, list); },
  savePlan(p) { write(K.p, p); },
  active() { return read(K.a, null); },
  saveActive(a) { if (a) write(K.a, a); else localStorage.removeItem(K.a); },
  // v1.8.0 eigene Übungen: [{ id, name, muscle }] (Grundübungen stehen in engine.EXERCISES)
  exercises() { const l = read(K.x, []); return Array.isArray(l) ? l.filter(Boolean).map(normalizeCustomEx) : []; },
  saveExercises(list) { write(K.x, list); },
  /** Alle Übungsnamen umbenennen (Workouts, Verlauf, Maxima, Anpassungen, Kombis). Gibt die Zahl geänderter Einträge zurück. */
  renameAll(rename) {
    const r = renameExercises({ workouts: this.workouts(), history: this.history(), maxes: this.maxes(), tunes: this.tunes(), combos: this.combos() }, rename);
    if (r.changed) { write(K.w, r.workouts); write(K.h, r.history); write(K.m, r.maxes); write(K.t, r.tunes); write(K.c, r.combos); }
    return r.changed;
  },
  /**
   * Eigene Übungen abgleichen: Namen, die einer neuen Grundübung entsprechen („Situps“, „Glute Bridge“), werden zur Grundübung;
   * eigene Übungen, die nur in Workouts/Kombis stehen, kommen in die Liste. Selbstheilend, läuft bei jedem Start und nach Import.
   */
  healExercises() {
    const names = new Set();
    for (const w of this.workouts()) names.add(w.exercise);
    for (const h of this.history()) { if (h?.exercise) names.add(h.exercise); for (const e of h?.exercises || []) names.add(e); }
    for (const k of Object.keys(this.maxes())) names.add(k);
    for (const k of Object.keys(this.tunes())) names.add(k);
    for (const c of this.combos()) for (const x of c.steps) names.add(x.exercise);
    for (const x of this.exercises()) names.add(x.name);
    const ren = baseRenames([...names].filter(n => n && !EXERCISES.includes(n)));
    const changed = this.renameAll(ren);
    const prev = this.exercises(), list = mergeCustomExercises(prev, this.workouts(), this.combos());
    if (JSON.stringify(list) !== JSON.stringify(prev)) write(K.x, list);
    return { renamed: Object.keys(ren), changed, list };
  },
  /** v1.8.0 Upgrade (einmalig): Sicherung aller edt.*-Daten, neue Vorlagen ergänzen. */
  upgrade180() {
    const s = this.settings();
    if ((s.exVer || 0) >= 1) return null;
    const had = localStorage.getItem(K.w) != null;
    if (had && localStorage.getItem('edt.backup-1.8.0') == null) {
      const b = {}; for (const k of Object.values(K)) { const v = localStorage.getItem(k); if (v != null) b[k] = v; }
      try { localStorage.setItem('edt.backup-1.8.0', JSON.stringify({ at: new Date().toISOString(), data: b })); } catch { /* voll: weiter ohne Sicherung */ }
    }
    const list = this.workouts(); let added = 0;
    if (had) for (const t of TEMPLATES) if (NEW_EXERCISES_180.includes(t.exercise) && !list.some(w => w.id === t.id)) { list.push(structuredClone(t)); added++; }
    if (added) this.saveWorkouts(list);
    this.saveSettings({ ...this.settings(), exVer: 1 });
    return { added };
  },
  restoreTemplates() {
    const list = this.workouts();
    for (const t of TEMPLATES) { const i = list.findIndex(x => x.id === t.id); if (i >= 0) list[i] = structuredClone(t); else list.push(structuredClone(t)); }
    this.saveWorkouts(list); return list;
  },
  exportAll() { return { app: 'EDT Timer', format: 1, exportedAt: new Date().toISOString(), workouts: this.workouts(), history: this.history(), maxes: this.maxes(), tunes: this.tunes(), settings: this.settings(), plan: this.plan(), combos: this.combos(), exercises: this.exercises() }; },
  importAll(data) {
    if (!data || !['EDT Timer', 'RepZeit'].includes(data.app) || !Array.isArray(data.workouts) || !Array.isArray(data.history)) throw new Error('Keine gültige EDT-Timer-Datei.');
    const w = this.workouts(), h = this.history();
    let nw = 0, nh = 0;
    for (const x of data.workouts.map(normalizeWorkout)) { const i = w.findIndex(y => y.id === x.id); if (i >= 0) w[i] = x; else { w.push(x); nw++; } }
    const ids = new Set(h.map(x => x.id));
    for (const x of data.history) if (x && x.id && Array.isArray(x.sets) && !ids.has(x.id)) { h.push(x); nh++; }
    h.sort((a, b) => a.date.localeCompare(b.date));
    this.saveWorkouts(w); this.saveHistory(h);
    if (data.maxes && typeof data.maxes === 'object') {
      const m = this.maxes();
      for (const [ex, list] of Object.entries(data.maxes)) if (Array.isArray(list)) {
        const have = new Set((m[ex] ||= []).map(x => x.date));
        for (const x of list) if (x && Number.isFinite(x.v) && x.date && !have.has(x.date)) m[ex].push(x);
        m[ex].sort((a, b) => a.date.localeCompare(b.date));
      }
      write(K.m, m);
    }
    if (data.tunes && typeof data.tunes === 'object') write(K.t, { ...this.tunes(), ...data.tunes });
    if (data.plan && Array.isArray(data.plan.entries)) write(K.p, data.plan);
    if (Array.isArray(data.combos)) { const c = this.combos(); for (const x of data.combos.filter(Boolean).map(normalizeCombo)) { const i = c.findIndex(y => y.id === x.id); if (i >= 0) c[i] = x; else c.push(x); } write(K.c, c); }
    if (Array.isArray(data.exercises)) write(K.x, mergeCustomExercises([...this.exercises(), ...data.exercises]));
    if (data.settings) this.saveSettings({ ...this.settings(), ...data.settings, exVer: this.settings().exVer });
    return { workouts: nw, sessions: nh };
  },
  wipe() { Object.values(NAMES).forEach(n => { localStorage.removeItem('edt.' + n); localStorage.removeItem('repzeit.' + n); }); localStorage.removeItem('edt.migrated'); localStorage.removeItem('edt.backup-1.8.0'); },
};
