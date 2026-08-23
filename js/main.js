/* ============================================================================
   main.js — scene state machine and wiring.

   Scene order:  sealed → opening → cake → blowing → wish → message
   The current scene lives in [data-scene] on .stage; CSS does the rest.
   ========================================================================== */

import { CARD } from '../card-config.js';
import { createFlames } from './flame.js';
import { createBlowDetector, isSupported as micSupported } from './blow.js';
import { createConfetti } from './confetti.js';

const $ = (id) => document.getElementById(id);

const stage      = $('stage');
const card       = $('card');
const cardSlot   = $('cardSlot');
const openBtn    = $('openBtn');
const candlesEl  = $('candles');
const promptText = $('promptText');
const micBtn     = $('micBtn');
const meter      = $('meter');
const tapHint    = $('tapHint');
const skipBtn    = $('skipBtn');
const messageEl  = $('message');
const replayBtn  = $('replayBtn');
const statusEl   = $('status');
const canvas     = $('confetti');

const reducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEBUG = new URLSearchParams(location.search).has('debug');

/* How much sustained blowing clears the whole cake, in "level-seconds".
   Divided across however many candles there are, so a 12-candle cake doesn't
   take twice as long as a 6-candle one — it just goes out in a faster
   cascade, which looks better anyway. */
const TOTAL_CHARGE = 0.9;
const MIN_GAP_MS = 90;      // never snuff two candles in the same instant

/* ==========================================================================
   Config
   ========================================================================== */

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function resolveCandleCount(cfg) {
  if (Number.isFinite(cfg.candleCount) && cfg.candleCount > 0) {
    return Math.min(24, Math.round(cfg.candleCount));
  }
  if (Number.isFinite(cfg.age) && cfg.age > 0) {
    /* Capped at 8. The number on a cake is symbolic once you're past a
       certain age, and more than eight either overflows the card or shrinks
       the candles below a tappable size. */
    return Math.min(8, Math.max(3, Math.round(cfg.age)));
  }
  return 6;
}

function resolveGreeting(cfg) {
  const base = cfg.greeting || 'Happy Birthday';
  if (!Number.isFinite(cfg.age) || cfg.age <= 0) return base;
  /* Slot the age into whatever greeting they wrote, rather than overwriting
     it: "Happy Birthday" → "Happy 60th Birthday". */
  return base.includes('Birthday')
    ? base.replace('Birthday', `${ordinal(cfg.age)} Birthday`)
    : base;
}

const CANDLE_COUNT = resolveCandleCount(CARD);
const PER_CANDLE = TOTAL_CHARGE / CANDLE_COUNT;

/* ==========================================================================
   Build the DOM from config
   ========================================================================== */

$('greetingText').textContent = resolveGreeting(CARD);
$('cardName').textContent = CARD.name || 'Mom';

/* Candle wax colours, cycled so neighbours never match. */
const WAX = [
  ['#F3E7D2', '#C0674B'],
  ['#F3E7D2', '#7C8C6F'],
  ['#F3E7D2', '#E8A33D'],
  ['#F3E7D2', '#5C6B51'],
];

function buildCandles() {
  candlesEl.innerHTML = '';
  /* Past six, tighten the spacing so the row stays about as wide as the cake
     instead of hanging off both sides of it. */
  candlesEl.classList.toggle('candles--dense', CANDLE_COUNT > 6);
  for (let i = 0; i < CANDLE_COUNT; i++) {
    const b = document.createElement('button');
    b.className = 'candle';
    b.type = 'button';
    b.dataset.i = String(i);
    b.setAttribute('aria-label', `Blow out candle ${i + 1} of ${CANDLE_COUNT}`);
    const [c1, c2] = WAX[i % WAX.length];
    b.style.setProperty('--c1', c1);
    b.style.setProperty('--c2', c2);
    b.innerHTML =
      '<span class="flame"><span class="flame-core"></span></span>' +
      '<span class="smoke"></span>' +
      '<span class="wick"></span>' +
      '<span class="stick"></span>';
    candlesEl.appendChild(b);
  }
  return Array.from(candlesEl.querySelectorAll('.candle'));
}

