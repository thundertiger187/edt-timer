// Wochenplan: Einträge je Wochentag, Abstandsprüfung gegen die Erholung, Erledigt-Abgleich, Kalender-Export (.ics).
import { musclesOf, overlaps, RECOVERY_DEFAULTS } from './engine.js';

export const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const DAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const emptyPlan = () => ({ entries: [], alarmBefore: 10, remind: false, removed: [], exported: [], seq: 0, exportedSig: null, exportedAt: null });
/** Wochentag 0 = Montag … 6 = Sonntag (lokale Zeit) */
export const dayIdx = d => (d.getDay() + 6) % 7;
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
export const validTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t));
let n = 0;
export const newId = () => 'p' + Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 5);

export function normalizePlan(p) {
  const b = { ...emptyPlan(), ...(p || {}) };
  b.entries = (Array.isArray(b.entries) ? b.entries : []).filter(e => e && Number.isInteger(e.day) && e.day >= 0 && e.day < 7 && validTime(e.time) && e.workoutId)
    .map(e => ({ id: String(e.id || newId()), day: e.day, time: e.time, workoutId: String(e.workoutId) }));
  b.alarmBefore = [0, 5, 10, 15, 30, 60].includes(b.alarmBefore) ? b.alarmBefore : 10;
  b.removed = Array.isArray(b.removed) ? b.removed.filter(x => typeof x === 'string') : [];
  b.exported = Array.isArray(b.exported) ? b.exported.filter(x => typeof x === 'string') : [];
  b.seq = Number.isInteger(b.seq) ? b.seq : 0;
  return b;
}
export const sortEntries = list => [...list].sort((a, b) => a.day - b.day || toMin(a.time) - toMin(b.time));
export const entriesOn = (plan, day) => sortEntries(plan.entries.filter(e => e.day === day));

/**
 * Vorlagen. resolve(exercise) → workoutId (oder null, dann wird der Eintrag ausgelassen).
 * 'daily3': täglich 08:00 Liegestütze, 13:00 Kniebeugen, 19:00 Klimmzüge; 'mwf3': dasselbe Mo/Mi/Fr.
 */
export const PLAN_TEMPLATES = {
  daily3: { name: 'Täglich 3×', days: [0, 1, 2, 3, 4, 5, 6] },
  mwf3: { name: 'Mo/Mi/Fr 3×', days: [0, 2, 4] },
};
export const TEMPLATE_SLOTS = [['08:00', 'Liegestütze'], ['13:00', 'Kniebeugen'], ['19:00', 'Klimmzüge']];
export function applyTemplate(plan, key, resolve) {
  const t = PLAN_TEMPLATES[key]; if (!t) return plan;
  const removed = plan.entries.map(e => e.id);
  const entries = [];
  for (const day of t.days) for (const [time, ex] of TEMPLATE_SLOTS) { const w = resolve(ex); if (w) entries.push({ id: newId(), day, time, workoutId: w }); }
  return { ...plan, entries, removed: [...new Set([...plan.removed, ...removed])] };
}
/** Tag `from` auf die Tage `to` kopieren (Ziel-Einträge werden ersetzt). */
export function copyDay(plan, from, to) {
  const src = entriesOn(plan, from), targets = to.filter(d => d !== from);
  const gone = plan.entries.filter(e => targets.includes(e.day)).map(e => e.id);
  const keep = plan.entries.filter(e => !targets.includes(e.day));
  const add = targets.flatMap(day => src.map(e => ({ id: newId(), day, time: e.time, workoutId: e.workoutId })));
  return { ...plan, entries: sortEntries([...keep, ...add]), removed: [...new Set([...plan.removed, ...gone])] };
}

/**
 * Einträge desselben Tages mit gleicher/überlappender Muskelgruppe und zu kleinem Abstand.
 * Abstand = Start zu Start minus Dauer der ersten Einheit (also Ende → Start). info(workoutId) → { exercise, muscle, limitMin }.
 */
/** Muskeln eines Plan-Eintrags: Einzel-Workout über Übung/Muskelgruppe, Kombi (v1.7.0, info.exercises) über alle Übungen. */
export function musclesOfInfo(i) {
  if (!i) return { name: '', muscles: [] };
  if (Array.isArray(i.exercises) && i.exercises.length) {
    const ms = i.exercises.map((e, k) => musclesOf(e, i.muscles?.[k]));
    return { name: [...new Set(ms.map(m => m.name))].join(' + '), muscles: [...new Set(ms.flatMap(m => m.muscles))] };
  }
  return musclesOf(i.exercise, i.muscle);
}
export function planConflicts(plan, info, rec = RECOVERY_DEFAULTS) {
  const need = rec.betweenEdt ?? RECOVERY_DEFAULTS.betweenEdt, out = [];
  for (let d = 0; d < 7; d++) {
    const list = entriesOn(plan, d);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], ia = info(a.workoutId), ib = info(b.workoutId);
      if (!ia || !ib) continue;
      const ma = musclesOfInfo(ia), mb = musclesOfInfo(ib);
      if (!overlaps(ma, mb)) continue;
      const gap = toMin(b.time) - toMin(a.time) - (ia.limitMin || 0);
      const group = ia.exercises || ib.exercises ? [...new Set([ma, mb].flatMap(m => m.muscles))].filter(x => ma.muscles.includes(x) && mb.muscles.includes(x)).join('/') : ma.name;
      if (gap < need) out.push({ day: d, a: a.id, b: b.id, gapMin: gap, needMin: need, group });
    }
  }
  return out;
}

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/**
 * Erledigt-Abgleich für einen Tag: jede Einheit (total > 0) hakt den frühesten offenen Eintrag derselben Übung ab
 * (gleiches Workout bevorzugt). Rückgabe: Set der erledigten Eintrags-IDs.
 */
