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
      if (card.rank >= 13) return 800; // Ace, King
      return 500 + card.rank;
    }

    if (suitCounts[card.suit] <= 2 && card.rank >= 11) {
      return 300 + card.rank;
    }

    if (card.suit === 'S' && card.rank >= 13) return 400; // A♠, K♠

    return card.rank;
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
    const ctx = state.context || {};
    const remaining = ctx.remaining || [13, 13, 13, 13];
    const hand = state.hand || [];

    // Played cards specifically (for counting)
    // ctx.playedCards = {'H': [ranks...], 'S': [], ...}
    const playedCards = ctx.playedCards || { 'H': [], 'S': [], 'D': [], 'C': [] };

    const qInHand = hand.some(isLikhaBlack);
    const tenInHand = hand.some(isLikhaRed);
    const qPlayed = ctx.queenOfSpadesPlayed || false;
    const qInOpponents = !qInHand && !qPlayed;
    const tenPlayed = ctx.tenOfDiamondsPlayed || false;
    const tenInOpponents = !tenInHand && !tenPlayed;

    // Determine if it's "Endgame" (< 5 cards left per player)
    // Total Remaining = sum(remaining)
    // Actually remaining is cards unplayed in whole game.
    // If remaining total < 20? 4 players * 5 cards = 20.
    const totalRemaining = remaining.reduce((a, b) => a + b, 0);
    const isEndgame = totalRemaining <= 16; // Last 4 tricks

    return {
      qInHand, tenInHand, qPlayed, tenPlayed, qInOpponents, tenInOpponents,
      remaining, playedCards, isEndgame,
      playerIndex: ctx.playerIndex || 0,
      scores: ctx.scores || [0, 0, 0, 0],
      hasPlayers: ctx.hasPlayers || [[], [], [], []],
      heartsBroken: ctx.heartsBroken || false,
      trickType: ctx.trickType || 0,

      // Helpers for checking if a card is "Boss" (highest remaining in suit)
      isBoss: (card) => {
        const suit = card.suit;
        const rank = card.rank;
        const played = playedCards[suit] || [];
        // Check if any unplayed card is higher than this card
        // We know our hand. We need to check if Opponents have higher.
        // Unplayed = AllCards - Played - MyHand
        // If any Unplayed > rank, then not Boss.

        // Iterate ranks > card.rank up to 14
        for (let r = rank + 1; r <= 14; r++) {
          // If r is NOT in played, AND NOT in my hand, then someone else has it.
          if (!played.includes(r)) {
            // Check if it's in my hand?
            const inMyHand = hand.some(c => c.suit === suit && c.rank === r);
            if (!inMyHand) return false; // Opponent has a higher card
          }
        }
        return true; // No higher cards out there
      }
    };
  }

  // ---------- Passing Logic (Smart Voiding) ----------

  function passCards(state) {
    const hand = cloneCards(state.hand);
    const suitCounts = countSuits(hand);
    const hasQ = hand.some(isLikhaBlack);

    // Identify suits we can VOID (length <= 3)
    // Prioritize voiding:
    // 1. Clubs (useless, good to void to ruff)
    // 2. Diamonds (if we don't have 10D, distinct advantage)
    // 3. Spades (Dangerous if we have Q, but if we pass Q, we want to void Spades!)

    // Cards to always pass if possible
    const forcePass = hand.filter(c => isLikha(c));

    // If we have > 3 cards to pass in forcePass (impossible, max 2 likhas + maybe hearts),
    // we pick top 3 danger.

    // Helper to score a set of 3 cards
    // This is a bit complex for JS, let's stick to heuristic scoring with "Void Bonus".

    const scored = hand.map(card => {
      let danger = cardDangerForPass(card, suitCounts);

      // VOID BONUS
      // If this suit has <= 3 cards, and we pass ALL of them, massive bonus.
      // But we can only pass 3 cards total.
      // So we can only void a suit if length <= 3 (and possibly others).
      // For now, let's just boost cards in short suits.

      const count = suitCounts[card.suit];
      if (count > 0 && count <= 3) {
        // Can we void it?
        if (isLikhaBlack(card) && count > 1) {
          // Keeping Q involves keeping guards usually.
          // Whatever, cardDanger handles Q high score.
        } else {
          // Boost based on how short it is
          // Length 1: Easy void (danger + 200)
          // Length 2: Doable (danger + 100)
          // Length 3: Harder (danger + 50)
          let bonus = 0;
          if (count === 1) bonus = 500; // Almost guaranteed pass
          else if (count === 2) bonus = 70;
          else if (count === 3) bonus = 40;

          // However, avoid voiding Spades if we are KEEPING Q (not passing it).
          if (card.suit === 'S' && hasQ && !isLikhaBlack(card)) {
            // We have Q, and this is a guard.
            // If we are passing Q, we want to void S.
            // If we are keeping Q, we want to KEEP S.
            // cardDanger already gives guards low danger?
            // Actually cardDanger returns rank. Low guards = low danger.
            // We want to make sure we don't accidentally pass guards if we keep Q.
            // If Q is score 1000, it will be passed.
            // So we assume Q is passed if present.
          } else {
            danger += bonus;
          }
        }
      }
      return { card, danger };
    });

    scored.sort((a, b) => b.danger - a.danger);
    return scored.slice(0, 3).map(s => s.card);
  }

  // ---------- Lead Logic (Exit Strategy & Protection) ----------

  function leadCardDanger(card, fullHand, ctx) {
    if (isLikha(card)) return 10000;
    if (card.suit === 'H' && !ctx.heartsBroken) return 5000;

    let danger = 0;
    const suit = card.suit;

    // Protective Leading
    // If I have Q♠, leading Spades is risky.
    if (ctx.qInHand && suit === 'S') danger += 200;
    // If I have 10♦, leading Diamonds is risky.
    if (ctx.tenInHand && suit === 'D') danger += 150;

    // Avoid leading high Diamonds if 10D is out (risk of eating it)
    // Also encourage bleeding low Diamonds to force 10D out.
    if (suit === 'D' && ctx.tenInOpponents) {
      if (card.rank >= 11) danger += 1500; // J, Q, K, A
      else danger -= 200; // Flush logic (safe leads)
    }

    // Voids Check
    const suitIdx = { 'H': 0, 'S': 1, 'D': 2, 'C': 3 }[suit];
    const playersWithSuit = ctx.hasPlayers[suitIdx];
    let opponentsVoid = 0;
    if (!playersWithSuit.includes(1)) opponentsVoid++;
    if (!playersWithSuit.includes(3)) opponentsVoid++;
    if (opponentsVoid > 0) danger += 100 * opponentsVoid;

    // Avoid leading high Spades if Q is out (risk of eating it)
    // Also encourage bleeding low Spades to force Q out.
    if (suit === 'S' && ctx.qInOpponents) {
      if (card.rank >= 13) danger += 2000; // K, A
      else danger -= 200; // Flush logic (safe leads)
    }

    if (card.rank >= 13) danger += 100;

    // Prefer lower ranks
    danger += card.rank;

    // Long suit preference
    const myCount = countSuits(fullHand)[suit];
    danger -= myCount * 15;

    return danger;
  }

  function chooseLead(legalCards, fullHand, ctx) {
    const candidates = legalCards.map(card => ({
      card,
      score: leadCardDanger(card, fullHand, ctx)
    }));
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].card; // Min danger
  }

  // ---------- Following Logic (with team & positional awareness) ----------

  function chooseWhenFollowing(legalCards, trick, fullHand, ctx) {
    const leadSuit = trick[0].card.suit;
    const myIndex = ctx.playerIndex || 0;
    const trickPosition = trick.length; // 1=2nd, 2=3rd, 3=last
    const isLastToPlay = trickPosition === 3;

    // Who is currently winning?
    const winnerEntry = findTrickWinner(trick);
    const currentHighRank = winnerEntry.card.rank;
    const partnerWinning = isPartner(myIndex, winnerEntry.player);

    // Accurate trick points
    const pointsInTrick = countTrickPoints(trick);

    const isDangerous = pointsInTrick > 0 ||
      (leadSuit === 'S' && ctx.qInOpponents) ||
      (leadSuit === 'D' && ctx.tenInOpponents);

    // --- 1. Following suit ---
    const following = legalCards.filter(c => c.suit === leadSuit);

    if (following.length > 0) {
      const under = following.filter(c => c.rank < currentHighRank);
      // HARD RULE: wherever we duck below the current winner (partner or
      // opponent, dangerous or clean), always prefer a card that isn't
      // Q♠/10♦ itself - dumping the penalty card still adds it to the
      // trick's point total, whoever ends up winning. Only fall back to
      // Q♠/10♦ when it's the sole card left under the winning rank.
      const safeUnder = under.filter(c => !isLikha(c));
      const duckPool = safeUnder.length > 0 ? safeUnder : under;

      // ~~~ Partner winning ~~~
      if (partnerWinning) {
        if (!isDangerous) {
          // Clean trick, partner winning - shed high cards safely
          if (duckPool.length > 0) {
            duckPool.sort(compareRankDesc);
            return duckPool[0];
          }
          // Must overtake partner on clean trick - burn high non-likha
          const safeOver = following.filter(c => c.rank > currentHighRank && !isLikha(c));
          if (safeOver.length > 0) {
            safeOver.sort(compareRankDesc);
            return safeOver[0];
          }
          following.sort(compareRankAsc);
          return following[0];
        } else {
          // Dangerous trick, partner winning - duck to let partner hold it
          if (duckPool.length > 0) {
            duckPool.sort(compareRankDesc);
            return duckPool[0];
          }
          // Must overtake partner - play lowest non-likha
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
      if (duckPool.length > 0) {
        // Can duck - play highest losing card
        duckPool.sort(compareRankDesc);
        return duckPool[0];
      }

      // Must go over (win the trick)
      if (isDangerous) {
        // Play lowest non-likha winner
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
        // Last to play - no one can dump on us, safe to burn high cards
        const safeToBurn = following.filter(c => !isLikha(c));
        if (safeToBurn.length > 0) {
          safeToBurn.sort(compareRankDesc);
          return safeToBurn[0];
        }
        following.sort(compareRankAsc);
        return following[0];
      }

      // Not last - cautious win (someone may still dump penalties)
      const nonLikhaWinners = following.filter(c => c.rank > currentHighRank && !isLikha(c));
      if (nonLikhaWinners.length > 0) {
        nonLikhaWinners.sort(compareRankAsc);
        return nonLikhaWinners[0]; // lowest possible winner
      }
      following.sort(compareRankAsc);
      return following[0];
    }

    // --- 2. Void - discard logic with team awareness ---

    // If only likha cards in legal set
    const onlyLikhas = legalCards.every(isLikha);
    if (onlyLikhas) {
      if (partnerWinning) {
        // Must give likha to partner - minimize: 10D(10) over QS(13)
        const red = legalCards.find(isLikhaRed);
        return red || legalCards[0];
      } else {
        // Opponent winning - maximize: QS(13) over 10D(10)
        const black = legalCards.find(isLikhaBlack);
        return black || legalCards[0];
      }
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
      // Only penalties left - dump lowest value on partner
      const hearts = legalCards.filter(c => c.suit === 'H' && !isLikha(c));
      if (hearts.length > 0) {
        hearts.sort(compareRankAsc);
        return hearts[0]; // lowest heart (1 pt)
      }
      // Must dump likha on partner - minimize damage
      const red = legalCards.find(isLikhaRed);
      if (red) return red; // 10D = 10 pts < QS = 13 pts
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

    // Context from BotAdapter
    const ctx = buildLikhaContext(state);

    // Legal moved (handled by BotAdapter usually, but good to filter)
    const trick = state.trick || [];
    let legalCards = fullHand;

    if (trick.length > 0) {
      const leadSuit = trick[0].card.suit;
      const following = fullHand.filter(c => c.suit === leadSuit);
      if (following.length > 0) legalCards = following;
      else {
        // Void. Check Forced Leekha?
        const penalties = fullHand.filter(isLikha);
        if (penalties.length > 0) legalCards = penalties;
      }
    } else {
      // Leading
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

    console.log(`[LMA] Chosen: ${chosen.rank}${chosen.suit}`);
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
