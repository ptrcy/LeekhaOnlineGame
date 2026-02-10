import { GameState } from '../../../js/game-state.js';
import { BotPlayer } from '../../../js/player.js';
import { GameEventEmitter } from '../../../js/events.js';

const BOT_TYPES = ['lmg', 'lmlm', 'lmx', 'lmx2', 'lmc'];

async function runMatchup(team0Bot, team1Bot, simGames, verbose = true) {
    const t0 = team0Bot.toLowerCase();
    const t1 = team1Bot.toLowerCase();

    if (verbose) {
        console.log(`Starting Leekha simulation for ${simGames} games...`);
        console.log(`Team 0 (${t0.toUpperCase()}) vs Team 1 (${t1.toUpperCase()})`);
    }

    const events = new GameEventEmitter();
    const game = new GameState(events);

    const players = [
        new BotPlayer(`Team0 A (${t0})`, "bottom"),
        new BotPlayer(`Team1 East (${t1})`, "right"),
        new BotPlayer(`Team0 Partner (${t0})`, "top"),
        new BotPlayer(`Team1 West (${t1})`, "left")
    ];

    game.players = players;

    game.simulation = {
        enabled: true,
        target: simGames,
        completed: 0,
        wins: {}
    };

    try {
        await game.initializeBots({ 0: t0, 2: t0, 1: t1, 3: t1 });
        game.startNewGame();
    } catch (error) {
        console.error("Simulation failed to start:", error);
        return { team0Bot: t0, team1Bot: t1, team0Wins: 0, team1Wins: 0 };
    }

    const team0Wins = game.simulation.wins[t0] || 0;
    const team1Wins = game.simulation.wins[t1] || 0;

    return { team0Bot: t0, team1Bot: t1, team0Wins, team1Wins };
}

async function runSingle(args) {
    const simGames = parseInt(args[0]) || 100;
    const team0Bot = (args[1] || 'lmg').toLowerCase();
    const team1Bot = (args[2] || 'lmlm').toLowerCase();

    await runMatchup(team0Bot, team1Bot, simGames, true);
}

async function runMatrix(args) {
    const simGames = parseInt(args[1]) || 100;
    const results = {};

    console.log(`Running ${simGames}-game matrix between bots: ${BOT_TYPES.join(', ')}`);

    for (const rowBot of BOT_TYPES) {
        results[rowBot] = {};
        for (const colBot of BOT_TYPES) {
            const { team0Wins, team1Wins } = await runMatchup(rowBot, colBot, simGames, false);
            results[rowBot][colBot] = { team0Wins, team1Wins };
        }
    }

    const header = [' '.repeat(6), ...BOT_TYPES.map(t => t.toUpperCase().padStart(8))].join('');
    console.log('\nResults matrix (entries are wins for ROW bot vs COLUMN bot)\n');
    console.log(header);

    for (const rowBot of BOT_TYPES) {
        let line = rowBot.toUpperCase().padEnd(6);
        for (const colBot of BOT_TYPES) {
            const { team0Wins, team1Wins } = results[rowBot][colBot];
            const cell = `${team0Wins}-${team1Wins}`.padStart(8);
            line += cell;
        }
        console.log(line);
    }
}

const args = process.argv.slice(2);

if (args[0] && args[0].toLowerCase() === 'matrix') {
    await runMatrix(args);
} else {
    await runSingle(args);
}
