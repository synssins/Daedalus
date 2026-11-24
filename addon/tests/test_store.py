"""Run: python addon/tests/test_store.py  (plain asserts, no test framework needed)."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.store import Store  # noqa: E402

DESIGN = {"grid": {"cols": 64, "rows": 48}, "pages": [{"id": "home", "tiles": []}]}

with tempfile.TemporaryDirectory() as tmp:
    s = Store(Path(tmp))

    # A new tablet waits for approval and has no key; a key never works before approval.
    t = s.hello({"id": "ABC-123", "model": "iPad5,3", "width": 1024, "height": 768, "scale": 2})
    assert t["status"] == "pending" and t["key"] is None and t["orientation"] == "landscape"
    assert s.tablet_by_key(None) is None and s.tablet_by_key("") is None

    key = s.approve("ABC-123")["key"]
    assert s.tablet_by_key(key)["id"] == "ABC-123"
    assert s.tablet_by_key(key + "x") is None

    # Saying hello again keeps the approval and the key, and picks up a rotated screen.
    t = s.hello({"id": "ABC-123", "width": 768, "height": 1024})
    assert t["status"] == "approved" and t["key"] == key and t["orientation"] == "portrait"

    # Ids are sanitised so they are safe as file names and URL parts.
    assert s.hello({"id": "../..//evil id"})["id"] == "....evilid"
    try:
        s.hello({"id": ""})
        raise AssertionError("empty id accepted")
    except ValueError:
        pass

    # Designs: versions go up on every save; rubbish is refused; duplicates are independent copies.
    d = s.save_design(None, "Main", DESIGN)
    assert d["version"] == 1
    assert s.save_design(d["id"], "Main", DESIGN)["version"] == 2
    try:
        s.save_design(None, "bad", {"pages": "nope"})
        raise AssertionError("bad design accepted")
    except ValueError:
        pass
    copy = s.duplicate_design(d["id"])
    assert copy["id"] != d["id"] and copy["name"] == "Main copy" and len(s.list_designs()) == 2

    # Deleting a design un-assigns it from tablets instead of leaving a dangling reference.
    s.update_tablet("ABC-123", {"design": d["id"], "name": "Office"})
    s.delete_design(d["id"])
    assert s.tablets["ABC-123"]["design"] is None and s.tablets["ABC-123"]["name"] == "Office"

    # Everything survives a restart.
    s2 = Store(Path(tmp))
    assert s2.tablet_by_key(key)["name"] == "Office" and len(s2.list_designs()) == 1

    # Asset names cannot escape the assets folder.
    assert s.save_asset("../../etc/pass wd.png", b"x") == "pass-wd.png"
    assert s.list_assets() == ["pass-wd.png"]

print("store: all checks passed")
