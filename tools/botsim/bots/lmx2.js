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
      if (ctx.qInOpponents) {
        if (card.rank >= 13) {
          danger += 900;
        } else if (card.rank === 12) {
          danger += 950;
        } else {
          danger += 200;
        }
      } else if (ctx.qInHand && !ctx.qPlayed) {
        if (card.rank >= 13) {
          danger += 600;
        } else {
          danger += 250;
        }
      } else {
        danger += card.rank / 2;
      }
    } else if (card.suit === 'D') {
      if (ctx.tenInOpponents) {
        if (card.rank > 10) {
          danger += 850;
        } else if (card.rank === 10) {
          danger += 950;
        } else {
          danger += 220;
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
      danger += 400 + card.rank;
    } else if (card.suit === 'C') {
      danger += card.rank / 3;
    }

    const len = suitCounts[card.suit] || 0;
    danger -= len * 15;
    danger += card.rank / 4;

    return danger;
  }

  // ---------- Legal plays (Forced Leekha + follow suit) ----------

  function computeLegalPlays(hand, trick) {
    if (!trick || trick.length === 0) {
      return cloneCards(hand);
    }

    const leadSuit = trick[0].card.suit;
    const followSuitCards = hand.filter(c => c.suit === leadSuit);

    if (followSuitCards.length > 0) {
      return followSuitCards;
    }

    const likhas = hand.filter(isLikha);
    if (likhas.length > 0) {
      return likhas;
    }

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

    scored.sort((a, b) => b.danger - a.danger);
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

  // ---------- Lead selection ----------

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

    if (nonLikhaNonHearts.length > 0) {
      return pickSafest(nonLikhaNonHearts);
    }

    if (nonLikhaHearts.length > 0) {
      return pickSafest(nonLikhaHearts);
    }

    if (likhas.length === 0) {
      return legalCards[0];
    }

    const red = likhas.find(isLikhaRed);
    const black = likhas.find(isLikhaBlack);

    if (red && black) return red;

    return likhas[0];
  }

  // ---------- Following suit / discarding ----------

  function chooseWhenFollowing(legalCards, trick, fullHand, playerIndex) {
    const leadSuit = trick[0].card.suit;

    // --- New Strategy: Dump Leekha on High Cards (only on OPPONENTS) ---
    if (leadSuit === 'S' || leadSuit === 'D') {
      // Find the entry with highest rank in lead suit
      const highestEntry = trick
        .filter(e => e.card.suit === leadSuit)
        .reduce((best, e) => (!best || e.card.rank > best.card.rank ? e : best), null);

      if (highestEntry) {
        const highestRank = highestEntry.card.rank;
        const highestPlayer = highestEntry.player;

        // Check if the high card was played by an OPPONENT (different team)
        // Teams: players 0,2 vs players 1,3
        const isOpponent = (playerIndex % 2) !== (highestPlayer % 2);

        const isSpadesHigh = leadSuit === 'S' && highestRank > 12; // > Q(12)
        const isDiamondsHigh = leadSuit === 'D' && highestRank > 10; // > 10

        if (isOpponent && (isSpadesHigh || isDiamondsHigh)) {
          // Opponent is winning with a high card - dump our Leekha on them
          const targetLeekha = legalCards.find(c =>
            (leadSuit === 'S' && isLikhaBlack(c)) ||
            (leadSuit === 'D' && isLikhaRed(c))
          );
          if (targetLeekha) {
            return targetLeekha;
          }
        }
      }
    }
    // -----------------------------------------------

    const trickHasPenalty = trick.some(e => isPenalty(e.card));

    const allLeadSuit = legalCards.every(c => c.suit === leadSuit);
    if (!allLeadSuit) {
      const containsLikha = legalCards.some(isLikha);

      if (containsLikha) {
        const likhas = legalCards.filter(isLikha);
        const q = likhas.find(isLikhaBlack);
        if (q) return q;
        return likhas[0];
      }

      const hearts = legalCards.filter(c => c.suit === 'H');
      if (hearts.length > 0) {
        hearts.sort(compareRankDesc);
        return hearts[0];
      }

      const scored = legalCards.map(card => ({
        card,
        danger: cardDangerForDiscard(card),
      }));
      scored.sort((a, b) => b.danger - a.danger);
      return scored[0].card;
    }

    const winningSoFar = trick
      .filter(e => e.card.suit === leadSuit)
      .reduce((best, e) => (best && best.card.rank > e.card.rank ? best : e), null);

    const winningRank = winningSoFar ? winningSoFar.card.rank : -1;

    const lower = legalCards.filter(c => c.rank < winningRank);
    const higher = legalCards.filter(c => c.rank > winningRank);

    let chosen;

    if (lower.length > 0) {
      lower.sort(compareRankAsc);
      chosen = lower[lower.length - 1];
    } else {
      if (trickHasPenalty) {
        const nonLikha = legalCards.filter(c => !isLikha(c));
        if (nonLikha.length > 0) {
          nonLikha.sort(compareRankAsc);
          chosen = nonLikha[0];
        } else {
          const likhas = legalCards.filter(isLikha);
          likhas.sort(compareRankAsc);
          chosen = likhas[0];
        }
      } else {
        const winningCandidates = higher;
        const nonLikhaWinners = winningCandidates.filter(c => !isLikha(c));
        if (nonLikhaWinners.length > 0) {
          nonLikhaWinners.sort(compareRankAsc);
          chosen = nonLikhaWinners[0];
        } else {
          winningCandidates.sort(compareRankAsc);
          chosen = winningCandidates[0];
        }
      }
    }

    if ((leadSuit === 'S' || leadSuit === 'D') && chosen && chosen.rank > 9) {
      const allowedCandidates = legalCards.filter(c =>
        c.rank <= 9 || (c.rank > 9 && c.rank < winningRank)
      );

      if (allowedCandidates.length > 0) {
        const lowerAllowed = allowedCandidates.filter(c => c.rank < winningRank);
        if (lowerAllowed.length > 0) {
          lowerAllowed.sort(compareRankAsc);
          return lowerAllowed[lowerAllowed.length - 1];
        }
        allowedCandidates.sort(compareRankAsc);
        return allowedCandidates[0];
      }
    }

    return chosen;
  }

  // ---------- Main playCard entry ----------

  function playCard(state) {
    const fullHand = cloneCards(state.hand);
    const trick = inferCurrentTrick(state);
    const ctx = buildLikhaContext(state);
    const legalCards = computeLegalPlays(fullHand, trick);

    if (legalCards.length === 1) {
      return legalCards[0];
    }

    if (!trick || trick.length === 0) {
      return chooseLead(legalCards, fullHand, ctx);
    } else {
      return chooseWhenFollowing(legalCards, trick, fullHand, state.playerIndex);
    }
  }

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
        const flatHand = Array.isArray(hand) ? hand.flat() : [];
        if (flatHand.length === 0) {
            return null;
        }

        const ranks = this.rankReference && Array.isArray(this.rankReference) && this.rankReference.length > 0
            ? this.rankReference
            : ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

        const maxSafeIndex = ranks.indexOf('9');

        const getRankIndex = (cardStr) => {
            if (!cardStr || typeof cardStr !== 'string' || cardStr.length < 2) {
                return -1;
            }
            const rankChar = cardStr[0];
            const idx = ranks.indexOf(rankChar);
            return idx === -1 ? -1 : idx;
        };

        const isFirstTrick = ctx && typeof ctx.trickType === 'number' && ctx.trickType === -1;

        if (isFirstTrick) {
            const clubs = flatHand.filter(c => typeof c === 'string' && c.length >= 2 && c[c.length - 1] === 'c');
            if (clubs.length > 0) {
                let best = clubs[0];
                let bestIdx = getRankIndex(best);
                for (let i = 1; i < clubs.length; i++) {
                    const idx = getRankIndex(clubs[i]);
                    if (idx > bestIdx) {
                        bestIdx = idx;
                        best = clubs[i];
                    }
                }
                return best;
            }
        }

        const safeCards = flatHand.filter(card => {
            const idx = getRankIndex(card);
            return idx !== -1 && maxSafeIndex !== -1 && idx <= maxSafeIndex;
        });

        const pickLowest = (cards) => {
            let best = cards[0];
            let bestIdx = getRankIndex(best);
            for (let i = 1; i < cards.length; i++) {
                const idx = getRankIndex(cards[i]);
                if (bestIdx === -1 || (idx !== -1 && idx < bestIdx)) {
                    bestIdx = idx;
                    best = cards[i];
                }
            }
            return best;
        };

        if (safeCards.length > 0) {
            return pickLowest(safeCards);
        }

        return pickLowest(flatHand);
    }

    chooseFollow(hand, ctx) {
        const lmHand = this.#flattenHand(hand);

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
