from collections.abc import Callable

import pytest

from mtb.models.cards import Battler, Card
from mtb.models.game import Config, DraftState, Puppet, StaticOpponent, create_game, set_battler
from mtb.phases import draft, reward


def test_is_stage_increasing() -> None:
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    player = game.players[0]

    player.round = 1
    assert not reward.is_stage_increasing(player)

    player.round = 3
    assert reward.is_stage_increasing(player)

    player.round = 6
    assert reward.is_stage_increasing(player)


def test_count_applied_upgrades(card_factory: Callable[..., Card], upgrade_factory: Callable[[str], Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]

    u1 = upgrade_factory("u1")
    u2 = upgrade_factory("u2")
    u3 = upgrade_factory("u3")
    player.upgrades = [u1, u2, u3]

    assert reward.count_applied_upgrades(player) == 0

    target = card_factory("target")
    player.hand = [target]
    u1.upgrade_target = target
    assert reward.count_applied_upgrades(player) == 1

    off_hand_target = card_factory("target2")
    u2.upgrade_target = off_hand_target
    assert reward.count_applied_upgrades(player) == 1

    companion = card_factory("companion")
    player.command_zone = [companion]
    u3.upgrade_target = companion
    assert reward.count_applied_upgrades(player) == 2


def test_apply_poison(card_factory: Callable[..., Card], upgrade_factory: Callable[[str], Card]) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players

    target = card_factory("t1")
    alice.hand = [target]
    u1 = upgrade_factory("u1")
    u1.upgrade_target = target
    alice.upgrades = [u1]

    poison = reward.apply_poison(alice, bob)

    assert poison == 2
    assert bob.poison == 2


def test_award_random_card(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    cards = [card_factory(f"c{i}") for i in range(5)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    player = game.players[0]

    card = reward.award_random_card(game, player)

    assert card is not None
    assert card in player.sideboard
    assert card not in game.battler.cards
    assert len(game.battler.cards) == 4


@pytest.mark.parametrize("play_mode", ["limited", "constructed"])
def test_loot_is_drawn_from_every_undealt_card_the_player_could_get(
    card_factory: Callable[..., Card], play_mode: str
) -> None:
    cards = [card_factory(f"c{i}") for i in range(17)]
    loose, undealt, dealt, riley_undealt = cards[:2], cards[2:7], cards[7:12], cards[12:]
    drawn = set()
    for _ in range(300):
        game = create_game(["Riley", "Sam"], num_players=2, config=Config(play_mode=play_mode))
        riley, sam = game.players
        sam.battler = Battler(cards=loose.copy(), upgrades=[], vanguards=[])
        draft_state = DraftState(packs=[], current_packs={riley.name: dealt.copy()})
        if play_mode == "limited":
            game.battler = sam.battler
            draft_state.packs = [undealt.copy()]
        else:
            draft_state.player_packs = {sam.name: [undealt.copy()], riley.name: [riley_undealt.copy()]}
        game.draft_state = draft_state

        card = reward.award_random_card(game, sam)

        assert card is not None
        drawn.add(card.id)
        packs = draft_state.packs if play_mode == "limited" else draft_state.player_packs[sam.name]
        assert [len(pack) for pack in packs] == [game.config.pack_size]
    assert drawn == {card.id for card in [*loose, *undealt]}


def test_second_to_finish_gets_a_card_when_every_undealt_card_is_packed(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Riley", "Sam"], num_players=2)
    riley, sam = game.players
    pools = 2 * game.config.starting_pool_size
    cards = [card_factory(f"c{i}") for i in range(pools + 1 + 5 * game.config.pack_size)]
    set_battler(game, Battler(cards=cards.copy(), upgrades=[], vanguards=[]))
    riley.phase = sam.phase = "reward"

    reward.start_rewards_single(game, riley, opponent_name=sam.name, won=True, poison_dealt=1, poison_taken=0)
    reward.end_for_player(game, riley)
    draft.start(game)
    riley_pack = draft.deal_pack_to_player(game, riley).copy()
    reward.start_rewards_single(game, sam, opponent_name=riley.name, won=False, poison_dealt=0, poison_taken=1)

    assert sam.last_battle_result is not None
    assert sam.last_battle_result.card_gained in sam.sideboard
    state = game.get_draft_state()
    assert state.current_packs == {riley.name: riley_pack}
    assert all(len(pack) == game.config.pack_size for pack in state.packs)
    assert game.battler is not None
    held = [card for player in game.players for card in [*player.hand, *player.sideboard]]
    packed = [card for pack in [*state.packs, riley_pack] for card in pack]
    assert sorted(card.id for card in [*game.battler.cards, *held, *packed]) == sorted(card.id for card in cards)


def test_pick_upgrade(upgrade_factory: Callable[[str], Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    upgrade = upgrade_factory("power_boost")
    game.available_upgrades = [upgrade]
    player = game.players[0]

    reward.pick_upgrade(game, player, upgrade=upgrade)

    assert len(player.upgrades) == 1
    assert player.upgrades[0].name == "power_boost"
    assert player.upgrades[0] is not upgrade


def test_pick_upgrade_not_available_raises(upgrade_factory: Callable[[str], Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    game.available_upgrades = [upgrade_factory("u1")]
    player = game.players[0]

    with pytest.raises(ValueError, match=r".+"):
        reward.pick_upgrade(game, player, upgrade=upgrade_factory("u2"))


def test_apply_upgrade_to_card(card_factory: Callable[..., Card], upgrade_factory: Callable[[str], Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    upgrade = upgrade_factory("power")
    target = card_factory("creature")
    player.upgrades = [upgrade]
    player.hand = [target]

    reward.apply_upgrade_to_card(player, upgrade, target=target)

    assert upgrade.upgrade_target is target
    assert upgrade.is_revealed is False


def test_hidden_applied_upgrades_do_not_count_until_revealed(
    card_factory: Callable[..., Card], upgrade_factory: Callable[[str], Card]
) -> None:
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    upgrade = upgrade_factory("power")
    target = card_factory("creature")
    player.hand = [target]
    player.upgrades = [upgrade]

    reward.apply_upgrade_to_card(player, upgrade, target=target)

    assert reward.count_applied_upgrades(player) == 0

    reward.reveal_upgrade(player, upgrade)

    assert reward.count_applied_upgrades(player) == 1


def test_apply_upgrade_to_card_already_applied_raises(
    card_factory: Callable[..., Card], upgrade_factory: Callable[[str], Card]
) -> None:
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    upgrade = upgrade_factory("power")
    upgrade.upgrade_target = card_factory("old_target")
    player.upgrades = [upgrade]

    with pytest.raises(ValueError, match=r".+"):
        reward.apply_upgrade_to_card(player, upgrade, target=card_factory("new_target"))


def test_start_reward_standard(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(10)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    alice, bob = game.players
    alice.phase = "reward"
    bob.phase = "reward"
    alice.round = 1
    bob.round = 1
    alice.treasures = 2
    bob.treasures = 1

    reward.start(game, alice, loser=bob)

    assert alice.treasures == 3
    assert bob.treasures == 2
    assert bob.poison == 1
    assert len(alice.sideboard) == 1
    assert len(bob.sideboard) == 1


def test_start_reward_stage_increase_gives_vanquisher(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    game.config.num_rounds_per_stage = 3
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    alice, bob = game.players
    alice.phase = "reward"
    bob.phase = "reward"
    alice.round = 3
    bob.round = 3

    reward.start(game, alice, loser=bob)

    assert alice.vanquishers == 1
    assert bob.vanquishers == 1
    assert len(alice.sideboard) == 0
    assert len(bob.sideboard) == 0


def test_end_reward_for_player_standard() -> None:
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "reward"
    player.round = 1

    reward.end_for_player(game, player)

    assert player.round == 2
    assert player.phase == "draft"


def test_end_reward_for_player_stage_increase(upgrade_factory: Callable[[str], Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    upgrade = upgrade_factory("power")
    game.available_upgrades = [upgrade]
    player = game.players[0]
    player.phase = "reward"
    player.round = 3
    player.stage = 1

    reward.end_for_player(game, player, upgrade_choice=upgrade)

    assert player.round == 1
    assert player.stage == 2
    assert len(player.upgrades) == 1


def test_end_reward_for_player_stage_increase_missing_choice_raises(upgrade_factory: Callable[[str], Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    game.available_upgrades = [upgrade_factory("u1")]
    player = game.players[0]
    player.phase = "reward"
    player.round = 3

    with pytest.raises(ValueError, match=r".+"):
        reward.end_for_player(game, player)


def test_start_reward_draw_applies_poison_to_both(
    card_factory: Callable[..., Card], upgrade_factory: Callable[[str], Card]
) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(10)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    alice, bob = game.players
    alice.phase = "reward"
    bob.phase = "reward"
    alice.round = 1
    bob.round = 1
    alice.treasures = 2
    bob.treasures = 1

    target = card_factory("target")
    alice.hand = [target]
    u1 = upgrade_factory("u1")
    u1.upgrade_target = target
    alice.upgrades = [u1]

    reward.start(game, alice, loser=bob, is_draw=True)

    assert alice.poison == 1
    assert bob.poison == 2
    assert alice.treasures == 3
    assert bob.treasures == 2
    assert len(alice.sideboard) == 1
    assert len(bob.sideboard) == 1


def test_end_reward_for_player_stage_increase_no_upgrade_when_disabled() -> None:
    """When use_upgrades=False, stage can increase without picking an upgrade."""
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    game.config.use_upgrades = False
    player = game.players[0]
    player.phase = "reward"
    player.round = 3
    player.stage = 1

    reward.end_for_player(game, player)

    assert player.round == 1
    assert player.stage == 2
    assert len(player.upgrades) == 0


def test_fibonacci_damage_formula() -> None:
    """Test fibonacci damage calculation: fib(hand_size - 2)."""
    game = create_game(["Alice", "Bob"], num_players=2)
    game.config.use_upgrades = False
    alice, bob = game.players
    alice.phase = "reward"
    bob.phase = "reward"

    alice.vanquishers = 0
    reward.apply_poison(alice, bob)
    assert bob.poison == 1

    bob.poison = 0
    alice.vanquishers = 1
    reward.apply_poison(alice, bob)
    assert bob.poison == 1

    bob.poison = 0
    alice.vanquishers = 2
    reward.apply_poison(alice, bob)
    assert bob.poison == 2

    bob.poison = 0
    alice.vanquishers = 3
    reward.apply_poison(alice, bob)
    assert bob.poison == 3

    bob.poison = 0
    alice.vanquishers = 4
    reward.apply_poison(alice, bob)
    assert bob.poison == 5


def test_static_opponent_deals_fibonacci_damage_without_upgrades(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    game.config.use_upgrades = False
    alice, bob = game.players
    bob.vanquishers = 3
    bob.hand = [card_factory(f"c{i}") for i in range(bob.hand_size)]
    ghost = StaticOpponent.from_player(bob)

    reward.apply_poison_static(game, alice, opponent=ghost, player_won=False, is_draw=False)

    assert alice.poison == 3


def test_vs_static_rewards_given_when_sudden_death_triggers_for_bots(card_factory: Callable[..., Card]) -> None:
    """Non-lethal player should receive vanquisher/treasure rewards even when.

    sudden death is triggered by multiple bots hitting lethal simultaneously.
    """
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    player = game.players[0]

    bot1 = Puppet(name="Bot1", player_history_id=1, poison=10)
    bot2 = Puppet(name="Bot2", player_history_id=2, poison=10)
    game.puppets = [bot1, bot2]

    player.round = 3
    player.stage = 5
    player.vanquishers = 2
    player.treasures = 2
    player.phase = "reward"

    opponent = StaticOpponent(name="Bot1", hand=[], source_player_history_id=1)

    reward.start_vs_static_rewards_only(
        game, player, opponent=opponent, player_won=True, is_draw=False, poison_dealt=1, poison_taken=0
    )

    assert player.vanquishers == 3
    assert player.treasures == 3
    assert player.last_battle_result is not None
    assert player.last_battle_result.vanquisher_gained is True
