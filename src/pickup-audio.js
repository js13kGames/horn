// Short, rising pickup chimes cut through combat; the backing track briefly ducks.
function pickupSound(type) {
  if (!ac || muted) return;
  if (musicGain) {
    const gain = musicGain.gain, now = ac.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.setTargetAtTime(.1, now, .01);
    gain.setTargetAtTime(.45, now + .3, .04);
  }
  [[880,1320], [660,880,1320], [784,988,1175], [988,1318,1976]][type]
    .forEach((frequency, i) => tone(frequency, .16, "triangle", .075, frequency, i * .08));
}
