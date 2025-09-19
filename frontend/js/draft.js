// Global draft state
let draftState = new DraftState();

// Initialize the draft page
function initializeDraft() {
    draftState.initializeSlots();

    // Set up event listeners
    setupEventListeners();

    // Render all zones
    renderZones();

    // Load initial data (mock for now, will connect to API)
    loadMockData();
}

// Render all card zones
function renderZones() {
    renderHand();
    renderPack();
    renderSideboard();
    renderUpgrades();
    renderTreasures();
    renderPlayers();
}

// Render hand zone
function renderHand() {
    const handElement = document.getElementById('hand');
    handElement.innerHTML = '';

    draftState.slots.hand.forEach(slot => {
        if (!slot.isEmpty || slot.position < 3) { // Always show at least 3 slots
            const slotElement = slot.render();
            handElement.appendChild(slotElement);
            addSlotEventListeners(slotElement, slot);
        }
    });
}

// Render pack zone
function renderPack() {
    const packElement = document.getElementById('pack');
    packElement.innerHTML = '';

    draftState.slots.pack.forEach(slot => {
        const slotElement = slot.render();
        packElement.appendChild(slotElement);
        addSlotEventListeners(slotElement, slot);
    });
}

// Render sideboard zone
function renderSideboard() {
    const sideboardElement = document.getElementById('sideboard');
    sideboardElement.innerHTML = '';

    draftState.slots.sideboard.forEach(slot => {
        const slotElement = slot.render();
        sideboardElement.appendChild(slotElement);
        addSlotEventListeners(slotElement, slot);
    });
}

// Render upgrades
function renderUpgrades() {
    const upgradesElement = document.getElementById('upgrades');
    upgradesElement.innerHTML = '';

    draftState.slots.upgrades.forEach(slot => {
        if (!slot.isEmpty) {
            const upgradeCard = document.createElement('div');
            upgradeCard.className = 'upgrade-card';
            upgradeCard.innerHTML = `
                <img src="${slot.card.image_url}" alt="${slot.card.name}">
                <div class="upgrade-info">
                    <div class="upgrade-name">${slot.card.name}</div>
                    <button class="apply-button" data-slot-id="${slot.id}">Apply</button>
                </div>
            `;
            upgradesElement.appendChild(upgradeCard);

            // Add apply button listener
            const applyBtn = upgradeCard.querySelector('.apply-button');
            applyBtn.addEventListener('click', () => startUpgradeApplication(slot.id));
        }
    });
}

// Render treasures
function renderTreasures() {
    document.getElementById('treasure-count').textContent = draftState.treasures;
    const rollButton = document.getElementById('roll-button');
    rollButton.disabled = draftState.treasures === 0;
}

// Render players list
function renderPlayers() {
    const playersListElement = document.getElementById('players-list');
    playersListElement.innerHTML = '';

    // Sort players by poison (lowest first)
    const sortedPlayers = [...draftState.players].sort((a, b) => {
        if (a.poison === b.poison) {
            return a.name.localeCompare(b.name);
        }
        return a.poison - b.poison;
    });

    sortedPlayers.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        if (player === draftState.currentPlayer) {
            playerItem.classList.add('selected');
        }

        playerItem.innerHTML = `
            <div class="player-avatar">${player.avatar}</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-poison">☠️ ${player.poison} poison</div>
            </div>
        `;

        playerItem.addEventListener('click', () => showPlayerDetails(player));
        playersListElement.appendChild(playerItem);
    });
}

// Show player details
function showPlayerDetails(player) {
    draftState.currentPlayer = player;
    renderPlayers(); // Re-render to update selection

    const detailsElement = document.getElementById('player-details');
    detailsElement.innerHTML = `
        <h3>${player.name}'s Recent Battle</h3>
        <div class="revealed-cards">
            ${player.mostRecentlyRevealedCards.map(card => `
                <div class="revealed-card">
                    <img src="${card.image_url}" alt="${card.name}">
                </div>
            `).join('')}
        </div>
    `;

    if (player.mostRecentlyRevealedCards.length === 0) {
        detailsElement.innerHTML += '<p>No cards revealed yet</p>';
    }
}

// Add event listeners to card slots
function addSlotEventListeners(element, slot) {
    element.addEventListener('click', () => handleSlotClick(slot));
}

