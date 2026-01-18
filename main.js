"use strict";
import { GameState } from './js/game-state.js';
import { HumanPlayer, BotPlayer } from './js/player.js';
import { GameEventEmitter } from './js/events.js';
import { DOMRenderer } from './js/renderer.js';
import { DOMInputController } from './js/input-controller.js';
import { AudioManager } from './js/audio.js';

// Entry point
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Likha Game Initializing...");

    // Initialize Game
    try {
        // Create event system
        const events = new GameEventEmitter();

        // Create audio manager
        const audioManager = new AudioManager(events);

        // Create game state
        const game = new GameState(events);

        // Setup UI
        const inputController = new DOMInputController(events);
        const renderer = new DOMRenderer(events, inputController);

        // Initialize renderer (setup DOM elements and event subscriptions)
        renderer.initialize();

        // Create players
        const players = [
            new HumanPlayer("You", "bottom", inputController),
            new BotPlayer("Eddy", "right"),
            new BotPlayer("Pat", "top"),
            new BotPlayer("Walid", "left")
        ];

        game.initialize(players);

        // Initialize AI bots from URL params or default
        const urlParams = new URLSearchParams(window.location.search);
        const botParam = urlParams.get('bots');
        let botAssignments = { 1: 'lmx', 2: 'lmx', 3: 'lmx' }; // Default
        if (botParam) {
            const botTypes = botParam.split(',');
            if (botTypes.length === 3) {
                botAssignments = {
                    1: botTypes[0],
                    2: botTypes[1],
                    3: botTypes[2]
                };
            }
        }
        await game.initializeBots(botAssignments);

        // Debug access
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            window.game = game;
        }

        // Debug: Press F7 to save game state
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F7') {
                e.preventDefault();
                const state = game.getCurrentState();
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                const filename = `leekha-round-state-${timestamp}.json`;
                const blob = new Blob([JSON.stringify(state, null, 2)], {type : 'application/json'});
                const url = URL.createObjectURL(blob);
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", url);
                downloadAnchorNode.setAttribute("download", filename);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                URL.revokeObjectURL(url);
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
