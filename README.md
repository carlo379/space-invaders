# Scary Invaders (Three.js 3D)

Fully **3D** arcade Space Invaders with horror branding. Built with **Three.js** (CDN, no build step) — real perspective camera, FogExp2 void, chase-arcade framing. Not faux-2D.

## Open

Serve the folder statically (required for ES module + CDN importmap):

```bash
python3 -m http.server 8765 --directory /workspace/space-invaders
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/) in Chrome.

## Presentation

| Asset | Form |
|-------|------|
| Player ship | Low-poly **mesh** (hooded human with cyan cannon) + optional Y-billboard accent |
| Six alien types | **Y-axis billboards** (`NearestFilter` PNGs from `assets/`) |
| Barriers | **Mesh** 0.2 cubes with full/crack textures |
| Bullets / bombs | Small meshes + Y-billboard sprites |
| Super Laser | Additive **vertical column** cylinder VFX in world space |

World axes: **X** right, **Y** up, **Z** into the void (fleet at −Z, player ≈ 0, camera at +Z looking −Z). FOV ~52°. Camera follows player **X** only.

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
- `assets/` — approved billboard PNGs
