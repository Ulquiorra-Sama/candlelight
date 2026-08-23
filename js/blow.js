/* ============================================================================
   blow.js — detects someone actually blowing at the microphone.

   PRIVACY: audio is read from an AnalyserNode and thrown away frame by frame.
   Nothing is recorded, buffered, stored, or sent anywhere. The stream is
   stopped and the AudioContext closed the moment we are done with it.

   ---------------------------------------------------------------------------
   Why this isn't just "is it loud":

   A volume threshold fires on talking, laughing, clapping, a passing truck —
   which is miserable, because the candles blow out while everyone is singing.
   So a frame only counts as a blow if THREE things are true at once:

     1. energy   — clearly above the room's own noise floor, which we measure
                   for the first second rather than hard-coding
     2. lowRatio — breath is bass-heavy; most of its energy sits under ~500 Hz
     3. flatness — breath is broadband noise. Speech and singing are tonal:
                   harmonic spikes with troughs between them, which scores low
                   on spectral flatness. This is the test that rejects a room
                   full of people singing Happy Birthday.

   Plus a sustain requirement, so a cough or a clap — broadband but momentary —
   doesn't count.
   ========================================================================== */

/* Tunable in one place. Open the card with ?debug to see these values live on
   the actual device and adjust if the room is unusual. */
export const TUNING = {
  fftSize: 2048,          // ~23 Hz per bin at 48 kHz — enough low-end detail
  smoothing: 0.6,
  calibrationMs: 1200,    // listen to the room before judging anything
  lowCutHz: 500,          // "low" band ceiling
  ceilingHz: 8000,        // ignore bins above this; they're mostly hiss
  lowRatioMin: 0.52,
  flatnessMin: 0.28,
  rmsFloorMult: 2.5,      // must beat the measured noise floor by this much
  rmsAbsMin: 0.015,       // ...and never trigger below this in a silent room
  rmsFull: 0.16,          // rms that maps to full strength
  armFrames: 5,           // ~80 ms of qualifying frames before we believe it
  releaseMs: 160,         // grace period so a breath pause isn't a hard stop
};

export function isSupported() {
  return !!(
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    (window.AudioContext || window.webkitAudioContext)
  );
}

/* Maps whatever the browser threw into a short reason string that main.js can
   turn into friendly copy. Never surfaced raw. */
function classify(err) {
  if (!window.isSecureContext) return 'insecure';
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' ||
      name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' ||
      name === 'OverconstrainedError') return 'nodevice';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'busy';
  return 'failed';
}

export function createBlowDetector({ onLevel, onDebug } = {}) {
  let ctx = null;
  let stream = null;
  let source = null;
  let analyser = null;
  let freqData = null;
  let timeData = null;
  let raf = 0;
  let running = false;

  let calibrateUntil = 0;
  let floorSum = 0;
  let floorCount = 0;
  let floorRms = 0.004;

  let armCount = 0;
  let lastQualifyAt = 0;

  const emit = (v) => { if (onLevel) onLevel(v); };

  function analyseFrame(now) {
    if (!running) return;

    /* --- time domain: raw energy ------------------------------------- */
    analyser.getByteTimeDomainData(timeData);
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / timeData.length);

    /* --- frequency domain: shape ------------------------------------- */
    /* Float data is in dB. Converting back to linear magnitude matters —
       averaging decibels directly would badly skew both metrics below. */
    analyser.getFloatFrequencyData(freqData);

    const hzPerBin = ctx.sampleRate / TUNING.fftSize;
    const lowBin = Math.max(2, Math.round(TUNING.lowCutHz / hzPerBin));
    const ceilBin = Math.min(freqData.length - 1,
                             Math.round(TUNING.ceilingHz / hzPerBin));

    const EPS = 1e-10;
    let total = 0, low = 0, logSum = 0, count = 0;

    for (let i = 1; i <= ceilBin; i++) {         // skip bin 0 (DC offset)
      const db = freqData[i];
      const mag = db === -Infinity ? 0 : Math.pow(10, db / 20);
      total += mag;
      if (i <= lowBin) low += mag;
      logSum += Math.log(mag + EPS);
      count++;
    }

    const lowRatio = total > EPS ? low / total : 0;
    const geoMean = Math.exp(logSum / count);
    const arithMean = total / count;
    const flatness = arithMean > EPS ? geoMean / arithMean : 0;

    /* --- calibration: learn the room --------------------------------- */
    if (now < calibrateUntil) {
      floorSum += rms;
      floorCount++;
      if (onDebug) onDebug({ calibrating: true, rms, lowRatio, flatness });
      emit(0);
      raf = requestAnimationFrame(analyseFrame);
      return;
    }
    if (floorCount) {
      floorRms = Math.max(0.002, floorSum / floorCount);
      floorSum = 0;
      floorCount = 0;
    }

    /* --- the three-way test ------------------------------------------ */
    const gate = Math.max(floorRms * TUNING.rmsFloorMult, TUNING.rmsAbsMin);
    const qualifies =
      rms > gate &&
      lowRatio > TUNING.lowRatioMin &&
      flatness > TUNING.flatnessMin;

    if (qualifies) {
      armCount++;
      lastQualifyAt = now;
    } else if (now - lastQualifyAt > TUNING.releaseMs) {
      armCount = 0;
    }

    let level = 0;
    if (armCount >= TUNING.armFrames) {
      const span = Math.max(1e-6, TUNING.rmsFull - gate);
      level = Math.min(1, Math.max(0, (rms - gate) / span));
    }

    if (onDebug) {
      onDebug({ calibrating: false, rms, lowRatio, flatness, gate,
                floorRms, qualifies, armCount, level });
    }

    emit(level);
    raf = requestAnimationFrame(analyseFrame);
  }

  return {
    isSupported,

    /* Must be called from inside a user gesture handler. iOS Safari will not
       create or resume an AudioContext outside one, and will not grant the
       microphone either. */
    async start() {
      if (running) return;
      if (!isSupported()) {
        const e = new Error('unsupported');
        e.reason = window.isSecureContext ? 'unsupported' : 'insecure';
        throw e;
      }

      try {
        /* Turning these three OFF is essential. Browser noise suppression is
           tuned to remove exactly the broadband breath noise we need to hear,
           and auto gain would fight our own noise-floor calibration. */
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });

        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        if (ctx.state === 'suspended') await ctx.resume();

        analyser = ctx.createAnalyser();
        analyser.fftSize = TUNING.fftSize;
        analyser.smoothingTimeConstant = TUNING.smoothing;

        source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        /* Deliberately NOT connected to ctx.destination — we never want to
           play her own microphone back at her. */

        freqData = new Float32Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);

        running = true;
        calibrateUntil = performance.now() + TUNING.calibrationMs;
        floorSum = 0;
        floorCount = 0;
        armCount = 0;
        raf = requestAnimationFrame(analyseFrame);
      } catch (err) {
        this.stop();
        const e = new Error('microphone unavailable');
        e.reason = classify(err);
        throw e;
      }
    },

    stop() {
      running = false;
      cancelAnimationFrame(raf);
      try { if (source) source.disconnect(); } catch (_) {}
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());   // releases the mic
      }
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
      source = null;
      stream = null;
      analyser = null;
      ctx = null;
      freqData = null;
      timeData = null;
      emit(0);
    },

    get running() { return running; },
  };
}