export function doneOn(plan, history, date, info) {
  const day = dayIdx(date), key = ymd(date), list = entriesOn(plan, day), done = new Set();
  const sessions = history.filter(h => h.total > 0 && ymd(new Date(h.date)) === key).sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sessions) {
    const open = list.filter(e => !done.has(e.id));
    const hit = open.find(e => e.workoutId === s.workoutId) || open.find(e => info(e.workoutId)?.exercise === s.exercise);
    if (hit) done.add(hit.id);
  }
  return done;
}
/** Montag der Woche von `date` (00:00 lokal). */
export function weekStart(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - dayIdx(d)); return d; }
/** Wochenübersicht: je Tag { date, total, done, past, today }. */
export function weekStatus(plan, history, now, info) {
  const mon = weekStart(now), today = ymd(now);
  return DAYS.map((_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const total = entriesOn(plan, i).length, done = total ? doneOn(plan, history, d, info).size : 0;
    return { day: i, date: d, total, done, today: ymd(d) === today, past: ymd(d) < today };
  });
}
/** Nächster offener Eintrag heute (ab jetzt, sonst der früheste offene, z. B. verpasst). */
export function nextToday(plan, history, now, info) {
  const list = entriesOn(plan, dayIdx(now)), done = doneOn(plan, history, now, info), mins = now.getHours() * 60 + now.getMinutes();
  const open = list.filter(e => !done.has(e.id));
  return open.find(e => toMin(e.time) >= mins - 30) || open[0] || null;
}

/** Signatur des Plans für „seit Export geändert“. */
export const planSig = p => JSON.stringify([sortEntries(p.entries).map(e => [e.id, e.day, e.time, e.workoutId]), p.alarmBefore]);

// ---------- iCalendar (RFC 5545) ----------
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Zeilen auf 75 Oktette falten (UTF-8, ohne Multibyte-Zeichen zu zerschneiden). */
export function fold(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', len = 0, limit = 75;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (len + l > limit) { out.push(cur); cur = ''; len = 0; limit = 74; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'X-LIC-LOCATION:Europe/Berlin',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];
const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const local = (d, time) => `${ymd(d).replace(/-/g, '')}T${time.replace(':', '')}00`;
/** Erstes Datum ≥ heute mit Wochentag `day`. */
export function firstDate(now, day) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((day - dayIdx(d) + 7) % 7)); return d; }
export const uidOf = id => `edt-${id}@edt-timer`;

/**
 * .ics mit einem wöchentlich wiederkehrenden Termin pro Eintrag.
 * opts: { info(workoutId) → { name, exercise, limitMin }, url, now: Date, alarmBefore (min, 0 = nur zur Startzeit), seq }
 * Gleiche UID pro Eintrag, SEQUENCE steigt mit jedem Export → Re-Import aktualisiert statt dupliziert.
 * Entfernte Einträge (plan.removed) werden als STATUS:CANCELLED ausgegeben.
 */
export function buildIcs(plan, { info, url, now = new Date(), alarmBefore = plan.alarmBefore, seq = plan.seq || 0 }) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EDT Timer//Wochenplan//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:EDT Timer', 'X-WR-TIMEZONE:Europe/Berlin', ...VTZ];
  const ds = stamp(now);
  for (const e of sortEntries(plan.entries)) {
    const w = info(e.workoutId); if (!w) continue;
    const link = `${url}?w=${encodeURIComponent(e.workoutId)}`, start = firstDate(now, e.day);
    const title = `EDT ${w.exercise} · ${w.limitMin} min`;
    L.push('BEGIN:VEVENT', `UID:${uidOf(e.id)}`, `SEQUENCE:${seq}`, `DTSTAMP:${ds}`,
      `DTSTART;TZID=Europe/Berlin:${local(start, e.time)}`, `DURATION:PT${w.limitMin + 5}M`, `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[e.day]}`,
      `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(`${w.name}\nIn der App starten: ${link}`)}`, `URL:${link}`, 'CATEGORIES:EDT Timer', 'TRANSP:OPAQUE',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:PT0M', 'END:VALARM');
    if (alarmBefore > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`In ${alarmBefore} min: ${title}`)}`, `TRIGGER:-PT${alarmBefore}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  for (const id of plan.removed || []) {
    if (plan.entries.some(e => e.id === id)) continue;
    L.push('BEGIN:VEVENT', `UID:${uidOf(id)}`, `SEQUENCE:${seq}`, `DTSTAMP:${ds}`, `DTSTART;TZID=Europe/Berlin:${local(firstDate(now, 0), '00:00')}`, 'DURATION:PT1M', 'STATUS:CANCELLED', 'SUMMARY:EDT (entfernt)', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
