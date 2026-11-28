---
name: Daedalus
description: Two separate visual systems. The Studio is a lighting plot for laying out wall tablets; the tablet renderer is a theme-driven glass panel.
colors:
  ground: "#18233f"
  rail: "#0d1326"
  panel: "#1f2c4d"
  panel-2: "#263660"
  seam: "#35447a"
  seam-soft: "#2a3862"
  chalk: "#e9edf7"
  chalk-2: "#a9b8dc"
  chalk-3: "#8496c2"
  edit: "#ff5fa8"
  edit-ink: "#1a0010"
  go: "#ffb547"
  go-hover: "#ffc56e"
  go-ink: "#2a1a00"
  live: "#57d49b"
  stop: "#ff7466"
  stop-ink: "#2a0500"
  tablet-text: "#fff"
  tablet-text-on: "#2b1400"
  tablet-fill: "rgba(255,255,255,.16)"
  tablet-border: "rgba(255,255,255,.4)"
  tablet-glow-on: "rgba(255,150,60,.5)"
  tablet-backdrop-fallback: "#101820"
typography:
  title:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-.01em"
  section:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  body:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tabular-nums"
  label:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  measure:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    fontFeature: "tabular-nums"
  ruler:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    fontFeature: "tabular-nums"
  tablet-name:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "var(--u)"
    fontWeight: 600
    lineHeight: 1.16
  tablet-line:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "calc(var(--u) * .76)"
    fontWeight: 500
  tablet-time:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "calc(var(--u) * 3.5)"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-.03em"
rounded:
  control: "7px"
  stage: "4px"
  box: "3px"
  tag: "8px"
  tablet-tile: "22px"
  tablet-button: "14px"
  tablet-modal: "24px"
spacing:
  list-gap: "2px"
  control-gap: "8px"
  pane-pad: "14px"
  removal-gap: "22px"
  page-pad: "28px"
  control-height: "32px"
  tablet-gap: "5px"
components:
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "{spacing.control-height}"
  button-hover:
    backgroundColor: "{colors.panel-2}"
  button-go:
    backgroundColor: "{colors.go}"
    textColor: "{colors.go-ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "{spacing.control-height}"
  button-go-hover:
    backgroundColor: "{colors.go-hover}"
  button-stop:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.stop}"
    rounded: "{rounded.control}"
    height: "{spacing.control-height}"
  button-live:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.live}"
    rounded: "{rounded.control}"
    height: "{spacing.control-height}"
  input:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.control}"
    padding: "0 9px"
    height: "{spacing.control-height}"
  rail-item:
    textColor: "{colors.chalk-2}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  rail-item-current:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.chalk}"
  tab:
    textColor: "{colors.chalk-2}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "{spacing.control-height}"
  tab-selected:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.chalk}"
  tile-tag:
    backgroundColor: "rgba(13,19,38,.82)"
    textColor: "{colors.chalk-2}"
    rounded: "{rounded.tag}"
    padding: "0 4px"
    height: "16px"
  tile-tag-selected:
    backgroundColor: "{colors.edit}"
    textColor: "{colors.edit-ink}"
  dimension-callout:
    backgroundColor: "{colors.edit}"
    textColor: "{colors.edit-ink}"
    typography: "{typography.measure}"
    rounded: "{rounded.stage}"
    padding: "1px 7px"
  toast:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.rail}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  toast-bad:
    backgroundColor: "{colors.stop}"
    textColor: "{colors.stop-ink}"
  tablet-tile:
    backgroundColor: "{colors.tablet-fill}"
    textColor: "{colors.tablet-text}"
    rounded: "{rounded.tablet-tile}"
  tablet-tile-on:
    textColor: "{colors.tablet-text-on}"
---

# Design System: Daedalus

