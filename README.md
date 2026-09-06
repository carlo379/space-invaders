# Space Invaders // The Breach

A self-contained, canvas-based classic Space Invaders game with animated alien horrors, procedural Web Audio, and no build step or external game assets.

## Open

- Directly: open `/workspace/space-invaders/index.html` in desktop Chrome.
- Via the included server: visit [http://127.0.0.1:8765/](http://127.0.0.1:8765/) after running:

```bash
python3 -m http.server 8765 --directory /workspace/space-invaders
```

## Controls

Core controls:

- **Left/Right arrows** or **A/D** — move the ship
- **Space** — fire (also starts/restarts from the title/game-over screen)
- **Shift** or **F** — fire a Super Laser
- **R** — restart at any time

Destroy every alien to advance to a faster wave. You start with three lives; alien bombs and collisions with the descending fleet are dangerous.

The Super Laser starts with **3 charges** (shown in the HUD), destroys every living alien in one column, and has a bright vertical beam plus a Web Audio zap. It targets the column containing the living alien horizontally nearest to your ship; if columns tie, it chooses the column whose center is closest to the ship. You regain one charge every third wave, up to 5 charges.
