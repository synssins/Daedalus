# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Two parts. Tablet app: static HTML/CSS/JS renderer bundled inside a native Swift shell (WKWebView). Daedalus Workshop: a Home Assistant add-on (Python, aiohttp) with a plain HTML/CSS/JS page in the HA sidebar. No framework, no build step for either UI, no network fonts or CDNs: the tablets have no internet access and the Studio is served through HA ingress.

## Users

One household. The owner builds and maintains it; the rest of the family uses it without instruction. People walk up to a panel in passing, or glance at it from across the room, to check the house or change something: lights, scenes, doors, media, cameras.

## Product Purpose

Turn retired iPad Air 2 tablets into purpose-built home control panels, replacing a generic Home Assistant web dashboard. Success: it reads as an appliance made for this house, not as a web page, and the common actions take one touch.

## Positioning

The look and layout are designed inside Home Assistant, in the Studio, on a small-cell snap grid, and the tablet app is a placeholder that draws whatever design it is given. The Studio keeps a list of tablets with their resolution and orientation, so one design can be fitted to another screen. The app never opens a hosted page: it downloads the design, keeps a copy, and draws it itself, with native shell features (brightness, wake, camera, mic) a browser dashboard cannot have.

## Operating Context

- Tablets are mounted on walls in some rooms and sit on stands in others. The design must read at a distance and up close.
- Used mostly in evening and night rooms; always on, always plugged in.
- When idle, the panel shows an ambient face (clock, weather, a few key states). Touch or motion brings up the controls.
- Home Assistant is the single backend, over its websocket API on the home network.
- Cameras are UniFi Protect, shown as still pictures that become live video where the tablet can decode it.

## Capabilities and Constraints

- Built: design-file renderer with tile plugins (clock, weather, people, alerts, light or switch, scene, room, media, camera, page link, text, picture, alarm panel); a popup with level, colour temperature, colour and effects for lights; confirmation or PIN for locks, garage doors and alarms; light groups as one button with their members in the popup; saving the lights of a room or floor as a Home Assistant scene; a scenes button; battery levels; room pages generated from each room's devices; Studio with tablet approval, designs, grid editor, picture upload and live preview; tablets find the Studio over mDNS and reach Home Assistant only through it.
- Planned, not built: importing existing HA dashboards, charts, remote-control layouts, media library browsing, animation packs, 3D floor plans, ambient idle face, wake on motion, doorbell and motion camera popups, push-to-talk voice assistant.
- Hardware: iPad Air 2, A8X, 2 GB RAM, iPadOS 15.8 WebKit. Go easy on blur, large animated layers and simultaneous video.
- Home-specific content (rooms, entities, people) lives in designs stored by the Studio, never in the source repo.
- The owner wants the tablet look bright, colourful, modern and technical, with imagery or scenery, transparency, shaped corners and borders, and a lit-edge 3D feel on buttons.
- Locks, garage doors and alarm panels act after a confirmation, or after a code where Home Assistant requires one. The confirmation is a panel setting.

## Brand Commitments

Name: Daedalus. No logo or identity assets exist. The owner rejected the first interface for three reasons, which bind future work: it looked like Home Assistant, it was text only with nothing to look at, and it was flat and dull.

## Evidence on Hand

Live data from the owner's Home Assistant: ten rooms, lights, scenes, media players, temperatures, weather, people, alerts, six cameras. No photography of the house or rooms exists in the project; do not fabricate it.

## Product Principles

1. An appliance, not a web page.
2. Show only what is relevant now; the house's problems surface themselves.
3. One touch for the common thing, a confirm for the dangerous thing.
4. Readable from across the room, precise up close.
5. It must heal itself: reconnect, recover, never need a keyboard.
