# Repository Guidelines

## Project Structure & Module Organization

- `index.html`, `main.js`, and `style.css` at the repo root form the entry point and styling.
- `js/` contains the ES module game engine, renderer, and input logic (e.g., `js/game-state.js`, `js/renderer.js`).
- `assets/` and `public/` hold static art/audio and other files copied as-is to the build.
- `tools/botsim/` contains headless bot simulations and bot implementations.
- `dist/` is the production build output (generated).

## Build, Test, and Development Commands

- `npm install` installs dev dependencies (Vite).
- `npm run dev` starts the Vite dev server for local play.
- `npm run build` creates a production build in `dist/`.
- `npm run preview` (or `npm run start`) serves the `dist/` build locally.
- Bot simulation: `node tools/botsim/sim/simulate.js 100` runs 100 headless games.
- Bot simulation via script: `npm --prefix tools/botsim run simulate -- 100`.

## Coding Style & Naming Conventions

- JavaScript is ES modules with semicolons and 4-space indentation.
- Use descriptive, lower-kebab filenames in `js/` (e.g., `game-state.js`).
- Keep constants centralized in `js/constants.js`; avoid magic numbers.
- CSS lives in `style.css`; prefer class names that reflect UI intent (e.g., `scoreboard`, `player-hand`).

## Testing Guidelines

- No automated test framework is configured.
- Use bot simulations in `tools/botsim/` to validate rule changes.
- Manually sanity-check gameplay via `npm run dev` before shipping.

## Commit & Pull Request Guidelines

- Commit messages in history are short, imperative, and sentence-case (e.g., “Switch build to Vite…”).
- Keep PRs focused; include a brief description of the change and testing performed.
- If UI behavior changes, add before/after screenshots or a short GIF.

## Security & Configuration Notes

- Deployment configuration lives in `netlify.toml`.
- Avoid committing generated output in `dist/` unless explicitly requested.
