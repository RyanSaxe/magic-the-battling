import pytest
from conftest import setup_battle_ready

from mtb.models.game import StaticOpponent, create_game
from mtb.phases import battle
from server.services.game_manager import GameManager


def test_move_zone_moves_card(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])
    card = card_factory("test")
    alice.sideboard = [card]

    b = battle.start(game, alice, bob)
    battle.move_zone(b, alice, card, "sideboard", "hand")

    assert card not in b.player_zones.sideboard
    assert card in b.player_zones.hand


def test_move_zone_card_not_in_zone_raises(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)

    with pytest.raises(ValueError):
        battle.move_zone(b, alice, card_factory("missing"), "hand", "battlefield")


def test_sideboard_to_battlefield_syncs_player_model(card_factory):
    """Moving sideboard->battlefield should remove card from player.sideboard."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    wish_target = card_factory("WishTarget", "Instant")
    alice.sideboard = [wish_target]

    b = battle.start(game, alice, bob)

    manager = GameManager()
    manager.handle_battle_move(game, alice, wish_target.id, "sideboard", "battlefield")

    assert wish_target not in alice.sideboard
    assert wish_target in b.player_zones.battlefield


class TestOpponentZoneManipulation:
    """Tests for manipulating opponent zones when opponent is StaticOpponent or Player."""

    def test_get_zones_for_card_finds_player_card(self, card_factory):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        card = card_factory("TestCard")
        alice.hand = [card]

        b = battle.start(game, alice, bob)

        zones, is_opponent = battle.get_zones_for_card(b, alice, card.id)
        assert zones == b.player_zones
        assert not is_opponent

    def test_get_zones_for_card_finds_opponent_card_vs_static(self, card_factory):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        opp_card = card_factory("OppCard")
        static_opp = StaticOpponent(
            name="Bot",
            hand=[opp_card],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)

        zones, is_opponent = battle.get_zones_for_card(b, alice, opp_card.id)
        assert zones == b.opponent_zones
        assert is_opponent

    def test_get_zones_for_card_finds_opponent_card_vs_player(self, card_factory):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        opp_card = card_factory("OppCard")
        bob.hand = [opp_card]

        b = battle.start(game, alice, bob)

        zones, is_opponent = battle.get_zones_for_card(b, alice, opp_card.id)
        assert zones == b.opponent_zones
        assert is_opponent

    def test_get_zones_for_card_raises_if_not_found(self, card_factory):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        b = battle.start(game, alice, bob)

        with pytest.raises(ValueError, match="not found"):
            battle.get_zones_for_card(b, alice, "nonexistent-card-id")

    def test_update_card_state_works_on_opponent_card(self, card_factory):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        opp_card = card_factory("OppCard")
        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)
        b.opponent_zones.battlefield.append(opp_card)

        result = battle.update_card_state(b, alice, "tap", opp_card.id)
        assert result
        assert opp_card.id in b.opponent_zones.tapped_card_ids

        result = battle.update_card_state(b, alice, "untap", opp_card.id)
        assert result
        assert opp_card.id not in b.opponent_zones.tapped_card_ids

    def test_battle_move_works_on_opponent_card_via_game_manager(self, card_factory):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        opp_card = card_factory("OppCard")
        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)
        b.opponent_zones.battlefield.append(opp_card)

        manager = GameManager()
        result = manager.handle_battle_move(
            game, alice, opp_card.id, "battlefield", "graveyard", from_owner="opponent", to_owner="opponent"
        )

        assert result
        assert opp_card not in b.opponent_zones.battlefield
        assert opp_card in b.opponent_zones.graveyard

    def test_battle_move_works_on_static_opponent_basic_lands(self):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)

        island = b.opponent_zones.battlefield[0]
        assert "Island" in island.name

        manager = GameManager()
        result = manager.handle_battle_move(
            game, alice, island.id, "battlefield", "graveyard", from_owner="opponent", to_owner="opponent"
        )

        assert result
        assert island not in b.opponent_zones.battlefield
        assert island in b.opponent_zones.graveyard

    def test_update_card_state_works_on_pvp_opponent(self, card_factory):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        opp_card = card_factory("OppCard")
        bob.hand = [opp_card]

        b = battle.start(game, alice, bob)

        result = battle.update_card_state(b, alice, "tap", opp_card.id)
        assert result
        assert opp_card.id in b.opponent_zones.tapped_card_ids


def test_spawn_token_for_opponent(card_factory):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)

    opp_card = card_factory("OppCard")
    static_opp = StaticOpponent(
        name="Bot",
        hand=[opp_card],
        chosen_basics=["Plains", "Island", "Mountain"],
    )

    b = battle.start(game, alice, static_opp)

    initial_player_battlefield = len(b.player_zones.battlefield)
    initial_opponent_battlefield = len(b.opponent_zones.battlefield)

    result = battle.update_card_state(
        b,
        alice,
        "spawn",
        "",
        data={
            "token": {"name": "Zombie", "image_url": "", "type_line": "Token Creature"},
            "for_opponent": True,
        },
    )

    assert result
    assert len(b.player_zones.battlefield) == initial_player_battlefield
    assert len(b.opponent_zones.battlefield) == initial_opponent_battlefield + 1
    zombie = b.opponent_zones.battlefield[-1]
    assert zombie.name == "Zombie"


def test_spawn_token_for_player(card_factory):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)

    opp_card = card_factory("OppCard")
    static_opp = StaticOpponent(
        name="Bot",
        hand=[opp_card],
        chosen_basics=["Plains", "Island", "Mountain"],
    )

    b = battle.start(game, alice, static_opp)

    initial_player_battlefield = len(b.player_zones.battlefield)
    initial_opponent_battlefield = len(b.opponent_zones.battlefield)

    result = battle.update_card_state(
        b,
        alice,
        "spawn",
        "",
        data={
            "token": {"name": "Zombie", "image_url": "", "type_line": "Token Creature"},
        },
    )

    assert result
    assert len(b.player_zones.battlefield) == initial_player_battlefield + 1
    assert len(b.opponent_zones.battlefield) == initial_opponent_battlefield
    zombie = b.player_zones.battlefield[-1]
    assert zombie.name == "Zombie"


def test_draw_library_moves_top_card_to_hand(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)

    top = card_factory("TopCard")
    bottom = card_factory("BottomCard")
    b = battle.start(game, alice, bob)
    b.player_zones.library = [bottom, top]

    result = battle.update_card_state(b, alice, "draw_library", "")

    assert result
    assert b.player_zones.library == [bottom]
    assert b.player_zones.hand[-1] is top


def test_shuffle_library_randomizes_player_library(card_factory, monkeypatch):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)

    cards = [card_factory(f"Card{i}") for i in range(3)]
    b = battle.start(game, alice, bob)
    b.player_zones.library = cards.copy()

    def reverse_shuffle(items):
        items[:] = list(reversed(items))

    monkeypatch.setattr("mtb.phases.battle.random.shuffle", reverse_shuffle)

    result = battle.update_card_state(b, alice, "shuffle_library", "")

    assert result
    assert b.player_zones.library == list(reversed(cards))


def test_copy_token_preserves_only_flip_and_face_down_state(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)

    card = card_factory(
        "CloneSource",
        oracle_text="Some rules text",
        flip_image_url="flip-image",
        png_url="png",
        flip_png_url="flip-png",
        colors=["U"],
        cmc=3,
    )
    b = battle.start(game, alice, bob)
    b.player_zones.battlefield.append(card)
    b.player_zones.flipped_card_ids.append(card.id)
    b.player_zones.face_down_card_ids.append(card.id)
    b.player_zones.tapped_card_ids.append(card.id)
    b.player_zones.counters[card.id] = {"+1/+1": 2}

    result = battle.update_card_state(b, alice, "copy_token", card.id)

    assert result
    copied = b.player_zones.battlefield[-1]
    assert copied.id != card.id
    assert copied.name == card.name
    assert copied.image_url == card.image_url
    assert copied.id in b.player_zones.flipped_card_ids
    assert copied.id in b.player_zones.face_down_card_ids
    assert copied.id not in b.player_zones.tapped_card_ids
    assert copied.id not in b.player_zones.counters


def test_draw_and_shuffle_opponent_library_for_static_opponent(card_factory, monkeypatch):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)

    static_opp = StaticOpponent(
        name="Bot",
        hand=[],
        chosen_basics=["Plains", "Island", "Mountain"],
    )
    b = battle.start(game, alice, static_opp)
    top = card_factory("TopCard")
    bottom = card_factory("BottomCard")
    b.opponent_zones.library = [bottom, top]

    draw_result = battle.update_card_state(b, alice, "draw_library", "", data={"for_opponent": True})
    assert draw_result
    assert b.opponent_zones.library == [bottom]
    assert b.opponent_zones.hand[-1] is top

    extra = card_factory("ExtraCard")
    b.opponent_zones.library.append(extra)

    def reverse_shuffle(items):
        items[:] = list(reversed(items))

    monkeypatch.setattr("mtb.phases.battle.random.shuffle", reverse_shuffle)
    shuffle_result = battle.update_card_state(b, alice, "shuffle_library", "", data={"for_opponent": True})
    assert shuffle_result
    assert b.opponent_zones.library == [extra, bottom]


def _spawn_token(b, player, name="Zombie"):
    battle.update_card_state(
        b,
        player,
        "spawn",
        "",
        data={"token": {"name": name, "image_url": "", "type_line": "Token Creature"}},
    )
    return next(c for c in b.player_zones.battlefield if c.name == name)


def test_token_removed_when_moved_to_graveyard(card_factory):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)
    static_opp = StaticOpponent(
        name="Bot",
        hand=[card_factory("OppCard")],
        chosen_basics=["Plains", "Island", "Mountain"],
    )
    b = battle.start(game, alice, static_opp)
    token = _spawn_token(b, alice)

    battle.move_zone(b, alice, token, "battlefield", "graveyard")

    assert token not in b.player_zones.graveyard
    assert token not in b.player_zones.battlefield
    assert not any(t.id == token.id for t in b.player_zones.spawned_tokens)


def test_token_removed_when_moved_to_exile(card_factory):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)
    static_opp = StaticOpponent(
        name="Bot",
        hand=[card_factory("OppCard")],
        chosen_basics=["Plains", "Island", "Mountain"],
    )
    b = battle.start(game, alice, static_opp)
    token = _spawn_token(b, alice)

    battle.move_zone(b, alice, token, "battlefield", "exile")

    assert token not in b.player_zones.exile
    assert token not in b.player_zones.battlefield
    assert not any(t.id == token.id for t in b.player_zones.spawned_tokens)


def test_token_persists_when_moved_between_battlefields(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)
    b = battle.start(game, alice, bob)
    token = _spawn_token(b, alice)

    gm = GameManager()
    gm.handle_battle_move(
        game,
        alice,
        token.id,
        "battlefield",
        "battlefield",
        from_owner="player",
        to_owner="opponent",
    )

    assert token in b.opponent_zones.battlefield
    assert token not in b.player_zones.battlefield


def test_treasure_token_removed_when_moved_to_graveyard(card_factory):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)
    static_opp = StaticOpponent(
        name="Bot",
        hand=[card_factory("OppCard")],
        chosen_basics=["Plains", "Island", "Mountain"],
    )
    b = battle.start(game, alice, static_opp)

    battle.update_card_state(b, alice, "create_treasure", "", data={})
    treasure = b.player_zones.spawned_tokens[-1]

    battle.move_zone(b, alice, treasure, "battlefield", "graveyard")

    assert treasure not in b.player_zones.graveyard
    assert treasure not in b.player_zones.battlefield
    assert not any(t.id == treasure.id for t in b.player_zones.spawned_tokens)


def test_initial_treasure_removed_when_moved_to_graveyard(card_factory):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)
    static_opp = StaticOpponent(
        name="Bot",
        hand=[card_factory("OppCard")],
        chosen_basics=["Plains", "Island", "Mountain"],
    )
    b = battle.start(game, alice, static_opp)
    treasure = next(c for c in b.player_zones.battlefield if c.id.startswith("treasure-"))

    battle.move_zone(b, alice, treasure, "battlefield", "graveyard")

    assert treasure not in b.player_zones.graveyard
    assert treasure not in b.player_zones.battlefield
    assert not any(t.id == treasure.id for t in b.player_zones.spawned_tokens)


class TestFaceDownRevealed:
    def test_face_down_adds_to_revealed_card_ids(self, card_factory):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        creature = card_factory("Creature", "Creature")
        alice.hand = [creature]

        b = battle.start(game, alice, bob)
        battle.move_zone(b, alice, creature, "hand", "battlefield")
        battle.update_card_state(b, alice, "face_down", creature.id)

        assert creature.id in b.player_zones.revealed_card_ids

    def test_face_down_revealed_shows_in_most_recently_revealed(self, card_factory):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        creature = card_factory("Creature", "Creature")
        alice.hand = [creature]

        b = battle.start(game, alice, bob)
        battle.move_zone(b, alice, creature, "hand", "battlefield")
        battle.update_card_state(b, alice, "face_down", creature.id)

        battle.submit_result(b, alice, "Alice")
        battle.submit_result(b, bob, "Alice")
        battle.end(game, b)

        assert creature in alice.most_recently_revealed_cards

    def test_face_up_toggle_does_not_double_add(self, card_factory):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        creature = card_factory("Creature", "Creature")
        alice.hand = [creature]

        b = battle.start(game, alice, bob)
        battle.move_zone(b, alice, creature, "hand", "battlefield")

        battle.update_card_state(b, alice, "face_down", creature.id)
        battle.update_card_state(b, alice, "face_down", creature.id)
        battle.update_card_state(b, alice, "face_down", creature.id)

        assert b.player_zones.revealed_card_ids.count(creature.id) == 1
