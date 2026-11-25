# Crucible documentation

Documentation is organized by task across setup, architecture, operations, and reference.

## Getting started

- [Local setup](getting-started/local-setup.md): install dependencies, run the dev stack, test against temporary DB copies, and run linters and tests.

## Concepts

- [Architecture](concepts/architecture.md): system boundaries, the round phase loop, ghosts and historical puppets, real-time state sync and snapshots, and naming conventions.

## Guides

- [Deployment and operations](guides/deployment-and-ops.md): Fly.io container startup, PR labels for deploy drains and GitHub releases, ops mode controls, and `fly_activity_report.py`.

## Reference

- [Configuration and API](reference/configuration-and-api.md): environment variables and defaults, HTTP API route groups, and phase-gated WebSocket actions.
