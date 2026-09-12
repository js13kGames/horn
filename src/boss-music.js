// Synthesized arrangements from the two user-supplied recordings.
// Simon 1994RD: first-second D–C–B stabs. R.A.V.E.: opening chromatic riff.
// The synth timbres and percussion approximate the recordings; no samples are embedded.
const bossTrack = (instrument, patterns, p, settings = {}) => ({
    ...hornSong.songData[instrument], osc1_detune:17, osc2_detune:20, ...settings, p,
    c: patterns.map(n => ({n:n.map(note => note ? note + 75 : 0)}))
});
const bossRows = fn => Array.from({length:32}, (_,r) => fn(r));
const bossCue = {rowLen:6400,endPattern:0,songLen:1,songData:[
    bossTrack(3,[[38,38,38,36,36,36,35]],[1],{
        osc2_oct:10,osc2_waveform:2,osc2_vol:75,env_attack:88,env_sustain:2425,env_release:3750,env_master:100,fx_freq:2700
    })
]};
const bossSong = {rowLen:3771,endPattern:3,songLen:128*3771/44100,songData:[
    bossTrack(0,[bossRows(r=>r%4===0?60:0)],[1,1,1,1]),
    bossTrack(1,[bossRows(r=>r%8===4?65:0)],[1,1,1,1]),
    bossTrack(2,[bossRows(r=>r%2===0||r%16===15?72:0)],[1,1,1,1]),
    bossTrack(3,[bossRows(r=>[38,0,38,0,48,0,44,0,0,0,0,0,0,0,50,0][r%16])],[1,1,1,1],{
        env_sustain:2400,env_release:3100,env_master:105,fx_freq:2300
    }),
    bossTrack(4,[0,12].map(o=>bossRows(r=>{
        const note=[74,0,74,0,0,0,72,0,75,0,0,76,0,0,77,0][r%16];
        return note?note+o:0;
    })),[1,2,1,2],{env_sustain:2600,env_release:2300,env_master:85,fx_delay_time:3,fx_delay_amt:42})
]};
