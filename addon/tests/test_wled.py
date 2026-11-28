"""Run: python addon/tests/test_wled.py  (plain asserts, no test framework needed)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.wled import effect_marks  # noqa: E402

NAMES = ["Solid", "Blink", "Matrix", "Gravimeter", "GEQ", "Extra name"]
DATA = ["", "!,Duty cycle;!,!;!;01", "!,Spawning rate,Trail,,,Custom color;Spawn,Trail;;2", "Rate of fall,Sensitivity;!,!;!;1v;ix=128,mp12=2,ssim=0",
        "Fade speed,Ripple decay,# of bands,,,Color bars;!,,Peaks;!;2f;c1=255,c2=64,pal=11,si=0"]
# sound, grid, both; plain effects are left out; a name without its data is left out
assert effect_marks(NAMES, DATA) == {"Matrix": "g", "Gravimeter": "s", "GEQ": "sg"}, effect_marks(NAMES, DATA)
assert effect_marks(None, None) == {} and effect_marks(["A"], [None]) == {}
print("wled: all checks passed")
