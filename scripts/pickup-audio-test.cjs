const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync('src/pickup-audio.js', 'utf8');
function fresh() {
  const notes = [], automation = [];
  const gain = {
    value: .45,
    cancelScheduledValues(time) { for (let i = automation.length - 1; i >= 0; i--) if (automation[i].time >= time) automation.splice(i, 1); },
    setValueAtTime(value, time) { automation.push({kind: 'value', value, time}); this.value = value; },
    setTargetAtTime(value, time, smoothing) { automation.push({kind: 'target', value, time, smoothing}); }
  };
  const sandbox = {ac: {currentTime: 10}, muted: false, musicGain: {gain}, tone: (...args) => notes.push(args)};
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return {sandbox, notes, automation, play: type => sandbox.pickupSound(type)};
}
const tests = [];
function test(name, run) { tests.push([name, run]); }
test('each pickup plays a distinct bright rising chime rather than another descending shot', () => {
  const melodies = new Set();
  for (let type = 0; type < 4; type++) {
    const t = fresh(); t.play(type);
    assert(t.notes.length >= 2 && t.notes.length <= 3);
    melodies.add(t.notes.map(note => note[0]).join(','));
    for (const [index, [frequency, duration, waveform, volume, endFrequency, delay]] of t.notes.entries()) {
      assert(frequency >= 600 && frequency <= 2200); assert.equal(endFrequency, frequency);
      assert(duration >= .12 && duration <= .18); assert.equal(waveform, 'triangle'); assert(volume >= .07 && volume <= .09);
      assert.equal(delay, index * .08);
      if (index) assert(frequency > t.notes[index - 1][0]);
    }
  }
  assert.equal(melodies.size, 4);
});
test('music briefly ducks under the chime and recovers smoothly', () => {
  const t = fresh(); t.play(2);
  const targets = t.automation.filter(event => event.kind === 'target');
  assert.equal(targets.length, 2); assert.equal(targets[0].value, .1); assert.equal(targets[0].time, 10);
  assert(targets[0].smoothing > 0 && targets[0].smoothing <= .02);
  assert.equal(targets[1].value, .45); assert(targets[1].time >= 10.25 && targets[1].time <= 10.4);
  assert(targets[1].smoothing > 0 && targets[1].smoothing <= .1);
  assert.equal(t.automation[0].kind, 'value'); assert.equal(t.automation[0].value, .45);
});
test('successive pickups cancel the earlier recovery and hold the latest chime above the music', () => {
  const t = fresh(); t.play(0); t.sandbox.ac.currentTime += .15; t.sandbox.musicGain.gain.value = .12;
  t.play(3);
  const future = t.automation.filter(event => event.time >= t.sandbox.ac.currentTime);
  assert.equal(future.filter(event => event.kind === 'target' && event.value === .45).length, 1);
  assert(future.at(-1).time > 10.4, 'Recovery belongs to the second pickup');
  assert.equal(future[0].value, .12, 'A new duck starts from the current gain without a volume jump');
});
test('mute or unavailable audio schedules neither notes nor gain automation', () => {
  for (const state of ['muted', 'missing']) {
    const t = fresh(); if (state === 'muted') t.sandbox.muted = true; else t.sandbox.ac = null;
    t.play(2); assert.equal(t.notes.length, 0); assert.equal(t.automation.length, 0);
  }
});
test('pickup sounds remain audible while music has not finished rendering', () => {
  const t = fresh(); t.sandbox.musicGain = null; t.play(1);
  assert.equal(t.notes.length, 3); assert.equal(t.automation.length, 0);
});
for (const [name, run] of tests) {run(); console.log('PASS ' + name)}
console.log(`${tests.length} pickup audio checks passed.`);
