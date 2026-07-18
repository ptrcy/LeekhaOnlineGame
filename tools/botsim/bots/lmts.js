/**
 * LMTSBot - Adapted from bot.ts (external heuristic source)
 */

function isQueenOfSpades(card) {
    return card.suit === 'S' && card.rank === 12;
}

function isTenOfDiamonds(card) {
    return card.suit === 'D' && card.rank === 10;
}

function isLikha(card) {
    return isQueenOfSpades(card) || isTenOfDiamonds(card);
}

function cardPoints(card) {
    if (isQueenOfSpades(card)) return 13;
    if (isTenOfDiamonds(card)) return 10;
    if (card.suit === 'H') return 1;
    return 0;
}

function suitCount(hand, suit) {
    return hand.filter((c) => c.suit === suit).length;
}

// Higher = more dangerous to keep holding.
function dangerScore(card, hand) {
    if (isQueenOfSpades(card)) {
        const spades = suitCount(hand, "S") - 1; // other spades besides this one
        if (spades <= 1) return 25; // extremely urgent to pass if no protection
        if (spades <= 4) return 20; // real risk of being stuck
        return 12; // long spade suit: some control, but still risky
    }
    if (isTenOfDiamonds(card)) {
        const diamonds = suitCount(hand, "D") - 1;
        if (diamonds <= 1) return 22; // extremely urgent to pass
        if (diamonds <= 4) return 17;
        return 10;
    }
    if (card.suit === "S" && card.rank >= 13) {
        const holdsQueen = hand.some(isQueenOfSpades);
        const spades = suitCount(hand, "S");
        const lenBonus = spades <= 2 ? 3 : 0;
        return holdsQueen ? 3 : 9 + lenBonus;
    }
    if (card.suit === "D" && card.rank >= 11) {
        const holdsTen = hand.some(isTenOfDiamonds);
        const diamonds = suitCount(hand, "D");
        const lenBonus = diamonds <= 2 ? 2 : 0;
        return holdsTen ? 2 : 6 + lenBonus;
    }
    if (card.suit === "H") {
        const hearts = suitCount(hand, "H");
        const rankBonus = (card.rank - 2) / 12; // 0..1
        const lengthBonus = Math.min(hearts, 6) / 2; // long heart suit = risk
        return 3 + rankBonus * 5 + lengthBonus;
    }
    if (card.suit === "C" && card.rank >= 11) {
        const clubs = suitCount(hand, "C");
        const lenBonus = clubs <= 2 ? 2 : 0;
        return card.rank - 10 + lenBonus; // J=1, Q=2, K=3, A=4 + lenBonus
    }
    // Harmless low card in clubs, or low spade/diamond.
    return card.rank / 14;
}

function choosePassCards(hand) {
    const scored = hand
        .map((card) => ({ card, score: dangerScore(card, hand) }))
        .sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map((s) => s.card);
}

function partnerOf(seat) {
    return (seat + 2) % 4;
}

function currentWinnerPlay(trick) {
    if (!trick.plays || trick.plays.length === 0) return null;
    const ledSuit = trick.plays[0].card.suit;
    let bestPlay = trick.plays[0];
    for (let i = 1; i < trick.plays.length; i++) {
        const play = trick.plays[i];
        if (play.card.suit === ledSuit && play.card.rank > bestPlay.card.rank) {
            bestPlay = play;
        }
    }
    return bestPlay;
}

function chooseFollow(hand, trick, sameSuit, botSeat) {
    const winnerPlay = currentWinnerPlay(trick);
    if (!winnerPlay) {
        const winning = sameSuit.slice().sort((a, b) => a.rank - b.rank);
        return winning[0];
    }
    const losing = sameSuit.filter((c) => c.rank < winnerPlay.card.rank);

    if (losing.length > 0) {
        const partnerSeat = partnerOf(botSeat);
        const partnerIsWinning = winnerPlay.seat === partnerSeat;

        if (partnerIsWinning) {
            // Avoid playing Q(S) or 10(D) to our partner.
            const safeLosing = losing.filter(
                (c) => !isQueenOfSpades(c) && !isTenOfDiamonds(c)
            );
            if (safeLosing.length > 0) {
                // Play highest safe losing card.
                safeLosing.sort((a, b) => b.rank - a.rank);
                return safeLosing[0];
            }
            // If we only have Q(S) or 10(D), play the highest losing card (must follow).
            losing.sort((a, b) => b.rank - a.rank);
            return losing[0];
        } else {
            // Opponent is winning: dump points!
            // Sort by points (descending) first, then rank (descending).
            losing.sort((a, b) => {
                const ptsA = cardPoints(a);
                const ptsB = cardPoints(b);
                if (ptsA !== ptsB) return ptsB - ptsA;
                return b.rank - a.rank;
            });
            return losing[0];
        }
    }

    // Forced to win this trick: use the lowest adequate card to preserve
    // higher cards for future flexibility.
    const winning = sameSuit.slice().sort((a, b) => a.rank - b.rank);
    return winning[0];
}

