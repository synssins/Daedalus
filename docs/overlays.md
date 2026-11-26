# Overlays

An overlay is a drawing layer above the dashboard. Each overlay is one `HP.fx.add()` call in a `web/fx-*.js` file.
The engine is `web/fx.js`. Its header comment is the full reference. This page is the summary.

## Adding an overlay

1. Create `web/fx-<name>.js`, or add to an existing file.
2. Register the overlay:

```js
HP.fx.add('name', {
  label: 'Shown in the Workshop',
  live: true, fps: 12,          // animated; omit for a still layer
  z: 1,                         // drawing order: 0 scenery, 1 creatures, 2 the goose
  options: [{key: 'count', label: 'How many', type: 'range', min: 1, max: 10, step: 1, default: 3}],
  create(ctx) { return {}; },   // build state; called again when the layout changes
  draw(g, state, ctx, t, dt) {} // g is a 2D canvas context in CSS pixels
});
```

3. Add a `<script>` line for a new file in `web/engine.html`, `web/fx-demo.html` and `addon/studio/index.html`.
4. Test it on `web/fx-demo.html?kind=name`.

`ctx` gives the tile rectangles (`rects`), the gaps between them (`gaps`), the house state (`env`), the overlay's
options (`opts`), a seeded random function (`rand`) and the shared scene (`scene`).

## How overlays meet

Overlays do not name each other. Each one says what it has on the dashboard, with tags and verbs. Every other
overlay reads that list one frame later and reacts to the tags.

### Actors

An actor is one thing on the dashboard:

```js
{kind: 'sheep', tags: ['creature', 'animal'], x, y, h, dir, pet(by) { ... }}
```

`x`, `y` is where it stands. `h` is its height. `hid: true` means it is out of sight and others leave it alone.

`view` says how it lives on the screen:

| View | Meaning | Examples |
| --- | --- | --- |
| `side` | Seen from the side, with gravity. Stands on tile tops and the ground. The default. | Snow Crew, Walkers |
| `top` | The whole screen is its ground, seen from above. Goes anywhere, over tiles too. | Sheep, Train, Ants |
| `free` | Flies or floats. Reaches both. | Goose, Fairy lights |

A `side` creature does not walk to a `top` one.

- A live overlay posts while drawing: `ctx.scene.next.push(actor)`.
- A still overlay returns its list from an `actors(state, ctx)` method.

### Tags

| Tag | Meaning |
| --- | --- |
| `creature` | Moves about by itself |
| `person` | A figure on two legs |
| `animal` | On four legs, or a bird |
| `threat` | Others run from it |
| `guard` | Drives threats away |
| `wonder` | Others stop and look at it |
| `trap` | Can take hold of a creature |
| `trapped` | Is held and wants help |
| `food` | Can be eaten or stolen |
| `vehicle` | Travels a track and may be ridden |
| `station` | A place where a vehicle stops and creatures wait |
| `prop` | Stands where it was put |
| `light` | Glows |

### Verbs

A verb is a function on an actor that another overlay may call. Offer only what the thing can do. Call with
`ctx.util.act(actor, 'verb', arg)`, which returns `undefined` when the verb is missing.

| Verb | On | Effect |
| --- | --- | --- |
| `pet(by)` | creature | It is stroked |
| `take(by)` | food, prop | Something is taken from it; `true` if it was there |
| `grab(by)`, `drag(x, y)`, `drop()` | vehicle, prop | It is seized, hauled, let go |
| `trap(by)` | trap | It takes hold of the creature at `by`; `true` if it did |
| `free()` | trap | It lets go |
| `rescue(by)` | trapped | Someone pulled; `true` once it is free |
| `paint(g)` | trap | It draws itself in front of what it holds |
| `scare(by)` | creature | It is frightened off; `true` if it fled |
| `carry(by)` | creature | It is taken out of sight toward `by` and returns after `by.secs` seconds. `by.mark` names what happened to it while away (`'shorn'`); a creature that knows the mark shows it on return |
| `lure(by)` | creature | It comes toward `by` for a few seconds, as far as it can; `true` if it came |
| `stomp(by)` | prop, vehicle | Something very heavy came down on it. It is flattened and mends later; `true` if it was whole |
| `board(rider)` | vehicle | `rider` gets on at a station; the vehicle later calls `rider.alight(x, y)` |