// Handle slot click for swapping
function handleSlotClick(slot) {
    // If applying upgrade, handle that instead
    if (draftState.applyingUpgrade) {
        if (slot.card && !slot.card.isUpgrade) {
            if (draftState.applyUpgradeToCard(draftState.applyingUpgrade, slot.id)) {
                console.log(`Applied upgrade to ${slot.card.name}`);
                draftState.applyingUpgrade = null;
                clearSwapButtons();
                renderUpgrades();
                renderZones();
            }
        }
        return;
    }

    // Handle card swapping - allow swapping between empty and filled slots
    // Empty slots can receive cards, filled slots can be swapped
    if (!draftState.selectedSlot) {
        // First selection - must have a card
        if (!slot.isEmpty && slot.card && !slot.card.isUpgrade) {
            draftState.selectedSlot = slot;
            slot.element.classList.add('selected');
            showSwapButtons();
        }
    } else if (draftState.selectedSlot === slot) {
        // Deselect
        clearSelection();
    } else {
        // Perform swap (allow swapping to empty slots)
        if (draftState.swapCards(draftState.selectedSlot.id, slot.id)) {
            console.log(`Swapped ${draftState.selectedSlot.id} with ${slot.id}`);
        }
        clearSelection();
    }
}

// Show swap buttons on eligible cards
function showSwapButtons() {
    clearSwapButtons();

    Object.values(draftState.slots).forEach(zoneSlots => {
        zoneSlots.forEach(slot => {
            // Show swap button on any slot that isn't the selected one (including empty slots)
            if (slot !== draftState.selectedSlot && slot.element && slot.zone !== 'upgrades') {
                const swapBtn = document.createElement('button');
                swapBtn.className = 'swap-button';
                swapBtn.textContent = 'Swap';
                swapBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleSlotClick(slot);
                });
                slot.element.appendChild(swapBtn);
            }
        });
    });
}

// Clear swap buttons
function clearSwapButtons() {
    document.querySelectorAll('.swap-button').forEach(btn => btn.remove());
}

// Clear selection
function clearSelection() {
    if (draftState.selectedSlot?.element) {
        draftState.selectedSlot.element.classList.remove('selected');
    }
    draftState.selectedSlot = null;
    draftState.applyingUpgrade = null;
    clearSwapButtons();
}

// Start upgrade application
function startUpgradeApplication(upgradeSlotId) {
    clearSelection();
    draftState.applyingUpgrade = upgradeSlotId;

    // Highlight valid targets
    Object.values(draftState.slots).forEach(zoneSlots => {
        zoneSlots.forEach(slot => {
            if (slot.card && !slot.card.isUpgrade && slot.element) {
                slot.element.style.border = '2px solid #9C27B0';
                slot.element.style.cursor = 'pointer';
            }
        });
    });
}

// Setup global event listeners
function setupEventListeners() {
    // Roll button
    document.getElementById('roll-button').addEventListener('click', handleRoll);

    // Click anywhere else to clear selection
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-slot') &&
            !e.target.closest('.swap-button') &&
            !e.target.closest('.apply-button')) {
            clearSelection();
        }
    });
}

// Handle treasure roll
async function handleRoll() {
    if (draftState.treasures > 0) {
        draftState.treasures--;
        renderTreasures();

        // Generate 5 completely new random cards for the pack
        const allPossibleCards = [
            { id: Math.random().toString(), name: 'Brainstorm', image_url: 'https://cards.scryfall.io/normal/front/4/8/48070245-1370-4cf1-be15-d4e8a8b92ba8.jpg', type_line: 'Instant' },
            { id: Math.random().toString(), name: 'Swords to Plowshares', image_url: 'https://cards.scryfall.io/normal/front/e/5/e58e681e-a069-4414-aafe-634c7987fd0d.jpg', type_line: 'Instant' },
            { id: Math.random().toString(), name: 'Path to Exile', image_url: 'https://cards.scryfall.io/normal/front/9/d/9d607a40-608a-44cd-b946-02636b5bea9f.jpg', type_line: 'Instant' },
            { id: Math.random().toString(), name: 'Thoughtseize', image_url: 'https://cards.scryfall.io/normal/front/b/2/b281a308-ab6b-47b6-bec7-632c9aaecede.jpg', type_line: 'Sorcery' },
            { id: Math.random().toString(), name: 'Ponder', image_url: 'https://cards.scryfall.io/normal/front/4/4/44dcfc0c-b23d-48be-bf3a-a6fc6806c5e1.jpg', type_line: 'Sorcery' },
            { id: Math.random().toString(), name: 'Preordain', image_url: 'https://cards.scryfall.io/normal/front/d/1/d10b9be3-d4ff-4e3c-b0d5-5ab2c4e6d684.jpg', type_line: 'Sorcery' },
            { id: Math.random().toString(), name: 'Doom Blade', image_url: 'https://cards.scryfall.io/normal/front/9/0/90699423-2556-40f7-b8f5-c9d82f22d52e.jpg', type_line: 'Instant' },
            { id: Math.random().toString(), name: 'Mana Leak', image_url: 'https://cards.scryfall.io/normal/front/1/7/179236d9-6fe2-4db6-bdfb-f851e8d531a2.jpg', type_line: 'Instant' },
            { id: Math.random().toString(), name: 'Rampant Growth', image_url: 'https://cards.scryfall.io/normal/front/8/9/89572b1f-f65a-4bd4-b52a-4e84eb373e90.jpg', type_line: 'Sorcery' },
            { id: Math.random().toString(), name: 'Wrath of God', image_url: 'https://cards.scryfall.io/normal/front/6/6/664e6656-36a3-4635-9f33-9f8901afd397.jpg', type_line: 'Sorcery' }
        ];

        // Randomly select 5 cards
        const newPack = [];
        for (let i = 0; i < 5; i++) {
            const randomIndex = Math.floor(Math.random() * allPossibleCards.length);
            newPack.push(allPossibleCards[randomIndex]);
        }

        // Clear and set new pack
        draftState.slots.pack.forEach((slot, i) => {
            if (i < newPack.length) {
                slot.setCard(new Card(newPack[i]));
            } else {
                slot.setCard(null);
            }
        });

        renderPack();
    }
}

