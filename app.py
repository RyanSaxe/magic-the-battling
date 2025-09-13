from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import random
from typing import List, Dict, Any

from mtb.models.cards import Card, build_battler

app = FastAPI(title="Magic: The Battling Cube Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount React app build files (we'll need to build first)
# app.mount("/static", StaticFiles(directory="frontend/react-frontend/dist"), name="static")

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