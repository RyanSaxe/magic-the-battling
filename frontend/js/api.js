// API configuration
const API_BASE_URL = 'http://localhost:8000/api';

// API client for draft operations
class DraftAPI {
    // Get current draft state
    static async getDraftState(playerId) {
        try {
            const response = await fetch(`${API_BASE_URL}/draft/state/${playerId}`);
            if (!response.ok) throw new Error('Failed to fetch draft state');
            return await response.json();
        } catch (error) {
            console.error('Error fetching draft state:', error);
            return null;
        }
    }

    // Swap two cards
    static async swapCards(playerId, slot1Id, slot2Id) {
        try {
            const response = await fetch(`${API_BASE_URL}/draft/swap`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    player_id: playerId,
                    slot1_id: slot1Id,
                    slot2_id: slot2Id
                })
            });
            if (!response.ok) throw new Error('Failed to swap cards');
            return await response.json();
        } catch (error) {
            console.error('Error swapping cards:', error);
            return null;
        }
    }

    // Roll for new pack (costs 1 treasure)
    static async rollPack(playerId) {
        try {
            const response = await fetch(`${API_BASE_URL}/draft/roll`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    player_id: playerId
                })
            });
            if (!response.ok) throw new Error('Failed to roll pack');
            return await response.json();
        } catch (error) {
            console.error('Error rolling pack:', error);
            return null;
        }
    }

    // Apply upgrade to a card
    static async applyUpgrade(playerId, upgradeId, targetCardId) {
        try {
            const response = await fetch(`${API_BASE_URL}/draft/apply-upgrade`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    player_id: playerId,
                    upgrade_id: upgradeId,
                    target_card_id: targetCardId
                })
            });
            if (!response.ok) throw new Error('Failed to apply upgrade');
            return await response.json();
        } catch (error) {
            console.error('Error applying upgrade:', error);
            return null;
        }
    }

    // Get all players info
    static async getPlayersInfo(gameId) {
        try {
            const response = await fetch(`${API_BASE_URL}/game/${gameId}/players`);
            if (!response.ok) throw new Error('Failed to fetch players info');
            return await response.json();
        } catch (error) {
            console.error('Error fetching players info:', error);
            return null;
        }
    }

    // Initialize a new draft session
    static async initializeDraft(playerId, cubeId = 'auto') {
        try {
            const response = await fetch(`${API_BASE_URL}/draft/initialize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    player_id: playerId,
                    cube_id: cubeId
                })
            });
            if (!response.ok) throw new Error('Failed to initialize draft');
            return await response.json();
        } catch (error) {
            console.error('Error initializing draft:', error);
            return null;
        }
    }
}