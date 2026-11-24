---
version: 1
slug: "addon-studio-index-html"
primary_target: "addon/studio/index.html"
related_targets: []
---

# HomePanel Studio (add-on page in the Home Assistant sidebar)

Scope: the whole Studio page: tablet list, design list, grid editor. Visitor mode: Operate.

Audience and job: the owner, at a desk monitor, usually in the evening, laying out wall-tablet dashboards. Tasks: approve a tablet and give it a design; place, size and style tiles on a small-cell grid; change the look (backdrop, fills, corners); save and see it on the tablet seconds later. Constraints: served through HA ingress (relative URLs only), no network fonts, standard web controls, must stay usable with nearly 3,000 entities.

Decisions made without the owner (he asked for the build to proceed unattended and gave free rein): direction taken from the roll, challengers weighed by me, no decision page shown.

## Direction contract

THESIS: The Studio is a lighting designer's plot of the house: a measured sheet where every tile is a numbered instrument at a known position. It refuses the category default of a grey admin page of equal cards.

OWN-WORLD: Night-blue work-light ground (#18233f) with a darker ink rail (#0d1326), chalk text, hairline seams instead of shadows. Gel colours carry meaning only: magenta is reserved for the thing being edited, amber for the primary action, green for live and approved, red for removal. Tabular numerals everywhere a measurement appears.

STORY: The owner sees at once which tablets exist and which need approval, opens a design, and trusts that what the sheet shows is what the wall shows, because the sheet is the real renderer with live house state.

FIRST VIEWPORT: Ink rail at left (Tablets, Designs, each design by name). Tablets view: one table, pending tablets first with an amber Approve button. Editor: toolbar across the top (name, pages, screen size, undo, save state), tile palette at left, the sheet in the centre with cell rulers along its top and left edges, inspector at right.

FORM: Stage lighting plot, candidate 6 of 7 on my ordered list (others: architect's drafting sheet, paint fan deck, print imposition marks, exhibition maquette labels, mood board, tile showroom sample board). seed:796f5f9cc8b033ae. Signature move: cell rulers on the sheet, a numbered tag on every tile like an instrument's channel number, and a dimension callout (position and size in cells) on the selected tile.

Raises: from the dark developer console, seams not shadows, and removal actions set apart by empty space. From the orienteering map, one overprint colour reserved for the selection and used for nothing else. From the airport signs, only the choices that apply: the inspector shows only the fields the selected tile type has.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
