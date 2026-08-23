/* ============================================================================
   card-config.js  —  THIS IS THE ONLY FILE YOU NEED TO EDIT.
   ----------------------------------------------------------------------------
   Everything the card says lives right here. Change the strings, save, refresh.
   You do not need to touch any other file.

   ⚠  THIS REPOSITORY IS PUBLIC. Anything you type below is readable by anyone
      who finds the URL. Keep it to first names. No last names, no addresses,
      no phone numbers, no workplace. Leave `age` as null if you would rather
      not publish a birth year.
   ========================================================================== */

export const CARD = {

  /* Who it's for. A first name, or "Mom", or a nickname she'd recognize. */
  name: "Mom",

  /* Which birthday. Set a number like 60 to print it, or leave null to
     show no number at all. This also decides how many candles appear. */
  age: null,

  /* The big line on the front of the card. */
  greeting: "Happy Birthday",

  /* Shown above the cake, before she blows the candles out. */
  wishPrompt: "Make a wish",

  /* ------------------------------------------------------------------------
     The message. Each string is revealed on its own, one after another,
     after the last candle goes out.

     Say something only you could say. A specific memory beats a nice
     sentiment every time — "you drove four hours for a twenty minute recital"
     lands harder than "you were always there for me".
     ---------------------------------------------------------------------- */
  lines: [
    "REPLACE ME — a specific thing she did that you still think about",
    "REPLACE ME — something only she says, quoted exactly",
    "REPLACE ME — the thank-you you don't say out loud often enough",
  ],

  /* Signed at the bottom, in a handwritten face. */
  signoff: "Love, Ethan",


  /* ==========================================================================
     Optional settings — the defaults are good. Change them only if you want to.
     ======================================================================== */

  /* How many candles. null = work it out from `age` (capped at 12 so the cake
     doesn't turn into a bonfire). Or just set a number you like. */
  candleCount: null,

  /* true  = offer the microphone, so she can really blow the candles out.
     false = tap-only. She is never prompted for the microphone.
     Even when true, the prompt only appears if she taps the button for it,
     and tapping the candles always works as well. */
  enableMic: true,

  /* Confetti when the last candle goes out. */
  confetti: true,
};
