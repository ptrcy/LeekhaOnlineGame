Bots + simulation live here so the web app logic can stay at the repo root.

Quick use
- Run a headless simulation: `node sim/simulate.js 100`
- Or: `npm run simulate -- 100`

Add a bot
- Drop a new bot file in `bots/`.
- Update the bot type mapping in `js/game-state.js` so the web app and simulations can load it.

Notes
- `docs/lm.js` is reference material for the LM-style bot logic.
