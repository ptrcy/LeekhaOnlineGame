"use strict";
import { Card, SUITS, RANKS } from './card.js';
import { HumanPlayer } from './player.js';
import { CardTracker } from './card-tracker.js';
import { BotAdapter } from './bot-adapter.js';
import { LMBot as LMGBot } from '../tools/botsim/bots/LMG.js';
import { LMBot as LMLMBot } from '../tools/botsim/bots/LMLM.js';
import { LMBot as LMXBot } from '../tools/botsim/bots/LMX.js';
import { LMBot as LMX2Bot } from '../tools/botsim/bots/lmx2.js';
import { GameEvents } from './events.js';
import {
    GAME_RULES,
    TIMING,
    PLAYER_POSITIONS,
    DEFAULT_BOT_TYPE
} from './constants.js';

/**
 * Manages the state and logic for a Leekha card game.
 * Handles game flow, player turns, scoring, and card tracking.
 */
export class GameState {
    /**
     * Create a new GameState instance
     * @param {GameEventEmitter} eventEmitter - Event emitter for game events
     */
    constructor(eventEmitter) {
        /** @type {GameEventEmitter} Event emitter for broadcasting game state changes */
        this.events = eventEmitter;
        /** @type {Player[]} Array of 4 players in the game */
        this.players = [];
        /** @type {Card[]} The deck of cards */
        this.deck = [];
        /** @type {number} Index of the current player (0-3) */
        this.currentTurn = 0;
        /** @type {Array<{player: number, card: Card}>} Cards played in current trick */
        this.trick = [];
        /** @type {number} Current round number (1-based) */
        this.roundNumber = 0;
        /** @type {number[]} Cumulative scores for each player */
        this.scores = [0, 0, 0, 0];
        /** @type {CardTracker} Tracks played cards and player voids */
        this.cardTracker = new CardTracker();
        /** @type {Object|null} Heuristic bot instance */
        this.heuristicBot = null;
        /** @type {Object<number, string>} Maps player index to bot type */
        this.botAssignments = {};
        /** @type {Object} Simulation configuration for bot testing */
        this.simulation = {
            enabled: false,
            target: 0,
            completed: 0,
            wins: { copy: 0, original: 0 }
        };
        /** @type {string[][]} Initial hands for each player (for debugging) */
        this.initialHands = [];
        /** @type {number} Index of the current dealer */
        this.dealerIndex = 0;
        /** @type {number|null} Index of player who captured Queen of Spades */
        this.queenOfSpadesCapturedBy = null;
    }

