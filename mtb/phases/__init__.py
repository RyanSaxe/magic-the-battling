from mtb.phases import battle, build, draft, reward
from mtb.phases.battle import (
    BattleResult,
    can_start_pairing,
    find_opponent,
    get_pairing_candidates,
    get_result,
    get_zones_for_player,
    is_in_active_battle,
    move_zone,
    results_agreed,
    submit_result,
    weighted_random_opponent,
)
from mtb.phases.build import VALID_BASICS, move_card
from mtb.phases.draft import deal_pack, roll, swap
from mtb.phases.reward import (
    apply_poison,
    apply_upgrade_to_card,
    award_random_card,
    count_applied_upgrades,
    is_stage_increasing,
    pick_upgrade,
)

__all__ = [
    # module namespaces (primary way to access phase functions)
    "battle",
    "build",
    "draft",
    "reward",
    # draft helpers
    "deal_pack",
    "roll",
    "swap",
    # build helpers
    "VALID_BASICS",
    "move_card",
    # battle helpers
    "BattleResult",
    "is_in_active_battle",
    "can_start_pairing",
    "get_pairing_candidates",
    "find_opponent",
    "weighted_random_opponent",
    "get_zones_for_player",
    "move_zone",
    "submit_result",
    "results_agreed",
    "get_result",
    # reward helpers
    "is_stage_increasing",
    "count_applied_upgrades",
    "apply_poison",
    "award_random_card",
    "pick_upgrade",
    "apply_upgrade_to_card",
]
