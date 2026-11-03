// Strichmännchen-Animationen (inline-SVG, ohne Bibliotheken).
// Gelenke werden per Vorwärts-/Inverskinematik mit festen Segmentlängen berechnet,
// damit Glieder bei der Interpolation zwischen Start- und Endposition nicht strecken oder verdrehen.
const SEG = { ua: 16, fa: 15, th: 20, sh: 19, to: 30, head: 5.5, neck: 10.5 };
const P = (x, y) => ({ x, y });
const add = (a, l, ang) => P(a.x + l * Math.cos(ang), a.y + l * Math.sin(ang)); // ang im SVG-Koordinatensystem (y nach unten)
const lerp = (a, b, t) => a + (b - a) * t;
const UP = -Math.PI / 2, DOWN = Math.PI / 2;

/** Gelenk zwischen a und b (Längen l1, l2); pref = bevorzugte Richtung des Gelenks. */
export function ik(a, b, l1, l2, pref) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.min(l1 + l2 - 1e-6, Math.max(Math.abs(l1 - l2) + 1e-6, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx), off = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const c = [add(a, l1, base + off), add(a, l1, base - off)];
  const score = j => (j.x - a.x) * pref.x + (j.y - a.y) * pref.y;
  return score(c[0]) >= score(c[1]) ? c[0] : c[1];
}

