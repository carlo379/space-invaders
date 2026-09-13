# Scary Invaders

Canvas Space Invaders with horror branding and pixel sprites. No build step — open the HTML file or serve the folder statically.

## Open

- Directly: open `index.html` in a desktop browser (Chrome recommended). Sprite paths are relative (`assets/...`) and work with `file://` or a static server.
- Via a local server:

```bash
python3 -m http.server 8765 --directory /workspace/space-invaders
```

Then visit [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Assets

PNG sprites live in `assets/` (player, six alien row types, barriers, bullet, bomb). Drawn with nearest-neighbor `drawImage`; collision hitboxes are unchanged from the arcade core.

## Controls

- **Left/Right arrows** or **A/D** — move the ship
- **Space** — fire (also starts/restarts from the title/game-over screen)
- **Shift** or **F** — Super Laser (column wipe)
- **R** — restart at any time

Destroy every alien to advance waves. Three lives; Super Laser starts with **3** charges (up to 5, +1 every third wave).
