"use strict";
import { GameEvents } from './events.js';
import {
  TIMING,
  PLAYER_ELEMENT_IDS,
  CARD_DISPLAY,
  SUIT_NAMES
} from './constants.js';

/**
 * Abstract base class defining the renderer contract
 */
export class GameRenderer {
  initialize() {
    throw new Error('initialize must be implemented by subclass');
  }

  renderHands(handsData, options) {
    throw new Error('renderHands must be implemented by subclass');
  }

  renderTrickCard(card, playerIndex, position) {
    throw new Error('renderTrickCard must be implemented by subclass');
  }

  updateStatus(message) {
    throw new Error('updateStatus must be implemented by subclass');
  }

  showPassModal(show, enabled) {
    throw new Error('showPassModal must be implemented by subclass');
  }

  updateScoreboard(scores) {
    throw new Error('updateScoreboard must be implemented by subclass');
  }

  showGameOver(results) {
    throw new Error('showGameOver must be implemented by subclass');
  }

  clearTrickPile() {
    throw new Error('clearTrickPile must be implemented by subclass');
  }
}

/**
 * DOM-based renderer for browser UI
 */
export class DOMRenderer extends GameRenderer {
  constructor(eventEmitter, inputController) {
    super();
    this.events = eventEmitter;
    this.inputController = inputController;

    // DOM element references (will be initialized in initialize())
    this.elements = {
      status: null,
      humanHand: null,
      trickPile: null,
      passModal: null,
      confirmPassBtn: null,
      scoreboard: null,
      scoresList: null,
      gameOverModal: null,
      modalOverlay: null,
      finalResults: null,
      restartBtn: null,
      aiThinkingIndicator: null,
      notificationArea: null
    };

    // State for rendering
    this.currentHand = null;
    this.selectionMode = null;
    this.selectedCards = new Set();

    // Memoization for hand rendering
    this.lastRenderedHandKey = null;

    // Keyboard navigation state
    this.focusedCardIndex = -1;
    this.validCardIndices = [];

    // Bind keyboard handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Initialize DOM elements and event subscriptions
   */
  initialize() {
    // Get DOM element references
    this.elements.status = document.getElementById('status-text');
    this.elements.humanHand = document.getElementById('human-hand');
    this.elements.trickPile = document.getElementById('trick-pile');
    this.elements.passModal = document.getElementById('pass-modal');
    this.elements.confirmPassBtn = document.getElementById('confirm-pass-btn');
    this.elements.scoreboard = document.getElementById('scoreboard');
    this.elements.scoresList = document.getElementById('scores-list');
    this.elements.gameOverModal = document.getElementById('game-over-modal');
    this.elements.modalOverlay = document.getElementById('modal-overlay');
    this.elements.finalResults = document.getElementById('final-results');
    this.elements.restartBtn = document.getElementById('restart-btn');
    this.elements.aiThinkingIndicator = document.getElementById('ai-thinking-indicator');
    this.elements.notificationArea = document.getElementById('notification-area');

    // Subscribe to game events
    this.subscribeToEvents();

    // Setup pass confirmation button
    this.elements.confirmPassBtn.onclick = () => {
      // Convert selected card keys back to card objects
      const selectedCardObjects = Array.from(this.selectedCards).map(key => {
        return this.currentHand.find(c => `${c.suit}${c.rank}` === key);
      }).filter(c => c !== undefined);

      this.inputController.handlePassConfirm(selectedCardObjects);
    };

    // Setup keyboard navigation
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Handle keyboard navigation for card selection
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    // Only handle keys when in selection mode
    if (!this.selectionMode) return;

    const key = event.key;

    switch (key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        this.focusNextCard();
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        this.focusPreviousCard();
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        this.selectFocusedCard();
        break;

      case 'Escape':
        event.preventDefault();
        this.clearFocus();
        break;

      case 'Home':
        event.preventDefault();
        this.focusFirstCard();
        break;

      case 'End':
        event.preventDefault();
        this.focusLastCard();
        break;
    }
  }

  /**
   * Focus the next valid card
   */
  focusNextCard() {
    if (this.validCardIndices.length === 0) return;

    const currentPos = this.validCardIndices.indexOf(this.focusedCardIndex);
    const nextPos = currentPos < 0 ? 0 : (currentPos + 1) % this.validCardIndices.length;
    this.setFocusedCard(this.validCardIndices[nextPos]);
  }

  /**
   * Focus the previous valid card
   */
  focusPreviousCard() {
    if (this.validCardIndices.length === 0) return;

    const currentPos = this.validCardIndices.indexOf(this.focusedCardIndex);
    const prevPos = currentPos <= 0 ? this.validCardIndices.length - 1 : currentPos - 1;
    this.setFocusedCard(this.validCardIndices[prevPos]);
  }

  /**
   * Focus the first valid card
   */
  focusFirstCard() {
    if (this.validCardIndices.length === 0) return;
    this.setFocusedCard(this.validCardIndices[0]);
  }

  /**
   * Focus the last valid card
   */
  focusLastCard() {
    if (this.validCardIndices.length === 0) return;
    this.setFocusedCard(this.validCardIndices[this.validCardIndices.length - 1]);
  }

  /**
   * Set focus on a specific card by index
   * @param {number} index - Card index
   */
  setFocusedCard(index) {
    const container = this.elements.humanHand;
    const cards = container.querySelectorAll('.card');

    // Remove focus from previous card
    cards.forEach(card => card.classList.remove('keyboard-focus'));

    // Set focus on new card
    this.focusedCardIndex = index;
    const card = cards[index];
    if (card) {
      card.classList.add('keyboard-focus');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  /**
   * Clear keyboard focus
   */
  clearFocus() {
    const container = this.elements.humanHand;
    const cards = container.querySelectorAll('.card');
    cards.forEach(card => card.classList.remove('keyboard-focus'));
    this.focusedCardIndex = -1;
  }

  /**
   * Select or toggle the currently focused card
   */
  selectFocusedCard() {
    if (this.focusedCardIndex < 0 || !this.currentHand) return;

    const card = this.currentHand[this.focusedCardIndex];
    if (!card) return;

    const container = this.elements.humanHand;
    const cardElement = container.querySelector(`[data-index="${this.focusedCardIndex}"]`);

    if (!cardElement || cardElement.classList.contains('disabled')) return;

    if (this.selectionMode === 'pass') {
      // Multi-selection for passing
      const cardKey = `${card.suit}${card.rank}`;

      if (this.selectedCards.has(cardKey)) {
        this.selectedCards.delete(cardKey);
        cardElement.classList.remove('selected');
        cardElement.setAttribute('aria-selected', 'false');
      } else {
        if (this.selectedCards.size < 3) {
          this.selectedCards.add(cardKey);
          cardElement.classList.add('selected');
          cardElement.setAttribute('aria-selected', 'true');
        }
      }

      // Update button state
      this.elements.confirmPassBtn.disabled = (this.selectedCards.size !== 3);
    } else if (this.selectionMode === 'play') {
      // Single selection for playing
      this.inputController.handleCardClick(card);
    }
  }

  /**
   * Subscribe to all relevant game events
   */
  subscribeToEvents() {
    this.events.on(GameEvents.STATUS_MESSAGE, (data) => {
      this.updateStatus(data.message);
    });

    this.events.on(GameEvents.HANDS_DEALT, (data) => {
      this.renderHands(data.hands, { selectionMode: false });
    });

    this.events.on(GameEvents.HAND_UPDATED, (data) => {
      this.renderHands(data.hands, { selectionMode: false });
    });

    this.events.on(GameEvents.CARD_PLAYED, (data) => {
      this.renderTrickCard(data.card, data.playerIndex, data.position);
      // Hide AI thinking indicator when any card is played
      this.showAIThinking(false);
    });

    this.events.on(GameEvents.TRICK_COMPLETE, (data) => {
      this.animateTrickCollection(data.winnerIndex);
      // Clear active turn indicator when trick completes
      this.clearActiveTurn();
    });

    this.events.on(GameEvents.TRICK_PILE_CLEAR, () => {
      this.clearTrickPile();
    });

    this.events.on(GameEvents.SCORE_UPDATED, (data) => {
      this.updateScoreboard(data);
    });

    this.events.on(GameEvents.GAME_OVER, (data) => {
      this.showGameOver(data);
      this.clearActiveTurn();
    });

    this.events.on(GameEvents.ENABLE_CARD_SELECTION, (data) => {
      this.enableCardSelection(data);
    });

    this.events.on(GameEvents.DISABLE_CARD_SELECTION, () => {
      this.disableCardSelection();
    });

    this.events.on(GameEvents.PASS_PHASE_START, () => {
      this.showPassModal(true, false);
    });

    this.events.on(GameEvents.PASS_PHASE_COMPLETE, () => {
      this.showPassModal(false, false);
    });

    this.events.on(GameEvents.TURN_CHANGED, (data) => {
      this.setActiveTurn(data.playerIndex);
      // Show AI thinking indicator for bot players (not player 0)
      if (data.playerIndex !== 0) {
        this.showAIThinking(true);
      } else {
        this.showAIThinking(false);
      }
    });

    this.events.on(GameEvents.INVALID_MOVE, (data) => {
      const message = data.reason || 'Invalid move';
      this.showNotification(message, 'error', TIMING.NOTIFICATION_DEFAULT);
    });

    this.events.on(GameEvents.ERROR_OCCURRED, (data) => {
      const message = data.message || 'An error occurred';
      this.showNotification(message, 'error', TIMING.NOTIFICATION_ERROR || 5000);
      console.error('Game error:', data);
    });
  }

  /**
   * Set the active turn indicator on a player
   * @param {number} playerIndex - Index of the active player (0-3)
   */
  setActiveTurn(playerIndex) {
    // Clear all active indicators
    this.clearActiveTurn();

    const elementId = PLAYER_ELEMENT_IDS[playerIndex];
    const playerElement = document.getElementById(elementId);

    if (playerElement) {
      playerElement.classList.add('active-turn');
    }
  }

  /**
   * Clear all active turn indicators
   */
  clearActiveTurn() {
    const playerAreas = document.querySelectorAll('.player-area');
    playerAreas.forEach(area => area.classList.remove('active-turn'));
  }

  /**
   * Show or hide the AI thinking indicator
   * @param {boolean} show - Whether to show the indicator
   */
  showAIThinking(show) {
    if (this.elements.aiThinkingIndicator) {
      if (show) {
        this.elements.aiThinkingIndicator.classList.remove('hidden');
      } else {
        this.elements.aiThinkingIndicator.classList.add('hidden');
      }
    }
  }

  /**
   * Show a notification toast message
   * @param {string} message - The message to display
   * @param {string} type - Type of notification: 'error', 'success', 'info' (default: 'info')
   * @param {number} duration - How long to show the notification in ms (default: TIMING.NOTIFICATION_DEFAULT)
   */
  showNotification(message, type = 'info', duration = TIMING.NOTIFICATION_DEFAULT) {
    if (!this.elements.notificationArea) return;

    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');

    this.elements.notificationArea.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, TIMING.NOTIFICATION_FADE);
    }, duration);
  }

