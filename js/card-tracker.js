"use strict";
/**
 * Tracks cards played and player information for bot AI
 */
import { RANKS } from './card.js';

export class CardTracker {
    constructor() {
        this.reset();
    }

    reset() {
        // Track which cards have been played
        this.playedCards = {
            'H': new Set(),
            'S': new Set(),
            'D': new Set(),
            'C': new Set()
        };

        // Track which players are known to be void in which suits
        // playerVoids[playerIndex][suit] = true if void
        this.playerVoids = [
            { 'H': false, 'S': false, 'D': false, 'C': false },
            { 'H': false, 'S': false, 'D': false, 'C': false },
            { 'H': false, 'S': false, 'D': false, 'C': false },
            { 'H': false, 'S': false, 'D': false, 'C': false }
        ];

        this.heartsBroken = false;
        this.queenOfSpadesPlayed = false;
        this.tenOfDiamondsPlayed = false;
        this.tricksPlayed = 0;
        this.firstTrickRevealedVoid = 100; // sentinel value
    }

    /**
     * Record a card being played
     */
    recordCardPlayed(card, playerIndex, trick) {
        // Mark card as played
        this.playedCards[card.suit].add(card.rank);

        // Check for special cards
        if (card.suit === 'S' && card.rank === 'Q') {
            this.queenOfSpadesPlayed = true;
        }
        if (card.suit === 'D' && card.rank === '10') {
            this.tenOfDiamondsPlayed = true;
        }
        if (card.suit === 'H') {
            this.heartsBroken = true;
        }

        // Detect voids
        if (trick.length > 0) {
            const leadSuit = trick[0].card.suit;
            if (card.suit !== leadSuit) {
                // Player is void in lead suit
                this.playerVoids[playerIndex][leadSuit] = true;

                // Track first trick void reveal
                if (this.tricksPlayed === 0 && this.firstTrickRevealedVoid === 100) {
                    this.firstTrickRevealedVoid = trick.length; // Position where void was revealed
                }
            }
        }
    }

    /**
     * Mark end of trick
     */
    endTrick() {
        this.tricksPlayed++;
    }

    /**
     * Get count of remaining cards in each suit (not yet played)
     * Returns: [hearts, spades, diamonds, clubs]
     */
    getRemainingCounts() {
        const counts = [0, 0, 0, 0];
        const suits = ['H', 'S', 'D', 'C'];

        for (let i = 0; i < 4; i++) {
            const suit = suits[i];
            counts[i] = 13 - this.playedCards[suit].size;
        }

        return counts;
    }

    /**
     * Get our rank positions in each suit
     * For example, if we have 2♥, 5♥, 9♥ and 2♥, 3♥, 4♥, 5♥ haven't been played,
     * our ranks are [1, 4] (2♥ is 1st lowest unplayed, 5♥ is 4th lowest unplayed)
     * Returns: [heartsRanks[], spadesRanks[], diamondsRanks[], clubsRanks[]]
     */
    getOurRanks(botHand) {
        const ranks = [[], [], [], []];
        const suits = ['H', 'S', 'D', 'C'];
        const suitLetters = ['h', 's', 'd', 'c'];

        for (let suitIndex = 0; suitIndex < 4; suitIndex++) {
            const suit = suits[suitIndex];
            const ourCards = botHand[suitIndex];

            // Get all unplayed cards in this suit
            const unplayedRanks = RANKS.filter(rank => !this.playedCards[suit].has(rank));

            // For each of our cards, find its position among unplayed cards
            for (const cardStr of ourCards) {
                // Extract rank from cardStr (e.g., "Ah" -> "A", "Th" -> "10")
                const botRank = cardStr.slice(0, -1).toUpperCase();
                const rank = botRank === 'T' ? '10' : botRank;

                const position = unplayedRanks.indexOf(rank) + 1; // 1-indexed
                if (position > 0) {
                    ranks[suitIndex].push(position);
                }
            }
        }

        return ranks;
    }

    /**
     * Get which players still have cards in each suit
     * Returns: [heartsPlayers[], spadesPlayers[], diamondsPlayers[], clubsPlayers[]]
     * Each inner array contains player indices (0-3) who might have cards in that suit
     */
    getPlayersWithSuit(ourPlayerIndex) {
        const hasPlayers = [[], [], [], []];
        const suits = ['H', 'S', 'D', 'C'];

        for (let suitIndex = 0; suitIndex < 4; suitIndex++) {
            const suit = suits[suitIndex];

            for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
                if (playerIndex === ourPlayerIndex) continue; // Skip ourselves

                // If player is not known to be void, they might have cards
                if (!this.playerVoids[playerIndex][suit]) {
                    // Relative player position (1, 2, 3 for left, partner, right)
                    const relativePos = (playerIndex - ourPlayerIndex + 4) % 4;
                    if (relativePos > 0) {
                        hasPlayers[suitIndex].push(relativePos);
                    }
                }
            }
        }

        return hasPlayers;
    }
}
