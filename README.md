# candlelight

An interactive birthday card.

**→ https://0x000null.github.io/candlelight/**

An envelope you open, a cake that rises out of it, and candles you blow out —
really blow out. The page listens through the device microphone, the flames
lean and gutter with your breath, and when the last one goes dark the confetti
comes and the message appears.

Plain HTML, CSS, and JavaScript. No build step, no dependencies, no framework.
Every drawing on the page — the paper, the wax seal, the cake, the flames, the
confetti — is CSS, SVG, or canvas. There are no image files.

## Editing the card

All of the words live in [`card-config.js`](./card-config.js). It is the only
file you need to touch: her name, which birthday, and every line of the message.
Change the strings, commit, push. GitHub Pages redeploys on its own.

> **This repository is public.** Anything in `card-config.js` is readable by
> anyone who finds the URL. First names only.

## Running it locally

ES modules will not load over `file://`, so serve the folder:

```bash
python -m http.server 8000     # then open http://localhost:8000
```

`localhost` counts as a secure context, so the microphone works locally too.

## The microphone

**Nothing is recorded, stored, or transmitted.** Audio is read from an
`AnalyserNode` frame by frame and discarded, the stream is never connected to
any output, and the microphone is released the moment the last candle goes out.

Detection deliberately isn't a volume threshold — that fires on talking,
laughing, clapping, and a room full of people singing. A frame only counts as a
blow when three things are true at once:

| signal | why |
|---|---|
| energy above the room's measured noise floor | the floor is measured for the first second, not hard-coded, so a quiet kitchen and a noisy party both behave |
| a bass-heavy spectrum | breath puts most of its energy below ~500 Hz |
| high spectral flatness | breath is broadband noise; speech and singing are tonal and score low |

Plus a sustain requirement, so a cough or a clap doesn't count.

If the room is unusual and the candles are stubborn — or too eager — open the
card with **`?debug`** appended to the URL to watch those three numbers live on
the actual device, then adjust `TUNING` at the top of
[`js/blow.js`](./js/blow.js).

## When the microphone isn't available

Denied, missing, unsupported, or insecure — every path falls back silently to
tapping the candles. No error, no apology, no dead end. Tapping is presented as
how the card works rather than as a downgrade, and it is always offered
alongside the microphone.

The card is also fully keyboard operable, announces candles remaining to screen
readers, honours `prefers-reduced-motion`, and has a "skip to the message" link
from the moment the cake appears.