function buildMessage() {
  messageEl.innerHTML = '';
  messageEl.tabIndex = -1;

  const lines = Array.isArray(CARD.lines) ? CARD.lines : [];
  lines.forEach((text, i) => {
    const p = document.createElement('p');
    p.className = 'line';
    p.style.setProperty('--i', String(i));
    p.textContent = text;
    messageEl.appendChild(p);
  });

  if (CARD.signoff) {
    const s = document.createElement('p');
    s.className = 'signoff';
    s.style.setProperty('--i', String(lines.length));
    s.textContent = CARD.signoff;
    messageEl.appendChild(s);
  }

  /* A closing flourish to balance the one at the top. */
  const head = document.querySelector('.card-head .sprig');
  if (head) {
    const foot = head.cloneNode(true);
    foot.classList.add('sprig--foot');
    messageEl.appendChild(foot);
  }
}

/* Measure every sprig shape so the draw-on has an exact dash length. Guessing
   these by eye left visible gaps and stray dashes. */
function initSprigs() {
  document.querySelectorAll('.sprig').forEach((svg) => {
    svg.querySelectorAll('path, ellipse, circle').forEach((shape, i) => {
      const len = typeof shape.getTotalLength === 'function'
        ? shape.getTotalLength()
        : 200;
      shape.style.setProperty('--len', len.toFixed(1));
      shape.style.setProperty('--delay', (0.05 + i * 0.11).toFixed(2) + 's');
    });
  });
}

const candles = buildCandles();
buildMessage();
initSprigs();

/* Order candles go out in: outermost pair first, working inward. A breath
   hits the edges of a cake before the middle. */
function outsideIn(n) {
  const order = [];
  let lo = 0, hi = n - 1;
  while (lo <= hi) {
    if (lo === hi) { order.push(lo); break; }
    order.push(lo, hi);
    lo++; hi--;
  }
  return order;
}
const ORDER = outsideIn(CANDLE_COUNT);

/* ==========================================================================
   Systems
   ========================================================================== */

const flames = createFlames(candles, { reducedMotion });
const confetti = createConfetti(canvas);

let detector = null;
let micActive = false;
let micEverGranted = false;

let scene = 'sealed';
let litCount = CANDLE_COUNT;
let charge = 0;
let lastOutAt = 0;
let lastLevelAt = 0;
let nextIndex = 0;

flames.start();
updateLit();
fitCard();
window.addEventListener('resize', fitCard);
window.addEventListener('orientationchange', fitCard);
/* Web fonts and the script face can change the card's height after first
   paint, so measure again once they've settled. */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(fitCard).catch(() => {});
}

/* ==========================================================================
   Scene machine
   ========================================================================== */

/* The card is authored at a comfortable portrait size. On a viewport too short
   for it — a phone held sideways, mostly — shrink the whole card to fit rather
   than letting it run off the top and bottom. Transforms don't affect layout,
   so measuring offsetHeight here can't feed back into itself. */
function fitCard() {
  const natural = card.offsetHeight;
  if (!natural) return;
  const available = window.innerHeight - 24;
  const s = Math.min(1, available / natural);
  stage.style.setProperty('--fit', s.toFixed(4));
  fitCandles();
}

/* Safety net for a hand-set `candleCount` far above the default cap: if the row
   is still wider than the card, shrink it to fit rather than letting candles
   hang off the edges. Never scales up, so the normal case is untouched. */
function fitCandles() {
  const cs = getComputedStyle(card);
  const inner = card.clientWidth
    - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  candlesEl.style.removeProperty('--candle-scale');
  const natural = candlesEl.scrollWidth;
  if (!natural || !inner) return;
  const s = Math.min(1, (inner - 8) / natural);
  if (s < 1) candlesEl.style.setProperty('--candle-scale', s.toFixed(4));
}

function setScene(next) {
  scene = next;
  stage.dataset.scene = next;
  /* The card gets taller when the message appears, so re-measure. */
  fitCard();
}

