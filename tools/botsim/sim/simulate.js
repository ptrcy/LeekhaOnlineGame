import { GameState } from '../../../js/game-state.js';
import { BotPlayer } from '../../../js/player.js';
import { GameEventEmitter } from '../../../js/events.js';

const args = process.argv.slice(2);
const simGames = parseInt(args[0]) || 100;
const team0Bot = (args[1] || 'lmg').toLowerCase();
const team1Bot = (args[2] || 'lmlm').toLowerCase();

console.log(`Starting Leekha simulation for ${simGames} games...`);
console.log(`Team 0 (${team0Bot.toUpperCase()}) vs Team 1 (${team1Bot.toUpperCase()})`);

// Create event system (no renderer needed for headless)
const events = new GameEventEmitter();

// Initialize Game State
const game = new GameState(events);

// Create Players
const players = [
    new BotPlayer(`Team0 A (${team0Bot})`, "bottom"),
    new BotPlayer(`Team1 East (${team1Bot})`, "right"),
    new BotPlayer(`Team0 Partner (${team0Bot})`, "top"),
    new BotPlayer(`Team1 West (${team1Bot})`, "left")
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
try {
    await game.initializeBots({ 0: team0Bot, 2: team0Bot, 1: team1Bot, 3: team1Bot });

    // Start the Loop
    game.startNewGame();
} catch (error) {
    console.error("Simulation failed to start:", error);
}
