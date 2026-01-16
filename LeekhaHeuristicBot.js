/**
 * Leekha/Likha Game AI Decision Engine
 *
 * This module implements strategic decision-making for the card game Leekha (also known as Likha).
 * It uses card counting, probability analysis, and positional strategy to make
 * optimal decisions without knowledge of other players' hands.
 */
export class LeekhaHeuristicBot {
    // ============================================================================
    // CONSTANTS AND CONFIGURATION
    // ============================================================================

    // Risk Thresholds
    static AGGRESSION_THRESHOLD_HAS_QS = 0.15;
    static AGGRESSION_THRESHOLD_LATE = 0.25;
    static QS_RISK_THRESHOLD_SAFE = 0.25;
    static QS_RISK_THRESHOLD_KILLSHOT = 0.5;
    static QS_RISK_THRESHOLD_SECONDARY = 0.4;

    // Future Remaining Value (FRV) multipliers
    static FRV_BASE_NO_VOIDS = 2.25;
    static FRV_BASE_ONE_VOID = 1.75;
    static FRV_BASE_TWO_VOIDS = 1.25;
    static FRV_HEARTS_BONUS_NO_VOIDS = 1.5;
    static FRV_HEARTS_BONUS_ONE_VOID = 1.25;
    static FRV_HEARTS_BONUS_TWO_VOIDS = 0.75;

    // Sentinel values for suit ranking
    static RANK_INVALID = 9999;
    static RANK_NO_HEARTS = 999;
    static RANK_WIN_DUEL = 100;
    static RANK_UNCERTAIN = 50;

    // Minimum cards for strategic plays
    static MIN_CARDS_FOR_SECONDARY_KILLSHOT = 4;
    static MIN_CARDS_FOR_SAFE_2ND_LOWEST = 5;

    #rankReference;

    /**
     * @param {string[]} rankReference - A list of card ranks from lowest to highest, e.g., ['2', '3', ..., 'A'].
     */
    constructor(rankReference) {
        this.#rankReference = [...rankReference];
    }

    // --- Public API ----------------------------------------------------------

    /**
     * Return 3 cards to pass (mutates `hand` in the same way as legacy).
     * @param {string[][]} hand - The player's hand, a 2D array sorted by suit.
     * @returns {string[]} The 3 cards to pass.
     */
    choosePass(hand) {
        return this.#passCards(hand);
    }

