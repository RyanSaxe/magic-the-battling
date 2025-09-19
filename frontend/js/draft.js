let draftState = new DraftState();

// Mock card data
const MOCK_CARDS = {
    hand: [
        { id: '1', name: 'Lightning Bolt', image_url: 'https://cards.scryfall.io/normal/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb214a7.jpg', type_line: 'Instant' },
        { id: '2', name: 'Counterspell', image_url: 'https://cards.scryfall.io/normal/front/8/4/8493131c-0a7b-4be6-a8a2-0b425f4f67fb.jpg', type_line: 'Instant' },
        { id: '3', name: 'Dark Ritual', image_url: 'https://cards.scryfall.io/normal/front/9/5/95f27eeb-6f14-4db3-adb9-9be5ed76b34b.jpg', type_line: 'Instant' }
    ],
    pack: [
        { id: '4', name: 'Giant Growth', image_url: 'https://cards.scryfall.io/normal/front/0/6/06ec9e8b-4bd8-4caf-a559-6514b7ab4ca4.jpg', type_line: 'Instant' },
        { id: '5', name: 'Shock', image_url: 'https://cards.scryfall.io/normal/front/5/9/59fa8e8d-4754-43e4-936e-d34e5eb1c2fc.jpg', type_line: 'Instant' },
        { id: '6', name: 'Opt', image_url: 'https://cards.scryfall.io/normal/front/3/2/323db259-d35e-467d-9a46-4adcb2fc107c.jpg', type_line: 'Instant' },
        { id: '7', name: 'Duress', image_url: 'https://cards.scryfall.io/normal/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg', type_line: 'Sorcery' },
        { id: '8', name: 'Negate', image_url: 'https://cards.scryfall.io/normal/front/4/0/4016c6f7-7cb4-46c2-af73-3bd6d682ea5e.jpg', type_line: 'Instant' }
    ],
    upgrades: [
        { id: '9', name: 'Power Play', image_url: 'https://cards.scryfall.io/normal/front/7/4/74fa5b3f-42ec-4eea-9f77-91c08e521a56.jpg', type_line: 'Conspiracy' },
        { id: '10', name: 'Secret Summoning', image_url: 'https://cards.scryfall.io/normal/front/8/7/87bae0f5-30a1-4449-99ec-da4e3b7e8279.jpg', type_line: 'Conspiracy' }
    ],
    rollPool: [
        { name: 'Brainstorm', image_url: 'https://cards.scryfall.io/normal/front/4/8/48070245-1370-4cf1-be15-d4e8a8b92ba8.jpg', type_line: 'Instant' },
        { name: 'Swords to Plowshares', image_url: 'https://cards.scryfall.io/normal/front/e/5/e58e681e-a069-4414-aafe-634c7987fd0d.jpg', type_line: 'Instant' },
        { name: 'Path to Exile', image_url: 'https://cards.scryfall.io/normal/front/9/d/9d607a40-608a-44cd-b946-02636b5bea9f.jpg', type_line: 'Instant' },
        { name: 'Thoughtseize', image_url: 'https://cards.scryfall.io/normal/front/b/2/b281a308-ab6b-47b6-bec7-632c9aaecede.jpg', type_line: 'Sorcery' },
        { name: 'Ponder', image_url: 'https://cards.scryfall.io/normal/front/4/4/44dcfc0c-b23d-48be-bf3a-a6fc6806c5e1.jpg', type_line: 'Sorcery' },
        { name: 'Preordain', image_url: 'https://cards.scryfall.io/normal/front/d/1/d10b9be3-d4ff-4e3c-b0d5-5ab2c4e6d684.jpg', type_line: 'Sorcery' },
        { name: 'Doom Blade', image_url: 'https://cards.scryfall.io/normal/front/9/0/90699423-2556-40f7-b8f5-c9d82f22d52e.jpg', type_line: 'Instant' },
        { name: 'Mana Leak', image_url: 'https://cards.scryfall.io/normal/front/1/7/179236d9-6fe2-4db6-bdfb-f851e8d531a2.jpg', type_line: 'Instant' },
        { name: 'Rampant Growth', image_url: 'https://cards.scryfall.io/normal/front/8/9/89572b1f-f65a-4bd4-b52a-4e84eb373e90.jpg', type_line: 'Sorcery' },
        { name: 'Wrath of God', image_url: 'https://cards.scryfall.io/normal/front/6/6/664e6656-36a3-4635-9f33-9f8901afd397.jpg', type_line: 'Sorcery' }
    ]
};

