from uuid import UUID

from mtb.models.game import Game


class GameManager:
    def __init__(self):
        self.games: dict[UUID, Game] = {}
        self.player_game_mapping: dict[UUID, UUID] = {}
