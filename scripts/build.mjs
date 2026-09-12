import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { minify } from 'terser';
import { Packer } from 'roadroller';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sources = ['sonant.js', 'music.js', 'boss-music.js', 'music-controller.js', 'pickup-audio.js', 'game.js'];
const read = name => readFile(new URL('../src/' + name, import.meta.url), 'utf8');
const [html, css, license, ...js] = await Promise.all(['index.html', 'style.css', 'SONANT-X-LICENSE.txt', ...sources].map(read));
// Mangle only synth parameters and private combat data; keep browser, audio and saved-score keys.
const result = await minify(js.join('\n'), { compress: { passes: 3, toplevel: true }, mangle: { toplevel: true, properties: { regex: /^(osc[12]_|env_|fx_|lfo_|noise_fader$|rowLen$|songData$|songLen$|endPattern$|(?:angle|born|dead|clock|hp|targetX|targetY|inv|cooldown|lastDash|spin|dash|vx|vy|dx|dy|life|burn|x2|y2|full)$)/ } } });
let output = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>');
const notice = ' Sonant-X, adapted renderer.\n' + license;
const bundledScript = '<script>/*' + notice + '*/\n' + result.code + '</script>';
for (const name of sources) output = output.replace('<script src="' + name + '"></script>', name === 'game.js' ? bundledScript : '');
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await mkdir(new URL('../work/build/', import.meta.url), { recursive: true });
await writeFile(new URL('../work/build/index.html', import.meta.url), output);
// Pack executable JS so Roadroller can abbreviate identifiers as well as the HTML.
// document.write creates the complete arena before the bundled game initializes.
const scaffold = output.replace(bundledScript, '<!--' + notice + '-->');
const program = 'document.write(' + JSON.stringify(scaffold) + ');' + result.code;
const packer = new Packer([{ data: program, type: 'js', action: 'eval' }], { maxMemoryMB: 150, allowFreeVars: false });
// Pin the optimizer's randomness so release ZIP sizes are reproducible.
const random = Math.random;
let seed = 42;
Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
try { await packer.optimize(1); } finally { Math.random = random; }
const decoder = packer.makeDecoder(), script = decoder.firstLine + decoder.secondLine;
assert(!/<\/script/i.test(script));
let decoded = '';
vm.runInNewContext(script, { TextDecoder, eval: code => { decoded = code; } }, { timeout: 10000 });
// Roadroller re-escapes string literals; canonicalize both programs before comparison.
const canonical = async code => (await minify(code, { compress: false, mangle: false, format: { ascii_only: true } })).code;
const [expectedProgram, decodedProgram] = await Promise.all([canonical(program), canonical(decoded)]);
assert.equal(decodedProgram, expectedProgram, 'Packed scaffold and game must decode without changes');
output = '<!doctype html><meta charset="utf-8"><script>' + script + '</script>';
await writeFile(new URL('../dist/index.html', import.meta.url), output);
console.log('Built self-contained dist/index.html (' + Buffer.byteLength(output) + ' bytes before ZIP compression).');