  /**
   * Create a card DOM element
   * @param {Card} card - Card object
   * @returns {HTMLElement} Card element
   */
  createCardElement(card) {
    const el = document.createElement('div');
    el.className = `card ${card.color}`;

    // Convert rank to SVG filename format (10 -> T)
    const svgRank = card.rank === '10' ? 'T' : card.rank;
    const svgFilename = `${svgRank}${card.suit}.svg`;

    const img = document.createElement('img');
    img.src = `assets/cards/${svgFilename}`;
    img.alt = `${card.rank} of ${SUIT_NAMES[card.suit]}`;
    img.className = 'card-svg';
    img.draggable = false;

    el.appendChild(img);

    return el;
  }

  /**
   * Render a card on the trick pile
   * @param {Card} card - Card to render
   * @param {number} playerIndex - Player who played the card (0-3)
   */
  renderTrickCard(card, playerIndex) {
    const el = this.createCardElement(card);

    // Use CSS classes for positioning
    el.classList.add(`trick-pos-${playerIndex}`);

    this.elements.trickPile.appendChild(el);
  }

  /**
   * Generate a unique key for a hand to use for memoization
   * @param {Card[]} hand - Array of cards
   * @returns {string} Unique key representing the hand state
   */
  generateHandKey(hand) {
    if (!hand || hand.length === 0) return '';
    return hand.map(card => `${card.suit}${card.rank}`).join(',');
  }

