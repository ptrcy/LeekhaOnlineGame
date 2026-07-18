# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Leekha (also known as Likha) is a four-player trick-taking card game where one human plays against three AI bots (in fixed partnerships: P0+P2 vs P1+P3). Built with vanilla JavaScript (ES modules), HTML, and CSS — no runtime dependencies. Vite is a devDependency used only for local dev/build tooling.

## Build & Development Commands

```bash
npm install         # install Vite (dev dependency only)
npm run dev         # Vite dev server for local play
npm run build       # production build to dist/
npm run preview     # serve the dist/ build (alias: npm run start)
```

`build.cjs` and `build.ts` are legacy/unused build scripts (plain-copy and Bun-bundle variants) — not wired into `package.json` or `netlify.toml`. The real build path is `vite build` via Netlify (`netlify.toml`: `command = "npm run build"`, `publish = "dist"`).

## Bot Simulation (headless, no DOM)

```bash
cd tools/botsim
node sim/simulate.js 100 lmg lmlm   # single matchup: N games, team0 bot vs team1 bot
node sim/simulate.js matrix 100     # full round-robin matrix across all bot types
npm --prefix tools/botsim run simulate -- 100   # equivalent to the single-matchup form
```

Bot types registered in `js/game-state.js` (`BOT_CLASSES`): `lmg`, `lmlm`, `lmx`, `lma`, `lmx2`, `lmc`, `lma1`. The simulator's built-in matrix (`tools/botsim/sim/simulate.js`) only exercises `lmg, lmlm, lmx, lmx2, lmc, lma1` — `lma` is registered in the engine but omitted from the matrix. `DEFAULT_BOT_TYPE` (`js/constants.js`) and the in-browser default when no `?bots=` param is given (`main.js`) are both `lma1` — the strongest bot in the matrix (~60% win rate against the field; see `tools/botsim/bots/lma.1.js`). Keep these two in sync if the matrix ranking changes.

Ad hoc bot-logic regression scripts (not a test framework) live in `tools/botsim/tests/` (e.g. `repro_q_spades.js`, `repro_unsafe_lead.js`) — run directly with `node` to reproduce specific bot decision bugs against a hand-built context. Note: `repro_q_spades.js` and `repro_unsafe_lead.js` predate `tools/botsim`'s `"type": "module"` and use CommonJS `require`, so they currently fail with `ERR_REQUIRE_ESM` — treat them as reference/historical, not runnable. `avoid_likha_when_ducking.mjs` is a real, passing, ESM regression test (exit code 0/1) asserting all 7 bots never volunteer Q♠/10♦ as a lead or duck card when a safer legal card exists — run it after touching any bot's lead/follow logic: `node tools/botsim/tests/avoid_likha_when_ducking.mjs`.

To add a new bot: drop a file in `tools/botsim/bots/`, then register it in the `BOT_CLASSES` map in `js/game-state.js` (this is the single source of truth for bot type strings — both the web app and `tools/botsim/sim/simulate.js` import bots through here).

## URL Parameters

- `?bots=type1,type2,type3` — sets bot types for players 1, 2, 3 (East, Partner, West); player 0 is always the human. Example: `?bots=lmg,lmlm,lmx`.

## Debug Features (localhost only)

- Press **F7** to download the current game state (hands, tracker state, trick) as JSON.
- `window.game` exposes the live `GameState` instance for console debugging (only set when hostname is `localhost`/`127.0.0.1`).

## Architecture

### Core Game Loop

`main.js` wires together the engine on `DOMContentLoaded`:
`GameEventEmitter` → `GameState` → `DOMInputController` → `DOMRenderer` → four `Player` instances (`HumanPlayer` + 3× `BotPlayer`) → `game.initializeBots(...)`.

The same `GameState`/`BotPlayer`/`GameEventEmitter` classes are reused unmodified by `tools/botsim/sim/simulate.js` (imported via relative path from `tools/botsim/sim/`) to run games with **no DOM and no renderer** — `GameState.simulation.enabled` short-circuits animation delays (`delay()` returns immediately) and auto-restarts games until the target count is reached, tallying wins by bot-type key.

### Player System

- `Player` (base, `js/player.js`) → `HumanPlayer` / `BotPlayer`.
- `HumanPlayer` awaits `DOMInputController` promises for card/pass selection; on error/timeout it falls back to a legal move rather than throwing, so the game never hard-stalls on bad input.
- `BotPlayer` delegates to a `BotAdapter` (set via `setAdapter`, injected by `GameState.initializeBots`); with no adapter it falls back to random-legal-move logic.

### Bot Integration (`js/bot-adapter.js`)

Bots do not see `Card` objects. `BotAdapter` translates each turn into the bot's own format:
- Hand: `[hearts[], spades[], diamonds[], clubs[]]`, each a sorted array of two-char strings like `"Th"`, `"Qs"`, `"Ad"` (rank `T` = ten, not `"10"`).
- Decision context objects (`buildLeadContext` / `buildFollowContext`) expose `remaining` counts, played cards, per-player suit-void info from `CardTracker`, `trickType` (-1 first trick, 0 early, 1 the Q♠ trick, 2 post-Q♠), and current scores.
- Bot responses are converted back to `Card` objects and validated against `GameState.getValidMoves()`; any bot exception, malformed return, or illegal card falls back to a legal move — bots can never make the engine play (or the UI display) an invalid card.

When changing the bot context shape, update `buildLeadContext`/`buildFollowContext` together — all bots share the same context contract.

### Event-Driven Rendering

All UI updates flow through `GameEventEmitter` (`js/events.js`), a plain pub/sub bus. `GameState` never touches the DOM directly; `DOMRenderer` (`js/renderer.js`) and `DOMInputController` (`js/input-controller.js`) subscribe to events (`CARD_PLAYED`, `TRICK_COMPLETE`, `ROUND_END`, `GAME_OVER`, `ENABLE_CARD_SELECTION`, `DISABLE_CARD_SELECTION`, `PASS_PHASE_START`/`COMPLETE`, etc. — full list in `js/events.js`). This separation is what makes headless bot simulation possible without stubbing out any DOM.

### Game Rules Encoded in `GameState`

- 4 players, 2 fixed teams (P0+P2 vs P1+P3), 13 cards each, 3 cards passed left before each round (`GAME_RULES` in `js/constants.js`).
- **Forced Leekha** (`getValidMoves`): if a player is void in the led suit but holds Q♠ or 10♦, they *must* play one of those — this is the rule the game is named after.
- Q♠ = 13 points, 10♦ = 10 points, each Heart = 1 point; first to `SCORE_LIMIT` (101) loses.
- Round 1 starting leader is the randomly selected dealer; subsequent rounds are led by the player who captured the Queen of Spades in the previous round (who also becomes the new dealer).
- `CardTracker` (`js/card-tracker.js`) tracks played cards, discovered suit-voids per player, and hearts-broken/Q♠-played/10♦-played flags — this is the primary signal bots use to infer opponents' hands.
