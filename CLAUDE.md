# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Leekha (also known as Likha) is a four-player trick-taking card game where one human plays against three AI bots. Built with vanilla JavaScript (ES modules), HTML, and CSS with no runtime dependencies.

## Build & Development Commands

```bash
# Build for production (bundles to dist/)
bun build

# Serve production build
bun start

# Development server (serves from root)
bun dev
```

## Bot Simulation

The `tools/botsim/` directory contains headless bot simulation tools:

```bash
# Run from tools/botsim directory
cd tools/botsim

# Single matchup (100 games, lmg vs lmlm)
node sim/simulate.js 100 lmg lmlm

# Full matrix comparison of all bots
node sim/simulate.js matrix 100
```

Available bot types: `lmg`, `lmlm`, `lmx`, `lmx2`

## URL Parameters

- `?bots=type1,type2,type3` - Set bot types for the three AI players (default: lmx,lmx,lmx)

## Debug Features (localhost only)

- Press **F7** to download current game state as JSON
- `window.game` exposes GameState for console debugging

## Architecture

### Core Game Loop

`main.js` initializes the game by wiring together:
1. `GameEventEmitter` - Central pub/sub event bus
2. `GameState` - Game logic, turn management, scoring
3. `DOMRenderer` - DOM updates in response to events
4. `DOMInputController` - Human card selection via promises

### Player System

- `Player` (base) → `HumanPlayer` / `BotPlayer`
- Human uses `DOMInputController` for async card selection
- Bots use `BotAdapter` which translates game state to bot-specific context formats

### Bot Integration

Bots live in `tools/botsim/bots/`. The `BotAdapter` class (`js/bot-adapter.js`) bridges the game engine and bot implementations by:
- Converting Card objects to bot format `{suit, rank, points}`
- Building context objects for lead/follow/pass decisions
- Translating bot responses back to Card objects

### Event-Driven Rendering

All UI updates flow through `GameEventEmitter`. Key events defined in `js/events.js`:
- `CARD_PLAYED`, `TRICK_COMPLETE`, `ROUND_END`, `GAME_OVER`
- `ENABLE_CARD_SELECTION`, `DISABLE_CARD_SELECTION`
- `PASS_PHASE_START`, `PASS_PHASE_COMPLETE`

### Game Constants

`js/constants.js` centralizes:
- Game rules (4 players, 13 cards, 3 pass cards, 101 score limit)
- Timing values for animations and delays
- Card/suit configuration and special cards (Queen of Spades, 10 of Diamonds)

## Game Rules Quick Reference

- 4 players in two teams (you + partner at top vs. left + right)
- 13 cards dealt per player, 3 cards passed before each round
- Must follow suit if able; Queen of Spades (13 pts) and 10 of Diamonds (10 pts) are penalty cards
- First to 101 points loses
