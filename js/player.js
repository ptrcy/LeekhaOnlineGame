"use strict";
import { GameEvents } from './events.js';

export class Player {
    constructor(name, position) {
        this.name = name;
        this.position = position; // 'bottom', 'left', 'top', 'right'
        this.hand = [];
        this.score = 0;
        this.currentRoundPoints = 0;
    }

    receiveCards(cards) {
        this.hand.push(...cards);
        this.sortHand();
    }

    removeCards(cardsToRemove) {
        const idsToRemove = new Set(cardsToRemove.map(c => c.id));
        this.hand = this.hand.filter(c => !idsToRemove.has(c.id));
    }

    sortHand() {
        // Sort by Suit then Rank
        const suitOrder = { 'H': 0, 'S': 1, 'D': 2, 'C': 3 };
        this.hand.sort((a, b) => {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return a.value - b.value;
        });
    }

    // Abstract methods
    async choosePassCards(gameState) { throw new Error("Not implemented"); }
    async playCard(gameState) { throw new Error("Not implemented"); }
}

export class HumanPlayer extends Player {
    constructor(name, position, inputController) {
        super(name, position);
        this.input = inputController;
    }

    async choosePassCards(gameState) {
        try {
            return await this.input.getPassSelection(this.hand);
        } catch (error) {
            if (gameState && gameState.events) {
                gameState.events.emit(GameEvents.ERROR_OCCURRED, {
                    type: 'input_error',
                    message: error.message || 'Pass selection failed, using fallback cards',
                    error
                });
            }
            const sorted = [...this.hand].sort((a, b) => b.value - a.value);
            return sorted.slice(0, 3);
        }
    }

    async playCard(gameState) {
        try {
            const validMoves = gameState.getValidMoves(this.hand);
            return await this.input.getCardSelection(this.hand, validMoves);
        } catch (error) {
            if (gameState && gameState.events) {
                gameState.events.emit(GameEvents.ERROR_OCCURRED, {
                    type: 'input_error',
                    message: error.message || 'Card selection failed, playing fallback card',
                    error
                });
            }
            try {
                const validMoves = gameState.getValidMoves(this.hand);
                if (validMoves && validMoves.length > 0) {
                    return validMoves[0];
                }
            } catch {
            }
            return this.hand[0];
        }
    }
}

export class BotPlayer extends Player {
    constructor(name, position) {
        super(name, position);
        this.adapter = null; // Will be set by GameState
    }

    setAdapter(adapter) {
        this.adapter = adapter;
    }

    async choosePassCards(gameState) {
        if (this.adapter) {
            // Use heuristic bot
            return this.adapter.choosePassCards(this.hand);
        }

        // Fallback: simple logic - pass 3 highest cards
        const sorted = [...this.hand].sort((a, b) => b.value - a.value);
        return sorted.slice(0, 3);
    }

    async playCard(gameState) {
        // Fake thinking delay for realism (skip during simulations)
        if (!gameState?.simulation?.enabled) {
            await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        }

        if (this.adapter) {
            // Use heuristic bot
            const choice = this.adapter.playCard(this.hand);
            return choice;
        }

        // Fallback: random valid move
        const validMoves = gameState.getValidMoves(this.hand);
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
}