function say(msg) {
  statusEl.textContent = msg;
}

function updateLit() {
  stage.style.setProperty('--lit', (litCount / CANDLE_COUNT).toFixed(3));
}

/* ==========================================================================
   Opening the envelope
   ========================================================================== */

openBtn.addEventListener('click', () => {
  if (scene !== 'sealed') return;
  setScene('opening');
  say('The card is opening.');

  /* Drop the envelope-shaped clip exactly as the card begins to slide. Until
     now it has guaranteed nothing pokes out past the envelope; from here the
     card needs to be able to rise above it. */
  setTimeout(() => cardSlot.classList.add('free'), reducedMotion ? 60 : 900);

  const wait = reducedMotion ? 220 : 1900;
  setTimeout(() => {
    setScene('cake');
    offerMic();
    /* Move focus to the thing she should do next, now that it exists. */
    const target = micBtn.hidden ? candles[0] : micBtn;
    if (target) target.focus({ preventScroll: true });
    say(`${CANDLE_COUNT} candles are lit. ${CARD.wishPrompt || 'Make a wish'}.`);
  }, wait);
});

/* ==========================================================================
   Microphone
   ========================================================================== */

function offerMic() {
  promptText.textContent = CARD.wishPrompt || 'Make a wish';

  if (!CARD.enableMic || !micSupported()) {
    /* No offer, no prompt, no explanation needed — tapping is presented as
       the way it works rather than as a downgrade. */
    micBtn.hidden = true;
    tapHint.textContent = 'Tap each candle to blow it out.';
    fitCard();
    return;
  }

  micBtn.hidden = false;
  micBtn.disabled = false;
  micBtn.textContent = 'Blow out the candles';
  tapHint.textContent = 'or tap each candle';

  /* Revealing the button makes the card taller, so re-measure — setScene's own
     fitCard() ran before it existed. */
  fitCard();
}

function fallbackToTap() {
  micActive = false;
  micBtn.hidden = true;
  meter.hidden = true;
  tapHint.textContent = 'Tap each candle to blow it out.';
  flames.setBlow(0);
  fitCard();
}

micBtn.addEventListener('click', async () => {
  micBtn.disabled = true;
  micBtn.textContent = 'One moment…';

  detector = detector || createBlowDetector({
    onLevel: handleLevel,
    onDebug: DEBUG ? showDebug : null,
  });

  try {
    /* Called straight out of the click handler — iOS Safari requires both
       getUserMedia and the AudioContext to start inside the gesture. */
    await detector.start();
    micActive = true;
    micEverGranted = true;
    micBtn.hidden = true;
    meter.hidden = false;
    tapHint.textContent = 'or tap each candle';
    say('Microphone on. Blow at the screen to put the candles out.');
  } catch (err) {
    /* Every failure path lands here and looks identical to her: the card
       simply becomes a tap-the-candles card. No error, no apology. */
    fallbackToTap();
    say('Tap each candle to blow it out.');
  }
});

/* ==========================================================================
   Blowing
   ========================================================================== */

function handleLevel(level) {
  const now = performance.now();
  const dt = lastLevelAt ? Math.min(0.05, (now - lastLevelAt) / 1000) : 0;
  lastLevelAt = now;

  flames.setBlow(level);
  meter.style.setProperty('--level', level.toFixed(3));

  if (scene !== 'cake' && scene !== 'blowing') return;
  if (level <= 0.06) return;

  if (scene === 'cake') setScene('blowing');

  charge = Math.min(charge + level * dt, PER_CANDLE * 2);

  while (charge >= PER_CANDLE && litCount > 0) {
    if (now - lastOutAt < MIN_GAP_MS) break;
    charge -= PER_CANDLE;
    extinguishNext(now);
  }
}

function extinguishNext(now) {
  while (nextIndex < ORDER.length) {
    const i = ORDER[nextIndex++];
    const el = candles[i];
    if (!el.classList.contains('out')) {
      snuff(el, now);
      return;
    }
  }
}

