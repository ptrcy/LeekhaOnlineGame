const { LMBot } = require('../bots/lma.js');

// Mock context: Q IS IN TRICK. TRACKER SAYS "PLAYED" (Correctly).
// Bot should NOT rely on qInOpponents (which is false now).
// Bot MUST detect danger from trick content.
const mockContext = {
    remaining: [10, 10, 10, 10],
    playedCards: { 'H': [], 'S': [], 'D': [], 'C': [] },
    hasPlayers: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]],
    queenOfSpadesPlayed: true, // TRUE because it is in the current trick!
    tenOfDiamondsPlayed: false,
    heartsBroken: false,
    playerIndex: 0,
    scores: [0, 0, 0, 0],
    trick: [
        { player: 1, card: { suit: 'S', rank: '3' } },
        { player: 2, card: { suit: 'S', rank: 'Q' } }   // QS is here
    ]
};

const botHand = [
    ["2h"],
    ["5s", "Ks"],
    [],
    []
];

const bot = new LMBot(0);

console.log("Starting Test 1 (Played=True)...");
console.log("Trick:", JSON.stringify(mockContext.trick));
console.log("Bot Hand:", JSON.stringify(botHand));

try {
    const choice = bot.chooseFollow(botHand, mockContext);
    console.log("Bot Chose:", choice);

    // Check Result
    if (choice === "Ks") {
        console.error("FAIL: Bot played K♠ and ate the Q♠!");
        process.exit(1);
    } else if (choice === "5s") {
        console.log("PASS: Bot played 5♠ and ducked the Q♠.");
        process.exit(0);
    } else {
        console.error("FAIL: Bot played unexpected card:", choice);
        process.exit(1);
    }
} catch (e) {
    console.error("Error executing bot:", e);
    process.exit(1);
}
