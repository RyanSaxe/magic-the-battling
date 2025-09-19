class Card {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.image_url = data.image_url;
        this.type_line = data.type_line;
        this.upgrades = data.upgrades || [];
    }

    get isUpgrade() {
        return this.type_line.toLowerCase() === 'conspiracy';
    }
}

class Slot {
    constructor(zone, position, card = null) {
        this.id = `${zone}-${position}`;
        this.zone = zone;
        this.position = position;
        this.card = card;
        this.element = null;
    }

    get isEmpty() {
        return this.card === null;
    }

    get isSwappable() {
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

class Player {
    constructor(data) {
        this.name = data.name;
        this.poison = data.poison || 0;
        this.treasures = data.treasures || 0;
        this.mostRecentlyRevealedCards = data.most_recently_revealed_cards || [];
        this.avatar = data.avatar || this.name.charAt(0).toUpperCase();
    }
}

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

    initializeSlots() {
        // Hand: 3-7 cards
        for (let i = 0; i < 7; i++) {
            this.slots.hand.push(new Slot('hand', i));
        }

        // Pack: 5 cards
        for (let i = 0; i < 5; i++) {
            this.slots.pack.push(new Slot('pack', i));
        }

        // Sideboard: 28 slots (7x4 grid)
        for (let i = 0; i < 28; i++) {
            this.slots.sideboard.push(new Slot('sideboard', i));
        }

        // Upgrades: 10 slots
        for (let i = 0; i < 10; i++) {
            this.slots.upgrades.push(new Slot('upgrades', i));
        }
    }

    setCards(zone, cards) {
        cards.forEach((card, i) => {
            if (i < this.slots[zone].length) {
                this.slots[zone][i].setCard(new Card(card));
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
            upgradeSlot.setCard(null);
            return true;
        }
        return false;
    }
}