// p = 0 Startposition, p = 1 Endposition
const POSES = {
  // Seitansicht, Blick nach rechts. Füße und Hände fest am Boden, Körper gerade (Drehung um die Füße).
  'Liegestütze': p => {
    const floor = 88, ft = P(14, floor - 2), hand = P(76, floor);
    const ang = -lerp(24.5, 6.5, p) * Math.PI / 180; // Körperneigung
    const kn = add(ft, SEG.sh, ang), hip = add(kn, SEG.th, ang), sh = add(hip, SEG.to, ang);
    const el = ik(sh, hand, SEG.ua, SEG.fa, P(-0.6, -1)); // Ellbogen nach hinten/oben
    const head = add(sh, SEG.neck, ang - 0.12);
    return { head, sh, el, ha: hand, hip, kn, ft, toe: P(ft.x + 3, floor), scene: `<line x1="2" y1="${floor + 1}" x2="118" y2="${floor + 1}"/>` };
  },
  // Seitansicht: Fersen fest, Hüfte nach hinten, Oberschenkel ~parallel, Oberkörper neigt sich, Arme nach vorn
  'Kniebeugen': p => {
    const floor = 92, ft = P(58, floor - 2);
    const a = lerp(0.03, 0.62, p), f = lerp(0.02, 1.5, p), s = lerp(0.04, 0.78, p), arm = lerp(0.25, 1.45, p);
    const kn = P(ft.x + SEG.sh * Math.sin(a), ft.y - SEG.sh * Math.cos(a));
    const hip = P(kn.x - SEG.th * Math.sin(f), kn.y - SEG.th * Math.cos(f));
    const sh = P(hip.x + SEG.to * Math.sin(s), hip.y - SEG.to * Math.cos(s));
    const el = P(sh.x + SEG.ua * Math.sin(arm), sh.y + SEG.ua * Math.cos(arm));
    const ha = P(el.x + SEG.fa * Math.sin(arm + 0.05), el.y + SEG.fa * Math.cos(arm + 0.05));
    const head = P(sh.x + SEG.neck * Math.sin(s * 0.7), sh.y - SEG.neck * Math.cos(s * 0.7));
    return { head, sh, el, ha, hip, kn, ft, toe: P(ft.x + 10, floor), heel: P(ft.x - 3, floor), scene: `<line x1="2" y1="${floor + 1}" x2="118" y2="${floor + 1}"/>` };
  },
  // Barren (oder zwei Stühle): Hände fest auf dem Holm, aufrecht, unten Oberarm ~parallel zum Boden
  'Dips': p => {
    const bar = 50, ha = P(62, bar);
    const sh = P(lerp(61, 64, p), lerp(bar - SEG.ua - SEG.fa + 1.5, bar - 9, p));
    const el = ik(sh, ha, SEG.ua, SEG.fa, P(-1, 0.15)); // Ellbogen nach hinten
    const t = lerp(0.1, 0.32, p); // leichte Vorlage
    const hip = P(sh.x - SEG.to * Math.sin(t), sh.y + SEG.to * Math.cos(t));
    const kn = add(hip, SEG.th, DOWN - 0.25 - 0.2 * p);
    const ft = add(kn, SEG.sh, DOWN + 1.15);
    const head = P(sh.x + SEG.neck * Math.sin(t * 0.6), sh.y - SEG.neck * Math.cos(t * 0.6));
    return { head, sh, el, ha, hip, kn, ft, scene: `<line x1="34" y1="${bar}" x2="92" y2="${bar}"/><line x1="40" y1="${bar}" x2="40" y2="99"/><line x1="86" y1="${bar}" x2="86" y2="99"/>` };
  },
  // Stange: aus voller Streckung, bis das Kinn über der Stange ist
  'Klimmzüge': p => {
    const bar = 14, ha = P(60, bar);
    const sh = P(lerp(59, 52, p), lerp(bar + SEG.ua + SEG.fa - 0.8, bar + 1, p));
    const el = ik(sh, ha, SEG.ua, SEG.fa, P(1, 0.9)); // Ellbogen nach vorn/unten
    const t = lerp(0.03, 0.3, p); // Körper leicht schräg
    const hip = P(sh.x - SEG.to * Math.sin(t), sh.y + SEG.to * Math.cos(t));
    const kn = add(hip, SEG.th, DOWN - lerp(0.05, 0.35, p));
    const ft = add(kn, SEG.sh, DOWN + lerp(0.15, 0.75, p));
    const head = P(sh.x + SEG.neck * Math.sin(0.35 * p + 0.05), sh.y - SEG.neck * Math.cos(0.35 * p + 0.05));
    return { head, sh, el, ha, hip, kn, ft, vb: '0 0 120 118', scene: `<line x1="22" y1="${bar}" x2="98" y2="${bar}"/><line x1="22" y1="${bar}" x2="22" y2="4"/><line x1="98" y1="${bar}" x2="98" y2="4"/>` };
  },
  // v1.8.0 Ausfallschritte (Seitansicht, Schrittstellung): beide Füße fest, Hüfte senkt sich senkrecht,
  // vorderes Knie über dem Fuß, hinteres Knie Richtung Boden. Zweites Bein (leg2) = hinteres Bein.
  'Ausfallschritte': p => {
    const floor = 90, ft = P(80, floor - 2), ft2 = P(36, floor - 4);
    const hip = P(lerp(58, 56, p), lerp(56, 69, p));
    const kn = ik(hip, ft, SEG.th, SEG.sh, P(1, -0.4)), kn2 = ik(hip, ft2, SEG.th, SEG.sh, P(0.35, 1));
    const sh = add(hip, SEG.to, -Math.PI / 2 + 0.05); // Oberkörper aufrecht
    const el = add(sh, SEG.ua, Math.PI / 2 + 0.08), ha = add(el, SEG.fa, Math.PI / 2 - 0.1); // Arme hängen seitlich
    const head = P(sh.x + 1, sh.y - SEG.neck);
    return { head, sh, el, ha, hip, kn, ft, toe: P(ft.x + 7, floor), hip2: hip, kn2, ft2, toe2: P(ft2.x - 5, floor), scene: `<line x1="2" y1="${floor + 1}" x2="118" y2="${floor + 1}"/>` };
  },
  // Beckenheben (Glute Bridge): Rückenlage, Schultern und Füße fest am Boden, Hüfte hebt sich bis Schulter–Hüfte–Knie eine Linie bilden
  'Beckenheben': p => {
    const floor = 90, sh = P(30, floor - 4.5), ft = P(88, floor - 2.5);
    const a = -lerp(0.02, 0.5, p); // Oberkörper dreht um die Schultern
    const hip = add(sh, SEG.to, a);
    const kn = ik(hip, ft, SEG.th, SEG.sh, P(0, -1));
    const head = P(sh.x - SEG.neck, floor - SEG.head - 0.5);
    const el = add(sh, SEG.ua, 0.12), ha = add(el, SEG.fa, 0.02); // Arme flach neben dem Körper
    return { head, sh, el, ha, hip, kn, ft, toe: P(ft.x + 7, floor), scene: `<line x1="2" y1="${floor + 1}" x2="118" y2="${floor + 1}"/>` };
  },
  // Superman: Bauchlage, Arme nach vorn gestreckt; Arme, Brust und Beine heben gleichzeitig ab, Hüfte bleibt am Boden
  'Superman': p => {
    const floor = 90, hip = P(46, floor - 4);
    const t = -lerp(0.02, 0.22, p), lg = lerp(0.02, 0.2, p), ar = t - lerp(0.12, 0.3, p);
    const sh = add(hip, SEG.to, t);
    const kn = add(hip, SEG.th, Math.PI + lg), ft = add(kn, SEG.sh, Math.PI + lg * 1.1);
    const el = add(sh, SEG.ua, ar - 0.25), ha = add(el, SEG.fa, ar - 0.1); // Arme über dem Kopf nach vorn
    const head = add(sh, SEG.neck - 1.5, t + 0.12); // Kopf in Verlängerung des Rumpfs, Blick zum Boden
    return { head, sh, el, ha, hip, kn, ft, scene: `<line x1="2" y1="${floor + 1}" x2="118" y2="${floor + 1}"/>` };
  },
  // Sit-ups: Rückenlage, Knie gebeugt, Füße fest; Oberkörper rollt aus der Rückenlage bis aufrecht, Arme nach vorn
  'Sit-ups': p => {
    const floor = 90, hip = P(62, floor - 4.5), ft = P(90, floor - 2.5);
    const t = Math.PI + lerp(0.03, 1.22, p); // π = flach nach links, π + π/2 = senkrecht
    const sh = add(hip, SEG.to, t);
    const kn = ik(hip, ft, SEG.th, SEG.sh, P(0, -1));
    const ar = lerp(-0.22, -0.08, p), el = add(sh, SEG.ua, ar), ha = add(el, SEG.fa, ar);
    const head = add(sh, SEG.neck, t + lerp(0.35, 0.25, p)); // Kinn zur Brust
    return { head, sh, el, ha, hip, kn, ft, toe: P(ft.x + 7, floor), scene: `<line x1="2" y1="${floor + 1}" x2="118" y2="${floor + 1}"/>` };
  },
};
export const FIGURES = Object.keys(POSES);
export const hasFigure = ex => !!POSES[ex];
export const poseOf = (ex, p) => POSES[ex](p);

