// Töne (WebAudio), Sprache (SpeechSynthesis), Vibration, Wake Lock. Alles optional, fällt still zurück.
let ctx = null, voice = null, wakeLock = null, wantWake = false;
export const cfg = { sound: true, voice: true, vibrate: true, wake: true };

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => v.lang === 'de-DE' && /Anna|Petra|Helena|Google/i.test(v.name)) || vs.find(v => /^de/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

/** Muss in einer Nutzer-Geste aufgerufen werden (iOS). */
export function unlock() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS 17+: auch bei Stummschalter
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0);
  } catch {}
  try { if ('speechSynthesis' in window && cfg.voice) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch {}
}

export function beep(freq = 880, dur = 0.12, delay = 0, vol = 0.5, type = 'sine') {
  if (!cfg.sound || !ctx) return;
  try {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.02);
  } catch {}
}

export function say(text, { interrupt = true } = {}) {
  if (!cfg.sound || !cfg.voice || !('speechSynthesis' in window)) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; if (voice) u.voice = voice; u.rate = 1.1;
    speechSynthesis.speak(u);
  } catch {}
}

export function vibrate(p) { if (cfg.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch {} }

export const cue = {
  go() { beep(1320, 0.35, 0, 0.6, 'square'); vibrate([120, 60, 120]); },
  count(n) { beep(880, 0.1, 0, 0.5); vibrate(40); },
  set() { beep(660, 0.08); beep(990, 0.12, 0.09); vibrate(60); },
  tap() { beep(1200, 0.04, 0, 0.3); vibrate(15); },
  done() { [0, 0.18, 0.36].forEach((d, i) => beep(660 + i * 220, 0.16, d, 0.6, 'triangle')); vibrate([300, 100, 300]); },
  alert() { beep(520, 0.25, 0, 0.6, 'sawtooth'); beep(520, 0.25, 0.3, 0.6, 'sawtooth'); vibrate([200, 80, 200, 80, 200]); },
};

export async function keepAwake(on) {
  wantWake = on && cfg.wake;
  try {
    if (wantWake && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!wantWake && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
export const wakeSupported = () => 'wakeLock' in navigator;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (wantWake) keepAwake(true); if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); }
});
