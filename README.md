# birthday-card

An interactive birthday card. Open the envelope, make a wish, and blow out the
candles — the page listens through your device microphone and the flames react.

Plain HTML, CSS, and JavaScript. No build step, no dependencies, no framework.

## Editing the card

All of the words live in [`card-config.js`](./card-config.js). That is the only
file you need to touch.

## Running it locally

ES modules will not load from `file://`, so serve the folder:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

`localhost` counts as a secure context, so the microphone works locally too.

## Privacy

The microphone is analysed in the browser and never recorded, stored, or
transmitted anywhere. Denying the microphone prompt is fine — you can tap the
candles out instead.
