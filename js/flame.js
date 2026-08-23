/* ============================================================================
   flame.js — keeps the candle flames alive.

   Flames are plain DOM elements. This module writes four CSS custom properties
   on each one every frame (--lean, --scale, --squash, --flicker) and lets CSS
   do the actual drawing. That keeps them crisp at any size, costs no canvas,
   and means a flame can react continuously to how hard someone is blowing.
   ========================================================================== */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* Frame-rate independent smoothing: approach the target with a time constant
   rather than a fixed per-frame fraction, so a 120Hz phone and a 60Hz laptop
   settle at the same speed. */
const approach = (dt, tau) => 1 - Math.exp(-dt / tau);

export function createFlames(candleEls, { reducedMotion = false } = {}) {
  const n = Math.max(1, candleEls.length);

  const flames = candleEls.map((el, i) => ({
    candle: el,
    flame: el.querySelector('.flame'),
    /* Desynchronise every flame, otherwise the cake pulses in unison and the
       whole thing reads as a looping GIF. */
    phase: i * 1.73 + Math.random() * 6.28,
    /* -1 at the left edge of the cake, +1 at the right. Used to fan the
       flames outward slightly when blown, like a real breath spreading. */
    bias: n === 1 ? 0 : (i / (n - 1)) * 2 - 1,
    lean: 0,
    scale: 1,
    flicker: 1,
  }));

  let blow = 0;        // 0..1, driven by blow.js or by nothing at all
  let raf = 0;
  let last = 0;
  let running = false;

  function writeVars(f) {
    const s = f.flame.style;
    s.setProperty('--lean', f.lean.toFixed(4));
    s.setProperty('--scale', f.scale.toFixed(4));
    /* Pre-computed rather than using CSS abs(), which is too new to depend on. */
    s.setProperty('--squash', (1 - Math.abs(f.lean) * 0.28).toFixed(4));
    s.setProperty('--flicker', f.flicker.toFixed(3));
  }

  function frame(now) {
    if (!running) return;

    const dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 0.016;
    last = now;

    for (const f of flames) {
      if (f.candle.classList.contains('out')) continue;

      f.phase += dt;
      const t = f.phase;

      /* Idle: three sines at unrelated frequencies never quite repeat, which
         is what makes a flame look alive instead of animated. */
      const idleLean = reducedMotion ? 0
        : Math.sin(t * 2.1) * 0.05 + Math.sin(t * 5.27) * 0.022;
      const idleScale = reducedMotion ? 1
        : 1 + Math.sin(t * 4.4) * 0.05 + Math.sin(t * 9.1) * 0.02;
      const idleFlicker = reducedMotion ? 1
        : 0.92 + Math.sin(t * 8.7) * 0.05 + Math.sin(t * 3.13) * 0.03;

      /* Blowing: lean hard, thin out, and gutter. The gust term keeps it
         unsteady so it never looks like a static tilt. */
      const gust = blow * (0.85 + Math.sin(t * 13.3) * 0.15);
      const targetLean = idleLean + gust * (0.95 + f.bias * 0.18);
      const targetScale = idleScale * (1 - blow * 0.28);
      const targetFlicker = clamp(
        idleFlicker - blow * 0.22 + Math.sin(t * 19.7) * blow * 0.25,
        0.12, 1
      );

      f.lean = lerp(f.lean, targetLean, approach(dt, 0.055));
      f.scale = lerp(f.scale, targetScale, approach(dt, 0.09));
      f.flicker = lerp(f.flicker, targetFlicker, approach(dt, 0.04));

      writeVars(f);
    }

    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },

    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },

    /* Called every frame by the blow detector, or on a timer by the tap
       fallback. 0 = still air, 1 = blowing hard. */
    setBlow(v) {
      blow = clamp(v, 0, 1);
    },

    /* Reset a flame's state so relighting looks right rather than resuming
       mid-gutter. */
    relight() {
      blow = 0;
      for (const f of flames) {
        f.lean = 0;
        f.scale = 1;
        f.flicker = 1;
        writeVars(f);
      }
    },
  };
}
