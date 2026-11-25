"""The game manager: one object that owns every live game and lobby on this server.

Each base class is one domain service over the shared state in ``GameManagerState``, and each lists as its
bases only the services it calls, so a service can't reach into one built on top of it:

- ``SeatService`` builds on ``LobbyService``, which builds on ``BattlerLoader``, ``PuppetLoader`` and
  ``SnapshotStore``.
- ``ActionHandlers`` builds on ``RoundService``, which builds on ``SnapshotStore``.
- ``SnapshotStore`` builds on ``SpectatorService``, which builds on ``GameManagerState``.
"""

from server.services.game.action_handlers import ActionHandlers
from server.services.game.seat_service import SeatService


class GameManager(SeatService, ActionHandlers):
    pass
