from sqlalchemy import ColumnElement, TextClause, text
from sqlalchemy.orm import QueryableAttribute

from mtb.models.cards import fold_card_name

LIKE_ESCAPE = "\\"


def like_pattern(search: str) -> str:
    """A LIKE pattern for text containing the search, in which % and _ match only themselves."""
    escaped = (
        search.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2).replace("%", f"{LIKE_ESCAPE}%").replace("_", f"{LIKE_ESCAPE}_")
    )
    return f"%{escaped}%"


def contains_text(column: ColumnElement[str] | QueryableAttribute[str], search: str) -> ColumnElement[bool]:
    """Whether the column contains the search, ignoring case."""
    return column.ilike(like_pattern(search), escape=LIKE_ESCAPE)


def _without_accents(column: str) -> str:
    # In SQL, since a function in Python would wait for the GIL at each name. These are Latin-1's accented letters.
    for letter in map(chr, range(0xC0, 0x100)):
        if (plain := fold_card_name(letter)).isascii():
            column = f"replace({column}, '{letter}', '{plain}')"
    return column


# LIKE ignores case in ASCII, so only other names need their accents taken off.
_FOLDED_NAME = f"CASE WHEN name GLOB '*[^ -~]*' THEN {_without_accents('name')} ELSE name END"

# A snapshot's hand and applied upgrades hold card ids; their names are in the snapshot's own card registry.
# Basic lands are stored by name. LIMIT -1 keeps SQLite from reading a name out of the state at each use of it.
_CARD_IN_PLAYERS_FIGHTS = f"""
EXISTS (
    SELECT 1 FROM battle_snapshots AS fight
    WHERE fight.player_history_id = player_game_history.id
    AND (
        EXISTS (
            SELECT 1 FROM (
                SELECT json_extract(
                    fight.full_state_json,
                    '$.card_registry."' || json_extract(card.value, '$.scryfall_id') || '".name'
                ) AS name
                FROM json_each(fight.hand_json) AS card
                LIMIT -1
            )
            WHERE {_FOLDED_NAME} LIKE :card_pattern ESCAPE '\\'
        )
        OR EXISTS (
            SELECT 1 FROM (
                SELECT json_extract(
                    fight.full_state_json,
                    '$.card_registry."' || json_extract(card.value, '$.scryfall_id') || '".name'
                ) AS name
                FROM json_each(fight.applied_upgrades_json) AS card
                LIMIT -1
            )
            WHERE {_FOLDED_NAME} LIKE :card_pattern ESCAPE '\\'
        )
        OR EXISTS (
            SELECT 1 FROM json_each(fight.basic_lands_json) AS land
            WHERE land.value LIKE :card_pattern ESCAPE '\\'
        )
    )
)
"""


def card_in_players_fights(search: str) -> TextClause:
    """Whether a card containing the search was in the player's hand, basic lands or applied upgrades in any
    recorded fight of the player_game_history row the query is on. Case and accents don't count."""
    return text(_CARD_IN_PLAYERS_FIGHTS).bindparams(card_pattern=like_pattern(fold_card_name(search)))
