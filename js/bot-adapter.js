"use strict";
/**
 * Adapter to integrate LeekhaHeuristicBot with the game engine
 */
import { RANKS } from './card.js';

export class BotAdapter {
    constructor(heuristicBot, playerIndex, gameState) {
        this.bot = heuristicBot;
        this.playerIndex = playerIndex;
        this.gameState = gameState;
    }

    /**
     * Convert Card objects to bot format: 2D array [hearts, spades, diamonds, clubs]
     * Cards are strings like "Ah", "Ks", "Qd", "Th" (T = 10)
     */
    convertHandToBotFormat(hand) {
        if (!hand || !Array.isArray(hand) || hand.length === 0) {
            console.warn('Empty or invalid hand in convertHandToBotFormat');
            return [[], [], [], []];
        }

        const botHand = [[], [], [], []]; // H, S, D, C
        const suitMap = { 'H': 0, 'S': 1, 'D': 2, 'C': 3 };

        for (const card of hand) {
            if (!card || !card.suit || !card.rank) {
                console.warn('Invalid card in hand:', card);
                continue;
            }
            const suitKey = String(card.suit).toUpperCase();
            const suitIndex = suitMap[suitKey];
            if (suitIndex === undefined) {
                console.warn('Invalid suit:', card.suit);
                continue;
            }
            // Convert rank: "10" -> "T", others stay the same
            const botRank = card.rank === '10' ? 'T' : card.rank;
            const cardStr = botRank + suitKey.toLowerCase();
            botHand[suitIndex].push(cardStr);
        }

        // Sort each suit by rank (lowest to highest)
        for (let i = 0; i < 4; i++) {
            botHand[i].sort((a, b) => {
                // Convert bot rank back to RANKS index for comparison
                const rankA = this.#botRankToIndex(a[0]);
                const rankB = this.#botRankToIndex(b[0]);
                return rankA - rankB;
            });
        }

        return botHand;
    }

