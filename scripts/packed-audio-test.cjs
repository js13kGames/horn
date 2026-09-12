// Exercise the distributable decoder, property-mangled synth and real game key hooks.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const packed = fs.readFileSync('dist/index.html', 'utf8');
const scripts = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => match[1]);
let decoded = '', decodedJS = '';
const decoder = scripts(packed);
assert.equal(decoder.length, 1, 'Release must contain one self-contained decoder');
// Capture the JS scaffold payload before running it with the complete game mocks.
// The older HTML-write wrapper remains readable for checking existing releases.
vm.runInNewContext(decoder[0], {
  TextDecoder, eval: code => { decodedJS += code; },
  document: {write: text => { decoded += text; }}
}, {timeout: 10000});
const gameScripts = decodedJS ? [decodedJS] : scripts(decoded);
assert.equal(gameScripts.length, 1, 'All game and music source must be bundled together');

const nodes = new Map(), listeners = {}, sources = [], contexts = [], buffers = [];
let nextFrame;
const gameMath = Object.create(Math);
const gradient = {addColorStop(){}};
const drawing = new Proxy({}, {get: (object, key) => key in object ? object[key] : key.startsWith('create') ? () => gradient : () => {}, set: (object, key, value) => (object[key] = value, true)});
function element(id) {
  if (!nodes.has(id)) nodes.set(id, {
    hidden: false, textContent: '', innerHTML: '', style: {}, children: [], firstElementChild: {style: {}},
    classList: {add(){}, remove(){}}, setAttribute(){}, append(child){this.children.push(child)}, focus(){},
    getContext(){return drawing}, toDataURL(){return 'data:image/png;base64,'},
    addEventListener(type, fn){listeners[id + ':' + type] = fn}, setPointerCapture(){},
    getBoundingClientRect(){return {left: 0, top: 0, width: 1200, height: 800}}
  });
  return nodes.get(id);
}
const parameter = () => ({value: 0, setValueAtTime(value){this.value = value}, exponentialRampToValueAtTime(value){this.value = value}});
class FakeAudioContext {
  constructor(){this.sampleRate = 48000; this.currentTime = 0; this.state = 'running'; this.destination = {}; contexts.push(this)}
  resume(){this.state = 'running'; return Promise.resolve()}
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({length: channels}, () => new Float32Array(length));
    const buffer = {numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel]};
    buffers.push(buffer); return buffer;
  }
  createGain(){return {gain: parameter(), connect(){}, disconnect(){}}}
  createOscillator(){return {frequency: parameter(), connect(){}, start(){}, stop(){}}}
  createBufferSource(){
    const node = {active: false, stops: 0, disconnects: 0,
      connect(target){this.target = target},
      start(when, offset) {
        assert.equal(sources.filter(source => source.active).length, 0, 'A new music source must never overlap an existing loop');
        assert(this.buffer && this.buffer.numberOfChannels === 2, 'Music starts with the rendered stereo buffer');
        this.active = true; this.when = when; this.offset = offset;
      },
      stop(){assert(this.active, 'A source is stopped only once'); this.active = false; this.stops++},
      disconnect(){this.disconnects++}
    };
    sources.push(node); return node;
  }
}
const sandbox = {
  console, Math: gameMath, Set, Number, AbortController, Float32Array, setTimeout,
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, matchMedia: () => ({matches: false}),
  document: {write: text => { decoded += text; }, getElementById: element, createElement: () => element(Symbol()), addEventListener(type, fn){listeners['document:' + type] = fn}, documentElement: {}},
  window: {AudioContext: FakeAudioContext, addEventListener(type, fn){listeners[type] = fn}},
  localStorage: {getItem(){return null}, setItem(){}}, requestAnimationFrame(callback){nextFrame = callback}
};
vm.createContext(sandbox);
vm.runInContext(gameScripts[0], sandbox, {timeout: 10000});
assert(decoded.includes('Copyright (c) 2014 Nicolas Vanhoren'), 'Decoded release preserves Sonant-X license');
assert(!/<script[^>]+src=/i.test(decoded), 'Decoded game must not depend on external scripts');
assert(decoded.includes('HORN'), 'Decoder must produce the game HTML');
function key(value) {
  assert(listeners.keydown, 'Game registers keyboard input');
  listeners.keydown({key: value, repeat: false, metaKey: false, ctrlKey: false, altKey: false, preventDefault(){}});
  listeners.keyup?.({key: value});
}
const active = () => sources.filter(source => source.active);
const closeTo = (value, expected) => assert(Math.abs(value - expected) < 1e-7, `${value} differs from ${expected}`);
async function waitForMusic() {
  const deadline = Date.now() + 5000;
  while (!active().length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(active().length, 1, 'Enter must finish synthesis and start one music loop within five seconds');
}
(async () => {
  key('Enter'); await waitForMusic();
  assert.equal(contexts.length, 1, 'Music and effects share one AudioContext');
  const preloadDeadline = Date.now() + 5000;
  while (buffers.length < 4 && Date.now() < preloadDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(buffers.length, 4, 'Normal music, boss cue, boss loop and combined boss buffer are rendered once');
  const first = active()[0], buffer = first.buffer;
  assert(first.loop, 'Music loops'); assert.equal(first.offset, 0);
  assert.equal(buffer.numberOfChannels, 2); assert.equal(buffer.sampleRate, 22050);
  closeTo(buffer.duration, Math.round(Math.round(60 * 44100 / 152 / 4) / 2) * 256 / 22050);
  let peak = 0, energy = 0, stereoDifference = 0;
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  for (let i = 0; i < buffer.length; i++) {
    for (const sample of [left[i], right[i]]) {
      assert(Number.isFinite(sample), 'Compiled instrument properties produce only finite samples');
      peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
    }
    stereoDifference += Math.abs(left[i] - right[i]);
  }
  const rms = Math.sqrt(energy / (buffer.length * 2));
  assert(rms > .01, 'Song contains audible music'); assert(stereoDifference > 1, 'Stereo pan survives compilation');
  closeTo(first.target.gain.value, .45); assert(peak * first.target.gain.value < 1, 'Music has output headroom for effects');
  const ac = contexts[0];
  ac.currentTime = 3.25; key('p'); assert.equal(active().length, 0); assert.equal(first.stops, 1); assert.equal(first.disconnects, 1);
  assert.equal(element('message-title').innerHTML, 'PAUSED.');
  ac.currentTime = 20; key('Enter'); assert.equal(active().length, 1); closeTo(active()[0].offset, 3.25);
  ac.currentTime = 21.5; key('m'); assert.equal(active().length, 0);
  ac.currentTime = 100; key('m'); assert.equal(active().length, 1); closeTo(active()[0].offset, 4.75);
  ac.currentTime = 101; key('r'); assert.equal(active().length, 1); assert.equal(active()[0].offset, 0);
  for (let i = 0; i < 5; i++) key('r');
  assert.equal(active().length, 1); assert.equal(active()[0].offset, 0); assert.equal(buffers.length, 4);
  for (const source of sources.slice(0, -1)) {assert.equal(source.stops, 1); assert.equal(source.disconnects, 1)}
  key('p'); assert.equal(active().length, 0, 'Pause silences music');

  // Isolate the real sixty-second boss transition from combat. Proximity never
  // damages the stationary player, and fixed random choices spawn melee only.
  gameMath.hypot = () => Infinity;
  gameMath.random = () => .5;
  key('r');
  const normalBuffer = active()[0].buffer, advanceFrom = ac.currentTime;
  for (let frame = 0; frame < 1210 && element('boss-hud').hidden; frame++) {
    ac.currentTime = advanceFrom + frame * .05;
    nextFrame(frame * 50 + 1);
  }
  assert.equal(element('boss-hud').hidden, false, 'Real game clock reaches the Warden');
  assert.equal(active().length, 1);
  const bossSource = active()[0], bossBuffer = bossSource.buffer;
  assert.notEqual(bossBuffer, normalBuffer, 'Boss arrival switches the compiled soundtrack');
  assert.equal(bossSource.offset, 0, 'Entrance cue begins immediately');
  assert.equal(bossSource.loopStart, 1, 'Subsequent loops skip the one-second cue');
  closeTo(bossSource.loopEnd, bossBuffer.duration);
  assert(bossBuffer.duration > 2);
  let bossPeak = 0, cueEnergy = 0, loopEnergy = 0;
  for (let channel = 0; channel < 2; channel++) {
    const data = bossBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      assert(Number.isFinite(data[i]), 'Compiled boss music stays finite');
      bossPeak = Math.max(bossPeak, Math.abs(data[i]));
      if (i < 22050) cueEnergy += data[i] ** 2; else loopEnergy += data[i] ** 2;
    }
    closeTo(data[22049], 0); closeTo(data[22050], 0);
  }
  assert(cueEnergy > 1 && loopEnergy > 1, 'Both entrance cue and repeating boss section are audible');
  assert(bossPeak * .45 < 1, 'Boss music leaves output headroom');
  const loopDuration = bossBuffer.duration - 1;
  ac.currentTime += 1 + loopDuration * 3 + .4;
  key('p'); assert.equal(active().length, 0);
  ac.currentTime += 40; key('Enter'); closeTo(active()[0].offset, 1.4);
  ac.currentTime += loopDuration * 2 + .2; key('m'); assert.equal(active().length, 0);
  ac.currentTime += 40; key('m'); closeTo(active()[0].offset, 1.6);
  key('r'); assert.equal(active().length, 1); assert.equal(active()[0].buffer, normalBuffer);
  assert.equal(active()[0].offset, 0); assert.equal(active()[0].loopStart, 0); assert.equal(buffers.length, 4);
  key('p'); assert.equal(active().length, 0, 'Final pause silences music');
  console.log('PASS packed HTML decoder, license, property-mangled stereo synth and keyboard music lifecycle');
  console.log(JSON.stringify({sampleRate: buffer.sampleRate, seconds: buffer.duration, peak: +peak.toFixed(5), rms: +rms.toFixed(5), outputPeak: +(peak * .45).toFixed(5), bossSeconds: bossBuffer.duration, bossPeak: +bossPeak.toFixed(5), renderedBuffers: buffers.length, sources: sources.length}));
})().catch(error => {console.error(error); process.exitCode = 1});
