import { Card, SUITS, RANKS } from './card.js';
import { HumanPlayer } from './player.js';
import { CardTracker } from './card-tracker.js';
import { BotAdapter } from './bot-adapter.js';
import { GameEvents } from './events.js';

export class GameState {
    constructor(eventEmitter) {
        this.events = eventEmitter;
        this.players = [];
        this.deck = [];
        this.currentTurn = 0; // Index of player
        this.trick = []; // Cards played in current trick
        this.roundNumber = 0;
        this.scores = [0, 0, 0, 0];
        this.cardTracker = new CardTracker();
        this.heuristicBot = null; // Will be loaded dynamically
        this.botAssignments = {};
        this.simulation = {
            enabled: false,
            target: 0,
            completed: 0,
            wins: { copy: 0, original: 0 }
        };
        this.initialHands = [];
    }

    initialize(players) {
        this.players = players;

        // Emit initialization event with player data
        this.events.emit(GameEvents.GAME_INITIALIZED, {
            players: this.getPlayersData()
        });

        // Emit initial score update
        this.events.emit(GameEvents.SCORE_UPDATED, {
            players: this.getPlayersData()
        });

        this.startNewGame();
    }

    async initializeBots(botAssignments = {}) {
        try {
            this.botAssignments = botAssignments;

            const botClasses = {};
            const botInstances = {};

            // Determine which bot types are needed
            const neededTypes = new Set(Object.values(botAssignments));
            if (neededTypes.size === 0) neededTypes.add('original'); // Default

            // Bot expects single-character ranks: ['2', '3', ..., '9', 'T', 'J', 'Q', 'K', 'A']
            const botRankReference = RANKS.map(r => r === '10' ? 'T' : r);

            for (const type of neededTypes) {
                let module;
                let className;

                if (type === 'original') {
                    module = await import('../LeekhaHeuristicBot.js');
                    className = 'LeekhaHeuristicBot';
                } else if (type === 'copy') {
                    module = await import('../LeekhaHeuristicBot - Copy.js');
                    className = 'LeekhaHeuristicBot';
                } else if (type === 'lm') {
                    module = await import('../LMBot.js');
                    className = 'LMBot';
                } else if (type === 'lmg') {
                    module = await import('../LMG.js');
                    className = 'LMBot';
                } else if (type === 'lmlm') {
                    module = await import('../LMLM.js');
                    className = 'LMBot';
                } else {
                    console.warn(`Unknown bot type: ${type}, falling back to original`);
                    module = await import('../LeekhaHeuristicBot.js');
                    className = 'LeekhaHeuristicBot';
                }

                botInstances[type] = new module[className](botRankReference);
            }

            // Setup adapters for each bot player
            for (let i = 0; i < this.players.length; i++) {
                const player = this.players[i];
                if (player.constructor.name === 'BotPlayer') {
                    const botType = botAssignments[i] || 'original';
                    const botInstance = botInstances[botType] || botInstances['original'];
                    const adapter = new BotAdapter(botInstance, i, this);
                    player.setAdapter(adapter);
                }
            }

            if (this.simulation && this.simulation.enabled) {
                // Determine team bot types (Team 0: P0/P2, Team 1: P1/P3)
                this.simulation.team0 = botAssignments[0] || 'unknown';
                this.simulation.team1 = botAssignments[1] || 'unknown';

                // Initialize counters if needed
                if (this.simulation.wins[this.simulation.team0] === undefined) this.simulation.wins[this.simulation.team0] = 0;
                if (this.simulation.wins[this.simulation.team1] === undefined) this.simulation.wins[this.simulation.team1] = 0;
            }

            console.log('✓ Bots initialized successfully');
        } catch (error) {
            console.warn('Failed to load bot, using fallback:', error);
        }
    }

    startNewGame() {
        this.scores = [0, 0, 0, 0];
        this.roundNumber = 0;

        // Reset all player scores
        this.players.forEach(p => {
            p.score = 0;
            p.currentRoundPoints = 0;
        });

        // Emit game start event
        this.events.emit(GameEvents.GAME_STARTED, {
            players: this.getPlayersData()
        });

        // Emit score update
        this.events.emit(GameEvents.SCORE_UPDATED, {
            players: this.getPlayersData()
        });

        this.startRound();
    }

