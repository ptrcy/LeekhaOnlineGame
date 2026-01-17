/**
 * LMBot - Adapted from LikhaBot
 */

const LikhaBot = (() => {
  // ---------- Utility helpers ----------

  function isLikhaBlack(card) {
    return card.suit === 'S' && card.rank === 12; // Q♠
  }

  function isLikhaRed(card) {
    return card.suit === 'D' && card.rank === 10; // 10♦
  }

  function isLikha(card) {
    return isLikhaBlack(card) || isLikhaRed(card);
  }

  function isPenalty(card) {
    // Penalties: all hearts, Q♠, 10♦
    return card.suit === 'H' || isLikha(card);
  }

  /**
   * Returns true if a card is not a strict penalty, but is dangerous to play
   * because it might force a penalty (e.g. Ace/King of Spades).
   */
  function isRisky(card) {
    // High Spades (King, Ace) are risky because they catch the Queen
    if (card.suit === 'S' && card.rank > 12) return true;
    
    // High Diamonds (Jack, Queen, King, Ace) are risky near the 10
    if (card.suit === 'D' && (card.rank > 10 || card.rank === 14)) return true;

    return false;
  }

  function compareRankAsc(a, b) {
    return a.rank - b.rank;
  }

  function compareRankDesc(a, b) {
    return b.rank - a.rank;
  }

  function cloneCards(cards) {
    return cards.map(c => ({ suit: c.suit, rank: c.rank }));
  }

  function countSuits(cards) {
    const counts = { C: 0, D: 0, H: 0, S: 0 };
    cards.forEach(c => { counts[c.suit]++; });
    return counts;
  }

  function highestByRank(cards) {
    return cards.reduce((best, c) => (!best || c.rank > best.rank ? c : best), null);
  }

  function lowestByRank(cards) {
    return cards.reduce((best, c) => (!best || c.rank < best.rank ? c : best), null);
  }

  // Danger scoring used for passing and some discards:
  function cardDangerForPass(card, suitCounts) {
    if (isLikhaBlack(card)) return 1000;
    if (isLikhaRed(card)) return 900;

    // Hearts: always bad; higher hearts worse
    if (card.suit === 'H') return 500 + card.rank;

    let danger = card.rank; // base: high ranks more dangerous

    // High card in a short suit is more dangerous (easy to get stuck winning)
    if (suitCounts[card.suit] <= 2 && card.rank >= 10) {
      danger += 20;
    }

    // High spades near Q♠ are more dangerous
    if (card.suit === 'S' && card.rank >= 11) {
      danger += 50; // Increased weight for Spades
    }

    // High diamonds near 10♦ are more dangerous
    if (card.suit === 'D' && card.rank >= 9) {
      danger += 40; // Increased weight for Diamonds
    }

    return danger;
  }

  // Danger scoring for discards when void in a suit
  function cardDangerForDiscard(card) {
    if (isLikhaBlack(card)) return 1000;
    if (isLikhaRed(card)) return 900;
    if (card.suit === 'H') return 500 + card.rank;

    let danger = card.rank;
    // Increased danger for high Spades/Diamonds
    if (card.suit === 'S' && card.rank >= 11) danger += 30;
    if (card.suit === 'D' && card.rank >= 9) danger += 25;
    return danger;
  }

  // Pick lowest card from the longest suit in 'fullHand' among 'candidates'
  function lowestFromLongestSuit(candidates, fullHand) {
    const suitCounts = countSuits(fullHand);
    let bestSuit = null;
    let bestLen = -1;

    // Determine which suits among candidates are longest in full hand
    for (const c of candidates) {
      const len = suitCounts[c.suit];
      if (len > bestLen) {
        bestLen = len;
        bestSuit = c.suit;
      }
    }
    const inBestSuit = candidates.filter(c => c.suit === bestSuit);
    return lowestByRank(inBestSuit);
  }

  // ---------- Core: compute legal plays (including Forced Likha) ----------

  function computeLegalPlays(hand, trick) {
    // If leading a trick, any card is legal
    if (!trick || trick.length === 0) {
      return cloneCards(hand);
    }

    const leadSuit = trick[0].card.suit;
    const followSuitCards = hand.filter(c => c.suit === leadSuit);

    if (followSuitCards.length > 0) {
      // Must follow suit
      return followSuitCards;
    }

    // Cannot follow suit: Forced Likha rule
    const likhas = hand.filter(isLikha);
    if (likhas.length > 0) {
      return likhas;
    }

    // Otherwise any card is legal
    return cloneCards(hand);
  }

  // ---------- Strategy: passing 3 cards ----------

  function passCards(state) {
    const hand = cloneCards(state.hand);
    const suitCounts = countSuits(hand);

    // Score each card by danger and pass the 3 worst
    const scored = hand.map(card => ({
      card,
      danger: cardDangerForPass(card, suitCounts),
    }));

    scored.sort((a, b) => b.danger - a.danger); // highest danger first
    const toPass = scored.slice(0, 3).map(s => s.card);

    return toPass;
  }

  // ---------- Strategy: choosing a card to play ----------

  function inferCurrentTrick(state) {
    // If state already provides 'trick', use it
    if (Array.isArray(state.trick)) {
      return cloneTrick(state.trick);
    }

    const history = state.playedCards || [];
    const n = history.length;
    const cardsThisTrick = n % 4;

    if (cardsThisTrick === 0) {
      return [];
    }
    const start = n - cardsThisTrick;
    return cloneTrick(history.slice(start));
  }

  function cloneTrick(trick) {
    return trick.map(entry => ({
      player: entry.player,
      card: { suit: entry.card.suit, rank: entry.card.rank },
    }));
  }

  function chooseLead(legalCards, fullHand) {
    // Priority 1: Lowest "Safe" card (Not Penalty, Not Risky, Not Heart) from long suit
    const safeCards = legalCards.filter(
      c => !isPenalty(c) && !isRisky(c) && c.suit !== 'H'
    );
    if (safeCards.length > 0) {
      return lowestFromLongestSuit(safeCards, fullHand);
    }

    // Priority 2: Lowest Heart (To bleed hearts, prefer this over leading a Risky King/Ace)
    const hearts = legalCards.filter(c => c.suit === 'H');
    if (hearts.length > 0) {
      hearts.sort(compareRankAsc);
      return hearts[0];
    }

    // Priority 3: Risky cards that are NOT Likhas (e.g. K♠, A♠, J♦...)
    // If we are forced to lead a risky suit, lead the LOWEST one to minimize winning chance.
    const riskyNonLikha = legalCards.filter(c => isRisky(c) && !isLikha(c));
    if (riskyNonLikha.length > 0) {
      riskyNonLikha.sort(compareRankAsc);
      return riskyNonLikha[0];
    }

    // Priority 4: Forced to lead a Likha (Q♠ or 10♦).
    // Lead the "least bad" penalty. 10♦ is better to lose than Q♠.
    const likhas = cloneCards(legalCards);
    likhas.sort((a, b) => {
      const score = c => (isLikhaBlack(c) ? 2 : 1); // 10♦ (1) before Q♠ (2)
      return score(a) - score(b) || (a.rank - b.rank);
    });
    return likhas[0];
  }

  function chooseWhenFollowing(legalCards, trick, fullHand) {
    const leadSuit = trick[0].card.suit;
    const trickHasPenalty = trick.some(e => isPenalty(e.card));

    // Case 1: Void in suit (Discarding)
    const cannotFollow = legalCards.some(c => c.suit !== leadSuit);
    if (cannotFollow && !legalCards.every(c => c.suit === leadSuit)) {
      // Forced Likha check
      const containsLikha = legalCards.some(isLikha);
      if (containsLikha) {
        // Forced to dump Likha. Dump Q♠ first.
        const likhas = legalCards.filter(isLikha);
        const q = likhas.find(isLikhaBlack);
        if (q) return q;
        return likhas[0]; 
      }

      // Safe Discarding Logic
      const hearts = legalCards.filter(c => c.suit === 'H');
      if (hearts.length > 0) {
        hearts.sort(compareRankDesc);
        return hearts[0];
      }

      // Dump most dangerous card
      const scored = legalCards.map(card => ({
        card,
        danger: cardDangerForDiscard(card),
      }));
      scored.sort((a, b) => b.danger - a.danger);
      return scored[0].card;
    }

    // Case 2: Following Suit
    const leadSuitCards = legalCards; // all in same suit
    const winningSoFar = trick
      .filter(e => e.card.suit === leadSuit)
      .reduce((best, e) => (best && best.card.rank > e.card.rank ? best : e), null);

    const winningRank = winningSoFar ? winningSoFar.card.rank : -1;

    const lower = leadSuitCards.filter(c => c.rank < winningRank);
    const higher = leadSuitCards.filter(c => c.rank > winningRank);

    // --- Subcase 2A: We can play under (Duck) ---
    if (lower.length > 0) {
      // We want to play the highest card that loses, BUT:
      // We should avoid playing a valuable "Risky" card if a "Safe" card works just as well.
      // Example: Trick is King(13). We have Queen(12) and 2.
      // If we play Queen, we lose the trick (good), but we lose the Queen. 
      // If Q is Spades, that's GREAT (dumping Q on K).
      // If Q is Diamonds, that's GREAT (dumping 10-eater on K).
      
      // Standard logic: highest card that loses.
      lower.sort(compareRankAsc);
      return lower[lower.length - 1];
    }

    // --- Subcase 2B: We MUST play over (Win) ---
    // Any card we play will win the trick. We must choose which winner to play.
    
    // We want to win with the "Safest" card possible.
    // If we have A♠ and 10♠, and trick is low... playing A♠ is dangerous because someone later might dump Q♠.
    // Playing 10♠ is safer.

    const safeWinners = higher.filter(c => !isRisky(c) && !isPenalty(c));
    if (safeWinners.length > 0) {
        // Win with the lowest safe card (save higher safe cards for later power)
        safeWinners.sort(compareRankAsc);
        return safeWinners[0];
    }

    // If we only have Risky winners (e.g. A♠, K♠) or Penalties
    const riskyWinners = higher.filter(c => isRisky(c) && !isPenalty(c));
    if (riskyWinners.length > 0) {
        // We are forced to play a risky card (e.g. A♠).
        // Play the lowest risky one? 
        // If we have A♠ and K♠, playing K is slightly safer? No, usually A is boss.
        // Let's just play lowest rank to be consistent.
        riskyWinners.sort(compareRankAsc);
        return riskyWinners[0];
    }

    // If we only have Penalties (Likhas/Hearts) that win
    higher.sort(compareRankAsc);
    return higher[0];
  }

  function playCard(state) {
    const fullHand = cloneCards(state.hand);
    const trick = inferCurrentTrick(state);
    const legalCards = computeLegalPlays(fullHand, trick);

    if (legalCards.length === 1) {
      // Only one legal move
      return legalCards[0];
    }

    if (!trick || trick.length === 0) {
      // We are leading a trick
      return chooseLead(legalCards, fullHand);
    } else {
      // We are following suit (or void and discarding)
      return chooseWhenFollowing(legalCards, trick, fullHand);
    }
  }

  // Public API
  return {
    passCards,
    playCard,
  };
})();

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

    #projectRankToLM(rank) {
        if (rank === '10') return 10;
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const idx = ranks.indexOf(rank);
        return idx + 2;
    }

    choosePass(hand, ctx) {
        const lmHand = this.#flattenHand(hand);
        const state = {
            hand: lmHand,
            scores: ctx.scores || [0, 0, 0, 0],
            playerIndex: ctx.playerIndex || 0
        };
        const toPass = LikhaBot.passCards(state);
        return toPass.map(c => this.#fromLMCard(c));
    }

    chooseLead(hand, ctx) {
        const lmHand = this.#flattenHand(hand);
        const state = {
            hand: lmHand,
            scores: ctx.scores || [0, 0, 0, 0],
            trick: [],
            playerIndex: ctx.playerIndex || 0
        };
        const chosen = LikhaBot.playCard(state);
        return this.#fromLMCard(chosen);
    }

    chooseFollow(hand, ctx) {
        const lmHand = this.#flattenHand(hand);
        
        // Convert trick from context if available
        const lmTrick = (ctx.trick || []).map(t => ({
            player: t.player,
            card: {
                suit: t.card.suit.toUpperCase(),
                rank: this.#projectRankToLM(t.card.rank)
            }
        }));

        const state = {
            hand: lmHand,
            scores: ctx.scores || [0, 0, 0, 0],
            trick: lmTrick,
            playerIndex: ctx.playerIndex || 0
        };
        const chosen = LikhaBot.playCard(state);
        return this.#fromLMCard(chosen);
    }
}