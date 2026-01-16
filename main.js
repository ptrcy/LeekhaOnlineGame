import { GameState } from './js/game-state.js';
import { HumanPlayer, BotPlayer } from './js/player.js';
import { GameEventEmitter } from './js/events.js';
import { DOMRenderer } from './js/renderer.js';
import { DOMInputController } from './js/input-controller.js';

// Entry point
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Likha Game Initializing...");

    // Initialize Game
    try {
        const params = new URLSearchParams(window.location.search);
        const simGames = parseInt(params.get('sim'), 10);
        const simulationEnabled = !isNaN(simGames) && simGames > 0;

        // Create event system
        const events = new GameEventEmitter();

        // Create game state
        const game = new GameState(events);

        if (!simulationEnabled) {
            // Normal mode: Setup UI
            const inputController = new DOMInputController(events);
            const renderer = new DOMRenderer(events, inputController);

            // Initialize renderer (setup DOM elements and event subscriptions)
            renderer.initialize();

            // Create players
            const players = [
                new HumanPlayer("You", "bottom", inputController),
                new BotPlayer("East (LMG)", "right"),
                new BotPlayer("Partner (LMG)", "top"),
                new BotPlayer("West (LMG)", "left")
            ];

            game.initialize(players);

            // Initialize AI bots (all use LMG logic)
            await game.initializeBots({ 1: 'lmg', 2: 'lmg', 3: 'lmg' });
        } else {
            // Simulation mode (headless)
            const players = [
                new BotPlayer("LMBot A", "bottom"),
                new BotPlayer("OriginalBot East", "right"),
                new BotPlayer("LMBot Partner", "top"),
                new BotPlayer("OriginalBot West", "left")
            ];

            game.players = players;
            game.simulation = {
                enabled: true,
                target: simGames,
                completed: 0,
                wins: {}
            };

            await game.initializeBots({ 0: 'lm', 2: 'lm', 1: 'original', 3: 'original' });
            game.startNewGame();
        }

        // Debug access
        window.game = game;

        // Debug: Press F7 to save game state
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F7') {
                e.preventDefault();
                const state = game.getCurrentState();
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                const filename = `leekha-round-state-${timestamp}.json`;
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", filename);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                console.log(`Game state saved to ${filename}`);
            }
        });

    } catch (e) {
        console.error("Game Initialization Failed:", e);
        const statusEl = document.getElementById('status-text');
        if (statusEl) {
            statusEl.textContent = "Error: " + e.message;
            statusEl.style.color = 'red';
        }
    }
});