  /**
   * Render all players' hands with memoization to avoid unnecessary re-renders
   * @param {Array} hands - Array of hands for each player
   * @param {Object} options - Rendering options
   * @param {boolean} options.force - Force re-render even if hand unchanged
   */
  renderHands(hands, options = {}) {
    const humanHand = hands[0];
    const handKey = this.generateHandKey(humanHand);

    // Skip re-render if hand hasn't changed (memoization)
    if (!options.force && handKey === this.lastRenderedHandKey && !this.selectionMode) {
      return;
    }

    this.currentHand = humanHand;
    this.lastRenderedHandKey = handKey;

    const container = this.elements.humanHand;
    container.innerHTML = '';

    const cardCount = humanHand.length;
    const useArcLayout = cardCount > 8;

    // Toggle arc layout class
    container.classList.toggle('arc-layout', useArcLayout);

    humanHand.forEach((card, index) => {
      const el = this.createCardElement(card);
      el.dataset.index = index;
      el.dataset.suit = card.suit;
      el.dataset.rank = card.rank;

      // Apply arc positioning when many cards
      if (useArcLayout) {
        const centerIndex = (cardCount - 1) / 2;
        const distanceFromCenter = index - centerIndex;
        // Max rotation spread: ~3 degrees per card from center
        const rotation = distanceFromCenter * 3;
        // Vertical offset creates the arc curve (parabolic)
        const translateY = Math.abs(distanceFromCenter) * Math.abs(distanceFromCenter) * 2;
        
        el.style.setProperty('--arc-rotation', rotation);
        el.style.setProperty('--arc-translate-y', `${translateY}px`);
      }

      // Card click will be handled by enableCardSelection when appropriate
      container.appendChild(el);
    });
  }