    /**
     * Convert bot rank character to RANKS array index
     * Bot uses: 2-9, T (for 10), J, Q, K, A
     */
    #botRankToIndex(botRank) {
        if (botRank === 'T') {
            return RANKS.indexOf('10');
        }
        return RANKS.indexOf(botRank);
    }

    /**
     * Convert bot card string back to Card object
     * Bot format: "Th", "Qs", "Ad", etc. (T = 10)
     */
    convertBotCardToCard(botCard, hand) {
        const legalFallback = () => {
            try {
                const valid = this.gameState?.getValidMoves ? this.gameState.getValidMoves(hand) : hand;
                return (valid && valid.length > 0) ? valid[0] : (hand.length > 0 ? hand[0] : null);
            } catch {
                return hand.length > 0 ? hand[0] : null;
            }
        };

        // Validate botCard
        if (!botCard || typeof botCard !== 'string' || botCard.length < 2) {
            console.error('Invalid botCard returned:', botCard, 'Hand:', hand);
            return legalFallback();
        }

        // Bot uses single character ranks: 2-9, T, J, Q, K, A
        // Be defensive: accept "10h" as well.
        const normalized = botCard.trim();
        const botRank = normalized.length === 3 ? 'T' : normalized[0].toUpperCase();
        const rank = botRank === 'T' ? '10' : botRank;
        const suit = normalized[normalized.length - 1].toUpperCase();

        const foundCard = hand.find(c => c.rank === rank && c.suit === suit);

        if (!foundCard) {
            console.error(`Card not found in hand: ${botCard} (${rank}${suit}). Available cards:`,
                hand.map(c => `${c.rank}${c.suit}`));
            return legalFallback();
        }

        return foundCard;
    }

    /**
     * Choose 3 cards to pass
     */
    choosePassCards(hand) {
        if (!hand || hand.length < 3) {
            console.error('Invalid hand for passing:', hand);
            return hand.slice(0, 3); // Return first 3 cards as fallback
        }

        const botHand = this.convertHandToBotFormat(hand);
        const ctx = this.buildPassContext();
        let botCards;

        try {
            botCards = this.bot.choosePass(botHand, ctx);
        } catch (error) {
            console.error('Error calling bot choosePass:', error);
            // Fallback: pass highest 3 cards
            const sorted = [...hand].sort((a, b) => b.value - a.value);
            return sorted.slice(0, 3);
        }

        if (!botCards || !Array.isArray(botCards) || botCards.length !== 3) {
            console.error('Bot returned invalid pass cards:', botCards);
            // Fallback: pass highest 3 cards
            const sorted = [...hand].sort((a, b) => b.value - a.value);
            return sorted.slice(0, 3);
        }

        // Convert back to Card objects, filtering out any null/undefined results
        const cards = botCards
            .map(botCard => this.convertBotCardToCard(botCard, hand))
            .filter(card => card !== null && card !== undefined);

        // Ensure we have exactly 3 cards
        if (cards.length !== 3) {
            console.warn('Bot pass conversion resulted in', cards.length, 'cards, using fallback');
            const sorted = [...hand].sort((a, b) => b.value - a.value);
            return sorted.slice(0, 3);
        }

        return cards;
    }

    buildPassContext() {
        return {
            scores: [...this.gameState.scores],
            playerIndex: this.playerIndex
        };
    }

    /**
     * Choose a card to play
     */
    playCard(hand) {
        if (!hand || hand.length === 0) {
            console.error('Empty hand passed to playCard');
            return null;
        }

        const botHand = this.convertHandToBotFormat(hand);
        const isLeading = this.gameState.trick.length === 0;

        let botCard;
        try {
            if (isLeading) {
                const ctx = this.buildLeadContext(botHand);
                botCard = this.bot.chooseLead(botHand, ctx);
            } else {
                const ctx = this.buildFollowContext(botHand);
                botCard = this.bot.chooseFollow(botHand, ctx);
            }
        } catch (error) {
            console.error('Error calling bot decision method:', error);
            console.error('Hand:', hand, 'BotHand:', botHand);
            // Fallback to a LEGAL card (follow suit / forced leekha)
            const valid = this.gameState?.getValidMoves ? this.gameState.getValidMoves(hand) : hand;
            return (valid && valid.length > 0) ? valid[0] : hand[0];
        }

        const card = this.convertBotCardToCard(botCard, hand);

        // Final safety check - ensure we return a valid, legal card
        if (!card && hand.length > 0) {
            console.warn('Bot returned invalid card, using legal fallback');
            const valid = this.gameState?.getValidMoves ? this.gameState.getValidMoves(hand) : hand;
            return (valid && valid.length > 0) ? valid[0] : hand[0];
        }

        return card;
    }

    /**
     * Build context for leading a trick
     */
    buildLeadContext(botHand) {
        const tracker = this.gameState.cardTracker;

        // Ensure botHand is valid
        if (!botHand || !Array.isArray(botHand) || botHand.length !== 4) {
            console.error('Invalid botHand in buildLeadContext:', botHand);
            botHand = [[], [], [], []];
        }

        return {
            remaining: tracker.getRemainingCounts(),
            ranks: tracker.getOurRanks(botHand),
            hasPlayers: tracker.getPlayersWithSuit(this.playerIndex),
            hasQueenOfSpades: botHand[1] && Array.isArray(botHand[1]) ? botHand[1].includes('Qs') : false,
            trickType: this.getTrickType(),
            heartsBroken: tracker.heartsBroken,
            queenOfSpadesPlayed: tracker.queenOfSpadesPlayed,
            tenOfDiamondsPlayed: tracker.tenOfDiamondsPlayed,
            firstTrickRevealedVoid: tracker.firstTrickRevealedVoid,
            playedCards: tracker.getPlayedCards(),
            trick: [],
            scores: [...this.gameState.scores],
            playerIndex: this.playerIndex
        };
    }

    /**
     * Build context for following a trick
     */
    buildFollowContext(botHand) {
        const tracker = this.gameState.cardTracker;
        const trick = this.gameState.trick;

        if (!trick || trick.length === 0) {
            console.error('Invalid trick in buildFollowContext');
            return this.buildLeadContext(botHand);
        }

        const leadCard = trick[0].card;
        const suitMap = { 'H': 0, 'S': 1, 'D': 2, 'C': 3 };
        const leadSuit = suitMap[String(leadCard.suit).toUpperCase()];

        // Ensure botHand is valid
        if (!botHand || !Array.isArray(botHand) || botHand.length !== 4) {
            console.error('Invalid botHand in buildFollowContext:', botHand);
            botHand = [[], [], [], []];
        }

        // Find highest rank played so far in the lead suit
        let highestRank = -1;
        for (const play of trick) {
            if (play.card.suit === leadCard.suit) {
                const rank = RANKS.indexOf(play.card.rank);
                if (rank > highestRank) {
                    highestRank = rank;
                }
            }
        }

        if (highestRank < 0) highestRank = 0;

        const trickPoints = trick.reduce((sum, play) => sum + play.card.points, 0);

        return {
            playerPosition: trick.length, // 0 = first to play, 3 = last
            suit: leadSuit,
            remaining: tracker.getRemainingCounts(),
            ranks: tracker.getOurRanks(botHand),
            hasPlayers: tracker.getPlayersWithSuit(this.playerIndex),
            highestRankPlayed: highestRank,
            hasQueenOfSpades: botHand[1] && Array.isArray(botHand[1]) ? botHand[1].includes('Qs') : false,
            trickType: this.getTrickType(),
            queenOfSpadesPlayed: tracker.queenOfSpadesPlayed,
            tenOfDiamondsPlayed: tracker.tenOfDiamondsPlayed,
            firstTrickRevealedVoid: tracker.firstTrickRevealedVoid,
            playedCards: tracker.getPlayedCards(),
            pointsInTrick: trickPoints,
            trick: trick,
            scores: [...this.gameState.scores],
            playerIndex: this.playerIndex
        };
    }

    /**
     * Determine trick type:
     * -1 = first trick of round
     *  0 = early game (Q♠ not played)
     *  1 = Q♠ trick
     *  2 = late game (Q♠ already played)
     */
    getTrickType() {
        const tracker = this.gameState.cardTracker;

        // First trick
        if (tracker.tricksPlayed === 0) {
            return -1;
        }

        // Check if Q♠ has been played
        if (tracker.queenOfSpadesPlayed) {
            return 2; // Late game
        }

        // Check if this is the Q♠ trick
        const trick = this.gameState.trick;
        for (const play of trick) {
            if (play.card.suit === 'S' && play.card.rank === 'Q') {
                return 1; // Q♠ trick
            }
        }

        return 0; // Early game
    }
}
