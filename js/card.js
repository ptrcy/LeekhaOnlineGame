"use strict";
export class Card {
    constructor(suit, rank) {
        this.suit = suit; // 'H', 'D', 'S', 'C'
        this.rank = rank; // 2-9, 10, J, Q, K, A
    }

    get id() {
        return `${this.rank}${this.suit}`;
    }

    get color() {
        return (this.suit === 'H' || this.suit === 'D') ? 'red' : 'black';
    }

    get value() {
        // For game logic comparisons (A > K > ... > 2)
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        return ranks.indexOf(this.rank);
    }

    get points() {
        if (this.suit === 'H') return 1;
        if (this.suit === 'S' && this.rank === 'Q') return 13;
        if (this.suit === 'D' && this.rank === '10') return 10;
        return 0;
    }

    toString() {
        const suitIcons = { 'H': '♥', 'D': '♦', 'S': '♠', 'C': '♣' };
        return `${this.rank}${suitIcons[this.suit]}`;
    }
}

export const SUITS = ['H', 'S', 'D', 'C'];
// Standard 52 card deck ranks
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
