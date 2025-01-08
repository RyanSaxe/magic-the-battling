import requests


def get_json(url: str) -> dict:
    response = requests.get(url)
    return response.json()