const REVEALED_CARDS = [
    { id: 'r1', name: 'Sol Ring', image_url: 'https://cards.scryfall.io/normal/front/3/3/33773feb-5b49-4d44-adca-93b99009acc0.jpg', type_line: 'Artifact' },
    { id: 'r2', name: 'Birds of Paradise', image_url: 'https://cards.scryfall.io/normal/front/f/e/feefe9f0-24a6-461c-9ef1-86c5a6f33b83.jpg', type_line: 'Creature' },
    { id: 'r3', name: 'Ancestral Recall', image_url: 'https://cards.scryfall.io/normal/front/2/3/2398892d-28e9-4009-81ec-0d544af79d2b.jpg', type_line: 'Instant' }
];

// Initialize
function initializeDraft() {
    draftState.initializeSlots();
    setupEventListeners();
    loadMockData();
    renderAll();
}

function renderAll() {
    renderZone('hand');
    renderZone('pack');
    renderZone('sideboard');
    renderUpgrades();
    renderTreasures();
    renderPlayers();
}

function renderZone(zoneName) {
    const element = document.getElementById(zoneName);
    element.innerHTML = '';

    draftState.slots[zoneName].forEach(slot => {
        if (!slot.isEmpty || zoneName !== 'sideboard') {
            const slotElement = slot.render();
            element.appendChild(slotElement);
            slotElement.addEventListener('click', () => handleSlotClick(slot));
        }
    });
}

function renderUpgrades() {
    const element = document.getElementById('upgrades');
    element.innerHTML = '';

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
            element.appendChild(upgradeCard);

            upgradeCard.querySelector('.apply-button').addEventListener('click', () => {
                clearSelection();
                draftState.applyingUpgrade = slot.id;
                highlightTargets();
            });
        }
    });
}

function renderTreasures() {
    document.getElementById('treasure-count').textContent = draftState.treasures;
    document.getElementById('roll-button').disabled = draftState.treasures === 0;
}

function renderPlayers() {
    const element = document.getElementById('players-list');
    element.innerHTML = '';

    const sorted = [...draftState.players].sort((a, b) => {
        if (a.poison === b.poison) return a.name.localeCompare(b.name);
        return a.poison - b.poison;
    });

    sorted.forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-item';
        if (player === draftState.currentPlayer) item.classList.add('selected');

        item.innerHTML = `
            <div class="player-avatar">${player.avatar}</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-poison">☠️ ${player.poison} poison</div>
            </div>
        `;

        item.addEventListener('click', () => showPlayerDetails(player));
        element.appendChild(item);
    });
}

function showPlayerDetails(player) {
    draftState.currentPlayer = player;
    renderPlayers();

    const element = document.getElementById('player-details');
    element.innerHTML = `
        <h3>${player.name}'s Recent Battle</h3>
        <div class="revealed-cards">
            ${player.mostRecentlyRevealedCards.map(card =>
                `<div class="revealed-card"><img src="${card.image_url}" alt="${card.name}"></div>`
            ).join('')}
        </div>
    `;

    if (player.mostRecentlyRevealedCards.length === 0) {
        element.innerHTML += '<p>No cards revealed yet</p>';
    }
}

