let musicBuffers = [], musicPending, musicSource, musicGain, musicOffset = 0, musicStarted = 0, musicStage = 0;
function music(reset = false) {
  const stage = +bossSpawned;
  if (musicSource && (reset || stage !== musicStage || mode !== "playing" || muted)) {
    musicOffset += ac.currentTime - musicStarted;
    const duration = musicSource.buffer.duration;
    if (musicOffset >= duration) musicOffset = musicStage + (musicOffset - musicStage) % (duration - musicStage);
    musicSource.stop();
    musicSource.disconnect();
    musicSource = null;
  }
  if (reset || stage !== musicStage) musicOffset = 0;
  musicStage = stage;
  if (!ac || ac.state === "closed" || mode !== "playing" || muted) return;
  const buffer = musicBuffers[stage];
  if (!buffer) {
    if (!musicPending) musicPending = Promise.resolve().then(() => renderSonantSong(hornSong, ac)).then(buffer => {
      musicBuffers[0] = buffer;
      music();
      return Promise.all([renderSonantSong(bossCue, ac), renderSonantSong(bossSong, ac)]);
    }).then(([cue, loop]) => {
      const buffer = ac.createBuffer(2, 22050 + loop.length, 22050);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        data.set(cue.getChannelData(channel).subarray(0, 22050));
        data.set(loop.getChannelData(channel), 22050);
        for (let i = 0; i < 110; i++) {
          data[22049 - i] *= i / 110;
          data[22050 + i] *= i / 110;
          data[buffer.length - 1 - i] *= i / 110;
        }
      }
      musicBuffers[1] = buffer;
      music();
    }).catch(() => {});
    return;
  }
  if (musicSource) return;
  if (!musicGain) {
    musicGain = ac.createGain();
    musicGain.gain.value = .45;
    musicGain.connect(ac.destination);
  }
  musicSource = ac.createBufferSource();
  musicSource.buffer = buffer;
  musicSource.loop = true;
  musicSource.loopStart = stage;
  musicSource.loopEnd = buffer.duration;
  musicSource.connect(musicGain);
  musicSource.start(0, musicOffset);
  musicStarted = ac.currentTime;
}
