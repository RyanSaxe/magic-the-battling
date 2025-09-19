from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import random
from typing import List, Dict, Any, Optional
import uuid

from mtb.models.cards import Card, build_battler
from mtb.models.game import Player, Draft, Game, create_game

app = FastAPI(title="Magic: The Battling Cube Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount frontend static files
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

class CubeRequest(BaseModel):
    cube_id: str


class CardState(BaseModel):
    id: str
    name: str
    image_url: str
    type_line: str
    elo: float
    flip_image_url: str | None = None
    tapped: bool = False
    counters: Dict[str, int] = {}
    summoning_sick: bool = False
    is_token: bool = False
    token_of: str | None = None

class GameSession(BaseModel):
    session_id: str
    cube_id: str
    player1: List[CardState]  # 7 cards dealt as hand
    player2: List[CardState]  # 7 cards dealt as hand
    current_player: int = 1
    turn: int = 1
    phase: str = "main"

# In-memory storage for game sessions (use Redis/DB in production)
game_sessions: Dict[str, GameSession] = {}
draft_sessions: Dict[str, Any] = {}  # Store draft states
games: Dict[str, Game] = {}  # Store game states

@app.get("/")
async def read_root():
    # For now, return a simple message. Later we'll serve the React build
    return {"message": "Magic: The Battling API - Use the React frontend"}

def card_to_state(card: Card, is_token: bool = False) -> CardState:
    """Convert Card model to CardState for game session"""
    return CardState(
        id=card.id,
        name=card.name,
        image_url=card.image_url,
        type_line=card.type_line,
        elo=card.elo,
        flip_image_url=card.flip_image_url,
        is_token=is_token
    )

@app.post("/api/cube")
async def load_cube(request: CubeRequest):
    try:
        battler = build_battler(request.cube_id)
        session_id = f"session_{random.randint(1000, 9999)}"
        
        # Convert cards to CardState format
        card_states = [card_to_state(card) for card in battler.cards]
        
        # Shuffle and deal 7 cards to each player
        shuffled_cards = card_states.copy()
        random.shuffle(shuffled_cards)
        
        # Deal 7 cards to each player
        player1_hand = shuffled_cards[:7]
        player2_hand = shuffled_cards[7:14]
        
        game_session = GameSession(
            session_id=session_id,
            cube_id=request.cube_id,
            player1=player1_hand,
            player2=player2_hand,
            current_player=1,
            turn=1,
            phase="main"
        )
        
        game_sessions[session_id] = game_session
        
        return game_session.dict()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load cube: {str(e)}")

# Drawing is no longer supported - hands are pre-dealt

# Move card functionality replaced with free-form positioning

class TapCardRequest(BaseModel):
    session_id: str
    player_id: int
    card_id: str

class CounterRequest(BaseModel):
    session_id: str
    player_id: int
    card_id: str
    counter_type: str
    change: int  # +1 to add, -1 to remove

class CreateTokenRequest(BaseModel):
    session_id: str
    player_id: int
    token_name: str
    image_url: str
    type_line: str
    power: int = 0
    toughness: int = 0

@app.post("/api/tap_card")
async def tap_card(request: TapCardRequest):
    if request.session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = game_sessions[request.session_id]
    player_cards = session.player1 if request.player_id == 1 else session.player2
    
    for card in player_cards:
        if card.id == request.card_id:
            card.tapped = not card.tapped
            return {"success": True, "tapped": card.tapped}
    
    raise HTTPException(status_code=404, detail="Card not found")

@app.post("/api/add_counter")
async def add_counter(request: CounterRequest):
    if request.session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = game_sessions[request.session_id]
    player_cards = session.player1 if request.player_id == 1 else session.player2
    
    for card in player_cards:
        if card.id == request.card_id:
            current = card.counters.get(request.counter_type, 0)
            new_count = max(0, current + request.change)
            
            if new_count == 0:
                card.counters.pop(request.counter_type, None)
            else:
                card.counters[request.counter_type] = new_count
            
            return {"success": True, "counters": card.counters}
    
    raise HTTPException(status_code=404, detail="Card not found")

@app.post("/api/create_token")
async def create_token(request: CreateTokenRequest):
    if request.session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = game_sessions[request.session_id]
    player_cards = session.player1 if request.player_id == 1 else session.player2
    
    # Create a unique token ID
    token_id = f"token_{random.randint(10000, 99999)}"
    
    token = CardState(
        id=token_id,
        name=request.token_name,
        image_url=request.image_url,
        type_line=request.type_line,
        elo=0,
        is_token=True,
        summoning_sick=True if "creature" in request.type_line.lower() else False
    )
    
    # Add token to player's cards
    player_cards.append(token)
    
    return {"success": True, "token": token.dict()}

@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    if session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = game_sessions[session_id]
    return session.dict()

# Draft-specific endpoints
class DraftInitRequest(BaseModel):
    player_id: str
    cube_id: str = "auto"

class SwapRequest(BaseModel):
    player_id: str
    slot1_id: str
    slot2_id: str

class RollRequest(BaseModel):
    player_id: str

class ApplyUpgradeRequest(BaseModel):
    player_id: str
    upgrade_id: str
    target_card_id: str

@app.post("/api/draft/initialize")
async def initialize_draft(request: DraftInitRequest):
    try:
        # Build battler
        battler = build_battler(request.cube_id)

        # Create player
        player = Player(name=f"Player_{request.player_id}", treasures=1)

        # Deal initial hand (3 cards)
        hand_cards = battler.cards[:3]
        battler.cards = battler.cards[3:]
        player.hand = hand_cards

        # Deal initial pack (5 cards)
        pack_cards = battler.cards[:5]
        battler.cards = battler.cards[5:]

        # Create draft state
        draft_state = {
            "player_id": request.player_id,
            "player": player.dict(),
            "pack": [card.dict() for card in pack_cards],
            "battler": battler,
            "upgrades": [card.dict() for card in battler.upgrades[:2]],  # Give 2 upgrades to start
            "vanguards": [card.dict() for card in battler.vanguards],
        }

        # Store draft state
        draft_sessions[request.player_id] = draft_state

        return {
            "success": True,
            "player": draft_state["player"],
            "pack": draft_state["pack"],
            "upgrades": draft_state["upgrades"],
            "vanguards": draft_state["vanguards"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to initialize draft: {str(e)}")

@app.get("/api/draft/state/{player_id}")
async def get_draft_state(player_id: str):
    if player_id not in draft_sessions:
        raise HTTPException(status_code=404, detail="Draft session not found")

    draft_state = draft_sessions[player_id]
    return {
        "player": draft_state["player"],
        "pack": draft_state["pack"],
        "upgrades": draft_state["upgrades"],
        "vanguards": draft_state.get("vanguards", []),
    }

@app.post("/api/draft/swap")
async def swap_cards(request: SwapRequest):
    if request.player_id not in draft_sessions:
        raise HTTPException(status_code=404, detail="Draft session not found")

    # Parse slot IDs (format: zone-position)
    zone1, pos1 = request.slot1_id.split('-')
    zone2, pos2 = request.slot2_id.split('-')
    pos1, pos2 = int(pos1), int(pos2)

    draft_state = draft_sessions[request.player_id]
    player = draft_state["player"]

    # Get card references based on zones
    def get_card_from_zone(zone, position):
        if zone == "hand":
            return player["hand"][position] if position < len(player["hand"]) else None
        elif zone == "pack":
            return draft_state["pack"][position] if position < len(draft_state["pack"]) else None
        elif zone == "sideboard":
            return player["sideboard"][position] if position < len(player["sideboard"]) else None
        return None

    def set_card_in_zone(zone, position, card):
        if zone == "hand":
            if position < len(player["hand"]):
                player["hand"][position] = card
        elif zone == "pack":
            if position < len(draft_state["pack"]):
                draft_state["pack"][position] = card
        elif zone == "sideboard":
            if position < len(player["sideboard"]):
                player["sideboard"][position] = card

    # Perform swap
    card1 = get_card_from_zone(zone1, pos1)
    card2 = get_card_from_zone(zone2, pos2)

    if card1 and card2:
        set_card_in_zone(zone1, pos1, card2)
        set_card_in_zone(zone2, pos2, card1)
        return {"success": True, "message": "Cards swapped"}

    return {"success": False, "message": "Invalid swap"}

@app.post("/api/draft/roll")
async def roll_pack(request: RollRequest):
    if request.player_id not in draft_sessions:
        raise HTTPException(status_code=404, detail="Draft session not found")

    draft_state = draft_sessions[request.player_id]
    player = draft_state["player"]

    # Check treasures
    if player["treasures"] <= 0:
        raise HTTPException(status_code=400, detail="Not enough treasures")

    # Deduct treasure
    player["treasures"] -= 1

    # Get new pack from battler
    battler = draft_state["battler"]
    battler.shuffle()

    # Return old pack cards to battler
    for card_dict in draft_state["pack"]:
        # Convert dict back to Card object if needed
        pass  # For now, we'll just replace with new cards

    # Deal new pack
    new_pack = battler.cards[:5]
    battler.cards = battler.cards[5:]
    draft_state["pack"] = [card.dict() for card in new_pack]

    return {
        "success": True,
        "pack": draft_state["pack"],
        "treasures_remaining": player["treasures"]
    }

@app.post("/api/draft/apply-upgrade")
async def apply_upgrade(request: ApplyUpgradeRequest):
    if request.player_id not in draft_sessions:
        raise HTTPException(status_code=404, detail="Draft session not found")

    draft_state = draft_sessions[request.player_id]

    # Find the upgrade and target card
    upgrade = None
    for idx, up in enumerate(draft_state["upgrades"]):
        if up["id"] == request.upgrade_id:
            upgrade = up
            # Remove the upgrade once applied
            draft_state["upgrades"].pop(idx)
            break

    if not upgrade:
        raise HTTPException(status_code=404, detail="Upgrade not found")

    # Apply upgrade to target card (mark it somehow)
    # This would need more complex logic to track which cards have which upgrades
    return {
        "success": True,
        "message": f"Applied {upgrade['name']} to target card"
    }

@app.get("/api/game/{game_id}/players")
async def get_players_info(game_id: str):
    # For demo purposes, return mock player data
    mock_players = [
        {
            "name": "Alice",
            "poison": 2,
            "treasures": 3,
            "most_recently_revealed_cards": []
        },
        {
            "name": "Bob",
            "poison": 0,
            "treasures": 1,
            "most_recently_revealed_cards": []
        },
        {
            "name": "Charlie",
            "poison": 4,
            "treasures": 2,
            "most_recently_revealed_cards": []
        },
        {
            "name": "Diana",
            "poison": 1,
            "treasures": 0,
            "most_recently_revealed_cards": []
        }
    ]
    return {"players": mock_players}