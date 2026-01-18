import { GameEvents } from './events.js';
import { TIMING } from './constants.js';

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
 * Selection states for the input controller state machine
 * @enum {string}
 */
const SelectionState = {
  IDLE: 'idle',
  PLAY_PENDING: 'play_pending',
  PASS_PENDING: 'pass_pending'
};

/**
 * DOM-based input controller for browser UI
 * Uses a state machine pattern to prevent race conditions
 */
export class DOMInputController extends InputController {
  constructor(eventEmitter) {
    super();
    this.events = eventEmitter;
    this.state = SelectionState.IDLE;
    this.pendingPlayResolve = null;
    this.pendingPlayReject = null;
    this.pendingPassResolve = null;
    this.pendingPassReject = null;
    this.validMoves = null;
    this.timeout = null;
  }

  /**
   * Get a card selection from DOM click events
   * @param {Card[]} hand - Player's hand
   * @param {Card[]} validMoves - Valid cards to play
   * @returns {Promise<Card>} Selected card
   * @throws {Error} If a selection is already in progress
   */
  async getCardSelection(hand, validMoves) {
    // State machine guard: prevent concurrent selections
    if (this.state !== SelectionState.IDLE) {
      throw new Error(`Cannot start card selection: already in state '${this.state}'`);
    }

    return new Promise((resolve, reject) => {
      // Transition to play pending state
      this.state = SelectionState.PLAY_PENDING;
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
      }, TIMING.SELECTION_TIMEOUT);
    });
  }

  /**
   * Get pass selection from DOM click events
   * @param {Card[]} hand - Player's hand
   * @returns {Promise<Card[]>} Array of 3 selected cards
   * @throws {Error} If a selection is already in progress
   */
  async getPassSelection(hand) {
    // State machine guard: prevent concurrent selections
    if (this.state !== SelectionState.IDLE) {
      throw new Error(`Cannot start pass selection: already in state '${this.state}'`);
    }

    return new Promise((resolve, reject) => {
      // Transition to pass pending state
      this.state = SelectionState.PASS_PENDING;
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
      }, TIMING.SELECTION_TIMEOUT);
    });
  }

  /**
   * Handle card click during play mode
   * @param {Card} card - Clicked card
   */
  handleCardClick(card) {
    // State machine guard: only handle clicks in play pending state
    if (this.state !== SelectionState.PLAY_PENDING || !this.pendingPlayResolve) {
      return;
    }

    // Validate the card is in validMoves
    const isValid = this.validMoves.some(
      c => c.suit === card.suit && c.rank === card.rank
    );

    if (isValid) {
      clearTimeout(this.timeout);
      const resolve = this.pendingPlayResolve;

      // Reset state to IDLE before resolving
      this.state = SelectionState.IDLE;
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
    // State machine guard: only handle confirmation in pass pending state
    if (this.state !== SelectionState.PASS_PENDING || !this.pendingPassResolve) {
      return;
    }

    if (selectedCards.length !== 3) {
      this.events.emit(GameEvents.INVALID_MOVE, {
        reason: `Must select exactly 3 cards (selected ${selectedCards.length})`
      });
      return;
    }

    clearTimeout(this.timeout);
    const resolve = this.pendingPassResolve;

    // Reset state to IDLE before resolving
    this.state = SelectionState.IDLE;
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
    if (this.state === SelectionState.PLAY_PENDING && this.pendingPlayReject) {
      clearTimeout(this.timeout);
      const reject = this.pendingPlayReject;

      // Reset state to IDLE
      this.state = SelectionState.IDLE;
      this.pendingPlayResolve = null;
      this.pendingPlayReject = null;
      this.validMoves = null;
      this.timeout = null;

      this.events.emit(GameEvents.DISABLE_CARD_SELECTION);
      this.events.emit(GameEvents.ERROR_OCCURRED, {
        type: 'selection_timeout',
        message: reason
      });
      reject(new Error(reason));
    }
  }

  /**
   * Cancel pending pass selection
   * @param {string} reason - Cancellation reason
   */
  cancelPassSelection(reason) {
    if (this.state === SelectionState.PASS_PENDING && this.pendingPassReject) {
      clearTimeout(this.timeout);
      const reject = this.pendingPassReject;

      // Reset state to IDLE
      this.state = SelectionState.IDLE;
      this.pendingPassResolve = null;
      this.pendingPassReject = null;
      this.timeout = null;

      this.events.emit(GameEvents.DISABLE_CARD_SELECTION);
      this.events.emit(GameEvents.ERROR_OCCURRED, {
        type: 'selection_timeout',
        message: reason
      });
      reject(new Error(reason));
    }
  }

  /**
   * Check if there's a pending selection
   * @returns {boolean}
   */
  hasPendingSelection() {
    return this.state !== SelectionState.IDLE;
  }

  /**
   * Get the current selection state
   * @returns {string}
   */
  getState() {
    return this.state;
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