> **Changed 2026-11-24 (owner's decision).** Daedalus Workshop no longer has a look of its own. It takes every colour,
> the font and the corner radius from the active Home Assistant theme (`addon/studio/studio.css` reads HA's theme
> variables; `haTheme()` in `studio.js` copies them from the page around it). The "lighting plot" palette described
> below for the Studio is retired; only the selection colour rule survives, now using HA's accent colour.
> The tablet renderer sections still apply. Words on screen: Panel, Dashboard, Button, Device, Theme.


## Overview

**Creative North Star: "The Lighting Plot"**

Daedalus carries two visual systems that must not be merged. This document's eight main sections describe **Daedalus Workshop** (`addon/studio/`), the admin page inside Home Assistant. The final section, **Tablet Renderer (separate system)**, describes the wall-tablet look (`web/`), which is theme-driven and has no fixed palette. Tokens prefixed `tablet-` belong only to the renderer.

The Studio is a lighting designer's plot of the house: a measured sheet on a night-blue work-light ground, where every tile is a numbered instrument at a known position. Text is chalk on blue. Surfaces are separated by hairline seams, never by shadow. Colour is rationed to four gels, and each gel means one thing. The sheet in the middle of the editor is the real renderer in an iframe with live house state, so what the sheet shows is what the wall shows.

Density is that of a desk tool: 32px controls, 14px body text, three fixed columns around a sheet that takes all remaining space.

**Key Characteristics:**
- Night-blue ground with a darker ink rail; chalk text in three strengths.
- Hairline seams (1px lines and 1px rings) do all the separating.
- Four gel colours, each tied to one meaning.
- Tabular numerals on the whole page.
- Signature: cell rulers on the sheet, a numbered tag on every tile, a dimension callout on the selected tile.
- System UI font stack on purpose: the page is served through Home Assistant ingress with no network fonts.

## Colors

A blue-black work surface with chalk text, plus four saturated gels that only ever appear as signals.

### Primary
- **Overprint Magenta** (`edit`): the thing being edited. On the sheet: the selected tile's 2px border, its numbered tag, its dimension callout and its four resize handles. Text set on magenta uses `edit-ink`.

### Secondary
- **Cue Amber** (`go`): the primary action (Save, Approve), with `go-ink` text and `go-hover` on hover. The build also uses amber for what is waiting on that action: the pending-tablet dot in the rail, the waiting status dot, and the "Unsaved changes" label beside Save.

### Tertiary
- **Live Green** (`live`): live and approved. The approved status dot, and the "Back to editing" button's border and text while the sheet is controlling the real house.
- **Strike Red** (`stop`): removal. Text of delete buttons, their border on hover. The failure toast also uses it as a background with `stop-ink` text.

### Neutral
- **Work-Light Blue** (`ground`): page background.
- **Ink Rail** (`rail`): the left rail, and the well of every input, select and dropdown list.
- **Panel Blue** (`panel`) and **Raised Panel** (`panel-2`): button rest and hover; hover and current states of rail items and tabs.
- **Seam** (`seam`) and **Soft Seam** (`seam-soft`): the strong seam borders controls, table headers and the sheet; the soft seam divides panes and table rows.
- **Chalk** (`chalk`), **Chalk 2** (`chalk-2`), **Chalk 3** (`chalk-3`): primary text; secondary text and field labels; tertiary text, placeholders, counts, ruler numbers and table headers.

### Named Rules
**The Overprint Rule.** Magenta marks the current selection on the sheet and is not available for decoration, links, brand or emphasis.

**The Gel Rule.** A saturated colour appears only where it carries its meaning: magenta editing, amber the primary action and what waits on it, green live or approved, red removal. Anything else is blue or chalk.

**Build note (not a rule).** The shipped page also applies magenta through `accent-color` to every native checkbox and range slider, to the text selection highlight, and to the chosen icon and chosen picture in the inspector grids. Treat these as existing spill, not as licence to add more magenta.

## Typography

**Display Font:** none. One family throughout.
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui, -apple-system, sans-serif)

**Character:** The operating system's own UI face, chosen because the page loads no network fonts. Hierarchy comes from weight (400 and 600, 700 for measurements) and chalk strength, not from size jumps.

### Hierarchy
- **Title** (600, 20px, -.01em): the page heading of the Tablets and Designs views.
- **Section** (600, 13px, `chalk-2`): group headings in the inspector and palette ("Backdrop", "Tiles", "Add a tile").
- **Body** (400, 14px, 1.45): everything else, including controls, which inherit it.
- **Label** (400, 12.5px): status chips, table headers (600), sub-lines, notes, the save state. Field labels in the inspector are 13px `chalk-2`.
- **Measure** (700, 11px, tabular): the dimension callout. The tile tag is 10px, 700 when selected.
- **Ruler** (400, 10px, tabular, `chalk-3`): cell numbers on the rulers.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the body, so every count, cell position and size lines up without per-element work.

## Layout

A full-height flex row: the rail (212px), then the main column. The Tablets and Designs views are a head row (18px 28px 14px padding) over a scrolling body (28px side padding) holding one full-width table. The editor is a toolbar (10px 14px padding, 8px gaps, soft seam below) over three columns: tile palette (178px), the sheet (all remaining width, scrolls), and the inspector (290px).

The sheet scales the tablet's real pixel size down to fit and never scales above 1:1. Rulers sit in a 22px gutter on the top and left of the stage and are numbered every 8 cells. A 1px cell grid at 10% white is drawn over the preview while editing and removed in "Try it" mode.

Inspector rows are a two-column grid: an 82px label and the control, 6px by 8px gaps, 7px between rows. Lists (rail, palette, tabs) use 2px gaps. Removal actions are set apart by empty space: 22px to the left of a delete button in a table row, and a 30px gap plus a soft seam above the delete row in the inspector.

Below 1500px wide (the Home Assistant sidebar takes its share), the rail folds to 58px and the palette to 52px, both icon-only, and the inspector narrows to 272px, so the sheet keeps its size.

## Elevation & Depth

Flat. The Studio has no blurred or offset shadows. Depth is tonal (rail darker than ground, panels lighter) and structural (1px seams). `box-shadow` appears only as a 1px ring: `0 0 0 1px` around the stage and `inset 0 0 0 1px` on the current rail item. Floating pieces (the entity dropdown, the toast) sit on a seam border or a solid chalk fill, with no shadow.

### Named Rules
**The Seam Rule.** Separate with a 1px line in `seam` or `seam-soft`. If a surface seems to need a shadow, give it a seam or a tonal step.

## Shapes

Small, consistent corners. Controls, rail items, tabs, dropdowns and the toast share one radius (7px). The stage and the dimension callout use 4px; tile boxes on the sheet use 3px so they read as drafting marks, not as buttons. Circles are reserved for status dots (8px), resize handles (12px with a 2px `edit-ink` border) and the pill-shaped tile tag (16px tall, 8px radius). Every control is 32px tall with a 1px `seam` border.

## Components

### Buttons
- **Shape:** 32px tall, softly squared (7px), 1px `seam` border, 12px side padding, 7px gap between icon and label. Icon-only buttons are 32px squares.
- **Default:** `panel` fill, `chalk` text. Hover lifts to `panel-2` with a `chalk-3` border. Disabled drops to 45% opacity.
- **Primary:** `go` fill and border, `go-ink` text, weight 600; hover `go-hover`. Used for Save in the editor and for Approve on each pending tablet row.
- **Removal:** default fill with `stop` text; border turns `stop` on hover. Always spaced away from its neighbours.
- **Live:** `live` border and text, for the mode where taps on the sheet control the house.
- **Focus:** every focusable element gets a 2px `chalk` outline, offset 2px.

### Chips
- **Style:** not a pill. A 12.5px `chalk-2` label preceded by an 8px dot. The dot is `chalk-3` by default, `live` when approved or online, `go` when waiting.

### Tables
- **Style:** full width, collapsed borders. Header cells are 12.5px/600 `chalk-3` over a `seam` line; rows are separated by `seam-soft` and tint by 2.5% white on hover.
- **Inline rename:** a text input that looks like plain text until hovered or focused, when the `rail` well and `seam` border appear.
- **Actions:** right-aligned, 6px apart, removal 22px apart.

### Inputs / Fields
- **Style:** 32px tall, `rail` well, 1px `seam` border, 7px radius, 9px side padding. Placeholder in `chalk-3`.
- **Hover:** border to `chalk-3`. **Focus:** the global 2px chalk outline.
- **Colour inputs:** a 32px square swatch in the same frame.
- **Entity picker:** a text input with a dropdown list (max 260px tall) on the `rail` fill with a `seam` border; the highlighted row is `panel-2`, with a `chalk-3` second line.

### Navigation
- **Rail:** `rail` background with a soft seam on the right. Items are full-width, borderless, `chalk-2`, with an 18px icon and a right-aligned count in `chalk-3`. Hover: `panel` fill, `chalk` text. Current: `panel-2` fill, weight 600, 1px inset `seam` ring. Design names are indented sub-items.
- **Tabs** (pages in the toolbar; Tile, Look, Page in the inspector): 32px, transparent until hovered (`panel`); selected is `panel-2` with a `seam` border.

### Toast
A centred pill of solid `chalk` with `rail` text, weight 600, 22px from the bottom, fading in over .2s. The failure variant is `stop` with `stop-ink` text. Transitions are removed under `prefers-reduced-motion`.

### The Sheet (signature)
- **Cell rulers:** `chalk-3` 10px numbers every 8 cells, each with a 1px `seam` tick, along the top and left of the stage.
- **Tile tag:** every tile carries its number (1-based, in page order) in a small pill at its top-left, dark and 78% opaque at rest, fully opaque when the pointer is over the sheet.
- **Selection:** the selected tile takes a 2px `edit` border, its tag turns `edit` with `edit-ink` text, and four round `edit` handles appear at the corners.
- **Dimension callout:** an `edit` label centred 22px below the selected tile reading `W × H at X, Y` in cells. It flips above the tile when the tile is within the last three rows. It updates live while dragging.
- **Unselected tiles:** invisible border, 70% white on hover or focus.

## Do's and Don'ts

### Do:
- **Do** keep magenta for the selection on the sheet (The Overprint Rule).
- **Do** separate surfaces with 1px seams in `seam` or `seam-soft`.
- **Do** keep every control 32px tall with a 7px radius and a 1px `seam` border.
- **Do** put empty space between a removal action and its neighbours (22px in a row, 30px plus a seam in the inspector).
- **Do** show measurements in cells with tabular numerals.
- **Do** keep the system font stack and relative URLs; the page runs behind Home Assistant ingress with no network access for fonts.
- **Do** show only the inspector fields the selected tile type has.

### Don't:
- **Don't** add blurred or offset shadows in the Studio. A 1px ring is a seam and is fine.
- **Don't** use a gel colour for decoration, branding or generic emphasis.
- **Don't** carry the Studio's palette, radius or seams into the tablet renderer, or the renderer's glass, glow and shadows into the Studio.
- **Don't** load web fonts or any asset from outside the add-on.

## Tablet Renderer (separate system)

Source: `web/panel.css`, `web/core.js`, `web/tiles.js`. This is the look drawn on the wall tablets and inside the Studio's sheet. It is the opposite of the Studio on purpose: bright, layered, lit and shadowed. It has **no fixed palette**. A design file's `theme` sets CSS variables; the values below are the defaults that apply when a design leaves a key out.

### Variable contract

Set on the document root by `applyTheme(theme)`; a key that is absent leaves the default in place.

| Variable | Design key | Default | Controls |
| --- | --- | --- | --- |
| `--text` | `theme.text` | `#fff` | Text and icon colour |
| `--font` | `theme.font` | `"Avenir Next", "Segoe UI", system-ui, sans-serif` | Font stack |
| `--fill` | `theme.tile.fill` | `rgba(255,255,255,.16)` | Tile fill at rest |
| `--fill-on` | `theme.tile.fillOn` | `linear-gradient(155deg, rgba(255,222,140,.92), rgba(255,142,66,.86))` | Tile fill when the entity is on; also the confirm button |
| `--text-on` | `theme.tile.textOn` | `#2b1400` | Text on a lit tile |
| `--glow-on` | `theme.tile.glowOn` | `rgba(255,150,60,.5)` | Drop glow under a lit tile |
| `--radius` | `theme.tile.radius` (px) | `22px` | Tile corner radius |
| `--border` | `theme.tile.border` | `rgba(255,255,255,.4)` | 1px inset outline |
| `--gap` | `theme.tile.gap` (px) | `5px` | Margin around each tile (visible gap is twice this) |

Not variables, but part of the theme:
- `theme.background.image`, `.color`, `.dim`: backdrop picture, the colour under it (fallback `#101820`), and a black overlay from 0 to 0.8 opacity.
- `theme.tile.glass === false` adds `noglass` to the body and removes the frosted layer.
- `theme.tile.rim === false` adds `norim` and replaces the lit edge with the plain outline.

Per-tile overrides (`tile.style`): `fill`, `fillOn`, `text`, `radius`, `border` set the same variables on that one tile; `opacity` and `image` (a cover picture inside the tile) are tile-only. `lightState: true` replaces the lit fill and glow of a light's button with the light's own colour at its own level. `tile.flat` removes fill, rim and shadow.

The Studio's Look tab exposes backdrop image, colour and darken; fill, lit fill, corners (0 to 60), spacing (0 to 16), border, lit edge and frosted. A new design starts with the `dusk.svg` backdrop over `#141a5c`, dim 0.04, fill `rgba(255,255,255,.15)`, radius 22, gap 5, glass on.

### Layout and type scale

Tiles sit on a CSS grid whose column and row counts come from the design. Each tile computes its own unit, `--u = clamp(11px, min(height × 0.2, width × 0.11), 64px)`, and all type and icon sizes derive from it: name `--u`/600, second line `0.76u`/500 at 84% opacity, icon `1.55u`, clock `3.5u`/600 with -.03em tracking, date `0.78u`. Padding is `0.62u` by `0.78u`. A tile wider than 2.4 times its height switches to a row layout. A name that overflows shrinks to no less than 70%.

### Depth and material

- **Frosted glass:** one blurred copy of the backdrop (`blur(22px) saturate(1.6) brightness(1.1)`, scaled 1.1) clipped to the tile shapes. One layer for the whole screen, because the iPad Air 2 cannot afford a backdrop filter per tile.
- **Lit edge (rim):** a radial highlight from the top-left, a top-to-bottom sheen, a bright 1.5px top inset line, fainter side lines, a dark foot, and the `--border` outline.
- **Drop shadow:** `0 12px 26px rgba(0,0,0,.30), 0 2px 5px rgba(0,0,0,.22)` on every non-flat tile.
- **Lit tile:** fill `--fill-on`, text `--text-on`, shadow `0 12px 30px var(--glow-on), 0 2px 5px rgba(0,0,0,.22)`.

### States

- **Pressed** (tappable tiles): scale .955 and brightness .86 over .12s ease-out.
- **Unavailable:** 55% opacity.
- **Warning** and **alert** fills are fixed gradients, not theme variables: amber `rgba(255,176,64,.80)` to `rgba(232,104,40,.74)`, red `rgba(255,110,96,.90)` to `rgba(206,40,58,.84)`, both at 155deg.

### Fixed pieces

Camera tiles (`#06080a` ground, cover-fit picture or video, 15px/600 label over a black gradient), the status bar pill at the top (`rgba(30,10,10,.82)`, `#ffd3cd` text), the confirm dialog (460px, 24px radius, `rgba(28,30,44,.96)`, buttons 14px radius with the confirm button in `--fill-on`), and the waiting splash (radial gradient `#3f2a96`, `#141a5c`, `#0b0e33`).

### Layers

From the back: backdrop, tiles, overlays, popup tile, question or PIN pad, status bar, remote ring. A touch on a layer
does not reach the layers under it.

The popup tile uses the confirm dialog's surface. Its controls share one look: a well with a 1px inset outline at 28%
white, the value range painted in the well, and a white mark with a dark ring at the current value. Level and colour
temperature are vertical bars (92 by 280px), colour is a wheel (220px), effects and device choices are lists that open upward. The members of a group are a wrapped row of buttons under the controls. A tile that is a choice shows its value as tile text with a small arrow after it; its list drops from the tile on the popup layer and takes the tile's fill, radius, border and text colour, with the current item in the lit fill. The save scene dialog is the confirm dialog with a 52px text field in the same well and outline. The PIN
pad is a three-column grid of 58px keys in the confirm dialog.

### Rules

- **Do** read colour, fill, radius, border and gap from the variables. A new tile type must not hard-code them.
- **Do** size type and padding from `--u`, never in fixed pixels, so a tile reads at any size.
- **Do** keep glass as the single clipped blur layer. **Don't** add `backdrop-filter` per tile.
- **Don't** treat the default values as the brand palette. They are fallbacks for a design that omits a key.