    /**
     * Choose a card to lead a trick.
     * @param {string[][]} hand
     * @param {object} ctx - The LeadContext object.
     * @param {number[]} ctx.remaining
     * @param {number[][]} ctx.ranks
     * @param {boolean[][]} ctx.hasPlayers
     * @param {boolean} ctx.hasQueenOfSpades
     * @param {boolean} ctx.hasTenOfDiamonds
     * @param {number} ctx.trickType
     * @param {boolean} ctx.heartsBroken
     * @param {boolean} ctx.firstTrickRevealedVoid
     * @returns {string} The card to lead.
     */
    chooseLead(hand, ctx) {
        const hasTenOfDiamonds = hand[2].includes("Td");
        return this.#lead(
            hand,
            [...ctx.remaining],
            ctx.ranks.map(x => [...x]),
            ctx.hasPlayers.map(x => [...x]),
            ctx.hasQueenOfSpades,
            hasTenOfDiamonds,
            ctx.trickType,
            ctx.heartsBroken,
            ctx.firstTrickRevealedVoid
        );
    }

    /**
     * Choose a card to play when following suit.
     * @param {string[][]} hand
     * @param {object} ctx - The FollowContext object.
     * @param {number} ctx.playerPosition
     * @param {number} ctx.suit
     * @param {number[]} ctx.remaining
     * @param {number[][]} ctx.ranks
     * @param {boolean[][]} ctx.hasPlayers
     * @param {number} ctx.highestRankPlayed
     * @param {boolean} ctx.hasQueenOfSpades
     * @param {boolean} ctx.hasTenOfDiamonds
     * @param {number} ctx.trickType
     * @param {boolean} ctx.firstTrickRevealedVoid
     * @returns {string} The card to play.
     */
    chooseFollow(hand, ctx) {
        const hasTenOfDiamonds = hand[2].includes("Td");
        return this.#follow(
            hand,
            ctx.playerPosition,
            ctx.suit,
            [...ctx.remaining],
            ctx.ranks.map(x => [...x]),
            ctx.hasPlayers.map(x => [...x]),
            ctx.highestRankPlayed,
            ctx.hasQueenOfSpades,
            hasTenOfDiamonds,
            ctx.trickType,
            ctx.firstTrickRevealedVoid,
            ctx.pointsInTrick
        );
    }

    // ============================================================================
    // Passing Methods
    // ============================================================================

    #passCards(hand) {
        let toPass = [];
        let cardsToPassRemaining = 3;
        const hasQueenOfSpades = hand[1].includes("Qs");

        cardsToPassRemaining = this.#passPriorityCards(hand, hasQueenOfSpades, toPass, cardsToPassRemaining);
        let { heartsToPreserve, cardsToPassRemaining: newRemaining } = this.#identifyHeartsToPreserve(hand, toPass, cardsToPassRemaining);
        cardsToPassRemaining = newRemaining;

        if (hasQueenOfSpades) {
            cardsToPassRemaining = this.#passToCreateVoidsWithQs(hand, toPass, cardsToPassRemaining);
        } else {
            cardsToPassRemaining = this.#passToCreateVoidsWithoutQs(hand, toPass, cardsToPassRemaining);
        }

        this.#passRemainingDangerousCards(hand, toPass, cardsToPassRemaining, heartsToPreserve);

        return toPass;
    }

    #passPriorityCards(hand, hasQueenOfSpades, toPass, cardsToPassRemaining) {
        // Priority 1: Pass Td if diamond suit is short
        if (hand[2].includes("Td") && hand[2].length <= 3 && cardsToPassRemaining > 0) {
            toPass.push(hand[2].splice(hand[2].indexOf("Td"), 1)[0]);
            cardsToPassRemaining--;
        }

        // Priority 2: Spade logic
        if (hasQueenOfSpades && cardsToPassRemaining > 0) {
            // Have Qs. If spade suit is short (<=2 cards), pass the other non-Qs spade.
            if (hand[1].length <= 2) {
                const otherSpades = hand[1].filter(c => c !== 'Qs');
                // Pass highest of the other spades first
                while(otherSpades.length > 0 && cardsToPassRemaining > 0) {
                    const cardToPass = otherSpades.pop();
                    toPass.push(hand[1].splice(hand[1].indexOf(cardToPass), 1)[0]);
                    cardsToPassRemaining--;
                }
            }
        } else { // Do NOT have Qs
            // Pass As and/or Ks if we have them, to avoid taking the Qs later.
            const highSpades = ["As", "Ks"];
            for (const card of highSpades) {
                if (cardsToPassRemaining > 0 && hand[1].includes(card)) {
                    toPass.push(hand[1].splice(hand[1].indexOf(card), 1)[0]);
                    cardsToPassRemaining--;
                }
            }
        }

        return cardsToPassRemaining;
    }

    #identifyHeartsToPreserve(hand, toPass, cardsToPassRemaining) {
        let heartsToPreserve = 0;
        if (heartsToPreserve < hand[0].length && hand[0][heartsToPreserve] === "Ah") {
            heartsToPreserve++;
        }
        if (heartsToPreserve < hand[0].length && hand[0][heartsToPreserve] === "Kh") {
            heartsToPreserve++;
        }

        if (hand[2].length === 0 && hand[3].length === 0) {
            while (cardsToPassRemaining > 0 && hand[0].length > heartsToPreserve) {
                toPass.push(hand[0].splice(heartsToPreserve, 1)[0]);
                cardsToPassRemaining--;
            }
            while (cardsToPassRemaining > 0 && hand[1].length > 0) {
                toPass.push(hand[1].shift());
                cardsToPassRemaining--;
            }
        }

        return { heartsToPreserve, cardsToPassRemaining };
    }

    #passToCreateVoidsWithQs(hand, toPass, cardsToPassRemaining) {
        const hasTenOfDiamonds = hand[2].includes("Td");
        let voidableSuit = -1;
        if ((hand[3].length > 0 && hand[3].length <= cardsToPassRemaining) || (hand[2].length > 0 && hand[2].length <= cardsToPassRemaining && !hasTenOfDiamonds)) {
            if (hand[3].length > 0 && hand[3].length <= cardsToPassRemaining) {
                voidableSuit = 3;
            }
            if (hand[2].length > 0 && hand[2].length <= cardsToPassRemaining && !hasTenOfDiamonds) {
                voidableSuit = 2;
            }
            
            toPass.push(...hand[voidableSuit]);
            cardsToPassRemaining -= hand[voidableSuit].length;
            hand[voidableSuit] = [];

        } else {
            let shortestSuit;
            if (hand[2].length === 0 || hasTenOfDiamonds) {
                shortestSuit = 3;
            } else if (hand[3].length === 0) {
                shortestSuit = 2;
            } else {
                shortestSuit = hand[3].length < hand[2].length ? 3 : 2;
            }

            while (cardsToPassRemaining > 0 && hand[shortestSuit].length > 0) {
                toPass.push(hand[shortestSuit].shift());
                cardsToPassRemaining--;
            }
        }
        return cardsToPassRemaining;
    }

    #passToCreateVoidsWithoutQs(hand, toPass, cardsToPassRemaining) {
        // NOTE: The Python code `self._rank_reference[card_char]` will fail. Assuming `indexOf` was intended.
        const kthLowestClub = hand[3].length > 0 ? 14 - this.#rankReference.indexOf(hand[3][hand[3].length - 1][0]) : 0;
        const kthLowestDiam = hand[2].length > 0 ? 14 - this.#rankReference.indexOf(hand[2][hand[2].length - 1][0]) : 0;

        if (kthLowestClub > kthLowestDiam) {
            while (cardsToPassRemaining > 0 && hand[3].length > 0) {
                toPass.push(hand[3].shift());
                cardsToPassRemaining--;
            }
        } else {
            while (cardsToPassRemaining > 0 && hand[2].length > 0) {
                toPass.push(hand[2].shift());
                cardsToPassRemaining--;
            }
        }
        return cardsToPassRemaining;
    }

    #passRemainingDangerousCards(hand, toPass, cardsToPassRemaining, heartsToPreserve) {
        while (cardsToPassRemaining > 0 && hand[0].length > heartsToPreserve && this.#rankReference.indexOf(hand[0][heartsToPreserve][0]) <= 6) {
            toPass.push(hand[0].splice(heartsToPreserve, 1)[0]);
            cardsToPassRemaining--;
        }

        while (cardsToPassRemaining > 0 && hand[2].length > 0) {
            toPass.push(hand[2].shift());
            cardsToPassRemaining--;
        }

        while (cardsToPassRemaining > 0 && hand[3].length > 0) {
            toPass.push(hand[3].shift());
            cardsToPassRemaining--;
        }

        while (cardsToPassRemaining > 0 && hand[1].length > 0) {
            toPass.push(hand[1].shift());
            cardsToPassRemaining--;
        }

        while (cardsToPassRemaining > 0 && hand[0].length > heartsToPreserve) {
            toPass.push(hand[0].splice(heartsToPreserve, 1)[0]);
            cardsToPassRemaining--;
        }

        return cardsToPassRemaining;
    }
    
    // ============================================================================
    // Leading Strategy
    // ============================================================================

    #lead(hand, remaining, ranks, hasPlayers, hasQueenOfSpades, hasTenOfDiamonds, trickType, heartsBroken, firstTrickRevealedVoid) {
        if (trickType === -1 || trickType === 0) {
            if (hasQueenOfSpades) {
                return this.#earlyLeadHasQs(hand, remaining, ranks, hasPlayers, hasTenOfDiamonds);
            } else {
                return this.#earlyLeadNoQs(hand, remaining, ranks, hasPlayers, firstTrickRevealedVoid, hasTenOfDiamonds);
            }
        } else {
            return this.#lateLead(hand, remaining, ranks, hasPlayers);
        }
    }

    #earlyLeadHasQs(hand, remaining, ranks, hasPlayers, hasTenOfDiamonds) {
        const index = this.#calculateAggressionThreshold(hand, remaining, LeekhaHeuristicBot.AGGRESSION_THRESHOLD_HAS_QS);

        if (remaining[1] === 1 && !ranks[1].includes(1)) {
            return "Qs";
        } else if (remaining[1] === 2 && !ranks[1].includes(1) && !ranks[1].includes(2)) {
            return "Qs";
        }

        const diamondFrem = remaining[2] ? remaining[2] - this.#calculateFutureRemainingValue(2, hasPlayers) * hand[2].length : -1000;
        const clubFrem = remaining[3] ? remaining[3] - this.#calculateFutureRemainingValue(3, hasPlayers) * hand[3].length : -1000;

        if (hand[0].length > 0) {
            const heartFrem = (remaining[0] && JSON.stringify(ranks[0]) !== JSON.stringify(Array.from({length: hand[0].length}, (_, i) => i + 1))) ? remaining[0] - this.#calculateFutureRemainingValue(0, hasPlayers) * hand[0].length : -1000;
            if ((hand[2].length === 0 || heartFrem > diamondFrem) && (hand[3].length === 0 || heartFrem > clubFrem) && heartFrem > -1000) {
                return hand[0][hand[0].length - 1];
            }
        }

        if (hand[2].length === 0 && hand[3].length === 0) {
            if (hand[1][hand[1].length - 1] === "Qs") {
                return hand[1][0];
            }
            return hand[1][hand[1].length - 1];
        }

        if (hand[2].length === 0) {
            if (clubFrem === -1000) {
                return this.#playUnderCurrentHigh(hand, 1, 3, 0);
            }
            return hand[3][index];
        }

        if (hand[3].length === 0) {
            if (diamondFrem === -1000) {
                return this.#playUnderCurrentHigh(hand, 1, 3, 0);
            }
            return hand[2][index];
        }

        if (diamondFrem === -1000 && clubFrem === -1000) {
            return this.#playUnderCurrentHigh(hand, 1, 3, 0);
        } else if (diamondFrem > clubFrem) {
            return hand[2][index];
        } else {
            return hand[3][index];
        }
    }

    #earlyLeadNoQs(hand, remaining, ranks, hasPlayers, firstTrickRevealedVoid, hasTenOfDiamonds) {
        if (hand[1].length > 0 && this.#rankReference.indexOf(hand[1][0][0]) >= 4) {
            return hand[1][0];
        }

        let diamondRisk = this.#calculatePenaltyCardRisk(remaining, 2, 0);
        if (!hasTenOfDiamonds) {
            diamondRisk += this.#calculatePenaltyCardRisk(remaining, 2, 0);
        }
        if (this.#shouldLeadRiskySuit(hand, remaining, ranks, hasPlayers, diamondRisk, 2)) {
            return hand[2][hand[2].length - 1];
        }

        const clubRisk = firstTrickRevealedVoid !== LeekhaHeuristicBot.RANK_WIN_DUEL ? 1/3 : this.#calculatePenaltyCardRisk(remaining, 3, 0);
        if (this.#shouldLeadRiskySuit(hand, remaining, ranks, hasPlayers, clubRisk, 3)) {
            return hand[3][hand[3].length - 1];
        }

        if (hand[0].length > 0) {
            const heartRisk = this.#calculatePenaltyCardRisk(remaining, 0, 0);
            if ((hand[2].length === 0 || heartRisk < diamondRisk) && (hand[3].length === 0 || heartRisk < clubRisk)) {
                return hand[0][hand[0].length - 1];
            }
        }
        
        if (hand[2].length === 0) {
            if (hand[3].length > 0) {
                 if (clubRisk < LeekhaHeuristicBot.QS_RISK_THRESHOLD_SAFE) {
                    return hand[3][0];
                }
                return hand[3][hand[3].length - 1];
            }
            return hand[1].length > 0 ? hand[1][hand[1].length - 1] : hand[0][hand[0].length - 1];
        }
    
        if (hand[3].length === 0) {
            if (hand[2].length > 0) {
                if (diamondRisk < LeekhaHeuristicBot.QS_RISK_THRESHOLD_SAFE) {
                    return hand[2][0];
                }
                return hand[2][hand[2].length - 1];
            }
            return hand[1].length > 0 ? hand[1][hand[1].length - 1] : hand[0][hand[0].length - 1];
        }
        
        if (diamondRisk <= clubRisk) {
            if (diamondRisk < LeekhaHeuristicBot.QS_RISK_THRESHOLD_SAFE) {
                return hand[2][0];
            }
            return hand[2][hand[2].length - 1];
        } else {
            if (clubRisk < LeekhaHeuristicBot.QS_RISK_THRESHOLD_SAFE) {
                return hand[3][0];
            }
            return hand[3][hand[3].length - 1];
        }
    }

    #lateLead(hand, remaining, ranks, hasPlayers) {
        const winDuelSuits = [];
        for (let i = 0; i < 4; i++) {
            if (hand[i].length > 0 && remaining[i] > 0 && this.#canWinDuel(ranks[i], remaining[i])) {
                winDuelSuits.push(i);
            }
        }
        
        if (winDuelSuits.length === 0) {
            const lowestRanks = [];
            for (let suit = 0; suit < 4; suit++) {
                if (hand[suit].length === 0) {
                    lowestRanks.push(LeekhaHeuristicBot.RANK_INVALID);
                } else if (remaining[suit] === 0) {
                    lowestRanks.push(LeekhaHeuristicBot.RANK_WIN_DUEL);
                } else if (JSON.stringify(ranks[suit]) === JSON.stringify(Array.from({length: ranks[suit].length}, (_, i) => i + 1))) {
                    lowestRanks.push(LeekhaHeuristicBot.RANK_UNCERTAIN);
                } else {
                    lowestRanks.push(hand[suit].length + remaining[suit] - ranks[suit][ranks[suit].length - 1] + 1);
                }
            }

            const minRank = Math.min(...lowestRanks);
            let index = lowestRanks.indexOf(minRank);

            if (minRank === 1) {
                for (let i = 0; i < 4; i++) {
                    if (lowestRanks[i] === 1 && hand[i].length < hand[index].length) {
                        index = i;
                    }
                }
            } else if (minRank === 2) {
                let hasTwo = hasPlayers[index].length >= 2;
                for (let i = 0; i < 4; i++) {
                    if (lowestRanks[i] === 2 && hasPlayers[i].length >= 2) {
                        if (!hasTwo || remaining[i] >= remaining[index]) {
                            index = i;
                            hasTwo = true;
                        }
                    }
                }
            } else if (minRank === 3) {
                let hasThree = hasPlayers[index].length === 3;
                for (let i = 0; i < 4; i++) {
                    if (lowestRanks[i] === 3 && hasPlayers[i].length === 3) {
                        if (!hasThree || remaining[i] >= remaining[index]) {
                            index = i;
                            hasThree = true;
                        }
                    }
                }
            } else {
                if (index === 0) {
                    const secondMin = Math.min(...lowestRanks.slice(1));
                    if (secondMin < LeekhaHeuristicBot.RANK_UNCERTAIN) {
                        index = lowestRanks.slice(1).indexOf(secondMin) + 1;
                    }
                }
                for (let i = 1; i < 4; i++) {
                    if (lowestRanks[i] <= LeekhaHeuristicBot.RANK_UNCERTAIN && hand[i].length <= hand[index].length) {
                        index = i;
                    }
                }
            }
            
            return hand[index][hand[index].length - 1];
        }

        let shortest = winDuelSuits[0];
        for (const suit of winDuelSuits) {
            if (hand[suit].length < hand[shortest].length) {
                shortest = suit;
            }
        }
        return hand[shortest][hand[shortest].length - 1];
    }

    // ============================================================================
    // Following Strategy
    // ============================================================================

    #follow(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, hasQueenOfSpades, hasTenOfDiamonds, trickType, firstTrickRevealedVoid, pointsInTrick) {
        if (trickType === -1) {
            return this.#firstTrickFollow(hand, hasQueenOfSpades, suit);
        }
        if (trickType === 0) {
            return this.#earlyFollow(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, hasQueenOfSpades, hasTenOfDiamonds, firstTrickRevealedVoid);
        } else if (trickType === 1) {
            return this.#qsTrick(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed);
        } else {
            return this.#lateFollow(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, pointsInTrick);
        }
    }

    #firstTrickFollow(hand, hasQueenOfSpades, suit) {
        if (hand[suit].length > 0) {
            return hand[suit][hand[suit].length - 1];
        }
        
        const leekhaCard = this.#checkLeekhaPrinciple(hand, suit);
        if (leekhaCard) {
            return leekhaCard;
        }
        
        if (!hasQueenOfSpades && hand[1].length > 0) {
            const highestSpade = hand[1][hand[1].length - 1];
            if (highestSpade === "As" || highestSpade === "Ks") {
                return highestSpade;
            }
        }
        
        if (hand[2].length > 0) {
            return hand[2][0];
        } else if (hand[1].length > 0) {
            if (hand[1][0] === "Qs" && hand[1].length >= 2) {
                return hand[1][1];
            }
            return hand[1][0];
        } else { 
            return hand[0][0];
        }
    }
    
    #earlyFollow(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, hasQueenOfSpades, hasTenOfDiamonds, firstTrickRevealedVoid) {
        if (suit === 0 && hand[0].length > 0) {
           return this.#playUnderCurrentHigh(hand, 0, highestRankPlayed, playerPosition);
        } else if (suit === 1 && hand[1].length > 0) {
            if (hasQueenOfSpades) {
                if (highestRankPlayed <= 2) {
                    return "Qs";
                } else if (hand[1][0] === "Qs" && hand[1].length >= 2) {
                    return hand[1][1];
                } else {
                    return hand[1][0];
                }
            } else if (playerPosition === 3 || (playerPosition === 2 && !hasPlayers[1].includes(1)) || (playerPosition === 1 && JSON.stringify(hasPlayers[1]) === JSON.stringify([3]))) {
                return hand[1][0];
            } else if (highestRankPlayed === 1) {
                return hand[1][0];
            } else {
                if (hand[1].includes("As") && hand[1].includes("Ks")) {
                    return hand[1].length >= 3 ? hand[1][2] : hand[1][0];
                } else if (hand[1].includes("As") || hand[1].includes("Ks")) {
                    return hand[1].length >= 2 ? hand[1][1] : hand[1][0];
                } else {
                    return hand[1][0];
                }
            }
        } else if (hasQueenOfSpades) {
            return this.#earlyFollowHasQs(hand, playerPosition, suit, remaining, hasPlayers, highestRankPlayed);
        } else {
            return this.#earlyFollowNoQs(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, hasTenOfDiamonds, firstTrickRevealedVoid);
        }
    }

    #earlyFollowHasQs(hand, playerPosition, suit, remaining, hasPlayers, highestRankPlayed) {
        if (hand[suit].length > 0) {
            const index = this.#calculateAggressionThreshold(hand, remaining, 0.15);
            const hasAhead = hasPlayers[suit].filter(p => p > playerPosition).length;

            if (remaining[suit] <= hasAhead || index === -1) {
                return this.#playUnderCurrentHigh(hand, suit, highestRankPlayed, playerPosition);
            }
            return hand[suit][0];
        }

        const leekhaCard = this.#checkLeekhaPrinciple(hand, suit);
        if (leekhaCard) {
            return leekhaCard;
        }
        
        return hand[1].length > 0 ? hand[1][0] : hand[0][0];
    }

    #earlyFollowNoQs(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, hasTenOfDiamonds, firstTrickRevealedVoid) {
        if (hand[suit].length > 0) {
            if (this.#calculatePenaltyCardRisk(remaining, suit, playerPosition) > LeekhaHeuristicBot.QS_RISK_THRESHOLD_SAFE || (suit === 3 && firstTrickRevealedVoid <= 3 - playerPosition)) {
                return this.#playUnderCurrentHigh(hand, suit, highestRankPlayed, playerPosition);
            }
            return hand[suit][0];
        }
        
        const leekhaCard = this.#checkLeekhaPrinciple(hand, suit);
        if (leekhaCard) {
            return leekhaCard;
        }
        
        if (hand[1].length > 0 && (hand[1][0] === "As" || hand[1][0] === "Ks")) {
            return hand[1][0];
        }

        if ((hand[0].length > 0 ? 1:0) + (hand[2].length > 0 ? 1:0) + (hand[3].length > 0 ? 1:0) === 1) {
            return hand[0].length > 0 ? hand[0][0] : (hand[2].length > 0 ? hand[2][0] : hand[3][0]);
        }
        
        const remValues = {
            0: hand[0].length > 0 ? remaining[0] : LeekhaHeuristicBot.RANK_INVALID,
            2: hand[2].length > 0 ? remaining[2] : LeekhaHeuristicBot.RANK_INVALID,
            3: hand[3].length > 0 ? remaining[3] : LeekhaHeuristicBot.RANK_INVALID,
        };

        for (const s of [0, 2, 3]) {
            if (hand[s].length > 0 && this.#canWinDuel(ranks[s], remaining[s])) {
                remValues[s] = LeekhaHeuristicBot.RANK_WIN_DUEL;
            }
            if (hand[s].length === 1 && hasPlayers[s].length >= 2 && ranks[s][0] === remaining[s] && remaining[s] >= LeekhaHeuristicBot.MIN_CARDS_FOR_SAFE_2ND_LOWEST) {
                remValues[s] = LeekhaHeuristicBot.RANK_UNCERTAIN;
            }
        }

        if (hand[1].length > 0 && Math.min(...Object.values(remValues)) >= LeekhaHeuristicBot.RANK_UNCERTAIN) {
            return hand[1][0];
        }

        const riskySuit = Object.keys(remValues).reduce((a, b) => remValues[a] < remValues[b] ? a : b);

        if (hand[riskySuit].length > 0) {
            return hand[riskySuit][0];
        }

        for (const i of [0, 2, 3, 1]) {
            if (hand[i].length > 0) {
                return hand[i][0];
            }
        }
        throw new Error("No cards available to play");
    }

    #qsTrick(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, pointsInTrick) {
        if (hand[suit].length > 0) {
            return this.#playUnderCurrentHigh(hand, suit, highestRankPlayed, playerPosition);
        }
        return this.#lateFollow(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, pointsInTrick);
    }

    #lateFollow(hand, playerPosition, suit, remaining, ranks, hasPlayers, highestRankPlayed, pointsInTrick) {
        if (hand[suit].length > 0) { // If the bot has the lead suit
            // If there are points on the table, play defensively to avoid taking the trick
            if (pointsInTrick > 0) {
                // Find the highest rank currently winning the trick
                const highestCardInSuitRank = highestRankPlayed;
                let cardToPlay = null;

                // Iterate downwards from the highest card to find a card that plays UNDER the current winner
                for (let i = hand[suit].length - 1; i >= 0; i--) {
                    const card = hand[suit][i];
                    if (this.#rankReference.indexOf(card[0]) < highestCardInSuitRank) {
                        cardToPlay = card; // Found a card that plays under, so we'll play the highest of these under-cards
                        break;
                    }
                }

                // If we found a card to play under the current winner, play it.
                // Otherwise, we are forced to play over. In that case, play our LOWEST card to minimize the chance of winning.
                if (cardToPlay) {
                    return cardToPlay;
                } else {
                    return hand[suit][0];
                }
            }

            // Original logic for when there are no points on the table (aggressive play to win)
            const index = this.#calculateAggressionThreshold(hand, remaining, LeekhaHeuristicBot.AGGRESSION_THRESHOLD_LATE);
            const hasAhead = hasPlayers[suit].filter(p => p > playerPosition).length;

            if (remaining[suit] <= hasAhead || (index === -1 && suit !== 0)) {
                return this.#playUnderCurrentHigh(hand, suit, highestRankPlayed, playerPosition);
            }

            if (suit === 0) { // Special handling for hearts
                const underCard = this.#playUnderCurrentHigh(hand, suit, highestRankPlayed, playerPosition);
                if (this.#rankReference.indexOf(underCard[0]) > highestRankPlayed) {
                    return underCard;
                }
                if (playerPosition === 3) {
                    return underCard;
                }

                const kthLowest = hand[suit].length + remaining[suit] + 1 - ranks[suit][ranks[suit].length - 1];
                if ((playerPosition === 2 && (!hasPlayers[0].includes(1) || kthLowest >= 3)) ||
                    (playerPosition === 1 && (!hasPlayers[0].includes(1) && !hasPlayers[0].includes(2)) || kthLowest >= 3)) {
                    return hand[0][0];
                }
                return hand[0][hand[0].length - 1];
            }

            return hand[suit][0]; // Default to playing the lowest card
        }

        // If void in the lead suit, find another card to play
        const leekhaCard = this.#checkLeekhaPrinciple(hand, suit);
        if (leekhaCard) {
            return leekhaCard;
        }

        const losingSuits = [0, 1, 2, 3].filter(i => hand[i].length > 0 && remaining[i] > 0 && !this.#canWinDuel(ranks[i], remaining[i]));

        if (losingSuits.length === 0) {
            // If all remaining suits can win a duel, find any card to play (e.g., from the longest suit)
            const anyHand = hand[1].length > 0 ? hand[1] : (hand[2].length > 0 ? hand[2] : (hand[3].length > 0 ? hand[3] : hand[0]));
            return anyHand[0];
        }

        // Play the lowest card from the shortest suit that is expected to lose
        const shortestLoser = losingSuits.reduce((a, b) => hand[a].length < hand[b].length ? a : b);
        return hand[shortestLoser][0];
    }

    // ============================================================================
    // UTILITY FUNCTIONS - Risk Assessment & Card Selection
    // ============================================================================

    #playUnderCurrentHigh(hand, suit, highestRankPlayed, playerPosition) {
        if (playerPosition === 3 && this.#rankReference.indexOf(hand[suit][hand[suit].length - 1][0]) < highestRankPlayed) {
            return hand[suit][0];
        }
        for (const card of hand[suit]) {
            if (this.#rankReference.indexOf(card[0]) > highestRankPlayed) {
                return card;
            }
        }
        return hand[suit][hand[suit].length - 1];
    }

    #checkLeekhaPrinciple(hand, suit) {
        if (hand[suit].length > 0) {
            return null;
        }
        if (hand[1].includes("Qs")) {
            return "Qs";
        }
        if (hand[2].includes("Td")) {
            return "Td";
        }
        return null;
    }

    #calculateFutureRemainingValue(suit, hasPlayers) {
        const numVoids = 3 - hasPlayers[suit].length;
        const isHearts = suit === 0;
        if (numVoids === 0) {
            return LeekhaHeuristicBot.FRV_BASE_NO_VOIDS + LeekhaHeuristicBot.FRV_HEARTS_BONUS_NO_VOIDS * isHearts;
        } else if (numVoids === 1) {
            return LeekhaHeuristicBot.FRV_BASE_ONE_VOID + LeekhaHeuristicBot.FRV_HEARTS_BONUS_ONE_VOID * isHearts;
        } else if (numVoids === 2) {
            return LeekhaHeuristicBot.FRV_BASE_TWO_VOIDS + LeekhaHeuristicBot.FRV_HEARTS_BONUS_TWO_VOIDS * isHearts;
        }
        return 0;
    }

    #calculatePenaltyCardRisk(remaining, suit, playerPosition) {
        const totalRemaining = remaining.reduce((a, b) => a + b, 0);
        const suitRemaining = remaining[suit];
        if (suitRemaining === 0) {
            return 1;
        }
        if (totalRemaining === suitRemaining) {
            return 0;
        }

        const expectedTricksRemaining = Math.ceil(totalRemaining / 3);
        
        let probOneVoid, probTwoVoids;
        if (playerPosition === 0) {
            probOneVoid = (2 ** suitRemaining - 2) / 3 ** (suitRemaining - 1);
            probTwoVoids = 1 / 3 ** (suitRemaining - 1);
        } else if (playerPosition === 1) {
            probOneVoid = 2 * (2 ** suitRemaining - 1) / 3 ** suitRemaining;
            probTwoVoids = 1 / 3 ** suitRemaining;
        } else { // playerPosition === 2
            probOneVoid = 2 ** suitRemaining / 3 ** suitRemaining;
            probTwoVoids = 0;
        }

        const risk = (probOneVoid + 2 * probTwoVoids) * expectedTricksRemaining / (totalRemaining - suitRemaining);
        return risk;
    }

    #calculateAggressionThreshold(hand, remaining, threshold) {
        const voidCards = remaining.filter((_, i) => hand[i].length === 0).reduce((a, b) => a + b, 0);
        const totalRemaining = remaining.reduce((a, b) => a + b, 0);
        if (totalRemaining === 0) {
            return -1;
        }
        
        const prob = (1 - voidCards / (4 / 3 * totalRemaining)) ** (totalRemaining / 3);
        return prob > threshold ? 0 : -1;
    }

    #canWinDuel(ranks, remaining) {
        const oppRanks = Array.from({length: remaining + ranks.length}, (_, i) => i + 1).filter(r => !ranks.includes(r));
        const len = Math.min(ranks.length, oppRanks.length);
        for (let i = 1; i <= len; i++) {
            if (ranks[ranks.length - i] < oppRanks[oppRanks.length - i]) {
                return false;
            }
        }
        return true;
    }

    #shouldLeadRiskySuit(hand, remaining, ranks, hasPlayers, risk, suit) {
        if (hand[suit].length === 0 || remaining[suit] === 0) {
            return false;
        }

        const kthLowestRank = hand[suit].length + remaining[suit] + 1 - ranks[suit][ranks[suit].length - 1];

        if (risk > LeekhaHeuristicBot.QS_RISK_THRESHOLD_KILLSHOT && kthLowestRank === 1) {
            return true;
        }

        if (hasPlayers[suit].length === 3 && kthLowestRank === 2) {
            if (remaining[suit] >= LeekhaHeuristicBot.MIN_CARDS_FOR_SECONDARY_KILLSHOT && risk > LeekhaHeuristicBot.QS_RISK_THRESHOLD_SECONDARY) {
                return true;
            }
        }

        return false;
    }
}
