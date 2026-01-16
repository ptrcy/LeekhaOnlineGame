import { GameEvents } from './events.js';

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
      restartBtn: null
    };

    // State for rendering
    this.currentHand = null;
    this.selectionMode = null;
    this.selectedCards = new Set();
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
    });

    this.events.on(GameEvents.TRICK_COMPLETE, (data) => {
      this.animateTrickCollection(data.winnerIndex);
    });

    this.events.on(GameEvents.TRICK_PILE_CLEAR, () => {
      this.clearTrickPile();
    });

    this.events.on(GameEvents.SCORE_UPDATED, (data) => {
      this.updateScoreboard(data);
    });

    this.events.on(GameEvents.GAME_OVER, (data) => {
      this.showGameOver(data);
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
  }

  /**
   * Create a card DOM element
   * @param {Card} card - Card object
   * @returns {HTMLElement} Card element
   */
  createCardElement(card) {
    const el = document.createElement('div');
    el.className = `card ${card.color}`;

    const suitIcons = { 'H': '♥', 'D': '♦', 'S': '♠', 'C': '♣' };
    const suit = suitIcons[card.suit];

    // Top-left corner
    const topLeft = document.createElement('div');
    topLeft.className = 'card-corner top-left';
    const topRankSpan = document.createElement('span');
    topRankSpan.className = 'card-rank';
    topRankSpan.textContent = card.rank;
    const topSuitSpan = document.createElement('span');
    topSuitSpan.className = 'card-suit';
    topSuitSpan.textContent = suit;
    topLeft.appendChild(topRankSpan);
    topLeft.appendChild(topSuitSpan);

    // Center suit
    const center = document.createElement('div');
    center.className = 'card-center';
    center.textContent = suit;

    // Bottom-right corner
    const bottomRight = document.createElement('div');
    bottomRight.className = 'card-corner bottom-right';
    const bottomRankSpan = document.createElement('span');
    bottomRankSpan.className = 'card-rank';
    bottomRankSpan.textContent = card.rank;
    const bottomSuitSpan = document.createElement('span');
    bottomSuitSpan.className = 'card-suit';
    bottomSuitSpan.textContent = suit;
    bottomRight.appendChild(bottomRankSpan);
    bottomRight.appendChild(bottomSuitSpan);

    el.appendChild(topLeft);
    el.appendChild(center);
    el.appendChild(bottomRight);

    return el;
  }

  /**
   * Render a card on the trick pile
   * @param {Card} card - Card to render
   * @param {number} playerIndex - Player who played the card (0-3)
   */
  renderTrickCard(card, playerIndex) {
    const el = this.createCardElement(card);
    el.style.position = 'absolute';

    // Get card dimensions from CSS variables
    const cardWidth = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--card-width')) || 90;
    const cardHeight = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--card-height')) || 126;

    // Spacing from center
    const spacing = 80;

    // Fixed positions with minimal rotation
    const positions = [
      { x: 0, y: spacing, rotation: 0 },        // Bottom - You
      { x: spacing, y: 0, rotation: 5 },        // Right - East
      { x: 0, y: -spacing, rotation: 0 },      // Top - Partner
      { x: -spacing, y: 0, rotation: -5 }      // Left - West
    ];

    const pos = positions[playerIndex];

    // Center the card and apply position
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.transform = `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) rotate(${pos.rotation}deg)`;

    // Add z-index so later cards appear on top
    el.style.zIndex = playerIndex + 1;

    this.elements.trickPile.appendChild(el);
  }

  /**
   * Render all players' hands
   * @param {Array} hands - Array of hands for each player
   * @param {Object} options - Rendering options
   */
  renderHands(hands, options = {}) {
    const humanHand = hands[0];
    this.currentHand = humanHand;

    const container = this.elements.humanHand;
    container.innerHTML = '';

    humanHand.forEach((card, index) => {
      const el = this.createCardElement(card);
      el.dataset.index = index;
      el.dataset.suit = card.suit;
      el.dataset.rank = card.rank;

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

    hand.forEach((card, index) => {
      const el = this.createCardElement(card);
      el.dataset.index = index;
      el.dataset.suit = card.suit;
      el.dataset.rank = card.rank;

      const isValid = validCards.some(
        c => c.suit === card.suit && c.rank === card.rank
      );

      if (!isValid) {
        el.classList.add('disabled');
      }

      el.onclick = () => {
        if (!isValid) return;

        if (this.selectionMode === 'pass') {
          // Multi-selection for passing
          const cardKey = `${card.suit}${card.rank}`;

          if (this.selectedCards.has(cardKey)) {
            this.selectedCards.delete(cardKey);
            el.classList.remove('selected');
          } else {
            if (this.selectedCards.size < maxSelection) {
              this.selectedCards.add(cardKey);
              el.classList.add('selected');
            }
          }

          // Update button state
          this.elements.confirmPassBtn.disabled = (this.selectedCards.size !== maxSelection);
        } else if (this.selectionMode === 'play') {
          // Single selection for playing
          this.inputController.handleCardClick(card);
        }
      };

      container.appendChild(el);
    });
  }

  /**
   * Disable card selection mode
   */
  disableCardSelection() {
    this.selectionMode = null;
    this.selectedCards.clear();

    // Re-render hand without selection handlers
    if (this.currentHand) {
      this.renderHands([this.currentHand]);
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

    // Define target positions for each player (where cards should fly to)
    // These are offsets from center, moving cards toward player positions
    const targetOffsets = [
      { x: 0, y: 200 },     // Bottom (You) - move down
      { x: 250, y: 0 },     // Right (East) - move right
      { x: 0, y: -200 },    // Top (Partner) - move up
      { x: -250, y: 0 }     // Left (West) - move left
    ];

    const target = targetOffsets[winnerIndex];

    // Animate each card toward the winner
    cards.forEach((card) => {
      // Get current transform and add the collection offset
      const currentTransform = card.style.transform;
      // Extract the current translate values
      const match = currentTransform.match(/translate\(calc\(-50% \+ ([-\d.]+)px\), calc\(-50% \+ ([-\d.]+)px\)\)/);

      let currentX = 0, currentY = 0;
      if (match) {
        currentX = parseFloat(match[1]);
        currentY = parseFloat(match[2]);
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
