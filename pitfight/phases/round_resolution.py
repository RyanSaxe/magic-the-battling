"""Single owner for legal phase transitions and post-battle / end-of-round resolution.

All player phase changes validate against ``LEGAL_PHASE_TRANSITIONS`` via
``transition_phase``. Post-battle and end-of-round resolution applies poison,
checks lethal thresholds, settles same-round placements, freezes puppet ghosts,
enters Sudden Death, and finalizes game-over state without server or DB imports.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal
from uuid import uuid4

from pitfight.models.game import (
    Battle,
    BattleResolution,
    BattleResolutionEvent,
    BattleResolutionSide,
    Game,
    Player,
    Puppet,
    StaticOpponent,
)
from pitfight.phases import battle, reward
from pitfight.phases.elimination import (
    Participant,
    check_game_over,
    eliminate_player,
    eliminate_puppet,
    get_live_players,
    get_live_puppets,
    get_sudden_death_fighters,
    get_would_be_dead,
    get_would_be_dead_puppets,
    needs_sudden_death,
    participant_join_order,
    process_puppet_eliminations,
    setup_sudden_death_battle,
    would_be_dead_ready_for_elimination,
)

if TYPE_CHECKING:
    from pitfight.models.types import Phase

ResolutionStatus = Literal["game_over", "sudden_death"]

LEGAL_PHASE_TRANSITIONS: dict[Phase, frozenset[Phase]] = {
    "draft": frozenset({"build", "eliminated", "winner", "game_over"}),
    "build": frozenset({"battle", "eliminated", "winner", "game_over"}),
    "battle": frozenset({"reward", "build", "awaiting_elimination", "eliminated", "winner", "game_over"}),
    "reward": frozenset({"draft", "winner", "game_over"}),
    "awaiting_elimination": frozenset({"eliminated", "build", "game_over"}),
    "eliminated": frozenset(),
    "winner": frozenset(),
    "game_over": frozenset(),
}

_TERMINAL_PHASES: frozenset[Phase] = frozenset({"eliminated", "winner", "game_over"})
_FINALE_PARTICIPANT_COUNT = 2


class InvalidPhaseTransitionError(ValueError):
    pass


@dataclass(frozen=True)
class RoundResolutionOutcome:
    status: ResolutionStatus | None = None
    winner: Player | None = None
    eliminated: tuple[Participant, ...] = ()
    check_round_start: bool = False


@dataclass(frozen=True)
class _StaticPoisonSummary:
    player_won: bool
    is_draw: bool
    winner_name: str | None
    poison_dealt: int
    poison_taken: int
    player_start_poison: int
    opponent_start_poison: int
    player_at_lethal: bool
    bot_at_lethal: bool
    is_finale: bool
    puppet: Puppet | None


@dataclass(frozen=True)
class _PvpPoisonSummary:
    is_draw: bool
    winner_name: str | None
    p1_poison: int
    p2_poison: int
    poison_dealt: int
    player_start_poison: int
    opponent_start_poison: int
    player_damage: int
    opponent_damage: int
    player_at_lethal: bool
    opponent_at_lethal: bool
    is_finale: bool
    battle_result: battle.BattleResult


def transition_phase(player: Player, target: Phase) -> Phase:
    allowed = LEGAL_PHASE_TRANSITIONS[player.phase]
    if target not in allowed:
        msg = f"Illegal phase transition for {player.name}: {player.phase} -> {target}"
        raise InvalidPhaseTransitionError(msg)
    player.phase = target
    return target


def _eliminate_human(game: Game, player: Player) -> None:
    transition_phase(player, "eliminated")
    eliminate_player(game, player, round_num=player.round, stage_num=player.stage)


def finalize_game_over(game: Game, winner: Player | None) -> None:
    live_players = get_live_players(game)
    live_bots = get_live_puppets(game)

    if winner is not None:
        if winner.phase != "winner":
            transition_phase(winner, "winner")
        winner.placement = 1

    winner_name = winner.name if winner is not None else ""
    remaining_humans = [p for p in live_players if p.placement == 0 and p.name != winner_name]
    unplaced_bots = [fp for fp in live_bots if fp.placement == 0]

    join_index = participant_join_order(game)
    all_unplaced: list[Participant] = [*remaining_humans, *unplaced_bots]
    all_unplaced.sort(key=lambda p: (p.poison, join_index.get(id(p), 0)))

    start_place = 2 if winner is not None else 1
    for offset, participant in enumerate(all_unplaced):
        participant.placement = start_place + offset

    for player in game.players:
        if player.phase not in _TERMINAL_PHASES:
            transition_phase(player, "game_over")


def _find_puppet_for_opponent(game: Game, opponent: StaticOpponent) -> Puppet | None:
    if not opponent.source_player_history_id:
        return None
    return next(
        (puppet for puppet in game.puppets if puppet.player_history_id == opponent.source_player_history_id),
        None,
    )


def _opponent_poison(opponent: StaticOpponent | Player, game: Game) -> int:
    if isinstance(opponent, StaticOpponent):
        puppet = _find_puppet_for_opponent(game, opponent)
        if puppet is not None:
            return puppet.poison
    return opponent.poison


def _build_resolution_events(
    attacker: Player | StaticOpponent | None,
    damage: int,
    *,
    use_upgrades: bool,
) -> list[BattleResolutionEvent]:
    if attacker is None or damage <= 0:
        return []
    if use_upgrades:
        return reward.build_damage_events(attacker, use_upgrades=True)
    return [BattleResolutionEvent(event_type="base_increment") for _ in range(damage)]


def _make_resolution_side(
    name: str,
    *,
    starting_poison: int,
    ending_poison: int,
    damage_taken: int,
    attacker: Player | StaticOpponent | None,
    use_upgrades: bool,
    poison_to_lose: int,
) -> BattleResolutionSide:
    took_lethal_damage = damage_taken > 0 and ending_poison >= poison_to_lose
    return BattleResolutionSide(
        name=name,
        starting_poison=starting_poison,
        ending_poison=ending_poison,
        poison_delta=damage_taken,
        took_damage=damage_taken > 0,
        is_lethal=ending_poison >= poison_to_lose,
        show_death_animation=took_lethal_damage,
        events=_build_resolution_events(attacker, damage_taken, use_upgrades=use_upgrades),
    )


def _assign_battle_resolution(
    viewer: Player,
    opponent_name: str,
    *,
    winner_name: str | None,
    is_draw: bool,
    is_sudden_death: bool,
    continue_sudden_death: bool,
    your_side: BattleResolutionSide,
    opponent_side: BattleResolutionSide,
) -> None:
    viewer.battle_resolution = BattleResolution(
        resolution_id=f"{viewer.name}:{viewer.stage}:{viewer.round}:{opponent_name}:{uuid4().hex[:8]}",
        winner_name=winner_name,
        is_draw=is_draw,
        is_sudden_death=is_sudden_death,
        continue_sudden_death=continue_sudden_death,
        your_side=your_side,
        opponent_side=opponent_side,
    )


def _record_static_resolution(
    game: Game,
    player: Player,
    *,
    opponent: StaticOpponent,
    summary: _StaticPoisonSummary,
    was_sudden_death: bool,
    continue_sudden_death: bool,
) -> None:
    use_upgrades = game.config.use_upgrades
    poison_to_lose = game.config.poison_to_lose
    your_side = _make_resolution_side(
        player.name,
        starting_poison=summary.player_start_poison,
        ending_poison=player.poison,
        damage_taken=summary.poison_taken,
        attacker=opponent if summary.poison_taken > 0 else None,
        use_upgrades=use_upgrades,
        poison_to_lose=poison_to_lose,
    )
    # A ghost's damage still plays in the animation, though its total no longer moves.
    opponent_side = _make_resolution_side(
        opponent.name,
        starting_poison=summary.opponent_start_poison,
        ending_poison=summary.opponent_start_poison + summary.poison_dealt,
        damage_taken=summary.poison_dealt,
        attacker=player if summary.poison_dealt > 0 else None,
        use_upgrades=use_upgrades,
        poison_to_lose=poison_to_lose,
    )
    _assign_battle_resolution(
        player,
        opponent.name,
        winner_name=summary.winner_name,
        is_draw=summary.is_draw,
        is_sudden_death=was_sudden_death,
        continue_sudden_death=continue_sudden_death,
        your_side=your_side,
        opponent_side=opponent_side,
    )


def _record_pvp_resolution(
    game: Game,
    player: Player,
    *,
    opponent: Player,
    summary: _PvpPoisonSummary,
    was_sudden_death: bool,
    continue_sudden_death: bool,
) -> None:
    use_upgrades = game.config.use_upgrades
    poison_to_lose = game.config.poison_to_lose
    player_side = _make_resolution_side(
        player.name,
        starting_poison=summary.player_start_poison,
        ending_poison=player.poison,
        damage_taken=summary.player_damage,
        attacker=opponent if summary.player_damage > 0 else None,
        use_upgrades=use_upgrades,
        poison_to_lose=poison_to_lose,
    )
    opponent_side = _make_resolution_side(
        opponent.name,
        starting_poison=summary.opponent_start_poison,
        ending_poison=opponent.poison,
        damage_taken=summary.opponent_damage,
        attacker=player if summary.opponent_damage > 0 else None,
        use_upgrades=use_upgrades,
        poison_to_lose=poison_to_lose,
    )
    _assign_battle_resolution(
        player,
        opponent.name,
        winner_name=summary.winner_name,
        is_draw=summary.is_draw,
        is_sudden_death=was_sudden_death,
        continue_sudden_death=continue_sudden_death,
        your_side=player_side,
        opponent_side=opponent_side,
    )
    _assign_battle_resolution(
        opponent,
        player.name,
        winner_name=summary.winner_name,
        is_draw=summary.is_draw,
        is_sudden_death=was_sudden_death,
        continue_sudden_death=continue_sudden_death,
        your_side=opponent_side,
        opponent_side=player_side,
    )


def _merge_eliminated(
    eliminated: tuple[Participant, ...],
    outcome: RoundResolutionOutcome,
) -> RoundResolutionOutcome:
    if not eliminated:
        return outcome
    return RoundResolutionOutcome(
        status=outcome.status,
        winner=outcome.winner,
        eliminated=(*eliminated, *outcome.eliminated),
        check_round_start=outcome.check_round_start,
    )


def _apply_static_poison(
    game: Game,
    player: Player,
    *,
    opponent: StaticOpponent,
    result: battle.BattleResult,
    player_start_poison: int,
    opponent_start_poison: int,
) -> _StaticPoisonSummary:
    player_won = result.winner is not None and result.winner.name == player.name
    is_draw = result.is_draw
    puppet = _find_puppet_for_opponent(game, opponent)
    # The Ghost is already out, so a fight against it is never the finale, even with two players left.
    is_finale = (
        puppet is not None
        and not puppet.is_eliminated
        and len(get_live_players(game)) + len(get_live_puppets(game)) == _FINALE_PARTICIPANT_COUNT
    )
    poison_info = reward.apply_poison_static(game, player, opponent=opponent, player_won=player_won, is_draw=is_draw)
    winner_name: str | None = player.name if player_won else (None if is_draw else opponent.name)
    poison_to_lose = game.config.poison_to_lose
    return _StaticPoisonSummary(
        player_won=player_won,
        is_draw=is_draw,
        winner_name=winner_name,
        poison_dealt=poison_info["poison_dealt"],
        poison_taken=poison_info["poison_taken"],
        player_start_poison=player_start_poison,
        opponent_start_poison=opponent_start_poison,
        player_at_lethal=player.poison >= poison_to_lose,
        bot_at_lethal=puppet is not None and puppet.poison >= poison_to_lose,
        is_finale=is_finale,
        puppet=puppet,
    )


def _set_static_no_rewards(player: Player, opponent_name: str, *, summary: _StaticPoisonSummary) -> None:
    reward.set_last_battle_result_no_rewards(
        player,
        opponent_name,
        winner_name=summary.winner_name,
        is_draw=summary.is_draw,
        poison_dealt=summary.poison_dealt,
        poison_taken=summary.poison_taken,
    )


def _resolve_static_sudden_death(
    game: Game,
    player: Player,
    *,
    opponent: StaticOpponent,
    puppet: Puppet,
    summary: _StaticPoisonSummary,
) -> RoundResolutionOutcome:
    if not summary.player_at_lethal and not summary.bot_at_lethal:
        _set_static_no_rewards(player, opponent.name, summary=summary)
        transition_phase(player, "build")
        return RoundResolutionOutcome()

    if summary.player_at_lethal and summary.bot_at_lethal:
        _set_static_no_rewards(player, opponent.name, summary=summary)
        setup_sudden_death_battle(game, player, p2=puppet)
        transition_phase(player, "build")
        return RoundResolutionOutcome()

    player.in_sudden_death = summary.player_at_lethal
    puppet.in_sudden_death = summary.bot_at_lethal

    if summary.player_at_lethal:
        _set_static_no_rewards(player, opponent.name, summary=summary)
        _eliminate_human(game, player)
        dead_puppets = tuple(process_puppet_eliminations(game))
        eliminated: tuple[Participant, ...] = (player, *dead_puppets)
        winner, is_over = check_game_over(game)
        if is_over:
            finalize_game_over(game, winner)
            return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=eliminated)
        return RoundResolutionOutcome(eliminated=eliminated, check_round_start=True)

    dead_puppets = tuple(process_puppet_eliminations(game))
    winner, is_over = check_game_over(game)
    if is_over and winner is not None:
        _set_static_no_rewards(player, opponent.name, summary=summary)
        finalize_game_over(game, winner)
        return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=dead_puppets)

    transition_phase(player, "reward")
    reward.start_vs_static_rewards_only(
        game,
        player,
        opponent=opponent,
        player_won=summary.player_won,
        is_draw=summary.is_draw,
        poison_dealt=summary.poison_dealt,
        poison_taken=summary.poison_taken,
    )
    return RoundResolutionOutcome(eliminated=dead_puppets)


def _resolve_static_finale_or_reward(
    game: Game,
    player: Player,
    *,
    opponent: StaticOpponent,
    summary: _StaticPoisonSummary,
    rng: random.Random | None,
) -> RoundResolutionOutcome:
    dead_puppets = tuple(process_puppet_eliminations(game))

    if summary.is_finale and summary.player_at_lethal:
        _set_static_no_rewards(player, opponent.name, summary=summary)
        _eliminate_human(game, player)
        finalize_game_over(game, None)
        return RoundResolutionOutcome(status="game_over", winner=None, eliminated=(*dead_puppets, player))

    if summary.is_finale:
        winner, is_over = check_game_over(game)
        if is_over and winner is not None:
            _set_static_no_rewards(player, opponent.name, summary=summary)
            finalize_game_over(game, winner)
            return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=dead_puppets)

    transition_phase(player, "reward")
    reward.start_vs_static_rewards_only(
        game,
        player,
        opponent=opponent,
        player_won=summary.player_won,
        is_draw=summary.is_draw,
        poison_dealt=summary.poison_dealt,
        poison_taken=summary.poison_taken,
    )
    winner, is_over = check_game_over(game)
    if is_over:
        finalize_game_over(game, winner)
        return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=dead_puppets)

    return _merge_eliminated(dead_puppets, resolve_end_of_round(game, rng=rng))


def _resolve_static_battle(
    game: Game,
    active_battle: Battle,
    *,
    opponent: StaticOpponent,
    rng: random.Random | None,
) -> RoundResolutionOutcome:
    player = active_battle.player
    was_sudden_death = active_battle.is_sudden_death
    player_start_poison = player.poison
    opponent_start_poison = _opponent_poison(opponent, game)
    result = battle.end(game, active_battle)

    summary = _apply_static_poison(
        game,
        player,
        opponent=opponent,
        result=result,
        player_start_poison=player_start_poison,
        opponent_start_poison=opponent_start_poison,
    )
    continue_sd = summary.puppet is not None and (
        (was_sudden_death and summary.player_at_lethal == summary.bot_at_lethal)
        or (summary.is_finale and summary.player_at_lethal and summary.bot_at_lethal)
    )
    _record_static_resolution(
        game,
        player,
        opponent=opponent,
        summary=summary,
        was_sudden_death=was_sudden_death,
        continue_sudden_death=continue_sd,
    )

    if was_sudden_death and summary.puppet is not None:
        return _resolve_static_sudden_death(game, player, opponent=opponent, puppet=summary.puppet, summary=summary)

    if summary.is_finale and summary.player_at_lethal and summary.bot_at_lethal and summary.puppet is not None:
        _set_static_no_rewards(player, opponent.name, summary=summary)
        setup_sudden_death_battle(game, player, p2=summary.puppet)
        transition_phase(player, "build")
        player.in_sudden_death = True
        summary.puppet.in_sudden_death = True
        return RoundResolutionOutcome(status="sudden_death")

    if not summary.is_finale and summary.player_at_lethal:
        _set_static_no_rewards(player, opponent.name, summary=summary)
        transition_phase(player, "awaiting_elimination")
        return resolve_end_of_round(game, rng=rng)

    if not summary.is_finale and needs_sudden_death(game):
        transition_phase(player, "reward")
        reward.start_vs_static_rewards_only(
            game,
            player,
            opponent=opponent,
            player_won=summary.player_won,
            is_draw=summary.is_draw,
            poison_dealt=summary.poison_dealt,
            poison_taken=summary.poison_taken,
        )
        return resolve_end_of_round(game, rng=rng)

    return _resolve_static_finale_or_reward(game, player, opponent=opponent, summary=summary, rng=rng)


def _apply_pvp_poison(
    game: Game,
    player: Player,
    *,
    opponent: Player,
    result: battle.BattleResult,
    player_start_poison: int,
    opponent_start_poison: int,
) -> _PvpPoisonSummary:
    is_draw = result.is_draw
    is_finale = len(get_live_players(game)) + len(get_live_puppets(game)) == _FINALE_PARTICIPANT_COUNT
    p1_poison = 0
    p2_poison = 0
    poison_dealt = 0
    winner_name: str | None = None

    if is_draw:
        poison_info = reward.apply_poison_pvp(game, player, opponent=opponent, is_draw=True, winner_name=None)
        p1_poison = poison_info["player_poison_taken"]
        p2_poison = poison_info["opponent_poison_taken"]
    else:
        winner = result.winner
        if winner is None or result.loser is None:
            msg = "Non-draw PvP battle must have both winner and loser"
            raise ValueError(msg)
        poison_info = reward.apply_poison_pvp(game, player, opponent=opponent, is_draw=False, winner_name=winner.name)
        poison_dealt = poison_info["poison"]
        winner_name = winner.name

    player_damage = p1_poison if is_draw else (0 if winner_name == player.name else poison_dealt)
    opponent_damage = p2_poison if is_draw else (poison_dealt if winner_name == player.name else 0)
    poison_to_lose = game.config.poison_to_lose
    return _PvpPoisonSummary(
        is_draw=is_draw,
        winner_name=winner_name,
        p1_poison=p1_poison,
        p2_poison=p2_poison,
        poison_dealt=poison_dealt,
        player_start_poison=player_start_poison,
        opponent_start_poison=opponent_start_poison,
        player_damage=player_damage,
        opponent_damage=opponent_damage,
        player_at_lethal=player.poison >= poison_to_lose,
        opponent_at_lethal=opponent.poison >= poison_to_lose,
        is_finale=is_finale,
        battle_result=result,
    )


def _set_player_result_no_rewards(
    player: Player,
    opponent_name: str,
    *,
    is_draw: bool,
    winner_name: str | None,
    poison_taken: int,
    poison_dealt: int,
) -> None:
    if is_draw:
        reward.set_last_battle_result_no_rewards(
            player,
            opponent_name,
            winner_name=None,
            is_draw=True,
            poison_dealt=0,
            poison_taken=poison_taken,
        )
        return
    player_won = winner_name == player.name
    reward.set_last_battle_result_no_rewards(
        player,
        opponent_name,
        winner_name=winner_name,
        is_draw=False,
        poison_dealt=poison_dealt if player_won else 0,
        poison_taken=0 if player_won else poison_dealt,
    )


def _set_pvp_results_no_rewards(player: Player, opponent: Player, *, summary: _PvpPoisonSummary) -> None:
    _set_player_result_no_rewards(
        player,
        opponent.name,
        is_draw=summary.is_draw,
        winner_name=summary.winner_name,
        poison_taken=summary.p1_poison,
        poison_dealt=summary.poison_dealt,
    )
    _set_player_result_no_rewards(
        opponent,
        player.name,
        is_draw=summary.is_draw,
        winner_name=summary.winner_name,
        poison_taken=summary.p2_poison,
        poison_dealt=summary.poison_dealt,
    )


def _start_pvp_rewards(game: Game, player: Player, *, opponent: Player, summary: _PvpPoisonSummary) -> None:
    transition_phase(player, "reward")
    transition_phase(opponent, "reward")
    if summary.is_draw:
        reward.start_rewards_draw(
            game, player, player2=opponent, p1_poison=summary.p1_poison, p2_poison=summary.p2_poison
        )
        return
    winner = summary.battle_result.winner
    loser = summary.battle_result.loser
    if winner is None or loser is None:
        msg = "Non-draw PvP battle must have both winner and loser"
        raise ValueError(msg)
    reward.start_rewards_only(game, winner, loser=loser, poison_dealt=summary.poison_dealt)


def _start_single_reward(
    game: Game,
    player: Player,
    *,
    opponent_name: str,
    is_draw: bool,
    winner_name: str | None,
    poison_taken: int,
    poison_dealt: int,
) -> None:
    transition_phase(player, "reward")
    if is_draw:
        reward.start_rewards_single(
            game,
            player,
            opponent_name=opponent_name,
            won=False,
            poison_dealt=poison_dealt,
            poison_taken=poison_taken,
            is_draw=True,
        )
        return
    player_won = winner_name == player.name
    reward.start_rewards_single(
        game,
        player,
        opponent_name=opponent_name,
        won=player_won,
        poison_dealt=poison_dealt if player_won else 0,
        poison_taken=0 if player_won else poison_dealt,
    )


def _resolve_pvp_finale(
    game: Game,
    player: Player,
    *,
    opponent: Player,
    summary: _PvpPoisonSummary,
    was_sudden_death: bool,
) -> RoundResolutionOutcome:
    dead_puppets = tuple(process_puppet_eliminations(game))

    if was_sudden_death and not summary.player_at_lethal and not summary.opponent_at_lethal:
        _set_pvp_results_no_rewards(player, opponent, summary=summary)
        transition_phase(player, "build")
        transition_phase(opponent, "build")
        return RoundResolutionOutcome(eliminated=dead_puppets)

    if summary.player_at_lethal and summary.opponent_at_lethal:
        _set_pvp_results_no_rewards(player, opponent, summary=summary)
        setup_sudden_death_battle(game, player, p2=opponent)
        transition_phase(player, "build")
        transition_phase(opponent, "build")
        player.in_sudden_death = True
        opponent.in_sudden_death = True
        status: ResolutionStatus | None = None if was_sudden_death else "sudden_death"
        return RoundResolutionOutcome(status=status, eliminated=dead_puppets)

    if summary.player_at_lethal or summary.opponent_at_lethal:
        if was_sudden_death:
            player.in_sudden_death = summary.player_at_lethal
            opponent.in_sudden_death = summary.opponent_at_lethal
        _set_pvp_results_no_rewards(player, opponent, summary=summary)
        loser, winner = (player, opponent) if summary.player_at_lethal else (opponent, player)
        _eliminate_human(game, loser)
        finalize_game_over(game, winner)
        return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=(*dead_puppets, loser))

    _start_pvp_rewards(game, player, opponent=opponent, summary=summary)
    return RoundResolutionOutcome(eliminated=dead_puppets)


def _resolve_pvp_non_finale(
    game: Game,
    player: Player,
    *,
    opponent: Player,
    summary: _PvpPoisonSummary,
    was_sudden_death: bool,
    rng: random.Random | None,
) -> RoundResolutionOutcome:
    if was_sudden_death:
        if not summary.player_at_lethal and not summary.opponent_at_lethal:
            _set_pvp_results_no_rewards(player, opponent, summary=summary)
            transition_phase(player, "build")
            transition_phase(opponent, "build")
            return RoundResolutionOutcome()
        player.in_sudden_death = summary.player_at_lethal
        opponent.in_sudden_death = summary.opponent_at_lethal

    if summary.player_at_lethal and summary.opponent_at_lethal:
        _set_pvp_results_no_rewards(player, opponent, summary=summary)
        transition_phase(player, "awaiting_elimination")
        transition_phase(opponent, "awaiting_elimination")
        return resolve_end_of_round(game, rng=rng)

    if summary.player_at_lethal or summary.opponent_at_lethal:
        lethal_player, survivor = (player, opponent) if summary.player_at_lethal else (opponent, player)
        lethal_taken = summary.p1_poison if summary.player_at_lethal else summary.p2_poison
        survivor_taken = summary.p2_poison if summary.player_at_lethal else summary.p1_poison
        survivor_dealt = lethal_taken if summary.is_draw else summary.poison_dealt
        _set_player_result_no_rewards(
            lethal_player,
            survivor.name,
            is_draw=summary.is_draw,
            winner_name=summary.winner_name,
            poison_taken=lethal_taken,
            poison_dealt=summary.poison_dealt,
        )
        transition_phase(lethal_player, "awaiting_elimination")
        _start_single_reward(
            game,
            survivor,
            opponent_name=lethal_player.name,
            is_draw=summary.is_draw,
            winner_name=summary.winner_name,
            poison_taken=survivor_taken,
            poison_dealt=survivor_dealt,
        )
        return resolve_end_of_round(game, rng=rng)

    dead_puppets = tuple(process_puppet_eliminations(game))
    _start_pvp_rewards(game, player, opponent=opponent, summary=summary)
    return _merge_eliminated(dead_puppets, resolve_end_of_round(game, rng=rng))


def _resolve_pvp_battle(
    game: Game,
    active_battle: Battle,
    *,
    opponent: Player,
    rng: random.Random | None,
) -> RoundResolutionOutcome:
    player = active_battle.player
    was_sudden_death = active_battle.is_sudden_death
    player_start_poison = player.poison
    opponent_start_poison = opponent.poison
    result = battle.end(game, active_battle)

    summary = _apply_pvp_poison(
        game,
        player,
        opponent=opponent,
        result=result,
        player_start_poison=player_start_poison,
        opponent_start_poison=opponent_start_poison,
    )
    continue_sd = (was_sudden_death and not summary.player_at_lethal and not summary.opponent_at_lethal) or (
        summary.is_finale and summary.player_at_lethal and summary.opponent_at_lethal
    )
    _record_pvp_resolution(
        game,
        player,
        opponent=opponent,
        summary=summary,
        was_sudden_death=was_sudden_death,
        continue_sudden_death=continue_sd,
    )

    if summary.is_finale:
        return _resolve_pvp_finale(
            game,
            player,
            opponent=opponent,
            summary=summary,
            was_sudden_death=was_sudden_death,
        )
    return _resolve_pvp_non_finale(
        game,
        player,
        opponent=opponent,
        summary=summary,
        was_sudden_death=was_sudden_death,
        rng=rng,
    )


def resolve_battle(
    game: Game,
    active_battle: Battle,
    *,
    rng: random.Random | None = None,
) -> RoundResolutionOutcome:
    opponent = active_battle.opponent
    if isinstance(opponent, StaticOpponent):
        return _resolve_static_battle(game, active_battle, opponent=opponent, rng=rng)
    return _resolve_pvp_battle(game, active_battle, opponent=opponent, rng=rng)


def _eliminate_non_fighters(game: Game, fighter_names: set[str]) -> list[Participant]:
    eliminated: list[Participant] = []
    for player in get_would_be_dead(game):
        if player.name not in fighter_names:
            _eliminate_human(game, player)
            eliminated.append(player)
    for puppet in get_would_be_dead_puppets(game):
        if puppet.name not in fighter_names:
            eliminate_puppet(game, puppet)
            eliminated.append(puppet)
    return eliminated


def _resolve_puppet_vs_puppet_sudden_death(
    game: Game,
    puppets: list[Puppet],
    *,
    prior_eliminated: list[Participant],
    rng: random.Random | None,
) -> RoundResolutionOutcome:
    chooser = rng.choice if rng is not None else random.choice
    loser = chooser(puppets)
    winner_puppet = puppets[0] if loser is puppets[1] else puppets[1]
    loser.in_sudden_death = True
    eliminate_puppet(game, loser)
    eliminated: tuple[Participant, ...] = (*prior_eliminated, loser)
    winner_puppet.poison = game.config.poison_to_lose - 1

    winner, is_over = check_game_over(game)
    if is_over:
        finalize_game_over(game, winner)
        return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=eliminated)
    return RoundResolutionOutcome(eliminated=eliminated, check_round_start=True)


def resolve_end_of_round(game: Game, *, rng: random.Random | None = None) -> RoundResolutionOutcome:
    if not would_be_dead_ready_for_elimination(game):
        return RoundResolutionOutcome(check_round_start=True)

    if not needs_sudden_death(game):
        eliminated = _eliminate_non_fighters(game, set())
        eliminated.extend(process_puppet_eliminations(game))
        winner, is_over = check_game_over(game)
        if is_over:
            finalize_game_over(game, winner)
            return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=tuple(eliminated))
        return RoundResolutionOutcome(eliminated=tuple(eliminated), check_round_start=True)

    fighters = get_sudden_death_fighters(game)
    if fighters is None:
        return RoundResolutionOutcome(check_round_start=True)

    f1, f2 = fighters
    eliminated = _eliminate_non_fighters(game, {f1.name, f2.name})
    humans = [fighter for fighter in (f1, f2) if isinstance(fighter, Player)]
    puppets = [fighter for fighter in (f1, f2) if isinstance(fighter, Puppet)]

    if len(puppets) == _FINALE_PARTICIPANT_COUNT:
        return _resolve_puppet_vs_puppet_sudden_death(game, puppets, prior_eliminated=eliminated, rng=rng)

    setup_sudden_death_battle(game, f1, p2=f2)
    for human in humans:
        human.in_sudden_death = True
        transition_phase(human, "build")
    for puppet in puppets:
        puppet.in_sudden_death = True
    return RoundResolutionOutcome(status="sudden_death", eliminated=tuple(eliminated))


def _advance_puppet_if_needed(game: Game, opponent_name: str | None) -> None:
    if not opponent_name:
        return
    num_rounds = game.config.num_rounds_per_stage
    for puppet in game.puppets:
        if puppet.name == opponent_name and not puppet.is_eliminated:
            if puppet.round >= num_rounds:
                puppet.stage += 1
                puppet.round = 1
            else:
                puppet.round += 1
            return


def resolve_reward_done(
    game: Game,
    player: Player,
    *,
    upgrade_id: str | None = None,
) -> RoundResolutionOutcome:
    if player.phase != "reward":
        msg = "Player is not in reward phase"
        raise ValueError(msg)

    opponent_name = player.last_opponent_name
    upgrade = next((u for u in game.available_upgrades if u.id == upgrade_id), None) if upgrade_id else None
    reward.end_for_player(game, player, upgrade_choice=upgrade)
    _advance_puppet_if_needed(game, opponent_name)

    dead_puppets = tuple(process_puppet_eliminations(game)) if not get_would_be_dead(game) else ()
    winner, is_over = check_game_over(game)
    if is_over:
        finalize_game_over(game, winner)
        return RoundResolutionOutcome(status="game_over", winner=winner, eliminated=dead_puppets)
    return RoundResolutionOutcome(eliminated=dead_puppets)


__all__ = [
    "LEGAL_PHASE_TRANSITIONS",
    "InvalidPhaseTransitionError",
    "ResolutionStatus",
    "RoundResolutionOutcome",
    "finalize_game_over",
    "resolve_battle",
    "resolve_end_of_round",
    "resolve_reward_done",
    "transition_phase",
]
