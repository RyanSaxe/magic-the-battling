"""SQLite LIKE escaping and search query helpers."""

from sqlalchemy import ColumnElement, TextClause, text
from sqlalchemy.orm import QueryableAttribute

LIKE_ESCAPE = "\\"


def like_pattern(search: str) -> str:
    """Build a LIKE pattern for text containing the search, escaping % and _."""
    escaped = (
        search.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2).replace("%", f"{LIKE_ESCAPE}%").replace("_", f"{LIKE_ESCAPE}_")
    )
    return f"%{escaped}%"


def contains_text(
    column: ColumnElement[str] | QueryableAttribute[str] | QueryableAttribute[str | None], search: str
) -> ColumnElement[bool]:
    """Whether the column contains the search, ignoring case."""
    return column.ilike(like_pattern(search), escape=LIKE_ESCAPE)


# A snapshot's hand and applied upgrades hold card ids; their names are in the snapshot's own card registry.
# Basic lands are stored by name.
_CARD_IN_PLAYERS_FIGHTS = """
EXISTS (
    SELECT 1 FROM battle_snapshots AS fight
    WHERE fight.player_history_id = player_game_history.id
    AND (
        EXISTS (
            SELECT 1 FROM json_each(fight.hand_json) AS card
            WHERE lower(json_extract(
                fight.full_state_json,
                '$.card_registry."' || json_extract(card.value, '$.scryfall_id') || '".name'
            )) LIKE lower(:card_pattern) ESCAPE '\\'
        )
        OR EXISTS (
            SELECT 1 FROM json_each(fight.applied_upgrades_json) AS card
            WHERE lower(json_extract(
                fight.full_state_json,
                '$.card_registry."' || json_extract(card.value, '$.scryfall_id') || '".name'
            )) LIKE lower(:card_pattern) ESCAPE '\\'
        )
        OR EXISTS (
            SELECT 1 FROM json_each(fight.basic_lands_json) AS land
            WHERE lower(land.value) LIKE lower(:card_pattern) ESCAPE '\\'
        )
    )
)
"""


def card_in_players_fights(search: str) -> TextClause:
    """Whether a card containing the search was in the player's hand, basic lands or applied upgrades in any.

    recorded fight of the player_game_history row the query is on.
    """
    return text(_CARD_IN_PLAYERS_FIGHTS).bindparams(card_pattern=like_pattern(search))