    /**
     * Initialize the game with players and start a new game
     * @param {Player[]} players - Array of exactly 4 player instances
     * @throws {Error} If players array is invalid or players are missing required methods
     */
    initialize(players) {
        // Validate players array
        if (!Array.isArray(players)) {
            throw new Error('GameState.initialize: players must be an array');
        }

        if (players.length !== 4) {
            throw new Error(`GameState.initialize: expected exactly 4 players, got ${players.length}`);
        }

        // Validate each player has required properties and methods
        for (let i = 0; i < players.length; i++) {
            const player = players[i];

            if (!player) {
                throw new Error(`GameState.initialize: player at index ${i} is null or undefined`);
            }

            if (typeof player.name !== 'string' || player.name.trim() === '') {
                throw new Error(`GameState.initialize: player at index ${i} has invalid name`);
            }

            if (typeof player.playCard !== 'function') {
                throw new Error(`GameState.initialize: player at index ${i} missing playCard method`);
            }

            if (typeof player.choosePassCards !== 'function') {
                throw new Error(`GameState.initialize: player at index ${i} missing choosePassCards method`);
            }

            if (!Array.isArray(player.hand)) {
                throw new Error(`GameState.initialize: player at index ${i} missing hand array`);
            }
        }

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

    /**
     * Initialize bot players with their AI adapters
     * @param {Object<number, string>} botAssignments - Maps player index to bot type
     * @throws {Error} If bot modules fail to load
     * @returns {Promise<void>}
     */
    async initializeBots(botAssignments = {}) {
        try {
            this.botAssignments = botAssignments;

            const botInstances = {};

            // Determine which bot types are needed
            const neededTypes = new Set(Object.values(botAssignments));
            if (neededTypes.size === 0) neededTypes.add(DEFAULT_BOT_TYPE);

            // Bot expects single-character ranks: ['2', '3', ..., '9', 'T', 'J', 'Q', 'K', 'A']
            const botRankReference = RANKS.map(r => r === '10' ? 'T' : r);

            // Use statically imported bot classes
            const BOT_CLASSES = {
                'lmg': LMGBot,
                'lmlm': LMLMBot,
                'lmx': LMXBot,
                'lmx2': LMX2Bot
            };

            for (const type of neededTypes) {
                const BotClass = BOT_CLASSES[type] || LMGBot;
                botInstances[type] = new BotClass(botRankReference);
            }

            // Setup adapters for each bot player
            for (let i = 0; i < this.players.length; i++) {
                const player = this.players[i];
                if (player.constructor.name === 'BotPlayer') {
                    const botType = botAssignments[i] || DEFAULT_BOT_TYPE;
                    const botInstance = botInstances[botType] || botInstances[DEFAULT_BOT_TYPE];
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

            console.log('Bots initialized successfully');
        } catch (error) {
            const errorMessage = `Failed to initialize bots: ${error.message}`;
            console.error(errorMessage, error);

            // Emit error event so UI can display feedback
            this.events.emit(GameEvents.ERROR_OCCURRED, {
                type: 'bot_initialization',
                message: errorMessage,
                error: error
            });

            // Re-throw to prevent game from continuing in broken state
            throw new Error(errorMessage);
        }
    }

    /**
     * Start a new game, resetting all scores and state
     * Emits GAME_STARTED and SCORE_UPDATED events
     */
    startNewGame() {
        this.scores = [0, 0, 0, 0];
        this.roundNumber = 0;

        // Set random dealer for the first round
        this.dealerIndex = Math.floor(Math.random() * 4);
        this.queenOfSpadesCapturedBy = null;

        // Reset all player scores
        this.players.forEach(player => {
            player.score = 0;
            player.currentRoundPoints = 0;
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

    /**
     * Create and shuffle a new 52-card deck
     * Uses Fisher-Yates shuffle algorithm
     */
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

    /**
     * Deal cards to all players (13 cards each)
     * Emits TRICK_PILE_CLEAR and HANDS_DEALT events
     */
    deal() {
        this.createDeck();

        // Clear trick pile
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        // 13 cards each
        this.players.forEach(player => player.hand = []);
        let pIndex = 0;
        while (this.deck.length > 0) {
            this.players[pIndex].receiveCards([this.deck.pop()]);
            pIndex = (pIndex + 1) % 4;
        }
        this.players.forEach(player => player.sortHand());

        // Emit hands dealt event
        this.events.emit(GameEvents.HANDS_DEALT, {
            hands: this.getHandsData()
        });
    }

    /**
     * Start a new round of play
     * Handles dealing, passing phase, and playing all 13 tricks
     * @returns {Promise<void>}
     */
    async startRound() {
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        this.roundNumber++;
        this.cardTracker.reset(); // Reset card tracking for new round
        this.queenOfSpadesCapturedBy = null; // Reset Q??? tracking for new round

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

        // Determine leader: First round is random, subsequent rounds use dealer rule
        let leader;
        if (this.roundNumber === 1) {
            // First round: random leader
            leader = Math.floor(Math.random() * 4);
            console.log(`[DEBUG] Round 1: Random leader selected = Player ${leader} (${this.players[leader].name})`);
        } else {
            // Subsequent rounds: Player to Right of Dealer leads first
            leader = (this.dealerIndex + 1) % 4;
        }

        for (let trickNum = 0; trickNum < 13; trickNum++) {
            leader = await this.playTrick(leader);
        }

        this.endRound();
    }

    /**
     * Handle the card passing phase at the start of each round
     * Each player passes 3 cards to the player on their left
     * @returns {Promise<void>}
     */
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

    /**
     * Play a single trick (4 cards, one from each player)
     * @param {number} leaderIndex - Index of the player who leads this trick
     * @returns {Promise<number>} Index of the trick winner (who leads next)
     */
    async playTrick(leaderIndex) {
        this.trick = [];
        let currentPlayerIndex = leaderIndex;
        let leadSuit = null;

        // Clear trick pile
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        for (let i = 0; i < 4; i++) {
            // Emit turn change
            this.events.emit(GameEvents.TURN_CHANGED, {
                playerIndex: currentPlayerIndex,
                playerName: this.players[currentPlayerIndex].name
            });

            this.events.emit(GameEvents.STATUS_MESSAGE, {
                message: `${this.players[currentPlayerIndex].name}'s Turn`
            });

            let card;
            try {
                card = await this.players[currentPlayerIndex].playCard(this);
            } catch (error) {
                this.events.emit(GameEvents.ERROR_OCCURRED, {
                    type: 'play_card_error',
                    message: error.message || 'Failed to get card from player, using fallback card',
                    error,
                    playerIndex: currentPlayerIndex
                });
            }

            const player = this.players[currentPlayerIndex];
            if (!card || !player.hand.includes(card)) {
                try {
                    const legalMoves = this.getValidMoves(player.hand);
                    if (legalMoves && legalMoves.length > 0) {
                        card = legalMoves[0];
                    }
                } catch {
                    if (player.hand.length > 0) {
                        card = player.hand[0];
                    }
                }
            }

            // Execute move
            this.players[currentPlayerIndex].removeCards([card]);

            // Emit hand updated
            this.events.emit(GameEvents.HAND_UPDATED, {
                hands: this.getHandsData()
            });

            // Add to trick
            this.trick.push({ player: currentPlayerIndex, card: card });

            // Track card for bot AI
            this.cardTracker.recordCardPlayed(card, currentPlayerIndex, this.trick.slice(0, -1));

            // Emit card played event
            this.events.emit(GameEvents.CARD_PLAYED, {
                card: card,
                playerIndex: currentPlayerIndex,
                position: i
            });

            if (i === 0) leadSuit = card.suit;

            // Next player (Anticlockwise)
            currentPlayerIndex = (currentPlayerIndex + 1) % 4;
        }

        // Evaluate Winner
        const winnerIndex = this.evaluateTrick(this.trick, leadSuit);

        await this.delay(TIMING.TRICK_DISPLAY_DELAY); // Wait to see trick

        // Move cards to winner's pile (logic only, no visual pile needed except for score)
        // Count points
        const points = this.trick.reduce((acc, t) => acc + t.card.points, 0);
        this.players[winnerIndex].currentRoundPoints += points;

        // Check if Queen of Spades was in this trick
        const hasQueenOfSpades = this.trick.some(t => t.card.suit === 'S' && t.card.rank === 'Q');
        if (hasQueenOfSpades) {
            this.queenOfSpadesCapturedBy = winnerIndex;
        }

        // Emit trick complete (triggers collection animation)
        this.events.emit(GameEvents.TRICK_COMPLETE, {
            winnerIndex: winnerIndex,
            winnerName: this.players[winnerIndex].name,
            points: points,
            trick: this.trick
        });

        // Wait for collection animation to complete
        await this.delay(TIMING.TRICK_COLLECTION_DELAY);

        // Emit score update
        this.events.emit(GameEvents.SCORE_UPDATED, {
            players: this.getPlayersData()
        });

        // Mark trick as complete for card tracking
        this.cardTracker.endTrick();

        return winnerIndex;
    }

    /**
     * Evaluate a completed trick to determine the winner
     * Winner is the player who played the highest card of the lead suit
     * @param {Array<{player: number, card: Card}>} trick - Array of played cards
     * @param {string} leadSuit - The suit that was led
     * @returns {number} Index of the winning player
     */
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

        if (winnerLocalIndex === -1) {
            winnerLocalIndex = 0;
        }

        return trick[winnerLocalIndex].player;
    }

    getValidMoves(hand) {
        // If not leading, must follow suit
        // Implement Forced Leekha
        const leadCard = this.trick.length > 0 ? this.trick[0].card : null;
        if (!leadCard) return hand; // Can lead anything

        const leadSuit = leadCard.suit;
        const matchingSuitCards = hand.filter(card => card.suit === leadSuit);

        if (matchingSuitCards.length > 0) {
            return matchingSuitCards;
        }

        // Void in suit
        // Check Forced Leekha (Queen of Spades or 10 of Diamonds)
        const leekhaCards = hand.filter(card =>
            (card.suit === 'S' && card.rank === 'Q') ||
            (card.suit === 'D' && card.rank === '10')
        );

        if (leekhaCards.length > 0) {
            return leekhaCards; // Must play one of these
        }

        return hand; // Can play anything
    }

    async endRound() {
        if (!this.simulation || !this.simulation.enabled) {
            console.log("Round End");
        }

        // Add round points to total score
        let limitReached = false;
        let loser = null;

        // Visual delay
        await this.delay(TIMING.ROUND_END_DELAY);

        // Clear table (remove last trick)
        this.events.emit(GameEvents.TRICK_PILE_CLEAR);

        for (const player of this.players) {
            player.score += player.currentRoundPoints;
            player.currentRoundPoints = 0; // Reset for next calculation or just keep in history

            if (player.score >= GAME_RULES.SCORE_LIMIT) {
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
            // Update dealer: player who captured the Queen of Spades becomes the new dealer
            if (this.queenOfSpadesCapturedBy !== null) {
                this.dealerIndex = this.queenOfSpadesCapturedBy;
            }

            // Next Round
            if (this.simulation?.enabled) {
                this.startRound();
            } else {
                setTimeout(() => this.startRound(), TIMING.ROUND_START_DELAY);
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