// Load mock data for testing
function loadMockData() {
    // Mock cards
    const mockCards = [
        { id: '1', name: 'Lightning Bolt', image_url: 'https://cards.scryfall.io/normal/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb214a7.jpg', type_line: 'Instant' },
        { id: '2', name: 'Counterspell', image_url: 'https://cards.scryfall.io/normal/front/8/4/8493131c-0a7b-4be6-a8a2-0b425f4f67fb.jpg', type_line: 'Instant' },
        { id: '3', name: 'Dark Ritual', image_url: 'https://cards.scryfall.io/normal/front/9/5/95f27eeb-6f14-4db3-adb9-9be5ed76b34b.jpg', type_line: 'Instant' }
    ];

    const mockPackCards = [
        { id: '4', name: 'Giant Growth', image_url: 'https://cards.scryfall.io/normal/front/0/6/06ec9e8b-4bd8-4caf-a559-6514b7ab4ca4.jpg', type_line: 'Instant' },
        { id: '5', name: 'Shock', image_url: 'https://cards.scryfall.io/normal/front/5/9/59fa8e8d-4754-43e4-936e-d34e5eb1c2fc.jpg', type_line: 'Instant' },
        { id: '6', name: 'Opt', image_url: 'https://cards.scryfall.io/normal/front/3/2/323db259-d35e-467d-9a46-4adcb2fc107c.jpg', type_line: 'Instant' },
        { id: '7', name: 'Duress', image_url: 'https://cards.scryfall.io/normal/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg', type_line: 'Sorcery' },
        { id: '8', name: 'Negate', image_url: 'https://cards.scryfall.io/normal/front/4/0/4016c6f7-7cb4-46c2-af73-3bd6d682ea5e.jpg', type_line: 'Instant' }
    ];

    const mockUpgrades = [
        { id: '9', name: 'Power Play', image_url: 'https://cards.scryfall.io/normal/front/7/4/74fa5b3f-42ec-4eea-9f77-91c08e521a56.jpg', type_line: 'Conspiracy' },
        { id: '10', name: 'Secret Summoning', image_url: 'https://cards.scryfall.io/normal/front/8/7/87bae0f5-30a1-4449-99ec-da4e3b7e8279.jpg', type_line: 'Conspiracy' }
    ];

    // Mock revealed cards for players
    const revealedCards = [
        { id: 'r1', name: 'Sol Ring', image_url: 'https://cards.scryfall.io/normal/front/3/3/33773feb-5b49-4d44-adca-93b99009acc0.jpg', type_line: 'Artifact' },
        { id: 'r2', name: 'Birds of Paradise', image_url: 'https://cards.scryfall.io/normal/front/f/e/feefe9f0-24a6-461c-9ef1-86c5a6f33b83.jpg', type_line: 'Creature' },
        { id: 'r3', name: 'Ancestral Recall', image_url: 'https://cards.scryfall.io/normal/front/2/3/2398892d-28e9-4009-81ec-0d544af79d2b.jpg', type_line: 'Instant' }
    ];

    const mockPlayers = [
        new Player({
            name: 'Alice',
            poison: 2,
            treasures: 3,
            most_recently_revealed_cards: [revealedCards[0], revealedCards[1]]
        }),
        new Player({
            name: 'Bob',
            poison: 0,
            treasures: 1,
            most_recently_revealed_cards: [revealedCards[2]]
        }),
        new Player({
            name: 'Charlie',
            poison: 4,
            treasures: 2,
            most_recently_revealed_cards: [revealedCards[0], revealedCards[1], revealedCards[2]]
        }),
        new Player({
            name: 'Diana',
            poison: 1,
            treasures: 0,
            most_recently_revealed_cards: []
        })
    ];

    // Set data to draft state
    draftState.setHandCards(mockCards);
    draftState.setPackCards(mockPackCards);
    draftState.setUpgrades(mockUpgrades);
    draftState.players = mockPlayers;
    draftState.currentPlayer = mockPlayers[0];
    draftState.treasures = 3;

    // Render everything
    renderZones();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeDraft);