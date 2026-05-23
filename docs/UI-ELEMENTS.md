# MiniCity — UI Element Catalog

A catalogue of every UI element in the game, for use with design tools.

**Renderer:** PixiJS v8 HUD (vector-drawn) layered over a Three.js 3D world.
**Theme:** dark — panel fill `#161A20` / `#222833`, border `#39414D`, text
`#EEF2F6`, muted text `#8B95A1`. Font: `ui-sans-serif, system-ui`. Corners
8–16px rounded.

**Accent palette:** residential `#49C46A` · commercial `#4A90D8` · industrial
`#E0B53C` · power `#E6C84A` · water `#4AB4E0` · services `#5B8FD6` · fire
`#E06A4A` · parks `#5FB05A` · terrain/neutral `#9AA3B0` · funds gold `#F4D77A` ·
primary button `#2B6CB0`.

---

## Screen 1 — Main Menu

Full-screen modal: 480×512 panel centered on a dimmed `#0B0F14` @ 82% backdrop.

| Element | Description |
|---|---|
| Title "MINICITY" | 38px, 800-weight wordmark |
| Root view | Two stacked buttons: **New City** (primary blue), **Load City** |
| New City view | Seed row + **Randomise** button; map-size toggle (Small 96² / Medium 128² / Large 192²); 3 sliders — Water amount, Terrain roughness, Tree density; **Back** + **Start** buttons |
| Load City view | Rich save-slot card list (see Shared Elements) + **Back** button |

---

## Screen 2 — In-game HUD

Vector HUD overlaid on the 3D city. All widgets reposition on resize.

| Element | Position | Description |
|---|---|---|
| Debug readout | top-left | FPS · speed multiplier · active tool · population · in-game date |
| Radio Player | top-left (below readout) | 340×40 bar: chevron, play, volume slider, mute, off. Expands to genre tabs (Top / Jazz / Lofi / Rock / News) + an 8-row station list |
| Notifications | top-left | Stack of up to 4 toasts, 250×30 each — info `#3F6F8C` / warn `#D98A3C` border, fade out after 4.2s |
| Budget Bar | top-center | 232×58 panel: coin icon, current funds (gold `#F4D77A`), last month's net |
| Overlay Bar | top-right | 7 direct-select buttons in one panel — Off / Power / Water / Police / Fire / Health / Crime. Active mode is highlighted with the same accent the build palette uses. Auto-switches when a matching utility/service tool is picked; a manual click always wins until the next tool change |
| System Bar | top-right (below overlay) | 3 icon buttons, 96×36 each: **New**, **Save**, **Load** |
| Tool Palette | bottom-center | Tab row (Inspect + 6 category tabs) above a tool sub-palette of 80×68 icon buttons |
| RCI Widget | bottom-left | "DEMAND" gauge — 3 vertical bars from a center baseline: R green, C blue, I yellow |
| Minimap | bottom-right | 166×166 top-down city map in a 4px frame |
| Selection Readout | floating near cursor | Tile count + total cost, shown during a rubber-band drag |
| Tile Inspector | right edge | 212-wide panel: title + labelled fact rows + close button (Inspect tool) |
| Pause Banner | center | "PAUSED" text, 46px, 50% opacity |

### Tool Palette — 20 tools across 6 categories

- **Inspect** — standalone tab
- **Terrain** (`#9AA3B0`): Road, Dozer, Raise, Lower
- **Zones** (`#49C46A`): Res (green), Com (blue), Ind (yellow)
- **Power** (`#E6C84A`): Wire, Plant
- **Water** (`#4AB4E0`): Pipe, Pump
- **Services** (`#5B8FD6`): Police, Fire, Hospital
- **Parks** (`#5FB05A`): Sm Park, Park, Plaza, Sports, Garden

Each tool button shows an icon, label, and keyboard shortcut; a tooltip gives a
one-line description with cost.

---

## Screen 3 — Save / Load Panel

In-game modal: 560-wide panel centered on a dimmed backdrop. Two modes.

| Element | Description |
|---|---|
| Title | "Save City" or "Load City", 24px 800-weight |
| City-name field | (save mode only) HTML text input, 28-char max |
| Save-slot card list | Vertical list of cards (see Shared Elements) |
| Footer buttons | **Download to file** / **Load from file…** (mode-dependent), and **Cancel** |

Save mode shows 6 numbered slots (occupied + empty). Load mode lists only
occupied saves plus a file-import button.

---

## Shared Elements

### Save-slot Card

504-wide × 76-tall card, used by the Main Menu Load view and the Save/Load
Panel.

- Minimap thumbnail — 64×64, framed
- City name — 16px bold
- In-game date — e.g. "Feb 01, Year 1"
- Population + funds — e.g. "Pop 12,400   $48,200"
- Real saved timestamp — right-aligned, 11px muted
- **Empty-slot variant:** centered text "Empty slot N — click to save here"

### Button styles

- **Primary** — fill `#2B6CB0`, border `#4A90C2`, 700-weight label
- **Secondary** — fill `#222833`, border `#3A4250`, 600-weight label
- **Toggle/selected** — primary fill when active, secondary when inactive

### Panel / card surfaces

- Modal panel — fill `#161A20` @ 98%, 2px `#39414D` border, 16px radius
- HUD widget — fill `#161A20` @ ~85%, 1px `#39414D` border, 10px radius
- Card — fill `#222833` @ 96%, 1.5px `#3A4250` border, 10px radius
