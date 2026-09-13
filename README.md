# Scary Invaders (Three.js 3D)

Fully **3D** arcade Space Invaders with horror branding. Built with **Three.js** (CDN, no build step) — real perspective camera, FogExp2 void, chase-arcade framing. Not faux-2D.

## Art redo (2026-09-13)

**FULL ART REDO** locked to chase-cam scene v2 + style guide (`scary-invaders-art/redo-realistic-scary/`):

| Asset | Form |
|-------|------|
| Player | Low-poly **advanced battleship** (void-navy `#7a9aa8` / `#1a1218`, twin ice-cyan thrusters +Z, spinal cannon −Z). Hitbox ~**1.4 × 0.6 × 2.0**. No human mesh. |
| Four alien types | Distinct low-poly meshes cycled by row: **stalker**, **crab brute**, **tendril orb**, **winged skitterer** (purple/toxic emissive eyes) |
| Barriers | Layered **metal bunker** plates + lime energy fissures `#b5ef68` (grid/HP unchanged) |
| Bullets / bombs | Small meshes + Y-billboard sprites |
| Super Laser | Additive **vertical column** cylinder VFX — formation **column** wipe (never a row) |

World axes: **X** right, **Y** up, **Z** into the void (fleet at −Z, player ≈ 0, camera at +Z looking −Z). FOV ~52°. Camera follows player **X** only. FogExp2 `#020207`.

## Open

Serve the folder statically (required for ES module + CDN importmap):

```bash
python3 -m http.server 8765 --directory /workspace/space-invaders
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/) in Chrome.

## Controls

- **← →** or **A D** — move
- **Space** — fire (also start/restart from title / game over)
- **Shift** / **F** — Super Laser (**formation column** wipe — all aliens sharing that `col`, never a row)
- **R** — restart anytime

Three lives. Super Laser starts with **3** charges (max **5**, +1 every 3rd wave).

## Files

- `index.html` — HUD overlay + canvas host + Three.js importmap
- `style.css` — brand (accent `#ff416d`, cyan `#70eaff`, void `#020207`)
- `game.js` — Three.js scene + arcade loop
- `assets/` — bullet/bomb billboard PNGs