const f1 = n => Math.round(n * 10) / 10;
const pts = (...a) => a.filter(Boolean).map(q => `${f1(q.x)},${f1(q.y)}`).join(' ');
function bodyParts(j) {
  return { arm: pts(j.sh, j.el, j.ha), leg: pts(j.hip, j.kn, j.ft, j.toe), leg2: j.kn2 ? pts(j.hip2 || j.hip, j.kn2, j.ft2, j.toe2) : '', heel: j.heel ? pts(j.heel, j.toe) : '', torso: pts(j.head && P(j.sh.x + (j.head.x - j.sh.x) * 0.45, j.sh.y + (j.head.y - j.sh.y) * 0.45), j.sh, j.hip) };
}
function bodySvg(j, cls = '') {
  const b = bodyParts(j);
  return `<g class="fbody ${cls}"><polyline data-k="torso" points="${b.torso}"/>${b.leg2 ? `<polyline data-k="leg2" class="back" points="${b.leg2}"/>` : ''}<polyline data-k="leg" points="${b.leg}"/>${b.heel ? `<polyline data-k="heel" points="${b.heel}"/>` : ''}<polyline data-k="arm" points="${b.arm}"/><circle data-k="head" cx="${f1(j.head.x)}" cy="${f1(j.head.y)}" r="${SEG.head}"/></g>`;
}
// v1.6.1: Bewegungsstufe aus html[data-motion] (Einstellung „Animationen“); ohne Angabe System folgen
const reduced = () => { const m = typeof document !== 'undefined' && document.documentElement?.dataset?.motion; return m ? m !== 'full' : typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; };
const NEUTRAL = `<g class="fbody neutral"><rect x="40" y="44" width="40" height="12" rx="3"/><rect x="28" y="34" width="10" height="32" rx="3"/><rect x="82" y="34" width="10" height="32" rx="3"/><rect x="20" y="40" width="7" height="20" rx="2"/><rect x="93" y="40" width="7" height="20" rx="2"/></g>`;

/** SVG-Markup für eine Übung. Bei reduzierter Bewegung statisch Start (blass) + Endposition. */
export function figureSvg(ex, cls = '') {
  const label = `${ex}: Bewegungsablauf`;
  if (!POSES[ex]) return `<svg class="fig ${cls}" viewBox="0 0 120 100" role="img" aria-label="Eigene Übung">${NEUTRAL}</svg>`;
  const j0 = POSES[ex](0);
  if (reduced()) return `<svg class="fig static ${cls}" data-fig="${ex}" viewBox="${j0.vb || '0 0 120 100'}" role="img" aria-label="${label} (Start und Endposition)"><g class="eq">${j0.scene}</g>${bodySvg(j0, 'ghost')}${bodySvg(POSES[ex](1))}</svg>`;
  return `<svg class="fig ${cls}" data-fig="${ex}" data-anim="1" viewBox="${j0.vb || '0 0 120 100'}" role="img" aria-label="${label}"><g class="eq">${j0.scene}</g>${bodySvg(j0)}</svg>`;
}

export const PERIOD = 2000; // ms pro Wiederholung
/** Fortschritt 0→1→0 mit weichem Umkehrpunkt. */
export const phaseAt = t => (1 - Math.cos(2 * Math.PI * ((t % PERIOD) / PERIOD))) / 2;

function update(svg, p) {
  const j = POSES[svg.dataset.fig](p), b = bodyParts(j);
  for (const el of svg.querySelectorAll('[data-k]')) {
    const k = el.dataset.k;
    if (k === 'head') { el.setAttribute('cx', f1(j.head.x)); el.setAttribute('cy', f1(j.head.y)); } else el.setAttribute('points', b[k]);
  }
}
let raf = 0;
/** Startet die gemeinsame Animationsschleife für alle sichtbaren Figuren. */
export function animateFigures(root = document) {
  cancelAnimationFrame(raf);
  const loop = ts => {
    const list = root.querySelectorAll('svg.fig[data-anim]');
    if (!list.length) { raf = 0; return; }
    const fixed = document.documentElement.dataset.figP; // für Tests/Screenshots: feste Phase
    const p = fixed != null && fixed !== '' ? +fixed : phaseAt(ts);
    list.forEach(svg => update(svg, p));
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
/** Einzelbild bei Phase p (für Tests und Vorschau). */
export function frameSvg(ex, p, cls = '') {
  const j = POSES[ex](p);
  return `<svg class="fig ${cls}" data-fig="${ex}" viewBox="${j.vb || '0 0 120 100'}"><g class="eq">${j.scene}</g>${bodySvg(j)}</svg>`;
}
