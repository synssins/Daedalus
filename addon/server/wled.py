"""WLED keeps on the device which of its effects answer to sound and which are made for a grid of lights.
Home Assistant only has the effects' names."""
from __future__ import annotations


def effect_marks(names: list, data: list) -> dict[str, str]:
    """{effect name: marks} from a WLED device's /json/effects and /json/fxdata, which run in step.
    's' is an effect that answers to sound, 'g' one made for a grid. Effects with neither are left out.
    An fxdata entry reads "sliders;colours;palette;flags;defaults"; among the flags, 2 is a grid and v or f is sound."""
    out = {}
    for name, meta in zip(names or [], data or []):
        parts = str(meta).split(";")
        flags = parts[3] if len(parts) > 3 else ""
        marks = ("s" if "v" in flags or "f" in flags else "") + ("g" if "2" in flags else "")
        if marks:
            out[str(name)] = marks
    return out
