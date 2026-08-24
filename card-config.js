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
  age: 52,

  /* The big line on the front of the card. */
  greeting: "Happy Birthday",

  /* Shown above the cake, before she blows the candles out. */
  wishPrompt: "Make a wish",

  /* ------------------------------------------------------------------------
     The message. Each string is revealed on its own, one after another,
     after the last candle goes out. Add or remove lines freely — the timing
     adjusts itself.

     Use curly apostrophes (’) rather than straight ones ('). In a serif face
     on paper, a straight quote reads as a typewriter mark.
     ---------------------------------------------------------------------- */
  lines: [
    "Thank you so much for all that you have done for me.",
    "You’ve been there for me so many times, and in so many ways.",
    "I love you so much.",
  ],

  /* Signed at the bottom, in a handwritten face. */
  signoff: "Love, Ethan",


  /* ==========================================================================
     Optional settings — the defaults are good. Change them only if you want to.
     ======================================================================== */

  /* How many candles. null = work it out from `age`, capped at 8 — the number
     on a cake is symbolic once you're past a certain age. Or set your own; go
     much above 10 and they get thin and fiddly to tap. */
  candleCount: null,

  /* true  = offer the microphone, so she can really blow the candles out.
     false = tap-only. She is never prompted for the microphone.
     Even when true, the prompt only appears if she taps the button for it,
     and tapping the candles always works as well. */
  enableMic: true,

  /* Confetti when the last candle goes out. */
  confetti: true,
};
