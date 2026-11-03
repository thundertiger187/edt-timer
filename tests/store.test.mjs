// v1.8.0: Migration eigener Übungen im Speicher (localStorage-Attrappe)
import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const { store } = await import('../src/store.js');
const E = await import('../src/engine.js');
const J = k => JSON.parse(mem.get(k));

test('v1.8.0 Upgrade: Sicherung, neue Vorlagen ergänzt, eigene Übungen als Liste, Varianten → Grundübung', () => {
  mem.clear();
  const old = E.TEMPLATES.filter(t => !E.NEW_EXERCISES_180.includes(t.exercise));
  const ws = [...old, { id: 'own-b', name: 'Burpee-EDT', exercise: 'Burpees', muscle: 'legs', limitMin: 5, phases: [{ reps: 5, restSec: 20, rounds: null }] },
    { id: 'own-s', name: 'Situps-EDT', exercise: 'Situps', muscle: 'own', limitMin: 5, phases: [{ reps: 10, restSec: 20, rounds: null }] }];
  mem.set('edt.workouts', JSON.stringify(ws));
  mem.set('edt.history', JSON.stringify([{ id: 'h', workoutId: 'own-s', exercise: 'Situps', total: 40, sets: [{ done: 40 }], date: '2026-10-01T10:00:00Z' }]));
  mem.set('edt.maxes', JSON.stringify({ Situps: [{ v: 25, date: '2026-10-01T09:00:00Z', source: 'test' }] }));
  mem.set('edt.combos', JSON.stringify([{ id: 'c1', name: 'K', steps: [{ exercise: 'Burpees', reps: 5, restSec: 10 }, { exercise: 'Situps', reps: 10, restSec: 10 }] }]));
  mem.set('edt.settings', JSON.stringify({ planVer: 2, exSel: '__own' }));
  const before = mem.get('edt.workouts');
  assert.deepEqual(store.upgrade180(), { added: 4 });
  const bk = J('edt.backup-1.8.0'); assert.equal(bk.data['edt.workouts'], before); assert.ok(bk.data['edt.maxes']);
  assert.equal(store.workouts().length, ws.length + 4);
  assert.equal(store.upgrade180(), null, 'nur einmal');
  const h = store.healExercises();
  assert.deepEqual(h.renamed, ['Situps']);
  assert.deepEqual(store.exercises().map(x => [x.name, x.muscle]), [['Burpees', 'legs']]);
  assert.equal(store.workouts().find(w => w.id === 'own-s').exercise, 'Sit-ups');
  assert.equal(store.history()[0].exercise, 'Sit-ups'); assert.deepEqual(Object.keys(store.maxes()), ['Sit-ups']);
  assert.deepEqual(store.combos()[0].steps.map(x => x.exercise), ['Burpees', 'Sit-ups']);
  const again = store.healExercises(); assert.deepEqual(again.renamed, []); assert.equal(again.changed, 0);
  // Export/Import enthält die Liste
  const ex = store.exportAll(); assert.deepEqual(ex.exercises.map(x => x.name), ['Burpees']);
  store.saveExercises([]); store.importAll(ex); assert.deepEqual(store.exercises().map(x => x.name), ['Burpees']);
  store.wipe(); assert.equal(mem.get('edt.exercises'), undefined); assert.equal(mem.get('edt.backup-1.8.0'), undefined);
});
test('v1.8.0 Neuinstallation: keine Sicherung, alle 9 Vorlagen, leere Liste', () => {
  mem.clear();
  assert.deepEqual(store.upgrade180(), { added: 0 });
  assert.equal(mem.get('edt.backup-1.8.0'), undefined);
  assert.equal(store.workouts().length, E.TEMPLATES.length);
  assert.deepEqual(store.healExercises().list, []);
});
