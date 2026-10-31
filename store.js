// Lokale Speicherung (localStorage). Kein Server.
import { TEMPLATES, normalizeWorkout } from './engine.js?v=ca63cfe1';
const NAMES = { w: 'workouts', h: 'history', s: 'settings', a: 'active', m: 'maxes', t: 'tunes', p: 'plan' };
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

export const DEFAULT_SETTINGS = { anim: 'on', sound: true, voice: true, vibrate: true, wake: true, leadIn: 5, exSel: 'Liegestütze', asked: [], setupDone: false, planVer: 0,
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
  savePlan(p) { write(K.p, p); },
  active() { return read(K.a, null); },
  saveActive(a) { if (a) write(K.a, a); else localStorage.removeItem(K.a); },
  restoreTemplates() {
    const list = this.workouts();
    for (const t of TEMPLATES) { const i = list.findIndex(x => x.id === t.id); if (i >= 0) list[i] = structuredClone(t); else list.push(structuredClone(t)); }
    this.saveWorkouts(list); return list;
  },
  exportAll() { return { app: 'EDT Timer', format: 1, exportedAt: new Date().toISOString(), workouts: this.workouts(), history: this.history(), maxes: this.maxes(), tunes: this.tunes(), settings: this.settings(), plan: this.plan() }; },
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
    if (data.settings) this.saveSettings({ ...this.settings(), ...data.settings });
    return { workouts: nw, sessions: nh };
  },
  wipe() { Object.values(NAMES).forEach(n => { localStorage.removeItem('edt.' + n); localStorage.removeItem('repzeit.' + n); }); localStorage.removeItem('edt.migrated'); },
};
