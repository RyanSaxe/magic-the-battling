// Card model
class Card {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.image_url = data.image_url;
        this.type_line = data.type_line;
        this.flip_image_url = data.flip_image_url || null;
        this.elo = data.elo || 0;
        this.upgrades = data.upgrades || [];
    }

    get isUpgrade() {
        return this.type_line.toLowerCase() === 'conspiracy';
    }

    get isVanguard() {
        return this.type_line.toLowerCase() === 'vanguard';
    }
}

// Slot model - represents a container that can hold a card
class Slot {
    constructor(zone, position, card = null) {
        this.id = `${zone}-${position}`;
        this.zone = zone; // 'hand', 'pack', 'sideboard', 'upgrades'
        this.position = position;
        this.card = card;
        this.element = null; // DOM element reference
    }

    get isEmpty() {
        return this.card === null;
    }

    get isSwappable() {
        // Upgrades zone cannot be swapped to/from
        // Allow empty slots to receive cards
        return this.zone !== 'upgrades';
    }

    setCard(card) {
        this.card = card;
        this.render();
    }

    swap(otherSlot) {
        const tempCard = this.card;
        this.card = otherSlot.card;
        otherSlot.card = tempCard;
        this.render();
        otherSlot.render();
    }

    render() {
        if (!this.element) {
            this.element = document.createElement('div');
            this.element.className = 'card-slot';
            this.element.dataset.slotId = this.id;
        }

        if (this.isEmpty) {
            this.element.className = 'card-slot empty';
            this.element.innerHTML = '';
        } else {
            this.element.className = 'card-slot filled';
            const img = document.createElement('img');
            img.src = this.card.image_url;
            img.alt = this.card.name;
            img.className = 'card-image';
            img.onerror = function() {
                // Fallback for broken images
                this.style.display = 'none';
                this.parentElement.style.backgroundColor = '#2a2a2a';
                this.parentElement.innerHTML = `<div style="padding: 10px; text-align: center; color: #fff; font-size: 12px;">${img.alt}</div>`;
            };
            this.element.innerHTML = '';
            this.element.appendChild(img);
        }

        return this.element;
    }
}

// Player model
class Player {
    constructor(data) {
        this.name = data.name;
        this.poison = data.poison || 0;
        this.treasures = data.treasures || 0;
        this.mostRecentlyRevealedCards = data.most_recently_revealed_cards || [];
        this.avatar = data.avatar || this.name.charAt(0).toUpperCase();
    }
}

// Draft State model
class DraftState {
    constructor() {
        this.slots = {
            hand: [],
            pack: [],
            sideboard: [],
            upgrades: []
        };
        this.players = [];
        this.currentPlayer = null;
        this.treasures = 0;
        this.selectedSlot = null;
        this.applyingUpgrade = null;
    }

    initializeSlots(handSize = 3, packSize = 5) {
        // Initialize hand slots (3-7 cards)
        for (let i = 0; i < 7; i++) {
            this.slots.hand.push(new Slot('hand', i));
        }

        // Initialize pack slots (5 cards)
        for (let i = 0; i < packSize; i++) {
            this.slots.pack.push(new Slot('pack', i));
        }

        // Initialize sideboard slots (flexible grid)
        for (let i = 0; i < 28; i++) { // 7 rows x 4 columns
            this.slots.sideboard.push(new Slot('sideboard', i));
        }

        // Initialize upgrade slots (flexible vertical list)
        for (let i = 0; i < 10; i++) {
            this.slots.upgrades.push(new Slot('upgrades', i));
        }
    }

    setHandCards(cards) {
        cards.forEach((card, i) => {
            if (i < this.slots.hand.length) {
                this.slots.hand[i].setCard(new Card(card));
            }
        });
    }

    setPackCards(cards) {
        cards.forEach((card, i) => {
            if (i < this.slots.pack.length) {
                this.slots.pack[i].setCard(new Card(card));
            }
        });
    }

    setSideboardCards(cards) {
        cards.forEach((card, i) => {
            if (i < this.slots.sideboard.length) {
                this.slots.sideboard[i].setCard(new Card(card));
            }
        });
    }

    setUpgrades(upgrades) {
        upgrades.forEach((upgrade, i) => {
            if (i < this.slots.upgrades.length) {
                this.slots.upgrades[i].setCard(new Card(upgrade));
            }
        });
    }

    getSlotById(slotId) {
        const [zone, position] = slotId.split('-');
        return this.slots[zone]?.[parseInt(position)];
    }

    swapCards(slot1Id, slot2Id) {
        const slot1 = this.getSlotById(slot1Id);
        const slot2 = this.getSlotById(slot2Id);

        // Allow swapping as long as both slots are swappable zones
        // This allows moving cards to empty slots
        if (slot1 && slot2 && slot1.isSwappable && slot2.isSwappable) {
            slot1.swap(slot2);
            return true;
        }
        return false;
    }

    applyUpgradeToCard(upgradeSlotId, targetSlotId) {
        const upgradeSlot = this.getSlotById(upgradeSlotId);
        const targetSlot = this.getSlotById(targetSlotId);

        if (upgradeSlot && targetSlot && upgradeSlot.card?.isUpgrade && targetSlot.card) {
            targetSlot.card.upgrades.push(upgradeSlot.card);
            // Upgrade is consumed, remove it
            upgradeSlot.setCard(null);
            return true;
        }
        return false;
    }
}