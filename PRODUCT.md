# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS bundled inside a native Swift shell (WKWebView). No framework, no build step for the UI, no network fonts or CDNs: the tablets have no internet access.

## Users

One household. The owner builds and maintains it; the rest of the family uses it without instruction. People walk up to a panel in passing, or glance at it from across the room, to check the house or change something: lights, scenes, doors, media, cameras.

## Product Purpose

Turn retired iPad Air 2 tablets into purpose-built home control panels, replacing a generic Home Assistant web dashboard. Success: it reads as an appliance made for this house, not as a web page, and the common actions take one touch.

## Positioning

Built for one specific house and one specific tablet, so nothing is generic: fixed 1024x768 landscape canvas, the house's own rooms and devices, native shell features (brightness, wake, camera, mic) a browser dashboard cannot have.

## Operating Context

- Tablets are mounted on walls in some rooms and sit on stands in others. The design must read at a distance and up close.
- Used mostly in evening and night rooms; always on, always plugged in.
- When idle, the panel shows an ambient face (clock, weather, a few key states). Touch or motion brings up the controls.
- Home Assistant is the single backend, over its websocket API on the home network.
- Cameras are UniFi Protect, shown as still pictures that become live video where the tablet can decode it.

## Capabilities and Constraints

- Built: home page, one page per room, camera wall, confirm dialog for whole-house and door actions.
- Planned, not built: ambient idle face, wake on motion, doorbell and motion camera popups, push-to-talk voice assistant, light brightness and colour control.
- Hardware: iPad Air 2, A8X, 2 GB RAM, iPadOS 15.8 WebKit. Go easy on blur, large animated layers and simultaneous video.
- Home-specific content (rooms, entities, people) lives in a per-tablet config file, never in the source repo.
- Lock and alarm are display-only for now.

## Brand Commitments

Name: HomePanel. No logo or identity assets exist. The owner rejected the first interface for three reasons, which bind future work: it looked like Home Assistant, it was text only with nothing to look at, and it was flat and dull.

## Evidence on Hand

Live data from the owner's Home Assistant: ten rooms, lights, scenes, media players, temperatures, weather, people, alerts, six cameras. No photography of the house or rooms exists in the project; do not fabricate it.

## Product Principles

1. An appliance, not a web page.
2. Show only what is relevant now; the house's problems surface themselves.
3. One touch for the common thing, a confirm for the dangerous thing.
4. Readable from across the room, precise up close.
5. It must heal itself: reconnect, recover, never need a keyboard.
