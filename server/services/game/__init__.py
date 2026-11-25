"""Pure read-only game view builders and game service submodules."""

from server.services.game.view_builder import (
    build_active_game_status,
    build_battle_view,
    build_game_bootstrap,
    build_game_state,
    build_pending_game_status,
    build_player_view,
    build_puppet_view,
    build_share_state,
    build_snapshot_game_status,
    determine_game_phase,
    get_pairing_probabilities_readonly,
    hidden_card_opaque_ids,
    puppet_snapshot_for_round,
)

__all__ = [
    "build_active_game_status",
    "build_battle_view",
    "build_game_bootstrap",
    "build_game_state",
    "build_pending_game_status",
    "build_player_view",
    "build_puppet_view",
    "build_share_state",
    "build_snapshot_game_status",
    "determine_game_phase",
    "get_pairing_probabilities_readonly",
    "hidden_card_opaque_ids",
    "puppet_snapshot_for_round",
]
