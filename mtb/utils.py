from functools import lru_cache

import requests


@lru_cache
def get_json(url: str) -> dict:
    response = requests.get(url)
    return response.json()
