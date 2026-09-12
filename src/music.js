// IRON PRISM — original music for HORN, 152 BPM, sixteen-bar loop.
// Sonant-X song format. Notes are MIDI + 75; zero is a rest.
const hornSong = (() => {
    const roots = [40, 40, 36, 38, 40, 43, 36, 35];
    const instrument = (settings, patterns, order) => Object.assign({
        osc1_oct:8, osc1_det:0, osc1_detune:0, osc1_xenv:0, osc1_vol:140, osc1_waveform:2,
        osc2_oct:8, osc2_det:0, osc2_detune:0, osc2_xenv:0, osc2_vol:0, osc2_waveform:0,
        noise_fader:0, env_attack:80, env_sustain:1800, env_release:2200, env_master:70,
        fx_filter:2, fx_freq:4200, fx_resonance:180, fx_delay_time:0, fx_delay_amt:0,
        fx_pan_freq:0, fx_pan_amt:0, lfo_osc1_freq:0, lfo_fx_freq:0, lfo_freq:0, lfo_amt:0, lfo_waveform:0,
        p:order || [1,2,3,4,5,6,7,8], c:patterns.map(n => ({n:n.map(v => v ? v+75 : 0)}))
    }, settings);
    const rows = fn => Array.from({length:32}, (_,r) => fn(r));
    const lead = ["l o s  q o n jl  l os v s q onl "," l no s q on l jl  s q o n jn   ","h l o s q o l jl o st s o l jh  ","j n q  s qn l j n q v tsq n ljn "].map(s=>Array.from(s,c=>c.charCodeAt(0)-32));
    return {songLen:256*60/152/4, rowLen:Math.round(60*44100/152/4), endPattern:7, songData:[
        instrument({osc1_oct:7,osc1_waveform:0,osc1_vol:255,osc1_xenv:1,env_attack:35,env_sustain:100,env_release:5400,env_master:110,fx_filter:0}, [rows(r => [0,6,10,16,22,24,30].includes(r)?60:0),rows(r => [0,6,10,16,22,26,28,30].includes(r)?60:0)], [1,1,1,2,1,1,1,2]),
        instrument({osc1_oct:7,osc1_waveform:3,osc1_vol:110,osc1_xenv:1,noise_fader:180,env_attack:35,env_sustain:250,env_release:4200,env_master:88,fx_filter:1,fx_freq:1400,fx_resonance:220}, [rows(r=>r%8===4?65:0),rows(r=>[4,12,20,26,28,30,31].includes(r)?65:0)], [1,1,1,2,1,1,1,2]),
        instrument({osc1_vol:0,noise_fader:150,env_attack:20,env_sustain:50,env_release:650,env_master:42,fx_filter:1,fx_freq:7000,fx_resonance:210,fx_pan_amt:95,fx_pan_freq:4}, [rows(r=>r%2===0||r%8===7?72:0)], [1,1,1,1,1,1,1,1]),
        instrument({osc1_waveform:2,osc1_vol:165,osc2_oct:7,osc2_vol:70,osc2_waveform:0,env_attack:60,env_sustain:1900,env_release:1300,env_master:95,fx_freq:1700,fx_resonance:185}, roots.map(root=>rows(r=>[7,15,23,31].includes(r)?0:root+(r%8===6?12:r%16===10?7:0)))),
        instrument({osc1_waveform:1,osc1_vol:100,osc2_vol:45,osc2_waveform:2,osc2_detune:5,env_attack:100,env_sustain:3800,env_release:3300,env_master:75,fx_freq:5000,fx_resonance:170,fx_delay_time:6,fx_delay_amt:62,fx_pan_amt:32,fx_pan_freq:3},lead,[1,2,3,4,1,2,3,4]),
        instrument({osc1_waveform:3,osc1_vol:140,osc2_vol:35,osc2_oct:9,env_attack:180,env_sustain:1000,env_release:1700,env_master:42,fx_freq:6200,fx_resonance:155,fx_pan_amt:160,fx_pan_freq:5},roots.map(root=>rows(r=>r%2?0:root+24+[0,7,12,15][r/2%4])))
    ]};
})();