    createDeck() {
        this.deck = [];
        for (let s of SUITS) {
            for (let r of RANKS) {
                this.deck.push(new Card(s, r));
            }
        }
        // Shuffle
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    deal() {
        this.createDeck();

        // Clear trick pile
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        // 13 cards each
        this.players.forEach(p => p.hand = []);
        let pIndex = 0;
        while (this.deck.length > 0) {
            this.players[pIndex].receiveCards([this.deck.pop()]);
            pIndex = (pIndex + 1) % 4;
        }
        this.players.forEach(p => p.sortHand());

        // Emit hands dealt event
        this.events.emit(GameEvents.HANDS_DEALT, {
            hands: this.getHandsData()
        });
    }

    async startRound() {
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        this.roundNumber++;
        this.cardTracker.reset(); // Reset card tracking for new round

        // Emit round start
        this.events.emit(GameEvents.ROUND_START, {
            roundNumber: this.roundNumber
        });

        // Emit score update
        this.events.emit(GameEvents.SCORE_UPDATED, {
            players: this.getPlayersData()
        });

        this.events.emit(GameEvents.STATUS_MESSAGE, {
            message: `Round ${this.roundNumber}: Dealing...`
        });

        this.deal();

        // 1. Passing Phase
        this.events.emit(GameEvents.STATUS_MESSAGE, {
            message: "Pass 3 cards to your Left"
        });

        await this.handlePassingPhase();

        // 2. Play Phase
        this.events.emit(GameEvents.STATUS_MESSAGE, {
            message: "Game On!"
        });

        // Determine leader: Player to Right of Dealer leads first
        const dealerIndex = (this.roundNumber - 1) % 4;
        let leader = (dealerIndex + 1) % 4;

        for (let trickNum = 0; trickNum < 13; trickNum++) {
            leader = await this.playTrick(leader);
        }

        this.endRound();
    }

    async handlePassingPhase() {
        // Emit pass phase start
        this.events.emit(GameEvents.PASS_PHASE_START);

        // Get passing choices from all players
        const promises = this.players.map(p => p.choosePassCards(this));

        const choices = await Promise.all(promises);

        // Remove cards passed from hands first
        for (let i = 0; i < 4; i++) {
            this.players[i].removeCards(choices[i]);
        }

        // Add received cards
        // P0 gets from P1, P3 gets from P0, P2 gets from P3, P1 gets from P2
        this.players[0].receiveCards(choices[1]);
        this.players[3].receiveCards(choices[0]);
        this.players[2].receiveCards(choices[3]);
        this.players[1].receiveCards(choices[2]);

        // Emit hand updated
        this.events.emit(GameEvents.HAND_UPDATED, {
            hands: this.getHandsData()
        });

        // Save initial hands for debugging
        this.initialHands = this.players.map(p => p.hand.map(card => card.id));

        // Emit pass phase complete
        this.events.emit(GameEvents.PASS_PHASE_COMPLETE);
    }

    async playTrick(leaderIndex) {
        this.trick = [];
        let currentObj = leaderIndex;
        let leadSuit = null;

        // Clear trick pile
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        for (let i = 0; i < 4; i++) {
            // Emit turn change
            this.events.emit(GameEvents.TURN_CHANGED, {
                playerIndex: currentObj,
                playerName: this.players[currentObj].name
            });

            this.events.emit(GameEvents.STATUS_MESSAGE, {
                message: `${this.players[currentObj].name}'s Turn`
            });

            const card = await this.players[currentObj].playCard(this);

            // Execute move
            this.players[currentObj].removeCards([card]);

            // Emit hand updated
            this.events.emit(GameEvents.HAND_UPDATED, {
                hands: this.getHandsData()
            });

            // Add to trick
            this.trick.push({ player: currentObj, card: card });

            // Track card for bot AI
            this.cardTracker.recordCardPlayed(card, currentObj, this.trick.slice(0, -1));

            // Emit card played event
            this.events.emit(GameEvents.CARD_PLAYED, {
                card: card,
                playerIndex: currentObj,
                position: i
            });

            if (i === 0) leadSuit = card.suit;

            // Next player (Anticlockwise)
            currentObj = (currentObj + 1) % 4;
        }

        // Evaluate Winner
        const winnerIndex = this.evaluateTrick(this.trick, leadSuit);

        await this.delay(2000); // Wait to see trick

        // Move cards to winner's pile (logic only, no visual pile needed except for score)
        // Count points
        const points = this.trick.reduce((acc, t) => acc + t.card.points, 0);
        this.players[winnerIndex].currentRoundPoints += points;

        // Emit trick complete (triggers collection animation)
        this.events.emit(GameEvents.TRICK_COMPLETE, {
            winnerIndex: winnerIndex,
            winnerName: this.players[winnerIndex].name,
            points: points,
            trick: this.trick
        });

        // Wait for collection animation to complete
        await this.delay(500);

        // Emit score update
        this.events.emit(GameEvents.SCORE_UPDATED, {
            players: this.getPlayersData()
        });

        // Mark trick as complete for card tracking
        this.cardTracker.endTrick();

        return winnerIndex;
    }

    evaluateTrick(trick, leadSuit) {
        let highest = -1;
        let winnerLocalIndex = -1;

        trick.forEach((play, idx) => {
            if (play.card.suit === leadSuit) {
                if (play.card.value > highest) {
                    highest = play.card.value;
                    winnerLocalIndex = idx;
                }
            }
        });

        return trick[winnerLocalIndex].player;
    }

    getValidMoves(hand) {
        // If not leading, must follow suit
        // Implement Forced Leekha
        const leadCard = this.trick.length > 0 ? this.trick[0].card : null;
        if (!leadCard) return hand; // Can lead anything

        const leadSuit = leadCard.suit;
        const matchingSuit = hand.filter(c => c.suit === leadSuit);

        if (matchingSuit.length > 0) {
            return matchingSuit;
        }

        // Void in suit
        // Check Forced Leekha (Q♠ or 10♦)
        const leekhaCards = hand.filter(c =>
            (c.suit === 'S' && c.rank === 'Q') ||
            (c.suit === 'D' && c.rank === '10')
        );

        if (leekhaCards.length > 0) {
            return leekhaCards; // Must play one of these
        }

        return hand; // Can play anything
    }

    async endRound() {
        console.log("Round End");

        // Add round points to total score
        let limitReached = false;
        let loser = null;

        // Visual delay
        await this.delay(1000);

        // Clear table (remove last trick)
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        for (let p of this.players) {
            p.score += p.currentRoundPoints;
            p.currentRoundPoints = 0; // Reset for next calculation or just keep in history

            if (p.score >= 101) {
                limitReached = true;
            }
        }

        // Emit round end
        this.events.emit(GameEvents.ROUND_END, {
            players: this.getPlayersData()
        });

        // Emit score update
        this.events.emit(GameEvents.SCORE_UPDATED, {
            players: this.getPlayersData()
        });

        if (limitReached) {
            this.handleGameOver();
        } else {
            // Next Round
            if (this.simulation?.enabled) {
                this.startRound();
            } else {
                setTimeout(() => this.startRound(), 2000);
            }
        }
    }

    handleGameOver() {
        // Determine loser (highest score over 101)
        const playersOver = this.players.filter(p => p.score >= 101).sort((a, b) => b.score - a.score);
        const loserPlayer = playersOver[0];

        // Teams: 0 & 2 (You & Partner), 1 & 3 (East & West)
        const myTeam = [this.players[0], this.players[2]];
        const enemyTeam = [this.players[1], this.players[3]];

        const myTeamLost = (loserPlayer === this.players[0] || loserPlayer === this.players[2]);

        if (this.simulation && this.simulation.enabled) {
            const winner = myTeamLost ? this.simulation.team1 : this.simulation.team0;
            this.simulation.completed += 1;
            this.simulation.wins[winner] = (this.simulation.wins[winner] || 0) + 1;

            const summary = `Simulation ${this.simulation.completed}/${this.simulation.target}: ${winner} team wins`;
            if (this.simulation.completed % 10 === 0) console.log(summary);

            if (this.simulation.completed >= this.simulation.target) {
                const t0 = this.simulation.team0;
                const t1 = this.simulation.team1;
                const finalSummary = `Simulation complete. ${t0}: ${this.simulation.wins[t0]}, ${t1}: ${this.simulation.wins[t1]}`;
                console.log(finalSummary);
                return; // Stop
            }

            // Restart automatically
            this.startNewGame();
            return;
        }

        // Emit game over event
        this.events.emit(GameEvents.GAME_OVER, {
            loserPlayer: {
                name: loserPlayer.name,
                score: loserPlayer.score
            },
            myTeamLost: myTeamLost,
            players: this.getPlayersData()
        });
    }

    async delay(ms) {
        if (this.simulation?.enabled) return;
        await new Promise(r => setTimeout(r, ms));
    }

    getCurrentState() {
        const playedCards = {};
        for (const suit in this.cardTracker.playedCards) {
            playedCards[suit] = Array.from(this.cardTracker.playedCards[suit]);
        }

        return {
            roundNumber: this.roundNumber,
            scores: this.scores,
            currentTurn: this.currentTurn,
            trick: this.trick.map(t => ({ player: t.player, card: t.card.id })),
            initialHands: this.initialHands,
            currentHands: this.players.map(p => p.hand.map(card => card.id)),
            cardTracker: {
                playedCards: playedCards,
                playerVoids: this.cardTracker.playerVoids,
                heartsBroken: this.cardTracker.heartsBroken,
                queenOfSpadesPlayed: this.cardTracker.queenOfSpadesPlayed,
                tenOfDiamondsPlayed: this.cardTracker.tenOfDiamondsPlayed,
                tricksPlayed: this.cardTracker.tricksPlayed,
                firstTrickRevealedVoid: this.cardTracker.firstTrickRevealedVoid
            },
        };
    }

    /**
     * Helper method to get hands data for events
     * @returns {Array} Array of hand arrays
     */
    getHandsData() {
        return this.players.map(p => [...p.hand]);
    }

    /**
     * Helper method to get players data for events
     * @returns {Array} Array of player data objects
     */
    getPlayersData() {
        return this.players.map(p => ({
            name: p.name,
            position: p.position,
            score: p.score,
            currentRoundPoints: p.currentRoundPoints,
            handSize: p.hand.length
        }));
    }
}