function chooseForcedLikha(forced, hand, trick, botSeat) {
    if (forced.length === 1) return forced[0];

    const partnerSeat = partnerOf(botSeat);
    const winnerPlay = currentWinnerPlay(trick);
    const partnerIsWinning = winnerPlay?.seat === partnerSeat;

    const queen = forced.find(isQueenOfSpades);
    const ten = forced.find(isTenOfDiamonds);

    if (winnerPlay) {
        if (partnerIsWinning) {
            // Partner is winning: play the one with fewer points (10(D) over Q(S))
            return ten || forced[0];
        } else {
            // Opponent is winning: play the one with more points (Q(S) over 10(D))
            return queen || forced[0];
        }
    }

    // Fallback: Holding both Q(S) and 10(D): shed whichever suit is longer/riskier to
    // keep, hang on to the other for a future safe void.
    const spades = suitCount(hand, "S");
    const diamonds = suitCount(hand, "D");
    return spades >= diamonds ? (queen || forced[0]) : (ten || forced[0]);
}

function chooseFreeDiscard(options, hand, trick, botSeat) {
    const winnerPlay = currentWinnerPlay(trick);
    if (!winnerPlay) {
        // Should not happen since trick has plays if we are void/discarding,
        // but handle fallback just in case.
        const scored = options
            .map((card) => ({ card, score: dangerScore(card, hand) }))
            .sort((a, b) => b.score - a.score);
        return scored[0].card;
    }

    const partnerSeat = partnerOf(botSeat);
    const partnerIsWinning = winnerPlay.seat === partnerSeat;

    if (partnerIsWinning) {
        // Partner is winning: avoid giving them points.
        const nonPoints = options.filter((c) => cardPoints(c) === 0);
        if (nonPoints.length > 0) {
            const scored = nonPoints
                .map((card) => ({ card, score: dangerScore(card, hand) }))
                .sort((a, b) => b.score - a.score);
            return scored[0].card;
        }

        const hearts = options.filter((c) => c.suit === "H");
        if (hearts.length > 0) {
            const scored = hearts
                .map((card) => ({ card, score: dangerScore(card, hand) }))
                .sort((a, b) => b.score - a.score);
            return scored[0].card;
        }

        // Only Q(S) and/or 10(D) left. Play the one with fewer points (10(D) < Q(S)).
        const sortedBig = options.slice().sort((a, b) => cardPoints(a) - cardPoints(b));
        return sortedBig[0];
    } else {
        // Opponent is winning: dump points!
        const scored = options
            .map((card) => ({
                card,
                points: cardPoints(card),
                danger: dangerScore(card, hand),
            }))
            .sort((a, b) => {
                if (a.points !== b.points) return b.points - a.points;
                return b.danger - a.danger;
            });
        return scored[0].card;
    }
}

function chooseLead(hand) {
    // Hard rule: Never lead Queen of Spades or 10 of Diamonds unless they are the only cards left
    const nonLikhaCards = hand.filter(c => !isLikha(c));
    const poolCards = nonLikhaCards.length > 0 ? nonLikhaCards : hand;

    const bySuit = new Map();
    for (const card of poolCards) {
        const list = bySuit.get(card.suit) ?? [];
        list.push(card);
        bySuit.set(card.suit, list);
    }

    // Prefer leading from the longest suit that doesn't contain a card we
    // consider currently dangerous to expose (Q(S) itself, or 10(D) itself).
    const safeSuits = [...bySuit.entries()].filter(
        ([, cards]) => !cards.some((c) => isQueenOfSpades(c) || isTenOfDiamonds(c))
    );
    const pool = safeSuits.length > 0 ? safeSuits : [...bySuit.entries()];
    pool.sort((a, b) => b[1].length - a[1].length);
    const chosenSuitCards = pool[0][1].slice().sort((a, b) => a.rank - b.rank);
    return chosenSuitCards[0];
}

