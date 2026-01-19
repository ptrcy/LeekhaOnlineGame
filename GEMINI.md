# GEMINI.md - Leekha Online Card Game

## Project Overview

This project is a web-based implementation of the card game Leekha (also known as Likha). It is a four-player trick-taking game where one player is human and the other three are bots. The game is built with vanilla JavaScript (ES modules), HTML, and CSS, with no external runtime dependencies. The project uses `bun` for building and serving.

The game logic is modular, with separate components for game state management (`js/game-state.js`), player representation (`js/player.js`), rendering (`js/renderer.js`), and user input (`js/input-controller.js`). The AI for the bot players is implemented in the `tools/botsim/bots/` directory.

The UI is designed to be modern, responsive, and dark-themed, with a focus on a clean and intuitive user experience.

## Building and Running

The project uses `bun` as the primary tool for building and running the application.

### Prerequisites

- [Bun](https://bun.sh/) installed on your system.

### Build

To build the project, run the following command. This will bundle the JavaScript and copy all necessary static files to the `dist` directory.

```bash
bun build
```

### Serve

After building the project, you can serve the contents of the `dist` directory with the following command:

```bash
bun start
```

This will start a local web server, and you can access the game in your browser at the URL provided in the console (usually `http://localhost:3000`).

## Development Conventions

### Code Style

The codebase follows a modular, object-oriented approach using ES6 classes and modules. The code is well-commented, particularly in the core logic files.

### File Structure

- `index.html`: The main entry point for the application.
- `style.css`: The main stylesheet for the application.
- `main.js`: The main JavaScript file that initializes the game.
- `js/`: This directory contains the core game logic:
  - `game-state.js`: Manages the overall state of the game.
  - `player.js`: Defines the `HumanPlayer` and `BotPlayer` classes.
  - `card.js`: Defines the `Card` class.
  - `renderer.js`: Handles rendering the game to the DOM.
  - `input-controller.js`: Manages user input.
  - `events.js`: Defines the game's event system.
  - `constants.js`: Contains constants used throughout the game.
- `assets/`: Contains static assets like images.
- `tools/`: Contains development and simulation tools:
  - `debugger.html`, `debugger.js`: A tool for debugging game states.
  - `botsim/`: A tool for simulating bot matches.
- `build.ts`: The build script for `bun`.
- `dist/`: The output directory for the build process.

### Testing

There are no formal unit or end-to-end tests in the project. However, the `tools/` directory contains a debugger and a bot simulation environment that can be used for testing and development.
