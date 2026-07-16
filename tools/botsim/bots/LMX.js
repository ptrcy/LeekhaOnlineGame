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

  // ---------- Team / trick analysis helpers ----------

  function isPartner(myIndex, otherIndex) {
    return (myIndex % 2) === (otherIndex % 2);
  }

  function findTrickWinner(trick) {
    const leadSuit = trick[0].card.suit;
    let winner = trick[0];
    for (let i = 1; i < trick.length; i++) {
      if (trick[i].card.suit === leadSuit && trick[i].card.rank > winner.card.rank) {
        winner = trick[i];
      }
    }
    return winner;
  }

  function countTrickPoints(trick) {
    let points = 0;
    for (const play of trick) {
      if (isLikhaBlack(play.card)) points += 13;
      else if (isLikhaRed(play.card)) points += 10;
      else if (play.card.suit === 'H') points += 1;
    }
    return points;
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

    // Prefer the tracker-backed flags from the adapter when present - they
    // stay correct all round, whereas recomputing from `history` only sees
    // whatever trick data happened to be passed in for this one decision.
    let qPlayed = typeof state.queenOfSpadesPlayed === 'boolean' ? state.queenOfSpadesPlayed : false;
    let tenPlayed = typeof state.tenOfDiamondsPlayed === 'boolean' ? state.tenOfDiamondsPlayed : false;

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
      playerIndex: state.playerIndex || 0,
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

  function chooseWhenFollowing(legalCards, trick, fullHand, ctx) {
    const leadSuit = trick[0].card.suit;
    const myIndex = (ctx && ctx.playerIndex) || 0;
    const trickPosition = trick.length; // 1=2nd, 2=3rd, 3=last
    const isLastToPlay = trickPosition === 3;

    const winnerEntry = findTrickWinner(trick);
    const currentHighRank = winnerEntry.card.rank;
    const partnerWinning = isPartner(myIndex, winnerEntry.player);

    const pointsInTrick = countTrickPoints(trick);
    const isDangerous = pointsInTrick > 0 ||
      (leadSuit === 'S' && ctx && ctx.qInOpponents) ||
      (leadSuit === 'D' && ctx && ctx.tenInOpponents);

    const allLeadSuit = legalCards.every(c => c.suit === leadSuit);

    // --- Void: can't follow suit ---
    if (!allLeadSuit) {
      const onlyLikhas = legalCards.every(isLikha);
      if (onlyLikhas) {
        if (partnerWinning) {
          // Must give a likha to partner - minimize: 10♦(10) over Q♠(13)
          const red = legalCards.find(isLikhaRed);
          return red || legalCards[0];
        }
        // Opponent winning - maximize: Q♠(13) over 10♦(10)
        const black = legalCards.find(isLikhaBlack);
        return black || legalCards[0];
      }

      if (!partnerWinning) {
        // Opponent winning - dump penalties aggressively
        const q = legalCards.find(isLikhaBlack);
        if (q) return q;
        const ten = legalCards.find(isLikhaRed);
        if (ten) return ten;
        const hearts = legalCards.filter(c => c.suit === 'H');
        if (hearts.length > 0) {
          hearts.sort(compareRankDesc);
          return hearts[0];
        }
      } else {
        // Partner winning - protect them from penalties
        const safe = legalCards.filter(c => !isPenalty(c));
        if (safe.length > 0) {
          safe.sort((a, b) => cardDangerForDiscard(b) - cardDangerForDiscard(a));
          return safe[0];
        }
        const hearts = legalCards.filter(c => c.suit === 'H' && !isLikha(c));
        if (hearts.length > 0) {
          hearts.sort(compareRankAsc);
          return hearts[0]; // lowest heart (1 pt)
        }
        const red = legalCards.find(isLikhaRed);
        if (red) return red; // 10♦ = 10 pts < Q♠ = 13 pts
        return legalCards[0];
      }

      const scored = legalCards.map(card => ({
        card,
        danger: cardDangerForDiscard(card),
      }));
      scored.sort((a, b) => b.danger - a.danger);
      return scored[0].card;
    }

    // --- Following suit ---
    const lower = legalCards.filter(c => c.rank < currentHighRank);
    const higher = legalCards.filter(c => c.rank > currentHighRank);

    // HARD RULE: if we can play a card that does NOT win the trick, we
    // always do - never voluntarily capture a trick we could have ducked.
    // Among cards that duck, always prefer one that isn't Q♠/10♦ itself:
    // shedding the penalty card here still hands it to whoever wins,
    // whereas a harmless low card costs nothing. Only fall back to
    // Q♠/10♦ when it's the sole card left under the winning rank.
    if (lower.length > 0) {
      const safeLower = lower.filter(c => !isLikha(c));
      const duckPool = safeLower.length > 0 ? safeLower : lower;
      duckPool.sort(compareRankAsc);
      return duckPool[duckPool.length - 1];
    }

    // Must go over (win the trick)
    if (partnerWinning && !isDangerous) {
      // Clean trick, forced to overtake our own partner - safe to burn a
      // high card since nothing is at stake.
      const safeOver = higher.filter(c => !isLikha(c));
      if (safeOver.length > 0) {
        safeOver.sort(compareRankDesc);
        return safeOver[0];
      }
      higher.sort(compareRankAsc);
      return higher[0];
    }

    if (isDangerous) {
      const nonLikha = higher.filter(c => !isLikha(c));
      if (nonLikha.length > 0) {
        nonLikha.sort(compareRankAsc);
        return nonLikha[0];
      }
      higher.sort(compareRankAsc);
      return higher[0];
    }

    if (isLastToPlay) {
      const safeToBurn = higher.filter(c => !isLikha(c));
      if (safeToBurn.length > 0) {
        safeToBurn.sort(compareRankDesc);
        return safeToBurn[0];
      }
      higher.sort(compareRankAsc);
      return higher[0];
    }

    const nonLikhaWinners = higher.filter(c => !isLikha(c));
    if (nonLikhaWinners.length > 0) {
      nonLikhaWinners.sort(compareRankAsc);
      return nonLikhaWinners[0];
    }
    higher.sort(compareRankAsc);
    return higher[0];
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
      return chooseWhenFollowing(legalCards, trick, fullHand, ctx);
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

        // Never volunteer to lead Q♠/10♦ - they are the two penalty cards, and
        // leading them just hands them straight to whoever wins the trick
        // (often ourselves, if no one can beat a mid-rank card). Only lead one
        // if it's literally the only card left in hand.
        const nonLikhaHand = flatHand.filter(c => c !== 'Qs' && c !== 'Td');
        const leadPool = nonLikhaHand.length > 0 ? nonLikhaHand : flatHand;

        const safeCards = leadPool.filter(card => {
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

        return pickLowest(leadPool);
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
            playerIndex: ctx.playerIndex || 0,
            queenOfSpadesPlayed: ctx.queenOfSpadesPlayed,
            tenOfDiamondsPlayed: ctx.tenOfDiamondsPlayed
        };
        const chosen = LikhaBot.playCard(state);
        return this.#fromLMCard(chosen);
    }
}
