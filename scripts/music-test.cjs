const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync('src/music-controller.js', 'utf8');
function fresh() {
  const sources = [], gains = [], renders = [], pending = {};
  const makeBuffer = (channels, length, sampleRate, value = 0) => {
    const data = Array.from({length: channels}, () => new Float32Array(length).fill(value));
    return {numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: index => data[index]};
  };
  for (const name of ['normal', 'cue', 'boss']) pending[name] = {};
  for (const part of Object.values(pending)) part.promise = new Promise((yes, no) => { part.resolve = yes; part.reject = no; });
  const context = {
    mode: 'playing', muted: false, bossSpawned: false,
    hornSong: {name: 'normal'}, bossCue: {name: 'cue'}, bossSong: {name: 'boss'},
    renderSonantSong(song, ac) { assert.equal(ac, context.ac); renders.push(song.name); return pending[song.name].promise; },
    ac: { currentTime: 0, state: 'running', destination: {}, createBuffer: makeBuffer,
      createGain() { const gain = {gain: {value: 0}, connect() {}}; gains.push(gain); return gain; },
      createBufferSource() {
        const node = { active: false, starts: [], stopped: 0, disconnected: 0,
          connect() {},
          start(when, offset) { assert.equal(sources.filter(source => source.active).length, 0, 'No overlapping music'); this.active = true; this.starts.push({when, offset}); },
          stop() { assert(this.active); this.active = false; this.stopped++; },
          disconnect() { this.disconnected++; }
        };
        sources.push(node); return node;
      }
    }
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const finishNormal = async () => { pending.normal.resolve(makeBuffer(2, 25 * 22050, 22050, .05)); await flush(); };
  const finishBoss = async () => {
    pending.cue.resolve(makeBuffer(2, 2 * 22050, 22050, .1));
    pending.boss.resolve(makeBuffer(2, 4 * 22050, 22050, .2)); await flush();
  };
  vm.createContext(context); vm.runInContext(source, context);
  return {context, sources, gains, call: reset => context.music(reset), renderCount: (name = 'normal') => renders.filter(render => render === name).length,
    flush, finishNormal, finishBoss, finish: async () => { await finishNormal(); await finishBoss(); },
    fail: async () => { pending.normal.reject(Error('audio unavailable')); await flush(); }
  };
}
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function closeTo(actual, expected) { assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test('late rendering while paused never starts audio; resume reuses the buffer', async () => {
  const t = fresh(); t.call(true); t.context.mode = 'paused'; t.call(); await t.finish();
  assert.equal(t.sources.length, 0); assert.equal(t.renderCount(), 1);
  t.context.mode = 'playing'; t.call(); assert.equal(t.sources.length, 1); assert(t.sources[0].loop);
  assert.equal(t.sources[0].starts[0].offset, 0);
});
test('rapid pending restarts render once and create only one source', async () => {
  const t = fresh(); for (let i = 0; i < 20; i++) t.call(true); await t.finish();
  assert.equal(t.renderCount(), 1); assert.equal(t.sources.length, 1);
  for (let i = 0; i < 20; i++) t.call(); assert.equal(t.sources.length, 1);
});
test('restarts stop and disconnect every previous source before starting at zero', async () => {
  const t = fresh(); t.call(); await t.finish();
  for (let i = 0; i < 8; i++) { t.context.ac.currentTime += 1.7; t.call(true); assert.equal(t.sources.filter(s => s.active).length, 1); }
  for (const s of t.sources.slice(0, -1)) { assert.equal(s.stopped, 1); assert.equal(s.disconnected, 1); }
  for (const s of t.sources) assert.equal(s.starts[0].offset, 0);
  assert.equal(t.renderCount(), 1); assert.equal(t.gains.length, 1); assert.equal(t.gains[0].gain.value, .45);
});
test('pause preserves position while wall-clock time advances', async () => {
  const t = fresh(); t.call(); await t.finish(); t.context.ac.currentTime = 4.2;
  t.context.mode = 'paused'; t.call(); t.context.ac.currentTime = 100;
  t.context.mode = 'playing'; t.call(); closeTo(t.sources.at(-1).starts[0].offset, 4.2);
  t.context.ac.currentTime = 101.3; t.context.mode = 'paused'; t.call(); t.context.mode = 'playing'; t.call();
  closeTo(t.sources.at(-1).starts[0].offset, 5.5);
});
test('mute and unmute retain the loop position rather than advancing silently', async () => {
  const t = fresh(); t.call(); await t.finish(); t.context.ac.currentTime = 28.3;
  t.context.muted = true; t.call(); assert.equal(t.sources.filter(s => s.active).length, 0);
  t.context.ac.currentTime = 1000; t.context.muted = false; t.call();
  closeTo(t.sources.at(-1).starts[0].offset, 3.3); assert.equal(t.renderCount(), 1);
});
test('restart while muted resets the saved position', async () => {
  const t = fresh(); t.call(); await t.finish(); t.context.ac.currentTime = 7;
  t.context.muted = true; t.call(); t.call(true); t.context.muted = false; t.call();
  assert.equal(t.sources.at(-1).starts[0].offset, 0);
});
test('late rendering respects muted, title, death and victory states', async () => {
  for (const state of ['muted', 'title', 'dead', 'victory']) {
    const t = fresh(); t.call();
    if (state === 'muted') t.context.muted = true; else t.context.mode = state;
    t.call(); await t.finish(); assert.equal(t.sources.length, 0, state);
    t.context.muted = false; t.context.mode = 'playing'; t.call(true);
    assert.equal(t.sources.length, 1); assert.equal(t.renderCount(), 1);
  }
});
test('terminal screens stop the active loop and remain silent across repeated updates', async () => {
  for (const state of ['title', 'dead', 'victory']) {
    const t = fresh(); t.call(); await t.finish(); t.context.mode = state; t.call();
    t.call(); t.call(); assert.equal(t.sources[0].stopped, 1); assert.equal(t.sources.filter(s => s.active).length, 0);
  }
});
test('missing or closed Web Audio is harmless and does not request a render', async () => {
  const t = fresh(); t.context.ac = null; t.call(true); await t.flush(); assert.equal(t.renderCount(), 0);
  t.context.ac = {state: 'closed'}; t.call(); await t.flush(); assert.equal(t.renderCount(), 0);
});
test('render failure is contained without unhandled rejection or repeated work', async () => {
  const t = fresh(); t.call(); await t.flush(); await t.fail(); t.call(); await t.flush();
  assert.equal(t.renderCount(), 1); assert.equal(t.sources.length, 0);
});
test('boss audio preloads once while normal music continues, then starts its cue exactly once', async () => {
  const t = fresh(); t.call(); await t.finish();
  assert.equal(t.sources.length, 1); assert.equal(t.renderCount('cue'), 1); assert.equal(t.renderCount('boss'), 1);
  t.context.bossSpawned = true; t.call(true);
  const boss = t.sources.at(-1);
  assert.equal(t.sources.length, 2); assert.equal(t.sources[0].stopped, 1);
  assert.equal(boss.starts[0].offset, 0); assert.equal(boss.loopStart, 1); assert.equal(boss.loopEnd, 5);
  assert.equal(boss.buffer.length, 5 * 22050);
  for (let channel = 0; channel < 2; channel++) {
    const data = boss.buffer.getChannelData(channel);
    closeTo(data[0], .1); closeTo(data[22049], 0);
    closeTo(data[22050], 0); closeTo(data[22160], .2); closeTo(data.at(-1), 0);
  }
  t.call(); assert.equal(t.sources.length, 2, 'An ordinary update never repeats the cue');
});
test('boss pause and mute after multiple loops resume the music section, never the entrance cue', async () => {
  const t = fresh(); t.call(); await t.finish(); t.context.bossSpawned = true; t.call(true);
  t.context.ac.currentTime = 13.2; t.context.mode = 'paused'; t.call();
  t.context.ac.currentTime = 100; t.context.mode = 'playing'; t.call();
  closeTo(t.sources.at(-1).starts[0].offset, 1.2);
  t.context.ac.currentTime = 108.4; t.context.muted = true; t.call();
  t.context.ac.currentTime = 1000; t.context.muted = false; t.call();
  closeTo(t.sources.at(-1).starts[0].offset, 1.6);
});
test('pausing during the one-second cue resumes only its remaining portion', async () => {
  const t = fresh(); t.call(); await t.finish(); t.context.bossSpawned = true; t.call(true);
  t.context.ac.currentTime = .4; t.context.mode = 'paused'; t.call();
  t.context.ac.currentTime = 50; t.context.mode = 'playing'; t.call();
  closeTo(t.sources.at(-1).starts[0].offset, .4);
  t.context.ac.currentTime = 54.6; t.context.mode = 'paused'; t.call(); t.context.mode = 'playing'; t.call();
  closeTo(t.sources.at(-1).starts[0].offset, 1);
});
test('new run restores the normal loop and a later boss gets one fresh entrance cue', async () => {
  const t = fresh(); t.call(); await t.finish(); const normal = t.sources[0].buffer;
  t.context.bossSpawned = true; t.call(true); t.context.ac.currentTime = 9;
  t.context.bossSpawned = false; t.call(true);
  assert.equal(t.sources.at(-1).buffer, normal); assert.equal(t.sources.at(-1).loopStart, 0); assert.equal(t.sources.at(-1).starts[0].offset, 0);
  t.context.bossSpawned = true; t.call(true); assert.equal(t.sources.at(-1).starts[0].offset, 0);
  for (const name of ['normal', 'cue', 'boss']) assert.equal(t.renderCount(name), 1);
});
test('late boss render respects death, mute and a reset to normal play', async () => {
  for (const state of ['dead', 'muted', 'reset']) {
    const t = fresh(); t.call(); await t.finishNormal(); t.context.bossSpawned = true; t.call(true);
    assert.equal(t.sources.filter(source => source.active).length, 0);
    if (state === 'dead') t.context.mode = 'dead';
    else if (state === 'muted') t.context.muted = true;
    else t.context.bossSpawned = false;
    t.call(state === 'reset'); await t.finishBoss();
    const active = t.sources.filter(source => source.active);
    assert.equal(active.length, state === 'reset' ? 1 : 0);
    if (state === 'reset') assert.equal(active[0].loopStart, 0);
    else { t.context.mode = 'playing'; t.context.muted = false; t.call(); assert.equal(t.sources.at(-1).starts[0].offset, 0); }
  }
});
test('boss arrival before normal rendering finishes cannot start normal music by mistake', async () => {
  const t = fresh(); t.call(); t.context.bossSpawned = true; t.call(true);
  await t.finishNormal(); assert.equal(t.sources.length, 0);
  await t.finishBoss(); assert.equal(t.sources.length, 1); assert.equal(t.sources[0].loopStart, 1);
});
(async () => {
  for (const [name, fn] of tests) { await fn(); console.log('PASS ' + name); }
  console.log(`${tests.length} music lifecycle checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
