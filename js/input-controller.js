import { GameEvents } from './events.js';

/**
 * Abstract base class for handling user input
 */
export class InputController {
  /**
   * Get a card selection from the user
   * @param {Card[]} hand - Player's hand
   * @param {Card[]} validMoves - Valid cards to play
   * @returns {Promise<Card>} Selected card
   */
  async getCardSelection(hand, validMoves) {
    throw new Error('getCardSelection must be implemented by subclass');
  }

  /**
   * Get pass selection from the user
   * @param {Card[]} hand - Player's hand
   * @returns {Promise<Card[]>} Array of 3 selected cards
   */
  async getPassSelection(hand) {
    throw new Error('getPassSelection must be implemented by subclass');
  }
}

/**
 * DOM-based input controller for browser UI
 */
export class DOMInputController extends InputController {
  constructor(eventEmitter) {
    super();
    this.events = eventEmitter;
    this.pendingPlayResolve = null;
    this.pendingPassResolve = null;
    this.validMoves = null;
    this.timeout = null;
  }

  /**
   * Get a card selection from DOM click events
   * @param {Card[]} hand - Player's hand
   * @param {Card[]} validMoves - Valid cards to play
   * @returns {Promise<Card>} Selected card
   */
  async getCardSelection(hand, validMoves) {
    // Clean up any previous pending selection
    if (this.pendingPlayResolve) {
      this.cancelSelection('New selection started');
    }

    return new Promise((resolve, reject) => {
      this.pendingPlayResolve = resolve;
      this.pendingPlayReject = reject;
      this.validMoves = validMoves;

      // Emit event to enable card selection in UI
      this.events.emit(GameEvents.ENABLE_CARD_SELECTION, {
        hand,
        validMoves,
        mode: 'play'
      });

      // Set timeout (60 seconds)
      this.timeout = setTimeout(() => {
        this.cancelSelection('Selection timeout (60s)');
      }, 60000);
    });
  }

  /**
   * Get pass selection from DOM click events
   * @param {Card[]} hand - Player's hand
   * @returns {Promise<Card[]>} Array of 3 selected cards
   */
  async getPassSelection(hand) {
    // Clean up any previous pending selection
    if (this.pendingPassResolve) {
      this.cancelPassSelection('New selection started');
    }

    return new Promise((resolve, reject) => {
      this.pendingPassResolve = resolve;
      this.pendingPassReject = reject;

      // Emit event to enable pass selection in UI
      this.events.emit(GameEvents.ENABLE_CARD_SELECTION, {
        hand,
        validMoves: hand, // All cards are valid for passing
        mode: 'pass',
        count: 3
      });

      // Set timeout (60 seconds)
      this.timeout = setTimeout(() => {
        this.cancelPassSelection('Selection timeout (60s)');
      }, 60000);
    });
  }

  /**
   * Handle card click during play mode
   * @param {Card} card - Clicked card
   */
  handleCardClick(card) {
    if (!this.pendingPlayResolve) return;

    // Validate the card is in validMoves
    const isValid = this.validMoves.some(
      c => c.suit === card.suit && c.rank === card.rank
    );

    if (isValid) {
      clearTimeout(this.timeout);
      const resolve = this.pendingPlayResolve;
      this.pendingPlayResolve = null;
      this.pendingPlayReject = null;
      this.validMoves = null;
      this.timeout = null;

      // Emit event to disable selection
      this.events.emit(GameEvents.DISABLE_CARD_SELECTION);

      resolve(card);
    } else {
      this.events.emit(GameEvents.INVALID_MOVE, {
        card,
        reason: 'Card is not a valid move'
      });
    }
  }

  /**
   * Handle pass confirmation with selected cards
   * @param {Card[]} selectedCards - Array of selected cards (should be 3)
   */
  handlePassConfirm(selectedCards) {
    if (!this.pendingPassResolve) return;

    if (selectedCards.length !== 3) {
      this.events.emit(GameEvents.INVALID_MOVE, {
        reason: `Must select exactly 3 cards (selected ${selectedCards.length})`
      });
      return;
    }

    clearTimeout(this.timeout);
    const resolve = this.pendingPassResolve;
    this.pendingPassResolve = null;
    this.pendingPassReject = null;
    this.timeout = null;

    // Emit event to disable selection
    this.events.emit(GameEvents.DISABLE_CARD_SELECTION);

    resolve(selectedCards);
  }

  /**
   * Cancel pending card selection
   * @param {string} reason - Cancellation reason
   */
  cancelSelection(reason) {
    if (this.pendingPlayResolve) {
      clearTimeout(this.timeout);
      const reject = this.pendingPlayReject;
      this.pendingPlayResolve = null;
      this.pendingPlayReject = null;
      this.validMoves = null;
      this.timeout = null;

      this.events.emit(GameEvents.DISABLE_CARD_SELECTION);
      reject(new Error(reason));
    }
  }

  /**
   * Cancel pending pass selection
   * @param {string} reason - Cancellation reason
   */
  cancelPassSelection(reason) {
    if (this.pendingPassResolve) {
      clearTimeout(this.timeout);
      const reject = this.pendingPassReject;
      this.pendingPassResolve = null;
      this.pendingPassReject = null;
      this.timeout = null;

      this.events.emit(GameEvents.DISABLE_CARD_SELECTION);
      reject(new Error(reason));
    }
  }

  /**
   * Check if there's a pending selection
   * @returns {boolean}
   */
  hasPendingSelection() {
    return this.pendingPlayResolve !== null || this.pendingPassResolve !== null;
  }
}

/**
 * Headless input controller for simulations (bots don't use this)
 */
export class HeadlessInputController extends InputController {
  async getCardSelection(hand, validMoves) {
    throw new Error('HeadlessInputController should not be used for human players');
  }

  async getPassSelection(hand) {
    throw new Error('HeadlessInputController should not be used for human players');
  }
}