  /**
   * Enable card selection mode
   * @param {Object} data - Selection data (hand, validMoves, mode, count)
   */
  enableCardSelection(data) {
    const { hand, validMoves, mode, count } = data;
    this.selectionMode = mode;
    this.selectedCards.clear();

    // Reset keyboard navigation state
    this.focusedCardIndex = -1;
    this.validCardIndices = [];

    // Build list of valid card indices for keyboard navigation
    hand.forEach((card, index) => {
      const isValid = validMoves.some(
        c => c.suit === card.suit && c.rank === card.rank
      );
      if (isValid) {
        this.validCardIndices.push(index);
      }
    });

    if (mode === 'pass') {
      // Show pass modal
      this.elements.passModal.classList.remove('hidden');
      this.elements.confirmPassBtn.disabled = true;

      // Render hand with selection enabled
      this.renderHandsWithSelection(hand, hand, count || 3);
    } else if (mode === 'play') {
      // Play mode - single card selection
      this.renderHandsWithSelection(hand, validMoves, 1);
    }

    // Don't auto-focus - let keyboard users initiate navigation with arrow keys
    // This avoids confusing mouse users with the focus indicator
  }

  /**
   * Render hands with click handlers for selection
   * @param {Card[]} hand - Player's hand
   * @param {Card[]} validCards - Cards that can be selected
   * @param {number} maxSelection - Max number of cards to select
   */
  renderHandsWithSelection(hand, validCards, maxSelection) {
    this.currentHand = hand; // Store for later reference
    const container = this.elements.humanHand;
    container.innerHTML = '';

    // Add ARIA attributes to container
    container.setAttribute('role', 'listbox');
    container.setAttribute('aria-label',
      this.selectionMode === 'pass'
        ? 'Select 3 cards to pass. Use arrow keys to navigate, Enter or Space to select.'
        : 'Select a card to play. Use arrow keys to navigate, Enter or Space to select.'
    );
    container.setAttribute('aria-multiselectable', this.selectionMode === 'pass' ? 'true' : 'false');

    // Separate cards into playable and non-playable
    const playableCards = [];
    const nonPlayableCards = [];

    hand.forEach((card, index) => {
      const isValid = validCards.some(
        c => c.suit === card.suit && c.rank === card.rank
      );
      if (isValid) {
        playableCards.push({ card, index });
      } else {
        nonPlayableCards.push({ card, index });
      }
    });

    // Single row mode - all cards in one row
    container.classList.remove('two-row-mode');

    // Arc layout for many cards
    const cardCount = hand.length;
    const useArcLayout = cardCount > 8;
    container.classList.toggle('arc-layout', useArcLayout);

    hand.forEach((card, index) => {
      const isValid = validCards.some(
        c => c.suit === card.suit && c.rank === card.rank
      );
      const el = this.createSelectableCardElement(card, index, isValid, maxSelection);

      // Apply arc positioning when many cards
      if (useArcLayout) {
        const centerIndex = (cardCount - 1) / 2;
        const distanceFromCenter = index - centerIndex;
        const rotation = distanceFromCenter * 3;
        const translateY = Math.abs(distanceFromCenter) * Math.abs(distanceFromCenter) * 2;
        
        el.style.setProperty('--arc-rotation', rotation);
        el.style.setProperty('--arc-translate-y', `${translateY}px`);
      }

      container.appendChild(el);
    });
  }

