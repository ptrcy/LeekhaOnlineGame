"use strict";
/**
 * Game constants and configuration values
 * Centralizes magic numbers and configuration for easier maintenance
 */

// =============================================================================
// GAME RULES
// =============================================================================

export const GAME_RULES = {
    PLAYERS_COUNT: 4,
    HAND_SIZE: 13,
    PASS_CARDS_COUNT: 3,
    SCORE_LIMIT: 101,
    TRICKS_PER_ROUND: 13
};

// =============================================================================
// TIMING (in milliseconds)
// =============================================================================

export const TIMING = {
    // Player interaction timeouts
    SELECTION_TIMEOUT: 60000,        // 60 seconds for card selection

    // Animation and display delays
    TRICK_DISPLAY_DELAY: 2000,       // Time to view trick before collection
    TRICK_COLLECTION_DELAY: 500,     // Animation time for collecting trick
    ROUND_END_DELAY: 1000,           // Delay before clearing table at round end
    ROUND_START_DELAY: 2000,         // Delay before starting next round

    // Notification durations
    NOTIFICATION_DEFAULT: 3000,      // Default toast duration
    NOTIFICATION_ERROR: 4000,        // Error toast duration
    NOTIFICATION_FADE: 300           // Fade out animation duration
};

// =============================================================================
// PLAYER POSITIONS
// =============================================================================

export const PLAYER_POSITIONS = {
    BOTTOM: 0,  // Human player (You)
    RIGHT: 1,   // East
    TOP: 2,     // Partner
    LEFT: 3     // West
};

// Map player index to DOM element ID
export const PLAYER_ELEMENT_IDS = {
    0: 'player-bottom',
    1: 'player-right',
    2: 'player-top',
    3: 'player-left'
};

// =============================================================================
// CARD DISPLAY
// =============================================================================

export const CARD_DISPLAY = {
    // Trick pile card positions (offset from center in pixels)
    TRICK_POSITIONS: [
        { x: 0, y: 80, rotation: 0 },      // Bottom (You)
        { x: 80, y: 0, rotation: 5 },      // Right (East)
        { x: 0, y: -80, rotation: 0 },     // Top (Partner)
        { x: -80, y: 0, rotation: -5 }     // Left (West)
    ],

    // Collection animation target offsets
    COLLECTION_OFFSETS: [
        { x: 0, y: 200 },     // Bottom - move down
        { x: 250, y: 0 },     // Right - move right
        { x: 0, y: -200 },    // Top - move up
        { x: -250, y: 0 }     // Left - move left
    ]
};

// =============================================================================
// SUIT CONFIGURATION
// =============================================================================

export const SUITS = {
    HEARTS: 'H',
    DIAMONDS: 'D',
    SPADES: 'S',
    CLUBS: 'C'
};

export const SUIT_SYMBOLS = {
    'H': '♥',
    'D': '♦',
    'S': '♠',
    'C': '♣'
};

export const SUIT_NAMES = {
    'H': 'Hearts',
    'D': 'Diamonds',
    'S': 'Spades',
    'C': 'Clubs'
};

// =============================================================================
// SPECIAL CARDS
// =============================================================================

export const SPECIAL_CARDS = {
    QUEEN_OF_SPADES: { suit: 'S', rank: 'Q' },
    TEN_OF_DIAMONDS: { suit: 'D', rank: '10' }
};

export const DEFAULT_BOT_TYPE = 'lmg';