function handleSlotClick(slot) {
    if (draftState.applyingUpgrade) {
        if (slot.card && !slot.card.isUpgrade) {
            if (draftState.applyUpgradeToCard(draftState.applyingUpgrade, slot.id)) {
                draftState.applyingUpgrade = null;
                clearSelection();
                renderUpgrades();
                renderAll();
            }
        }
        return;
    }

    if (!draftState.selectedSlot) {
        if (!slot.isEmpty && slot.card && !slot.card.isUpgrade) {
            draftState.selectedSlot = slot;
            slot.element.classList.add('selected');
            showSwapButtons();
        }
    } else if (draftState.selectedSlot === slot) {
        clearSelection();
    } else {
        if (draftState.swapCards(draftState.selectedSlot.id, slot.id)) {
            clearSelection();
        }
    }
}

function showSwapButtons() {
    clearSwapButtons();

    Object.values(draftState.slots).forEach(zoneSlots => {
        zoneSlots.forEach(slot => {
            if (slot !== draftState.selectedSlot && slot.element && slot.zone !== 'upgrades') {
                const btn = document.createElement('button');
                btn.className = 'swap-button';
                btn.textContent = 'Swap';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleSlotClick(slot);
                });
                slot.element.appendChild(btn);
            }
        });
    });
}

function clearSwapButtons() {
    document.querySelectorAll('.swap-button').forEach(btn => btn.remove());
}

function clearSelection() {
    if (draftState.selectedSlot?.element) {
        draftState.selectedSlot.element.classList.remove('selected');
    }
    draftState.selectedSlot = null;
    draftState.applyingUpgrade = null;
    clearSwapButtons();

    // Clear highlight styles
    document.querySelectorAll('.card-slot').forEach(el => {
        el.style.border = '';
        el.style.cursor = '';
    });
}

function highlightTargets() {
    Object.values(draftState.slots).forEach(zoneSlots => {
        zoneSlots.forEach(slot => {
            if (slot.card && !slot.card.isUpgrade && slot.element) {
                slot.element.style.border = '2px solid #9C27B0';
                slot.element.style.cursor = 'pointer';
            }
        });
    });
}

function handleRoll() {
    if (draftState.treasures > 0) {
        draftState.treasures--;
        renderTreasures();

        // Generate new pack
        const newPack = [];
        for (let i = 0; i < 5; i++) {
            const card = MOCK_CARDS.rollPool[Math.floor(Math.random() * MOCK_CARDS.rollPool.length)];
            newPack.push({ ...card, id: Math.random().toString() });
        }

        // Update pack slots
        draftState.slots.pack.forEach((slot, i) => {
            slot.setCard(i < newPack.length ? new Card(newPack[i]) : null);
        });

        renderZone('pack');
    }
}

function setupEventListeners() {
    document.getElementById('roll-button').addEventListener('click', handleRoll);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-slot') &&
            !e.target.closest('.swap-button') &&
            !e.target.closest('.apply-button')) {
            clearSelection();
        }
    });
}

function loadMockData() {
    draftState.setCards('hand', MOCK_CARDS.hand);
    draftState.setCards('pack', MOCK_CARDS.pack);
    draftState.setCards('upgrades', MOCK_CARDS.upgrades);
    draftState.treasures = 3;

    draftState.players = [
        new Player({ name: 'Alice', poison: 2, treasures: 3, most_recently_revealed_cards: [REVEALED_CARDS[0], REVEALED_CARDS[1]] }),
        new Player({ name: 'Bob', poison: 0, treasures: 1, most_recently_revealed_cards: [REVEALED_CARDS[2]] }),
        new Player({ name: 'Charlie', poison: 4, treasures: 2, most_recently_revealed_cards: REVEALED_CARDS }),
        new Player({ name: 'Diana', poison: 1, treasures: 0, most_recently_revealed_cards: [] })
    ];

    draftState.currentPlayer = draftState.players[0];
}

document.addEventListener('DOMContentLoaded', initializeDraft);