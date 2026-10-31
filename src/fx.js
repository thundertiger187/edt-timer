// v1.6 Effekte ohne Bibliotheken: Leuchtpunkt beim Tippen, Ziffern-Effekt, Karten beim Scrollen, fließender Hintergrund.
// Alle Effekte animieren nur transform/opacity (Ausnahme: Ziffern-Text).
// v1.6.1 Bewegungsstufe (html[data-motion]):
//   full   – alle Effekte mit Bewegung
//   gentle – nur Überblendungen (kein Gleiten, keine wandernden Flächen, kein Skalieren)
//   off    – keine Effekte
// Einstellung „Animationen“: on → full, off → off, auto → System folgen (reduzierte Bewegung → gentle, sonst full).
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
let pref = 'on';
export const systemReduced = () => mq.matches;
export const mode = () => (pref === 'off' ? 'off' : pref === 'on' ? 'full' : mq.matches ? 'gentle' : 'full');
export const reduced = () => mode() !== 'full'; // starke Bewegung (Gleiten, Figuren, Skalieren) aus
const applyMode = () => { document.documentElement.dataset.motion = mode(); };
export function setPref(p) { pref = ['auto', 'on', 'off'].includes(p) ? p : 'on'; applyMode(); }
mq.addEventListener?.('change', applyMode);
const hidden = () => document.visibilityState === 'hidden';

// ---------- 1. Leuchtpunkt (Touch-Glow) ----------
const GLOW_SEL = '.extile, .card, .card2, .btn, .go, .chip, .lr, .hitem, .tab, .hit, .round, .lk, .mr .st, .icon';
const GREEN_SEL = '.go, .btn.primary, [data-act=start], [data-act=plan-go], .hit';
let layer = null;
function glowLayer() {
  if (!layer || !layer.isConnected) { layer = document.createElement('div'); layer.className = 'fx-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
  return layer;
}
export function initGlow() {
  // passiv: blockiert weder Tippen noch Scrollen; Overlay außerhalb von #app übersteht ein Neuzeichnen
  document.addEventListener('pointerdown', e => {
    if (mode() === 'off' || e.button > 0) return;
    const t = e.target.closest?.(GLOW_SEL); if (!t || t.disabled) return;
    const r = t.getBoundingClientRect(); if (!r.width || !r.height) return;
    const g = document.createElement('span');
    const green = t.matches(GREEN_SEL), filled = green && !t.matches('[data-act=plan-go].st');
    g.className = 'fx-glow ' + (green ? (filled ? 'green filled' : 'green') : 'cyan');
    const rad = getComputedStyle(t).borderRadius;
    g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${rad};--gx:${e.clientX - r.left}px;--gy:${e.clientY - r.top}px;--gs:${Math.max(r.width, r.height) * 1.25}px`;
    glowLayer().appendChild(g);
    const done = () => g.remove();
    g.addEventListener('animationend', done, { once: true }); setTimeout(done, 1000);
  }, { passive: true, capture: true });
}

// ---------- 2. Ziffern-Effekt ----------
// Das Element behält immer den echten Wert als Text (Screenreader, Tests, ohne JS). Die Zufallsziffern liegen
// als CSS-Pseudo-Inhalt mit leerem Alternativtext darüber (content: attr(data-scr) / "").
const running = new Set();
export function scramble(el, { dur = 1200, onDone } = {}) {
  const final = el.textContent;
  const idx = [...final].map((c, i) => (/\d/.test(c) ? i : -1)).filter(i => i >= 0);
  if (mode() === 'off' || hidden() || !idx.length) { onDone?.(); return null; }
  const settle = idx.map((_, k) => dur * 0.6 + (k + 1) * (dur * 0.4) / idx.length); // links → rechts
  let t0 = null, last = -1;
  const job = { el, stop: () => finish() };
  const finish = () => { if (!running.has(job)) return; running.delete(job); cancelAnimationFrame(job.raf); el.removeAttribute('data-scr'); el.classList.remove('scr'); onDone?.(); };
  const step = ts => {
    if (t0 == null) t0 = ts;
    const t = ts - t0;
    if (t >= dur || !el.isConnected) return finish();
    const tick = Math.floor(t / 55); // Zufallsziffern ca. 18× pro Sekunde
    if (tick !== last) {
      last = tick;
      const ch = [...final];
      idx.forEach((i, k) => { if (t < settle[k]) ch[i] = String((Math.random() * 10) | 0); });
      el.setAttribute('data-scr', ch.join(''));
    }
    job.raf = requestAnimationFrame(step);
  };
  el.classList.add('scr'); el.setAttribute('data-scr', final.replace(/\d/g, '0'));
  running.add(job); job.raf = requestAnimationFrame(step);
  return job;
}
export const stopScrambles = () => [...running].forEach(j => j.stop());

// ---------- 3. Karten beim Scrollen ----------
// Progressive Enhancement: versteckt wird nur, was JS mit .rv markiert; ohne IntersectionObserver bleibt alles sichtbar.
let io = null;
export function reveal(root, sel) {
  io?.disconnect(); io = null;
  if (mode() === 'off' || typeof IntersectionObserver !== 'function') return 0;
  const els = [...root.querySelectorAll(sel)]; if (!els.length) return 0;
  let first = true, seen = false;
  io = new IntersectionObserver(entries => {
    seen = true;
    const vis = entries.filter(e => e.isIntersecting).map(e => e.target);
    // erster Durchlauf (sichtbarer Bereich): kurz gestaffelt, nach spätestens 300 ms sichtbar
    vis.forEach((el, i) => { el.style.setProperty('--rvd', `${first ? Math.min(i, 2) * 40 : Math.min(i, 5) * 50}ms`); el.classList.add('rv-in'); io?.unobserve(el); });
    first = false;
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
  els.forEach(el => { el.classList.add('rv'); io.observe(el); });
  // Sicherheitsnetz: falls der Observer gar nichts meldet, nach 1,2 s alles zeigen
  setTimeout(() => { if (!seen) els.forEach(el => el.classList.add('rv-in')); }, 1200);
  return els.length;
}

// ---------- 4. Fließender Hintergrund ----------
let bg = null;
export function background(mode) {
  if (!bg) {
    bg = document.createElement('div'); bg.id = 'fxbg'; bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<div class="fxl g"><i></i><i></i><i></i></div><div class="fxl c"><i></i><i></i><i></i></div>';
    document.body.prepend(bg);
    document.addEventListener('visibilitychange', () => { bg.classList.toggle('paused', hidden()); if (hidden()) stopScrambles(); });
  }
  if (bg.dataset.mode !== mode) bg.dataset.mode = mode; // home | work | rest | off – Wechsel per Überblendung
}
