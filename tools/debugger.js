import { LeekhaHeuristicBot } from './botsim/bots/LeekhaHeuristicBot.js';
import { Card, SUITS, RANKS } from './js/card.js';
import { CardTracker } from './js/card-tracker.js';
import { BotAdapter } from './js/bot-adapter.js';

let gameState = null;

document.getElementById('file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            gameState = JSON.parse(e.target.result);
            document.getElementById('output').textContent = 'Game state loaded. Click "Replay Last Trick" to analyze.';
            console.log("Game State Loaded:", gameState);
        } catch (error) {
            document.getElementById('output').textContent = `Error parsing JSON: ${error.message}`;
        }
    };
    reader.readAsText(file);
});

document.getElementById('replay-btn').addEventListener('click', () => {
    if (!gameState) {
        document.getElementById('output').textContent = 'Please load a game state file first.';
        return;
    }

    replayLastTrick(gameState);
});

function cardFromId(id) {
    if (!id || typeof id !== 'string' || id.length < 2) {
        throw new Error(`Invalid card ID format: "${id}"`);
    }
    const suit = id.slice(-1);
    const rank = id.slice(0, -1);
    return new Card(suit, rank);
}

function replayLastTrick(state) {
    const output = document.getElementById('output');
    output.innerHTML = '';

    try {
        // 1. Recreate Bot and dependencies
        const botRankReference = RANKS.map(r => r === '10' ? 'T' : r);
        const heuristicBot = new LeekhaHeuristicBot(botRankReference);

        // 2. Recreate CardTracker state
        const tracker = new CardTracker();
        tracker.playerVoids = state.cardTracker.playerVoids;
        tracker.heartsBroken = state.cardTracker.heartsBroken;
        tracker.queenOfSpadesPlayed = state.cardTracker.queenOfSpadesPlayed;
        tracker.tenOfDiamondsPlayed = state.cardTracker.tenOfDiamondsPlayed;
        tracker.tricksPlayed = state.cardTracker.tricksPlayed;
        tracker.firstTrickRevealedVoid = state.cardTracker.firstTrickRevealedVoid;
        for (const suit in state.cardTracker.playedCards) {
            tracker.playedCards[suit] = new Set(state.cardTracker.playedCards[suit]);
        }

        // 3. Figure out which player's decision to replay
        const playerIndex = state.currentTurn;
        
        // 4. Recreate hand for that player
        const playerHandIds = state.currentHands[playerIndex];
        const playerHand = playerHandIds.map(cardFromId);
        
        // 5. Recreate a mock GameState and BotAdapter
        const mockGameState = {
            trick: state.trick.map(t => ({ player: t.player, card: cardFromId(t.card) })),
            cardTracker: tracker,
        };

        const adapter = new BotAdapter(heuristicBot, playerIndex, mockGameState);

        // 6. Get the context that was passed to the bot
        const botHand = adapter.convertHandToBotFormat(playerHand);
        const isLeading = mockGameState.trick.length === 0;
        let context;
        let decisionType;

        if (isLeading) {
            context = adapter.buildLeadContext(botHand);
            decisionType = "Lead";
        } else {
            context = adapter.buildFollowContext(botHand);
            decisionType = "Follow";
        }
        
        // 7. Get the bot's decision
        let botCard;
        if (isLeading) {
            botCard = heuristicBot.chooseLead(botHand, context);
        } else {
            botCard = heuristicBot.chooseFollow(botHand, context);
        }

        // 8. Display the analysis
        output.innerHTML += `<h2>Analysis for Player ${playerIndex}</h2>`;
        output.innerHTML += `<p><strong>Decision Type:</strong> ${decisionType}</p>`;
        output.innerHTML += `<p><strong>Hand:</strong> ${playerHand.map(c => c.id).join(', ')}</p>`;
        output.innerHTML += `<p><strong>Trick so far:</strong> ${mockGameState.trick.map(t => t.card.id).join(', ')}</p>`;
        output.innerHTML += `<p><strong>Bot chose:</strong> ${botCard}</p>`;
        output.innerHTML += `<h3>Bot Context:</h3>`;
        output.innerHTML += `<pre>${JSON.stringify(context, (key, value) => value instanceof Set ? Array.from(value) : value, 2)}</pre>`;


    } catch (error) {
        output.innerHTML = `<p style="color: red; font-weight: bold;">An error occurred during replay:</p><pre>${error.stack}</pre>`;
        console.error(error);
    }
}

