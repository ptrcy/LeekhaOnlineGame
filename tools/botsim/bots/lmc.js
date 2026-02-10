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

  // ---------- Team / trick analysis helpers ----------

  function isPartner(myIndex, otherIndex) {
    return (myIndex % 2) === (otherIndex % 2);
  }

  function findTrickWinner(trick) {
    if (!trick || trick.length === 0) return null;
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

    if (card.suit === 'H') {
      if (card.rank >= 13) return 800;
      return 500 + card.rank;
    }

    if (suitCounts[card.suit] <= 2 && card.rank >= 11) {
      return 300 + card.rank;
    }

    if (card.suit === 'S' && card.rank >= 13) return 400;

    return card.rank;
  }

  function cardDangerForDiscard(card) {
    if (isLikhaBlack(card)) return 1000;
    if (isLikhaRed(card)) return 900;
    if (card.suit === 'H') return 500 + card.rank;

    let danger = card.rank;
    if (card.suit === 'S' && card.rank >= 11) danger += 30;
    if (card.suit === 'D' && card.rank >= 11) danger += 25;
    if (card.suit === 'D' && card.rank >= 8) danger += 15;

    return danger;
  }

  // ---------- Context about Q♠ and 10♦ ----------

  function buildLikhaContext(state) {
    const ctx = state.context || {};
    const remaining = ctx.remaining || [13, 13, 13, 13];

    const hand = state.hand || [];
    const qInHand = hand.some(isLikhaBlack);
    const tenInHand = hand.some(isLikhaRed);

    const qPlayed = ctx.queenOfSpadesPlayed || false;
    const tenPlayed = ctx.tenOfDiamondsPlayed || false;
    const qInOpponents = !qInHand && !qPlayed;
    const tenInOpponents = !tenInHand && !tenPlayed;

    return {
      qInHand,
      tenInHand,
      qPlayed,
      tenPlayed,
      qInOpponents,
      tenInOpponents,
      remaining,
      playerIndex: ctx.playerIndex || 0,
      scores: ctx.scores || [0, 0, 0, 0],
      hasPlayers: ctx.hasPlayers || [[], [], [], []],
      heartsBroken: ctx.heartsBroken || false,
      trickType: ctx.trickType || 0
    };
  }

  // Danger of leading a given card
  function leadCardDanger(card, fullHand, ctx) {
    if (isLikha(card)) return 10000;
    if (card.suit === 'H' && !ctx.heartsBroken) return 5000;

    let danger = 0;
    const suit = card.suit;

    const suitIdx = { 'H': 0, 'S': 1, 'D': 2, 'C': 3 }[suit];
    const playersWithSuit = ctx.hasPlayers[suitIdx];

    let opponentsVoid = 0;
    if (!playersWithSuit.includes(1)) opponentsVoid++;
    if (!playersWithSuit.includes(3)) opponentsVoid++;

    if (opponentsVoid > 0) {
      danger += 50 * opponentsVoid;
    }

    if (suit === 'S') {
      if (ctx.qInOpponents) {
        if (card.rank >= 12) danger += 2000;
        else danger -= 200; // Low spade lead to flush Q♠
      } else if (ctx.qInHand) {
        danger += 100;
      }
    }

    if (suit === 'D') {
      if (ctx.tenInOpponents) {
        if (card.rank > 10) danger += 500;
        else danger -= 50;
      }
    }

    const myCount = countSuits(fullHand)[suit];
    danger -= myCount * 10;
    danger += card.rank;

    return danger;
  }

  // ---------- Legal plays ----------

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
      danger: cardDangerForPass(card, suitCounts)
    }));

    const suits = ['C', 'D', 'H', 'S'];
    const hasQ = hand.some(isLikhaBlack);

    for (const s of suits) {
      const count = suitCounts[s];
      if (count > 0 && count <= 2) {
        if (s === 'S' && hasQ && count > 1) continue;

        scored.forEach(item => {
          if (item.card.suit === s) item.danger += 50;
        });
      }
    }

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
    const candidates = legalCards.map(card => ({
      card,
      score: leadCardDanger(card, fullHand, ctx)
    }));

    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].card;
  }

  // ---------- Following suit / discarding ----------
  // Enhanced with: team awareness, positional awareness, correct points calc

  function chooseWhenFollowing(legalCards, trick, fullHand, ctx) {
    const leadSuit = trick[0].card.suit;
    const myIndex = ctx.playerIndex || 0;
    const trickPosition = trick.length; // 1=2nd, 2=3rd, 3=last
    const isLastToPlay = trickPosition === 3;

    // Find who is currently winning the trick
    const winnerEntry = findTrickWinner(trick);
    const currentHighRank = winnerEntry.card.rank;
    const partnerWinning = isPartner(myIndex, winnerEntry.player);

    // Accurate trick points (no card.points dependency)
    const pointsInTrick = countTrickPoints(trick);

    const isDangerous = pointsInTrick > 0 ||
      (leadSuit === 'S' && ctx.qInOpponents) ||
      (leadSuit === 'D' && ctx.tenInOpponents);

    // --- 1. Following suit ---
    const following = legalCards.filter(c => c.suit === leadSuit);

    if (following.length > 0) {
      const under = following.filter(c => c.rank < currentHighRank);

      // ~~~ Partner winning ~~~
      if (partnerWinning) {
        if (!isDangerous) {
          // Clean trick, partner winning — safe to shed high cards
          if (under.length > 0) {
            under.sort(compareRankDesc);
            return under[0]; // highest losing card
          }
          // Must overtake partner on a clean trick — burn high non-likha
          const safeOver = following.filter(c => c.rank > currentHighRank && !isLikha(c));
          if (safeOver.length > 0) {
            safeOver.sort(compareRankDesc);
            return safeOver[0];
          }
          following.sort(compareRankAsc);
          return following[0];
        } else {
          // Dangerous trick, partner winning — duck to let partner hold it
          if (under.length > 0) {
            under.sort(compareRankDesc);
            return under[0];
          }
          // Must overtake partner — play lowest non-likha to minimize damage
          const nonLikha = following.filter(c => !isLikha(c));
          if (nonLikha.length > 0) {
            nonLikha.sort(compareRankAsc);
            return nonLikha[0];
          }
          following.sort(compareRankAsc);
          return following[0];
        }
      }

      // ~~~ Opponent winning ~~~
      if (under.length > 0) {
        // Can duck — play highest losing card
        under.sort(compareRankDesc);
        return under[0];
      }

      // Must go over (win the trick)
      if (isDangerous) {
        // Dangerous — play lowest non-likha winner to limit exposure
        const nonLikha = following.filter(c => !isLikha(c));
        if (nonLikha.length > 0) {
          nonLikha.sort(compareRankAsc);
          return nonLikha[0];
        }
        following.sort(compareRankAsc);
        return following[0];
      }

      // Clean trick, forced to win
      if (isLastToPlay) {
        // Last to play — no one can dump on us, safe to burn high cards
        const safeToBurn = following.filter(c => !isLikha(c));
        if (safeToBurn.length > 0) {
          safeToBurn.sort(compareRankDesc);
          return safeToBurn[0];
        }
        following.sort(compareRankAsc);
        return following[0];
      }

      // Not last — cautious win (someone may still dump penalties on us)
      const nonLikhaWinners = following.filter(c => c.rank > currentHighRank && !isLikha(c));
      if (nonLikhaWinners.length > 0) {
        nonLikhaWinners.sort(compareRankAsc);
        return nonLikhaWinners[0]; // lowest possible winner
      }
      following.sort(compareRankAsc);
      return following[0];
    }

    // --- 2. Void — discard logic ---

    // Forced leekha (only likha cards in legal set)
    const onlyLikhas = legalCards.every(isLikha);
    if (onlyLikhas) {
      if (partnerWinning) {
        // Must give likha to partner — minimize: 10♦(10) over Q♠(13)
        const red = legalCards.find(isLikhaRed);
        return red || legalCards[0];
      } else {
        // Opponent winning — maximize: Q♠(13) over 10♦(10)
        const black = legalCards.find(isLikhaBlack);
        return black || legalCards[0];
      }
    }

    if (!partnerWinning) {
      // Opponent winning — dump penalties aggressively
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
      // Partner winning — protect them from penalties
      const safe = legalCards.filter(c => !isPenalty(c));
      if (safe.length > 0) {
        safe.sort((a, b) => cardDangerForDiscard(b) - cardDangerForDiscard(a));
        return safe[0];
      }
      // Only penalties left — dump lowest value on partner
      const hearts = legalCards.filter(c => c.suit === 'H' && !isLikha(c));
      if (hearts.length > 0) {
        hearts.sort(compareRankAsc);
        return hearts[0]; // lowest heart (1 pt)
      }
      // Must dump likha on partner — minimize damage
      const red = legalCards.find(isLikhaRed);
      if (red) return red; // 10♦ = 10 pts < Q♠ = 13 pts
      return legalCards[0];
    }

    // General fallback discard
    const safeDump = legalCards.filter(c => !isLikha(c));
    if (safeDump.length > 0) {
      safeDump.sort((a, b) => cardDangerForDiscard(b) - cardDangerForDiscard(a));
      return safeDump[0];
    }

    return legalCards[0];
  }

  // ---------- Main entry ----------

  function playCard(state) {
    const fullHand = cloneCards(state.hand);
    const ctx = buildLikhaContext(state);
    const trick = state.trick || [];
    let legalCards = fullHand;

    if (trick.length > 0) {
      const leadSuit = trick[0].card.suit;
      const following = fullHand.filter(c => c.suit === leadSuit);
      if (following.length > 0) legalCards = following;
      else {
        const penalties = fullHand.filter(isLikha);
        if (penalties.length > 0) legalCards = penalties;
      }
    } else {
      if (!ctx.heartsBroken) {
        const nonHearts = fullHand.filter(c => c.suit !== 'H');
        if (nonHearts.length > 0) legalCards = nonHearts;
      }
    }

    if (legalCards.length === 1) return legalCards[0];

    let chosen;
    if (trick.length === 0) {
      chosen = chooseLead(legalCards, fullHand, ctx);
    } else {
      chosen = chooseWhenFollowing(legalCards, trick, fullHand, ctx);
    }

    return chosen;
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
    const state = {
      hand: lmHand,
      scores: ctx.scores || [0, 0, 0, 0],
      context: ctx
    };
    const toPass = LikhaBot.passCards(state);
    return toPass.map(c => this.#fromLMCard(c));
  }

  chooseLead(hand, ctx) {
    const lmHand = this.#flattenHand(hand);
    const state = {
      hand: lmHand,
      trick: [],
      context: ctx
    };
    const chosen = LikhaBot.playCard(state);
    return this.#fromLMCard(chosen);
  }

  chooseFollow(hand, ctx) {
    const lmHand = this.#flattenHand(hand);
    const lmTrick = this.#projectTrickToLikha(ctx.trick);
    const state = {
      hand: lmHand,
      trick: lmTrick,
      context: ctx
    };
    const chosen = LikhaBot.playCard(state);
    return this.#fromLMCard(chosen);
  }
}
