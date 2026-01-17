const LikhaBot = (() => {
  // ---------- Card / rule helpers ----------

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

  // ---------- Danger evaluation for passing / discarding ----------

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

    // NEW: Spades near Q♠ – much more dangerous to keep
    if (card.suit === 'S' && card.rank >= 11) {
      danger += 40;
    }

    // NEW: High diamonds near 10♦ – more dangerous to keep
    if (card.suit === 'D' && card.rank >= 11) {
      danger += 35;
    } else if (card.suit === 'D' && card.rank >= 8) {
      danger += 20;
    }

    return danger;
  }

  function cardDangerForDiscard(card) {
    if (isLikhaBlack(card)) return 1000;
    if (isLikhaRed(card)) return 900;
    if (card.suit === 'H') return 500 + card.rank;

    let danger = card.rank;

    // NEW: Stronger penalty for high spades / diamonds kept into later tricks
    if (card.suit === 'S' && card.rank >= 11) danger += 30;
    if (card.suit === 'D' && card.rank >= 11) danger += 25;
    if (card.suit === 'D' && card.rank >= 8) danger += 15;

    return danger;
  }

  // ---------- Context about Q♠ and 10♦ ----------

  function buildLikhaContext(state) {
    const hand = state.hand || [];
    const history = state.playedCards || [];

    const qInHand = hand.some(isLikhaBlack);
    const tenInHand = hand.some(isLikhaRed);

    let qPlayed = false;
    let tenPlayed = false;

    for (const e of history) {
      if (isLikhaBlack(e.card)) qPlayed = true;
      else if (isLikhaRed(e.card)) tenPlayed = true;
    }

    return {
      qInHand,
      tenInHand,
      qPlayed,
      tenPlayed,
      qInOpponents: !qInHand && !qPlayed,
      tenInOpponents: !tenInHand && !tenPlayed,
    };
  }

  // Danger of *leading* a given card (focus on Spades / Diamonds)
  function leadCardDanger(card, suitCounts, ctx) {
    if (isLikhaBlack(card)) return 1000; // almost never want to lead this
    if (isLikhaRed(card)) return 950;

    let danger = 0;

    if (card.suit === 'S') {
      // SPADES: beware of eating Q♠
      if (ctx.qInOpponents) {
        // Q♠ is in someone else's hand:
        // - high spades (K/A) likely take Q♠ if it appears
        if (card.rank >= 13) {
          danger += 900; // A♠, K♠: very risky lead
        } else if (card.rank === 12) {
          danger += 950; // Q♠ itself
        } else {
          danger += 200; // low spades: Q♠ likely wins, not us
        }
      } else if (ctx.qInHand && !ctx.qPlayed) {
        // We still hold Q♠ and haven't shed it yet
        if (card.rank >= 13) {
          danger += 600; // leading A/K builds spade control around our Q♠
        } else {
          danger += 250;
        }
      } else {
        // Q♠ already seen (played / captured) or otherwise accounted for
        danger += card.rank / 2;
      }
    } else if (card.suit === 'D') {
      // DIAMONDS: beware of eating 10♦
      if (ctx.tenInOpponents) {
        if (card.rank > 10) {
          danger += 850; // J,Q,K,A ♦: very risky with 10♦ still out
        } else if (card.rank === 10) {
          danger += 950; // 10♦ itself
        } else {
          danger += 220; // low diamond: 10♦ may win, but not us
        }
      } else if (ctx.tenInHand && !ctx.tenPlayed) {
        if (card.rank > 10) {
          danger += 600;
        } else {
          danger += 250;
        }
      } else {
        danger += card.rank / 2;
      }
    } else if (card.suit === 'H') {
      // Hearts: 1 point each; non-trivial but less than Likhas
      danger += 400 + card.rank;
    } else if (card.suit === 'C') {
      // Clubs are usually the safest suit to lead
      danger += card.rank / 3;
    }

    // Prefer leading from longer suits (more room to shed safely later)
    const len = suitCounts[card.suit] || 0;
    danger -= len * 15;

    // Generic chance of winning: higher ranks more likely to take the trick
    danger += card.rank / 4;

    return danger;
  }

  // ---------- Legal plays (Forced Leekha + follow suit) ----------

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

    // Cannot follow suit: Forced Leekha rule
    const likhas = hand.filter(isLikha);
    if (likhas.length > 0) {
      return likhas;
    }

    // Otherwise any card is legal
    return cloneCards(hand);
  }

  // ---------- Passing 3 cards ----------

  function passCards(state) {
    const hand = cloneCards(state.hand);
    const suitCounts = countSuits(hand);

    const scored = hand.map(card => ({
      card,
      danger: cardDangerForPass(card, suitCounts),
    }));

    scored.sort((a, b) => b.danger - a.danger); // highest danger first
    return scored.slice(0, 3).map(s => s.card);
  }

  // ---------- Trick inference helper ----------

  function inferCurrentTrick(state) {
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

  // ---------- Lead selection (extra care for S / D) ----------

  function chooseLead(legalCards, fullHand, ctx) {
    const suitCounts = countSuits(fullHand);

    const nonLikhaNonHearts = legalCards.filter(
      c => !isLikha(c) && c.suit !== 'H'
    );
    const nonLikhaHearts = legalCards.filter(
      c => !isLikha(c) && c.suit === 'H'
    );
    const likhas = legalCards.filter(isLikha);

    function pickSafest(cards) {
      let best = cards[0];
      let bestDanger = leadCardDanger(best, suitCounts, ctx);
      for (let i = 1; i < cards.length; i++) {
        const d = leadCardDanger(cards[i], suitCounts, ctx);
        if (d < bestDanger) {
          bestDanger = d;
          best = cards[i];
        }
      }
      return best;
    }

    // 1) Prefer any non-likha, non-heart (Clubs, low/mid Spades, low Diamonds, etc.)
    if (nonLikhaNonHearts.length > 0) {
      return pickSafest(nonLikhaNonHearts);
    }

    // 2) Then non-likha hearts, picking the safest (usually lowest heart)
    if (nonLikhaHearts.length > 0) {
      return pickSafest(nonLikhaHearts);
    }

    // 3) Only Likhas remain (rare, near end). Never choose Q♠/10♦
    //    if *any* other card existed.
    if (likhas.length === 0) {
      // Should not happen, but just in case
      return legalCards[0];
    }

    const red = likhas.find(isLikhaRed);
    const black = likhas.find(isLikhaBlack);

    // If both, lead 10♦ before Q♠ (smaller penalty)
    if (red && black) return red;

    // Otherwise, only one type available
    return likhas[0];
  }

  // ---------- Following suit / discarding (small tweaks only) ----------

  function chooseWhenFollowing(legalCards, trick, fullHand /*, ctx */) {
    const leadSuit = trick[0].card.suit;
    const trickHasPenalty = trick.some(e => isPenalty(e.card));

    // If we couldn't follow, legalCards may be:
    // - only likhas (Forced Likha), or
    // - whole hand (no likhas)
    const allLeadSuit = legalCards.every(c => c.suit === leadSuit);
    if (!allLeadSuit) {
      // Cannot follow suit
      const containsLikha = legalCards.some(isLikha);

      if (containsLikha) {
        // Forced Likha: dump the worst one; prefer to ditch Q♠ before 10♦
        const likhas = legalCards.filter(isLikha);
        const q = likhas.find(isLikhaBlack);
        if (q) return q;
        return likhas[0]; // then 10♦
      }

      // No likhas, can't follow suit: safely discard something dangerous
      const hearts = legalCards.filter(c => c.suit === 'H');
      if (hearts.length > 0) {
        // Discard highest heart first (get rid of big penalties)
        hearts.sort(compareRankDesc);
        return hearts[0];
      }

      // Discard most dangerous non-heart card (high Spades/Diamonds prioritized)
      const scored = legalCards.map(card => ({
        card,
        danger: cardDangerForDiscard(card),
      }));
      scored.sort((a, b) => b.danger - a.danger);
      return scored[0].card;
    }

    // We are following suit normally: all legalCards are of leadSuit
    const winningSoFar = trick
      .filter(e => e.card.suit === leadSuit)
      .reduce((best, e) => (best && best.card.rank > e.card.rank ? best : e), null);

    const winningRank = winningSoFar ? winningSoFar.card.rank : -1;

    const lower = legalCards.filter(c => c.rank < winningRank);
    const higher = legalCards.filter(c => c.rank > winningRank);

    if (lower.length > 0) {
      // We can lose the trick: play the highest card that still loses
      lower.sort(compareRankAsc);
      return lower[lower.length - 1];
    }

    // We cannot play under: anything we play will win the trick.
    if (trickHasPenalty) {
      // Try to win as cheaply as possible and avoid adding our own big penalties
      const nonLikha = legalCards.filter(c => !isLikha(c));
      if (nonLikha.length > 0) {
        nonLikha.sort(compareRankAsc);
        return nonLikha[0];
      }
      const likhas = legalCards.filter(isLikha);
      likhas.sort(compareRankAsc);
      return likhas[0];
    } else {
      // No penalty in the trick so far; still must win
      const winningCandidates = higher;
      const nonLikhaWinners = winningCandidates.filter(c => !isLikha(c));
      if (nonLikhaWinners.length > 0) {
        nonLikhaWinners.sort(compareRankAsc);
        return nonLikhaWinners[0];
      }
      winningCandidates.sort(compareRankAsc);
      return winningCandidates[0];
    }
  }

  // ---------- Main playCard entry ----------

  function playCard(state) {
    const fullHand = cloneCards(state.hand);
    const trick = inferCurrentTrick(state);
    const ctx = buildLikhaContext(state);
    const legalCards = computeLegalPlays(fullHand, trick);

    if (legalCards.length === 1) {
      // Only one legal move (e.g., Forced Likha or last card)
      return legalCards[0];
    }

    if (!trick || trick.length === 0) {
      // We are leading a trick
      return chooseLead(legalCards, fullHand, ctx);
    } else {
      // We are following suit (or void and discarding)
      return chooseWhenFollowing(legalCards, trick, fullHand, ctx);
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