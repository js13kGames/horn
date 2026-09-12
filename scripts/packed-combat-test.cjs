// Exercise the shipped HTML through real input and animation hooks, without state overrides.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const scripts = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => match[1]);
const packed = fs.readFileSync('dist/index.html', 'utf8');
const decoder = scripts(packed);
assert.equal(decoder.length, 1);
let decoded = '';

const nodes = new Map(), listeners = {};
let nextFrame, now = 1000, labels = [];
const gradient = {addColorStop(){}};
const drawing = new Proxy({fillText(value){labels.push(value)}}, {
  get: (object, key) => key in object ? object[key] : key.startsWith('create') ? () => gradient : () => {},
  set: (object, key, value) => (object[key] = value, true)
});
function element(id) {
  if (!nodes.has(id)) nodes.set(id, {
    hidden: false, textContent: '', innerHTML: '', style: {}, children: [], firstElementChild: {style: {}},
    classList: {add(){}, remove(){}}, setAttribute(){}, append(child){this.children.push(child)}, focus(){},
    getContext(){return drawing}, toDataURL(){return 'data:image/png;base64,'}, setPointerCapture(){},
    addEventListener(type, fn){listeners[id + ':' + type] = fn},
    getBoundingClientRect(){return {left: 0, top: 0, width: 1200, height: 800}}
  });
  return nodes.get(id);
}
const sandbox = {
  console, Math, Set, Number, AbortController, TextDecoder,
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, matchMedia: () => ({matches: false}),
  document: {write(text){decoded += text}, getElementById: element, createElement: () => element(Symbol()), documentElement: {}, addEventListener(type, fn){listeners['document:' + type] = fn}},
  window: {addEventListener(type, fn){listeners[type] = fn}},
  localStorage: {getItem(){return null}, setItem(){}}, requestAnimationFrame(fn){nextFrame = fn}
};
vm.createContext(sandbox);
vm.runInContext(decoder[0], sandbox, {timeout: 10000});
assert.equal(scripts(decoded).length, 0, 'The decoder writes markup and executes the bundled game itself');
assert(decoded.includes('Copyright (c) 2014 Nicolas Vanhoren'), 'Shipped markup retains the full Sonant-X notice');
function frame() {
  labels = [];
  assert.equal(typeof nextFrame, 'function', 'Game keeps scheduling frames');
  now += 1000 / 60;
  nextFrame(now);
}
const health = () => (element('hearts').textContent.match(/♥/g) || []).length;
listeners.keydown({key: 'Enter', repeat: false, preventDefault(){}});
listeners.keyup?.({key: 'Enter'});
for (let i = 0; i < 30; i++) frame();
assert.equal(health(), 5);
assert(labels.includes('SHIELD'), 'Starting protection is visible');
for (let i = 0; i < 102; i++) frame();
assert.equal(health(), 5, 'Starting enemies give time to enter the game');
assert(!labels.includes('SHIELD'), 'Startup protection expires after two seconds in the shipped build');
for (let i = 0; i < 900 && health() === 5; i++) frame();
assert.equal(health(), 4, 'An undefended player takes real damage after the starting shield expires');
assert(labels.includes('SHIELD'), 'A real hit grants temporary protection');
for (let i = 0; i < 1500 && element('screen').hidden; i++) frame();
assert.equal(element('message-title').innerHTML, 'YOU DIED.', 'Natural enemy hits eventually defeat an idle player');
assert.equal(health(), 0);
console.log('PASS packed combat: initial shield expires, real enemies damage the player, temporary grace ends, and idle play reaches death');
