/**
 * Event names used throughout the game
 */
export const GameEvents = {
  // Game lifecycle
  GAME_INITIALIZED: 'GAME_INITIALIZED',
  GAME_STARTED: 'GAME_STARTED',
  ROUND_START: 'ROUND_START',
  ROUND_END: 'ROUND_END',
  GAME_OVER: 'GAME_OVER',

  // Card and hand events
  HANDS_DEALT: 'HANDS_DEALT',
  HAND_UPDATED: 'HAND_UPDATED',
  CARD_PLAYED: 'CARD_PLAYED',
  TRICK_COMPLETE: 'TRICK_COMPLETE',
  TRICK_PILE_CLEAR: 'TRICK_PILE_CLEAR',

  // Passing phase
  PASS_PHASE_START: 'PASS_PHASE_START',
  PASS_SELECTION_READY: 'PASS_SELECTION_READY',
  PASS_PHASE_COMPLETE: 'PASS_PHASE_COMPLETE',

  // UI state
  TURN_CHANGED: 'TURN_CHANGED',
  STATUS_MESSAGE: 'STATUS_MESSAGE',
  ENABLE_CARD_SELECTION: 'ENABLE_CARD_SELECTION',
  DISABLE_CARD_SELECTION: 'DISABLE_CARD_SELECTION',
  INVALID_MOVE: 'INVALID_MOVE',

  // Scoring
  SCORE_UPDATED: 'SCORE_UPDATED',
};

/**
 * Simple event emitter for game events using pub/sub pattern
 */
export class GameEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  /**
   * Subscribe to an event for one-time execution
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  once(event, handler) {
    const wrapper = (...args) => {
      handler(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler to remove
   */
  off(event, handler) {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }

    // Clean up empty arrays
    if (handlers.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event);
    // Create a copy of handlers array to avoid issues if handlers modify subscriptions
    [...handlers].forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Remove all listeners for a specific event or all events
   * @param {string} [event] - Optional event name, if omitted clears all
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get count of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    return this.listeners.has(event) ? this.listeners.get(event).length : 0;
  }
}
