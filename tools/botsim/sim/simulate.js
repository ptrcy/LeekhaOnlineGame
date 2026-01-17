import { GameState } from '../../../js/game-state.js';
import { BotPlayer } from '../../../js/player.js';
import { GameEventEmitter } from '../../../js/events.js';

const args = process.argv.slice(2);
const simGames = parseInt(args[0]) || 100;

console.log(`Starting Leekha simulation for ${simGames} games...`);
console.log(`Team 0 (LMG) vs Team 1 (LMLM)`);

// Create event system (no renderer needed for headless)
const events = new GameEventEmitter();

// Initialize Game State
const game = new GameState(events);

// Create Players
const players = [
    new BotPlayer("LMG A", "bottom"),         // Team 0
    new BotPlayer("LMLM East", "right"),      // Team 1
    new BotPlayer("LMG Partner", "top"),      // Team 0
    new BotPlayer("LMLM West", "left")        // Team 1
];

// Manually assign players to game state to allow bot initialization before game start
game.players = players;

// Configure Simulation
game.simulation = {
    enabled: true,
    target: simGames,
    completed: 0,
    wins: {}
};

// Initialize Bots
// Team 0: LMG (LMG.js)
// Team 1: LMLM (LMLM.js)
try {
    await game.initializeBots({ 0: 'lmg', 2: 'lmg', 1: 'lmlm', 3: 'lmlm' });

    // Start the Loop
    game.startNewGame();
} catch (error) {
    console.error("Simulation failed to start:", error);
}