  /**
   * Create a card element with selection handling
   * @param {Card} card - Card object
   * @param {number} index - Index in hand
   * @param {boolean} isValid - Whether card can be selected
   * @param {number} maxSelection - Max cards to select
   * @returns {HTMLElement} Card element
   */
  createSelectableCardElement(card, index, isValid, maxSelection) {
    const el = this.createCardElement(card);
    el.dataset.index = index;
    el.dataset.suit = card.suit;
    el.dataset.rank = card.rank;

    // Add ARIA attributes for accessibility
    el.setAttribute('role', 'option');
    el.setAttribute('aria-label', `${card.rank} of ${SUIT_NAMES[card.suit]}`);
    el.setAttribute('aria-selected', 'false');
    el.setAttribute('tabindex', isValid ? '0' : '-1');

    if (!isValid) {
      el.classList.add('disabled');
      el.setAttribute('aria-disabled', 'true');
    }

    el.onclick = () => {
      if (!isValid) return;

      if (this.selectionMode === 'pass') {
        // Multi-selection for passing
        const cardKey = `${card.suit}${card.rank}`;

        if (this.selectedCards.has(cardKey)) {
          this.selectedCards.delete(cardKey);
          el.classList.remove('selected');
          el.setAttribute('aria-selected', 'false');
        } else {
          if (this.selectedCards.size < maxSelection) {
            this.selectedCards.add(cardKey);
            el.classList.add('selected');
            el.setAttribute('aria-selected', 'true');
          }
        }

        // Update button state
        this.elements.confirmPassBtn.disabled = (this.selectedCards.size !== maxSelection);
      } else if (this.selectionMode === 'play') {
        // Single selection for playing
        this.inputController.handleCardClick(card);
      }
    };

    return el;
  }

  /**
   * Disable card selection mode
   */
  disableCardSelection() {
    this.selectionMode = null;
    this.selectedCards.clear();

    // Clear keyboard navigation state
    this.clearFocus();
    this.validCardIndices = [];

    // Remove two-row mode class
    this.elements.humanHand.classList.remove('two-row-mode');

    // Clear memoization to force re-render without selection handlers
    this.lastRenderedHandKey = null;

    // Re-render hand without selection handlers
    if (this.currentHand) {
      this.renderHands([this.currentHand], { force: true });
    }
  }

  /**
   * Update status message
   * @param {string} message - Status message
   */
  updateStatus(message) {
    if (this.elements.status) {
      this.elements.status.textContent = message;
    }
  }

  /**
   * Show or hide pass modal
   * @param {boolean} show - Whether to show modal
   * @param {boolean} enabled - Whether pass button is enabled
   */
  showPassModal(show, enabled) {
    if (show) {
      this.elements.passModal.classList.remove('hidden');
      this.elements.confirmPassBtn.disabled = !enabled;
    } else {
      this.elements.passModal.classList.add('hidden');
      this.selectedCards.clear();
    }
  }

  /**
   * Update scoreboard display
   * @param {Object} data - Score data
   */
  updateScoreboard(data) {
    const { players } = data;

    const list = this.elements.scoresList;
    list.innerHTML = '';

    players.forEach((player, i) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.color = (i === 0) ? 'var(--accent-gold)' : 'white';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = player.name;

      const scoreSpan = document.createElement('span');
      scoreSpan.textContent = `${player.score} (${player.currentRoundPoints})`;

      row.appendChild(nameSpan);
      row.appendChild(scoreSpan);
      list.appendChild(row);
    });