function snuff(el, now) {
  if (el.classList.contains('out')) return;
  el.classList.add('out');
  el.disabled = true;
  el.setAttribute('aria-label', 'Candle is out');
  litCount--;
  lastOutAt = now || performance.now();
  updateLit();

  if (litCount > 0) {
    say(`${litCount} candle${litCount === 1 ? '' : 's'} left.`);
  } else {
    allOut();
  }
}

/* Tapping is not a lesser path — it does exactly the same thing. */
candlesEl.addEventListener('click', (e) => {
  const el = e.target.closest('.candle');
  if (!el || el.classList.contains('out')) return;
  if (scene !== 'cake' && scene !== 'blowing') return;
  snuff(el);
});

/* ==========================================================================
   The wish, and the message
   ========================================================================== */

function allOut() {
  setScene('wish');
  say('All the candles are out.');

  /* Release the microphone the moment it stops being useful — no reason to
     hold it open while she reads. */
  stopMic();

  const hush = reducedMotion ? 120 : 620;
  setTimeout(() => {
    setScene('message');
    if (CARD.confetti && !reducedMotion) fireConfetti();
    messageEl.focus({ preventScroll: true });
  }, hush);
}

function fireConfetti() {
  const r = candlesEl.getBoundingClientRect();
  confetti.burst(r.left + r.width / 2, r.top + r.height / 2);
}

function stopMic() {
  if (detector && detector.running) detector.stop();
  micActive = false;
  meter.hidden = true;
  flames.setBlow(0);
}

skipBtn.addEventListener('click', () => {
  candles.forEach((el) => {
    el.classList.add('out');
    el.disabled = true;
  });
  litCount = 0;
  nextIndex = ORDER.length;
  updateLit();
  stopMic();
  setScene('message');
  messageEl.focus({ preventScroll: true });
  say('Showing the message.');
});

/* ==========================================================================
   Replay
   ========================================================================== */

replayBtn.addEventListener('click', async () => {
  confetti.clear();

  candles.forEach((el, i) => {
    el.classList.remove('out');
    el.disabled = false;
    el.setAttribute('aria-label', `Blow out candle ${i + 1} of ${CANDLE_COUNT}`);
  });

  litCount = CANDLE_COUNT;
  charge = 0;
  nextIndex = 0;
  lastOutAt = 0;
  lastLevelAt = 0;
  flames.relight();
  updateLit();

  setScene('cake');
  offerMic();

  /* Permission already granted this session, so re-acquiring is silent — she
     is not prompted a second time. This click is itself a user gesture, which
     is what iOS needs. */
  if (micEverGranted && CARD.enableMic && micSupported()) {
    try {
      await detector.start();
      micActive = true;
      micBtn.hidden = true;
      meter.hidden = false;
    } catch (err) {
      fallbackToTap();
    }
  }

  const target = micBtn.hidden ? candles[0] : micBtn;
  if (target) target.focus({ preventScroll: true });
  say('The candles are lit again.');
});

/* ==========================================================================
   Debug overlay — ?debug
   Lets the three detection signals be read on the real phone, in the real
   room, which is the only place the thresholds can honestly be tuned.
   ========================================================================== */

let debugEl = null;
function showDebug(d) {
  if (!debugEl) {
    debugEl = document.createElement('pre');
    debugEl.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:8px 10px;' +
      'background:rgba(20,17,13,.86);color:#EFE2D2;font:11px/1.5 ui-monospace,monospace;' +
      'border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(debugEl);
  }
  const f = (v, n = 3) => (v === undefined ? '—' : Number(v).toFixed(n));
  debugEl.textContent =
    (d.calibrating ? 'CALIBRATING…\n' : '') +
    `rms      ${f(d.rms)}   gate ${f(d.gate)}\n` +
    `lowRatio ${f(d.lowRatio)}   min  ${f(0.52)}\n` +
    `flatness ${f(d.flatness)}   min  ${f(0.28)}\n` +
    `floor    ${f(d.floorRms)}\n` +
    `armed    ${d.armCount || 0}   ${d.qualifies ? 'YES' : 'no'}\n` +
    `level    ${f(d.level)}`;
}
