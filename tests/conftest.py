import pytest

from mtb.models.cards import Card


@pytest.fixture
def card_factory():
    def _card(name: str, type_line: str = "Creature", **kwargs) -> Card:
        return Card(name=name, image_url="image", id=name, type_line=type_line, **kwargs)

    return _card


@pytest.fixture
def upgrade_factory(card_factory):
    def _upgrade(name: str) -> Card:
        return card_factory(name, type_line="Conspiracy")

    return _upgrade