export class LMBot {
    constructor(rankReference) {
        this.rankReference = rankReference;
    }

    #toLMCard(botCardStr) {
        const suitMap = { 'h': 'H', 's': 'S', 'd': 'D', 'c': 'C' };
        const rankStr = botCardStr.slice(0, -1);
        const suitChar = botCardStr.slice(-1);

        let rank;
        if (rankStr === 'T') rank = 10;
        else if (rankStr === 'J') rank = 11;
        else if (rankStr === 'Q') rank = 12;
        else if (rankStr === 'K') rank = 13;
        else if (rankStr === 'A') rank = 14;
        else rank = parseInt(rankStr);

        return { suit: suitMap[suitChar], rank };
    }

    #fromLMCard(lmCard) {
        const rankMap = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
        const rank = rankMap[lmCard.rank] || lmCard.rank.toString();
        const suit = lmCard.suit.toLowerCase();
        return rank + suit;
    }

    #flattenHand(hand2D) {
        return hand2D.flat().map(c => this.#toLMCard(c));
    }

    #projectTrickToLikha(trick) {
        if (!trick) return [];
        return trick.map(t => ({
            player: t.player,
            card: {
                suit: t.card.suit.toUpperCase(),
                rank: typeof t.card.rank === 'string' && isNaN(t.card.rank) ?
                    (t.card.rank === 'T' ? 10 :
                        t.card.rank === 'J' ? 11 :
                            t.card.rank === 'Q' ? 12 :
                                t.card.rank === 'K' ? 13 :
                                    t.card.rank === 'A' ? 14 : parseInt(t.card.rank))
                    : parseInt(t.card.rank)
            }
        }));
    }

    choosePass(hand, ctx) {
        const lmHand = this.#flattenHand(hand);
        const toPass = choosePassCards(lmHand);
        return toPass.map(c => this.#fromLMCard(c));
    }

    chooseLead(hand, ctx) {
        const lmHand = this.#flattenHand(hand);
        
        let leadableCards = lmHand;
        if (ctx && ctx.heartsBroken === false) {
            const nonHearts = lmHand.filter(c => c.suit !== 'H');
            if (nonHearts.length > 0) {
                leadableCards = nonHearts;
            }
        }
        
        const chosen = chooseLead(leadableCards);
        return this.#fromLMCard(chosen);
    }

    chooseFollow(hand, ctx) {
        const lmHand = this.#flattenHand(hand);
        const botSeat = ctx.playerIndex;
        
        const plays = ctx.trick.map(t => ({
            seat: t.player,
            card: {
                suit: t.card.suit.toUpperCase(),
                rank: typeof t.card.rank === 'string' && isNaN(t.card.rank) ?
                    (t.card.rank === 'T' ? 10 :
                        t.card.rank === 'J' ? 11 :
                            t.card.rank === 'Q' ? 12 :
                                t.card.rank === 'K' ? 13 :
                                    t.card.rank === 'A' ? 14 : parseInt(t.card.rank))
                    : parseInt(t.card.rank)
            }
        }));
        
        const leader = ctx.trick[0].player;
        const trick = { leader, plays };

        const leadSuit = trick.plays[0].card.suit;
        const sameSuit = lmHand.filter(c => c.suit === leadSuit);
        
        if (sameSuit.length > 0) {
            const chosen = chooseFollow(lmHand, trick, sameSuit, botSeat);
            return this.#fromLMCard(chosen);
        }
        
        // Void: Play Likha if forced, else free discard
        const likhas = lmHand.filter(isLikha);
        if (likhas.length > 0) {
            const chosen = chooseForcedLikha(likhas, lmHand, trick, botSeat);
            return this.#fromLMCard(chosen);
        }
        
        const chosen = chooseFreeDiscard(lmHand, lmHand, trick, botSeat);
        return this.#fromLMCard(chosen);
    }
}
