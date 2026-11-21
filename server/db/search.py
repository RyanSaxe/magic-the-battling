from sqlalchemy import ColumnElement
from sqlalchemy.orm import QueryableAttribute

LIKE_ESCAPE = "\\"


def contains_text(column: ColumnElement[str] | QueryableAttribute[str], text: str) -> ColumnElement[bool]:
    """Whether the column contains the text, ignoring case. % and _ in the text match only themselves."""
    escaped = text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2).replace("%", f"{LIKE_ESCAPE}%").replace("_", f"{LIKE_ESCAPE}_")
    return column.ilike(f"%{escaped}%", escape=LIKE_ESCAPE)
