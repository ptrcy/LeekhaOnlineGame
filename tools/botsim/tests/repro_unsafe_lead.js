
const { LMBot } = require('../bots/lma.js');

// Mock context: 10♦ is OUT (in opponents).
// Bot has A♦ (Singleton) and Spades [K, Q]
// Bot should NOT lead A♦.
const mockContext = {
    remaining: [13, 13, 13, 13],
    playedCards: { 'H': [], 'S': [], 'D': [], 'C': [] },
    hasPlayers: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]],
    queenOfSpadesPlayed: false,
    tenOfDiamondsPlayed: false, // 10D is out
    heartsBroken: false,
    playerIndex: 0,
    qInOpponents: false, // We have Q
    tenInOpponents: true, // Key: 10D is in opponents
    qInHand: true,
    tenInHand: false,
    scores: [0, 0, 0, 0]
};

const bot = new LMBot(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);

// Hand format for LMBot: [H[], S[], D[], C[]]
// D is index 2, C is index 3.
const botHand = [
    [], // H
    ['Ks', 'Qs'], // S (Index 1)
    ['Ad'], // D (Index 2)
    []  // C
];

// Test 2: Tradeoff (High vs Safe D)
// Hand:
// D: [A, 2] -> Should lead 2.
// S: [K]
const botHand2 = [
    [],
    ['Ks'],
    ['Ad', '2d'],
    []
];

// Helper to run test
function runTest() {
    // We override context manually just in case LMBot recalculates it from something else?
    // chooseLead takes (hand, ctx).

    // Test 1: Singleton A vs K Spades
    console.log("Test 1: Singleton A♦ vs K♠");
    const choice1 = bot.chooseLead(botHand, mockContext);
    console.log(`Bot Choice: ${choice1}`);
    if (choice1 === 'Ad' || choice1 === 'AD') console.log("FAIL 1: Bot led A♦ (Unsafe).");
    else console.log(`PASS 1: Bot led ${choice1}.`);

    // Test 2: High + Low D
    console.log("Test 2: A♦ + 2♦");
    const ctx2 = { ...mockContext, qInHand: false }; // Simplify context
    const choice2 = bot.chooseLead(botHand2, ctx2);
    console.log(`Bot Choice: ${choice2}`);
    if (choice2 === 'Ad' || choice2 === 'AD') console.log("FAIL 2: Bot led A♦ when 2♦ was available.");
    else if (choice2 === '2d' || choice2 === '2D') console.log(`PASS 2: Bot led 2♦.`);
    else console.log(`INFO 2: Bot led ${choice2}.`);

    // Test 3: Unsafe Singleton Spade Lead
    // Hand: S: [A] (Singleton) -> Dangerous if Q is out.
    // D: [Q, J] (Holding 10 is out) -> Leading Q is risky (+10).
    // Leading A♠ is risking +13.
    // Leading Q♦ is risking +10.
    // Bot should prefer Q♦ (10 pts) over A♠ (13 pts).
    console.log("Test 3: Singleton A♠ vs Q♦ (Tradeoff)");
    const botHand3 = [
        [],
        ['As'], // S
        ['Qd', 'Jd'], // D
        []
    ];
    // Q is out, 10D is out.
    const ctx3 = { ...mockContext, qInOpponents: true, qInHand: false, tenInOpponents: true, tenInHand: false };

    const choice3 = bot.chooseLead(botHand3, ctx3);
    console.log(`Bot Choice: ${choice3}`);
    if (choice3 === 'As' || choice3 === 'AS') console.log("FAIL 3: Bot led A♠ (Unsafe, worth 13 pts).");
    else console.log(`PASS 3: Bot led ${choice3} (Avoided A♠).`);
}

try {
    runTest();
} catch (e) {
    console.error(e);
}