    this.elements.scoreboard.classList.remove('hidden');

    // Update player score displays
    this.updatePlayerScoreDisplays(players);
  }

  /**
   * Update individual player score displays
   * @param {Array} players - Array of player objects
   */
  updatePlayerScoreDisplays(players) {
    players.forEach((player, index) => {
      const scoreElement = document.querySelector(`.hand-summary[data-player-index="${index}"]`);
      if (scoreElement) {
        const totalScore = player.score;
        const roundScore = player.currentRoundPoints;
        if (roundScore > 0) {
          scoreElement.textContent = `${totalScore} pts (+${roundScore})`;
        } else {
          scoreElement.textContent = `${totalScore} pts`;
        }
      }
    });
  }

  /**
   * Show game over modal
   * @param {Object} results - Game results data
   */
  showGameOver(results) {
    const { loserPlayer, myTeamLost, players } = results;

    const msg = myTeamLost ? "DEFEAT" : "VICTORY";
    const color = myTeamLost ? "red" : "gold";

    const modal = this.elements.gameOverModal;
    const resultsDiv = this.elements.finalResults;
    const restartBtn = this.elements.restartBtn;

    // Build results HTML using DOM methods to avoid XSS
    resultsDiv.innerHTML = '';

    const title = document.createElement('h1');
    title.style.color = color;
    title.textContent = msg;
    resultsDiv.appendChild(title);

    const loserText = document.createElement('p');
    loserText.textContent = `${loserPlayer.name} crossed the limit with ${loserPlayer.score} points.`;
    resultsDiv.appendChild(loserText);

    const scoresTitle = document.createElement('h3');
    scoresTitle.textContent = 'Final Scores:';
    resultsDiv.appendChild(scoresTitle);

    players.forEach(p => {
      const scoreDiv = document.createElement('div');
      scoreDiv.textContent = `${p.name}: ${p.score}`;
      resultsDiv.appendChild(scoreDiv);
    });

    modal.classList.remove('hidden');
    this.elements.modalOverlay.classList.remove('hidden');

    // Restart callback will be set by main.js or game controller
    restartBtn.onclick = () => {
      modal.classList.add('hidden');
      this.elements.modalOverlay.classList.add('hidden');
      this.events.emit('GAME_RESTART_REQUESTED');
    };
  }

  /**
   * Animate trick cards being collected by the winner
   * @param {number} winnerIndex - Index of the winning player (0-3)
   */
  animateTrickCollection(winnerIndex) {
    const cards = this.elements.trickPile.querySelectorAll('.card');
    if (cards.length === 0) return;

    const target = CARD_DISPLAY.COLLECTION_OFFSETS[winnerIndex];

    // Animate each card toward the winner
    cards.forEach((card) => {
      // Extract player index from trick-pos-X class to get original position
      let currentX = 0, currentY = 0;
      for (let i = 0; i <= 3; i++) {
        if (card.classList.contains(`trick-pos-${i}`)) {
          const pos = CARD_DISPLAY.TRICK_POSITIONS[i];
          currentX = pos.x;
          currentY = pos.y;
          break;
        }
      }

      // Calculate new position (move toward winner)
      const newX = currentX + target.x;
      const newY = currentY + target.y;

      // Apply the animation
      card.style.transform = `translate(calc(-50% + ${newX}px), calc(-50% + ${newY}px)) scale(0.8)`;
      card.classList.add('collecting');
    });
  }

  /**
   * Clear the trick pile
   */
  clearTrickPile() {
    if (this.elements.trickPile) {
      this.elements.trickPile.innerHTML = '';
    }
  }
}

/**
 * Headless renderer for simulations (no-op implementations)
 */
export class HeadlessRenderer extends GameRenderer {
  initialize() {
    // No-op
  }

  renderHands(handsData, options) {
    // No-op
  }

  renderTrickCard(card, playerIndex, position) {
    // No-op
  }

  updateStatus(message) {
    // No-op
  }

  showPassModal(show, enabled) {
    // No-op
  }

  updateScoreboard(scores) {
    // No-op
  }

  showGameOver(results) {
    // No-op
  }

  clearTrickPile() {
    // No-op
  }
}
