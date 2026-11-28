"""Run: python addon/tests/test_scenes.py  (plain asserts, no test framework needed)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.scenes import areas_of, capture, lights_of  # noqa: E402

AREAS = [{"area_id": "den", "floor_id": "up"}, {"area_id": "hall", "floor_id": "up"}, {"area_id": "shed", "floor_id": None}]
DEVICES = [{"id": "d1", "area_id": "den"}, {"id": "d2", "area_id": "shed"}]
ENTS = [{"entity_id": "light.lamp", "area_id": None, "device_id": "d1"}, {"entity_id": "light.hall", "area_id": "hall", "device_id": None},
        {"entity_id": "light.strip_segment", "area_id": "den", "device_id": None, "hidden_by": "user"},
        {"entity_id": "light.grouped", "area_id": "den", "device_id": None, "hidden_by": "integration"},
        {"entity_id": "light.gone", "area_id": "den", "device_id": None}, {"entity_id": "light.den_group", "area_id": "den", "device_id": None},
        {"entity_id": "light.shed", "area_id": None, "device_id": "d2"}, {"entity_id": "switch.garage_door", "area_id": "den", "device_id": None},
        {"entity_id": "light.off_in_settings", "area_id": "den", "device_id": None, "disabled_by": "user"}]
st = lambda e, state, **a: {"entity_id": e, "state": state, "attributes": a}  # noqa: E731
STATES = [st("light.lamp", "on", brightness=128, color_mode="color_temp", color_temp_kelvin=2700, effect=None, icon="mdi:lamp"),
          st("light.hall", "off"), st("light.strip_segment", "on"), st("light.grouped", "on", rgb_color=[1, 2, 3]), st("light.gone", "unavailable"),
          st("light.den_group", "on", entity_id=["light.lamp"]), st("light.shed", "on"), st("switch.garage_door", "on"),
          st("light.off_in_settings", "on"), st("light.no_registry", "on")]

assert areas_of("area:den", AREAS) == {"den"} and areas_of("floor:up", AREAS) == {"den", "hall"}
assert areas_of("area:nowhere", AREAS) == set() and areas_of("den", AREAS) == set() and areas_of("", AREAS) == set()

den = capture("area:den", AREAS, DEVICES, ENTS, STATES)
# the room's lights that answer, one hidden by a group included; no strip segment, no dead light, no group, no switch
assert sorted(den) == ["light.grouped", "light.lamp"], den
# its state and the values that put it back; nothing else, and nothing empty
assert den["light.lamp"] == {"state": "on", "brightness": 128, "color_mode": "color_temp", "color_temp_kelvin": 2700}, den["light.lamp"]
assert sorted(capture("floor:up", AREAS, DEVICES, ENTS, STATES)) == ["light.grouped", "light.hall", "light.lamp"]
assert capture("area:nowhere", AREAS, DEVICES, ENTS, STATES) == {} and capture("garbage", AREAS, DEVICES, ENTS, STATES) == {}
# what a saved scene sets: lights only, in order, with a colour to draw whichever way the scene stored it
got = lights_of({"entities": {"light.a": {"state": "on", "brightness": 200, "color_mode": "hs", "hs_color": [240, 100]},
                              "light.b": {"state": "on", "color_mode": "color_temp", "color_temp_kelvin": 2700},
                              "light.c": {"state": "on", "rgb_color": [1, 2, 3, 4]}, "light.d": "off", "switch.x": {"state": "on"}}})
assert [g["e"] for g in got] == ["light.a", "light.b", "light.c", "light.d"]
assert got[0] == {"e": "light.a", "on": True, "bri": 200, "mode": "hs", "k": None, "hs": [240, 100], "rgb": [0, 0, 255]}, got[0]
assert got[1]["k"] == 2700 and got[1]["rgb"][0] == 255 and got[1]["rgb"][0] > got[1]["rgb"][1] > got[1]["rgb"][2], got[1]
assert got[2]["rgb"] == [1, 2, 3] and got[3] == {"e": "light.d", "on": False, "bri": None, "mode": None, "k": None, "hs": None, "rgb": None}
assert lights_of({}) == []
print("scenes: all checks passed")
