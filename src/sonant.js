// HORN adaptation of Sonant-X by Nicolas Vanhoren, Marcus Geelnard and Jake Taylor.
// Altered renderer: cached notes, 22050 Hz, exact loop length and circular tails/delay.
// Specialized for the included, fully specified instruments (no LFO modulation).
// See SONANT-X-LICENSE.txt for the original zlib license notice.
async function renderSonantSong(song, audioContext) {
  const rate = 22050, row = Math.round(song.rowLen / 2);
  const rows = 32 * (song.endPattern + 1), length = row * rows;
  const output = audioContext.createBuffer(2, length, rate);
  const left = output.getChannelData(0), right = output.getChannelData(1);
  const sine = t => Math.sin(t * Math.PI * 2);
  const oscillators = [sine, t => sine(t) < 0 ? -1 : 1, t => t % 1 - .5,
    t => { const v = t % 1 * 4; return v < 2 ? v - 1 : 3 - v; }];
  const quantize = x => Math.max(-32768, Math.min(32767, 4 * (((32768 + x) & 65535) - 32768))) / 32768;
  for (const instrument of song.songData) {
    const p = instrument, cache = {};
    const trackL = new Float32Array(length), trackR = new Float32Array(length);
    const attack = p.env_attack / 2, sustain = p.env_sustain / 2, release = p.env_release / 2;
    const duration = Math.ceil(attack + sustain + release);
    const panFrequency = 2 ** (p.fx_pan_freq - 8) / row;
    const f = 1.5 * Math.sin(p.fx_freq * Math.PI / rate);
    for (let r = 0; r < rows; r++) {
      const pattern = p.p[r >> 5], note = pattern && p.c[pattern - 1].n[r % 32];
      if (!note) continue;
      if (!cache[note]) {
        const noteL = new Float32Array(duration), noteR = new Float32Array(duration);
        const freq = (oct, det, fine) => .00390625 * 1.059463094 ** (note + (oct - 8) * 12 + det - 128) * 2 * (1 + .0008 * fine);
        const freq1 = freq(p.osc1_oct, p.osc1_det, p.osc1_detune);
        const freq2 = freq(p.osc2_oct, p.osc2_det, p.osc2_detune);
        let phase1 = 0, phase2 = 0, low = 0, band = 0;
        for (let j = 0; j < duration; j++) {
          const envelope = j < attack ? j / attack : j >= attack + sustain ? 1 - (j - attack - sustain) / release : 1;
          let frequency = freq1;
          if (p.osc1_xenv) frequency *= envelope * envelope;
          phase1 += frequency;
          phase2 += freq2 * (p.osc2_xenv ? envelope * envelope : 1);
          let sample = oscillators[p.osc1_waveform](phase1) * p.osc1_vol + oscillators[p.osc2_waveform](phase2) * p.osc2_vol;
          if (p.noise_fader) sample += (Math.random() * 2 - 1) * p.noise_fader * envelope;
          sample *= envelope / 255;
          low += f * band;
          const high = p.fx_resonance / 255 * (sample - band) - low;
          band += f * high;
          sample = [sample, high, low, band, low + high][p.fx_filter];
          const pan = sine(j * panFrequency) * p.fx_pan_amt / 512 + .5;
          sample *= 39 * p.env_master;
          // Preserve Sonant-X's 16-bit wrapping, clipping and stereo gain.
          noteL[j] = quantize(sample * (1 - pan));
          noteR[j] = quantize(sample * pan);
        }
        cache[note] = [noteL, noteR];
      }
      const [noteL, noteR] = cache[note];
      for (let j = 0; j < duration; j++) {
        const position = (r * row + j) % length;
        trackL[position] += noteL[j]; trackR[position] += noteR[j];
      }
    }
    for (let j = 0; j < length; j++) { left[j] += trackL[j]; right[j] += trackR[j]; }
    const delay = Math.round(p.fx_delay_time * row / 2), amount = p.fx_delay_amt / 255;
    if (delay && amount) {
      for (let echo = 1, gain = amount; gain > .005 && echo < 16; echo++, gain *= amount) {
        for (let j = 0; j < length; j++) {
          const position = (j + delay * echo) % length;
          left[position] += trackL[j] * gain; right[position] += trackR[j] * gain;
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return output;
}