### Reading the scene

```js
ctx.scene.all('wonder')                 // everyone with a tag
ctx.scene.near('trap', x, y, 300)       // the nearest within 300 pixels, or null
ctx.scene.over.push(g => { ... })       // draw in front of every overlay this frame
```

`HP.fx.scene` is the same object, for tests and tools.

### Scale

An overlay may set `scale` on its definition. `1` is the default: its creatures are about goose-sized. A small number
means a whole world drawn small, such as `0.1` for an apartment building that fits on the screen. `ctx.scene.scale`
is the smallest scale on the dashboard. An overlay that roams, such as the goose, sizes itself by it.

## What each overlay posts and reacts to

| Overlay | Posts | Reacts to | Offers |
| --- | --- | --- | --- |
| Goose | `creature`, `animal`, `threat` | `creature`, `guard`, `vehicle`, `food`, `trap`; as a giant, anything with `stomp` | `scare`, `carry`, `lure` |
| Snow Crew | `creature`, `person`; `trapped` while held | `threat`, `wonder`, `trap`, `trapped`, `station`, `vehicle`, `light` | `scare`, `carry`, `lure`, `rescue` |
| Snow Crew snowman | `prop`, `food` | | `take` |
| Kung Fu | `creature`, `person` | `threat`, creatures with `pet` | `scare`, `carry`, `lure` |
| Walkers | `creature`, `person` | `threat`, `person` | `scare`, `carry`, `lure` |
| Sheep | `creature`, `animal` | `threat`, `food` | `pet`, `scare`, `carry`, `lure` |
| Sheep ram | `creature`, `animal`, `guard` | `threat` | `pet`, `carry` |
| Construction crew | workers, tenants and shoppers `creature`, `person`; lifts `vehicle`; cars `vehicle`, `prop`; sign `prop`, `wonder`; a rave `light`, `wonder`; helicopter and turkeys `threat` | `threat` | `scare`, `carry`; cars and sign `stomp` |
| Train | `vehicle` | | `grab`, `drag`, `drop`, `board` |
| Train station | `prop`, `station` | | |
| Ants | `creature` | `food` | |
| Koi pond | `creature`, `animal`; lily pads `prop` | `threat` | `carry`, `lure` |
| String lights | `light` | | |
| Vine (Flytraps) | `wonder`, `trap` | | `trap`, `free`, `paint` |
| Vine (flowers) | `wonder` | | |
| Vine (Pumpkins) | `food` | | `take` |
| Mushrooms | `food`; `light`, `wonder` at night | `creature` | `take` |
| Cobwebs | `wonder`, `trap` | | `trap`, `free`, `paint` |
| Crystals | `wonder`, `light` | | `take` |
| Honeycomb | `food`; bees `creature` | | `take` |
| Moss | `food` | | `take` |
| Coral reef | fish `creature`, `animal` | | `scare` |
| Fairy lights | `light`, `wonder`; portal `wonder`, `threat` | creatures with `lure` or `carry` | |
| UFO | `wonder`, `threat`, `light` | creatures with `carry` | |
| Fireworks | `light`, `wonder` | | |
| Aurora | `light`, `wonder` | | |
| Fireflies | `creature`, `light`, `wonder` | `light`, `threat` | `take` |
| Tank battle | tanks `vehicle`, `threat`; shells and blasts `threat` | `creature` | |
| Lava | `threat`, `light` | `creature` | |

Overlays not listed post nothing yet.

## Rules

- Do not test for another overlay's `kind`. Use tags and verbs.
- A missing verb is normal. Handle `undefined`.
- Free what you hold when your own state is rebuilt or your game is cut short.
- Draw original art. Do not copy sprites or characters from elsewhere.
- The target device is an iPad Air 2. Keep per-frame work small.
