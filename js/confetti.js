/* ============================================================================
   confetti.js — a small canvas particle burst.

   Paper rectangles, not dots: each one is scaled horizontally by a sine of its
   own spin, so it turns edge-on as it tumbles and briefly disappears. That
   flutter is most of what separates paper confetti from falling sprinkles.
   ========================================================================== */

const COLORS = [
  '#C0674B',  // terracotta
  '#E8A33D',  // gold
  '#7C8C6F',  // sage
  '#5C6B51',  // deep sage
  '#EFE2D2',  // frosting
  '#FBF6EC',  // cream
];

const rand = (a, b) => a + Math.random() * (b - a);

export function createConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  let particles = [];
  let raf = 0;
  let running = false;
  let last = 0;
  let w = 0, h = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  function spawnBurst(cx, cy, count) {
    for (let i = 0; i < count; i++) {
      /* Radiating up and outward from the cake, weighted upward. */
      const angle = rand(-Math.PI * 0.92, -Math.PI * 0.08);
      const speed = rand(220, 560);
      particles.push({
        x: cx + rand(-14, 14),
        y: cy + rand(-10, 10),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: rand(5, 10),
        h: rand(8, 15),
        rot: rand(0, Math.PI * 2),
        vrot: rand(-9, 9),
        spin: rand(0, Math.PI * 2),
        vspin: rand(4, 11),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: rand(2.2, 3.4),
        age: 0,
      });
    }
  }

  function spawnFall(count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: rand(0, w),
        y: rand(-h * 0.5, -10),
        vx: rand(-30, 30),
        vy: rand(60, 150),
        w: rand(5, 9),
        h: rand(8, 14),
        rot: rand(0, Math.PI * 2),
        vrot: rand(-5, 5),
        spin: rand(0, Math.PI * 2),
        vspin: rand(3, 8),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: rand(4, 7),
        age: 0,
      });
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;

    ctx.clearRect(0, 0, w, h);

    const GRAVITY = 620;
    const DRAG = 0.92;      // per-second velocity retention

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;

      p.vy += GRAVITY * dt;
      p.vx *= Math.pow(DRAG, dt * 6);
      p.vy *= Math.pow(0.985, dt * 6);

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.spin += p.vspin * dt;

      /* A little lateral sway, like paper catching air. */
      p.x += Math.sin(p.spin * 0.7) * 22 * dt;

      if (p.age > p.life || p.y > h + 40) {
        particles.splice(i, 1);
        continue;
      }

      const fade = p.age > p.life - 0.9
        ? Math.max(0, (p.life - p.age) / 0.9)
        : 1;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      /* The edge-on flutter. */
      ctx.scale(Math.cos(p.spin), 1);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (particles.length === 0) {
      running = false;
      ctx.clearRect(0, 0, w, h);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  return {
    /* cx, cy are viewport coordinates — pass the cake's position so the
       confetti appears to come off the candles. */
    burst(cx, cy) {
      resize();
      spawnBurst(cx, cy, 90);
      spawnFall(40);
      run();
    },

    clear() {
      running = false;
      cancelAnimationFrame(raf);
      particles = [];
      ctx.clearRect(0, 0, w, h);
    },

    destroy() {
      this.clear();
      window.removeEventListener('resize', resize);
    },
  };
}
