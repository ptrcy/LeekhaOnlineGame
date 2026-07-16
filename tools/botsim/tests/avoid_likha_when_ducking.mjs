// Regression test: bots must never volunteer Q♠/10♦ when a safer card is
// legally available - neither as a lead, nor as a card to duck a trick
// with. Covers the "K♣ chosen over safe 10♣, eating a dumped Q♠" class of
// bug. Run directly with `node tools/botsim/tests/avoid_likha_when_ducking.mjs`.

import { LMBot as LMGBot } from '../bots/LMG.js';
import { LMBot as LMLMBot } from '../bots/LMLM.js';
import { LMBot as LMXBot } from '../bots/LMX.js';
import { LMBot as LMX2Bot } from '../bots/lmx2.js';
import { LMBot as LMCBot } from '../bots/lmc.js';
import { LMBot as LMABot } from '../bots/lma.js';
import { LMBot as LMA1Bot } from '../bots/lma.1.js';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const BOTS = [
  ['lmg', LMGBot],
  ['lmlm', LMLMBot],
  ['lmx', LMXBot],
  ['lmx2', LMX2Bot],
  ['lmc', LMCBot],
  ['lma', LMABot],
  ['lma1', LMA1Bot],
];

let failures = 0;

function check(botName, label, actual, expectedNot) {
  const ok = actual && actual.toLowerCase() !== expectedNot.toLowerCase();
  const status = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`[${status}] ${botName.padEnd(6)} ${label.padEnd(45)} played: ${actual}`);
}

console.log('--- Duck test: Q♠ dumped into a clubs trick, bot last to act holding Tc+Kc ---');
console.log('    Bot must duck with Tc, not win with Kc (which would eat the Q♠).\n');

const duckHand = [[], [], [], ['Tc', 'Kc']];
const duckCtx = {
  trick: [
    { player: 1, card: { suit: 'c', rank: '5' } },
    { player: 2, card: { suit: 's', rank: 'Q' } },
    { player: 3, card: { suit: 'c', rank: 'J' } },
  ],
  heartsBroken: true,
  hasPlayers: [[1, 3], [1, 3], [1, 3], [1, 3]],
  queenOfSpadesPlayed: false,
  tenOfDiamondsPlayed: false,
  remaining: [10, 10, 10, 10],
  playedCards: { H: [], S: [], D: [], C: [] },
  playerIndex: 0,
  scores: [0, 0, 0, 0],
  qInOpponents: false,
  tenInOpponents: true,
};

for (const [name, BotClass] of BOTS) {
  const bot = new BotClass(RANKS);
  const choice = bot.chooseFollow(duckHand, duckCtx);
  check(name, 'ducks with Tc instead of winning with Kc', choice, 'Kc');
}

console.log('\n--- Lead test: late-game hand with only high cards, including Q♠, plus a safer Kd/Ah ---');
console.log('    Bot must not volunteer to lead Q♠ when Kd/Ah are legal alternatives.\n');

const leadHand = [['Ah'], ['Qs'], ['Kd'], []];
const leadCtx = {
  trickType: 0,
  heartsBroken: true,
  hasPlayers: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]],
  queenOfSpadesPlayed: false,
  tenOfDiamondsPlayed: false,
  remaining: [10, 10, 10, 10],
  playedCards: { H: [], S: [], D: [], C: [] },
  playerIndex: 0,
  scores: [0, 0, 0, 0],
  qInHand: true,
  qInOpponents: false,
  tenInOpponents: false,
};

for (const [name, BotClass] of BOTS) {
  const bot = new BotClass(RANKS);
  const choice = bot.chooseLead(leadHand, leadCtx);
  check(name, 'does not lead Qs when Kd/Ah are available', choice, 'Qs');
}

console.log('\n--- Sanity check: when Q♠ is the ONLY legal card, bots must still play it ---');
console.log('    (proves the safety filter never blocks a forced, rules-mandated play)\n');

const forcedHand = [[], ['Qs'], [], []];
const forcedCtx = {
  trick: [{ player: 1, card: { suit: 'h', rank: '5' } }],
  heartsBroken: true,
  hasPlayers: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]],
  queenOfSpadesPlayed: false,
  tenOfDiamondsPlayed: false,
  remaining: [10, 10, 10, 10],
  playedCards: { H: [], S: [], D: [], C: [] },
  playerIndex: 0,
  scores: [0, 0, 0, 0],
};

for (const [name, BotClass] of BOTS) {
  const bot = new BotClass(RANKS);
  const choice = bot.chooseFollow(forcedHand, forcedCtx);
  const ok = choice && choice.toLowerCase() === 'qs';
  const status = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`[${status}] ${name.padEnd(6)} plays Qs when it's the only legal card       played: ${choice}`);
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
