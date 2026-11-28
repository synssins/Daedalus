"""Capturing a scene: the lights of a room or a floor as they are now, in the form Home Assistant's scene editor saves."""
from __future__ import annotations

# What a light is put back to. Home Assistant picks the colour value that matches color_mode.
KEEP = ("brightness", "color_mode", "color_temp_kelvin", "hs_color", "rgb_color", "xy_color", "rgbw_color", "rgbww_color",
        "effect", "supported_color_modes", "friendly_name")


def areas_of(scope: str, areas: list[dict]) -> set[str]:
    """scope is 'area:<id>' or 'floor:<id>'. An unknown place is no place."""
    kind, _, key = scope.partition(":")
    if kind == "area":
        return {key} if any(a["area_id"] == key for a in areas) else set()
    if kind == "floor":
        return {a["area_id"] for a in areas if a.get("floor_id") == key}
    return set()


def capture(scope: str, areas: list[dict], devices: list[dict], ents: list[dict], states: list[dict]) -> dict:
    """The scene's entities: every light of that place that answers, with its state.

    shortcut: lights only. Switches, covers and locks are left out on purpose, because a scene that holds a garage
    door moves it whenever the scene is used; add domains one by one when they are asked for.
    Left out as well: lights the owner has hidden (the segments of a light strip), lights that are switched off in
    Home Assistant's settings, and groups, whose lights are saved themselves.
    """
    want = areas_of(scope, areas)
    dev_area = {d["id"]: d.get("area_id") for d in devices}
    reg = {e["entity_id"]: e for e in ents}
    out = {}
    for s in states:
        eid, e = s["entity_id"], reg.get(s["entity_id"])
        if not eid.startswith("light.") or not e or e.get("hidden_by") == "user" or e.get("disabled_by") or e.get("entity_category"):
            continue
        if (e.get("area_id") or dev_area.get(e.get("device_id"))) not in want:
            continue
        if s["state"] not in ("on", "off") or isinstance(s["attributes"].get("entity_id"), list):
            continue
        out[eid] = {"state": s["state"], **{k: v for k, v in s["attributes"].items() if k in KEEP and v is not None}}
    return out
