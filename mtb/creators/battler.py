import requests

from mtb.models.cards import Battler, Card

# MOVE THESE DEFAULTS TO API SIDE
DEFAULT_VANGUARD_ID = "default_mtb_vanguards"
DEFAULT_BATTLER_ID = "auto"
DEFAULT_UPGRADES_ID = "default_mtb_upgrades"


def get_cube_data(cube_id) -> list[Card]:
    url = f"https://cubecobra.com/cube/api/cubejson/{cube_id}"

    response = requests.get(url)
    data = response.json()
    cube = data["cards"]["mainboard"]

    return [Card.from_cubecobra_json(card_json) for card_json in cube]


def build_battler(battler_id=DEFAULT_BATTLER_ID, upgrades_id=DEFAULT_UPGRADES_ID, vanguards_id=DEFAULT_VANGUARD_ID):
    battler = Battler(
        cards=get_cube_data(battler_id),
        upgrades=get_cube_data(upgrades_id),
        vanguards=get_cube_data(vanguards_id),
    )

    return battler
