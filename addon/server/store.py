"""Persistent state for HomePanel Studio: tablets, designs, uploaded assets. Plain JSON files, no database.

Layout under the data directory:
    tablets.json          every tablet that has ever said hello
    designs/<id>.json     one design per file: {"id", "name", "version", "design": {...}}
    assets/<file>         uploaded images
    library.json          the theme library: {"themes": [{id, name, backgrounds: [...], buttons: [...], background, button}]}
    settings.json         server-side settings (the direct LLM connection for assistant buttons)
"""
from __future__ import annotations

import base64
import json
import re
import secrets
import time
from pathlib import Path

SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


class Store:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir)
        self.designs_dir = self.dir / "designs"
        self.assets_dir = self.dir / "assets"
        for d in (self.dir, self.designs_dir, self.assets_dir):
            d.mkdir(parents=True, exist_ok=True)
        self._tablets_file = self.dir / "tablets.json"
        self.tablets: dict[str, dict] = self._read(self._tablets_file, {})
        self._library_file = self.dir / "library.json"
        self._settings_file = self.dir / "settings.json"

    # ---- files ----
    @staticmethod
    def _read(path: Path, default):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return default

    @staticmethod
    def _write(path: Path, obj) -> None:
        # Write beside the target then swap, so a crash mid-write never leaves a half file.
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, indent=1), encoding="utf-8")
        tmp.replace(path)

    def _save_tablets(self) -> None:
        self._write(self._tablets_file, self.tablets)

    # ---- tablets ----
    def hello(self, info: dict) -> dict:
        """A tablet announces itself. New ones wait as 'pending' until approved in the Studio."""
        tid = SAFE_NAME.sub("", str(info.get("id", "")))[:64]
        if not tid:
            raise ValueError("tablet id missing")
        t = self.tablets.get(tid)
        if t is None:
            t = {"id": tid, "name": info.get("name") or info.get("model") or "Tablet", "status": "pending",
                 "key": None, "design": None, "start_page": None}
            self.tablets[tid] = t
        for k in ("model", "width", "height", "scale"):
            if info.get(k) is not None:
                t[k] = info[k]
        if t.get("width") and t.get("height"):
            t["orientation"] = "landscape" if t["width"] >= t["height"] else "portrait"
        t["last_seen"] = int(time.time())
        self._save_tablets()
        return t

    def approve(self, tid: str) -> dict:
        t = self.tablets[tid]
        t["status"] = "approved"
        t["key"] = t.get("key") or secrets.token_urlsafe(32)
        self._save_tablets()
        return t

    def update_tablet(self, tid: str, changes: dict) -> dict:
        t = self.tablets[tid]
        for k in ("name", "start_page"):
            if k in changes:
                t[k] = changes[k]
        if "panels" in changes:  # ordered; the first is the device's default
            t["panels"] = [p for p in dict.fromkeys(changes["panels"] or []) if isinstance(p, str)]
        elif "design" in changes:
            t["panels"] = [changes["design"]] if changes["design"] else []
        if "default" in changes:
            t["default"] = changes["default"]
        if "bar" in changes:  # show the row of panel tabs along the top of this device's screen
            t["bar"] = bool(changes["bar"])
        # "design" is the device's default panel: the chosen one while it is still on the device, else the first.
        mine = self.panels_of(t)
        t["design"] = t.get("default") if t.get("default") in mine else (mine[0] if mine else None)
        t["default"] = t["design"]
        self._save_tablets()
        return t

    @staticmethod
    def panels_of(t: dict) -> list[str]:
        """The panels on a device, default first. Devices saved before there could be several have only 'design'."""
        return t["panels"] if isinstance(t.get("panels"), list) else ([t["design"]] if t.get("design") else [])

    def remove_tablet(self, tid: str) -> None:
        self.tablets.pop(tid, None)
        self._save_tablets()

    def tablet_by_key(self, key: str | None) -> dict | None:
        if not key:
            return None
        for t in self.tablets.values():
            if t.get("status") == "approved" and t.get("key") and secrets.compare_digest(t["key"], key):
                return t
        return None

    # ---- designs ----
    def _design_path(self, did: str) -> Path:
        return self.designs_dir / (SAFE_NAME.sub("", did) + ".json")

    def list_designs(self) -> list[dict]:
        out = []
        for p in sorted(self.designs_dir.glob("*.json")):
            d = self._read(p, None)
            if d:
                g = d["design"].get("grid", {})
                out.append({"id": d["id"], "name": d["name"], "version": d["version"],
                            "pages": len(d["design"].get("pages", [])), "cols": g.get("cols"), "rows": g.get("rows")})
        return out

    def get_design(self, did: str) -> dict | None:
        return self._read(self._design_path(did), None) if did else None

    def save_design(self, did: str | None, name: str, design: dict) -> dict:
        """Create (did None) or replace a design. Every save bumps the version so tablets know to reload."""
        if not isinstance(design, dict) or not isinstance(design.get("pages"), list) or "grid" not in design:
            raise ValueError("not a design: needs grid and pages")
        did = did or secrets.token_hex(4)
        old = self.get_design(did)
        rec = {"id": did, "name": name or (old or {}).get("name") or "Untitled",
               "version": (old["version"] + 1) if old else 1, "design": design}
        self._write(self._design_path(did), rec)
        return rec

    def duplicate_design(self, did: str, name: str | None = None) -> dict:
        src = self.get_design(did)
        if not src:
            raise KeyError(did)
        return self.save_design(None, name or src["name"] + " copy", json.loads(json.dumps(src["design"])))

    def delete_design(self, did: str) -> None:
        self._design_path(did).unlink(missing_ok=True)
        for t in self.tablets.values():
            if did in self.panels_of(t):
                t["panels"] = [p for p in self.panels_of(t) if p != did]
                if t.get("design") == did:
                    t["design"] = t["default"] = t["panels"][0] if t["panels"] else None
        self._save_tablets()

    # ---- assets ----
    def save_asset(self, filename: str, data: bytes) -> str:
        name = SAFE_NAME.sub("-", Path(filename).name).strip("-.") or "image"
        (self.assets_dir / name).write_bytes(data)
        return name

    def list_assets(self) -> list[str]:
        return sorted(p.name for p in self.assets_dir.iterdir() if p.is_file())

    def delete_asset(self, name: str) -> None:
        (self.assets_dir / SAFE_NAME.sub("-", Path(name).name)).unlink(missing_ok=True)

    # ---- theme library and settings ----
    def get_library(self) -> dict:
        return {"themes": self._read(self._library_file, {}).get("themes") or []}

    def get_theme(self, tid: str | None) -> dict | None:
        return next((t for t in self.get_library()["themes"] if t.get("id") == tid), None) if tid else None

    def save_library(self, lib: dict) -> dict:
        themes = lib.get("themes") if isinstance(lib, dict) else None
        if not isinstance(themes, list) or not all(isinstance(t, dict) and t.get("id") for t in themes):
            raise ValueError("not a theme library")
        self._write(self._library_file, {"themes": themes})
        return self.get_library()

    def get_settings(self) -> dict:
        return self._read(self._settings_file, {})

    def save_settings(self, changes: dict) -> dict:
        cur = self.get_settings()
        llm = dict(cur.get("llm") or {})
        for k in ("url", "model", "key", "system"):
            if k in (changes.get("llm") or {}):
                llm[k] = changes["llm"][k]
        cur["llm"] = llm
        self._write(self._settings_file, cur)
        return cur

    # ---- full backup ----
    def backup(self) -> dict:
        """Everything needed to rebuild this server on a fresh install, in one JSON object."""
        designs = [d for d in (self._read(p, None) for p in sorted(self.designs_dir.glob("*.json"))) if d]
        assets = {p.name: base64.b64encode(p.read_bytes()).decode() for p in self.assets_dir.iterdir() if p.is_file()}
        return {"format": "hpbackup", "version": 1, "made": int(time.time()), "tablets": self.tablets, "designs": designs,
                "library": self.get_library(), "settings": self.get_settings(), "assets": assets}

    def restore(self, data: dict) -> dict:
        """Put a backup back. Nothing is checked against Home Assistant: a design that names an entity
        which no longer exists restores as it is and shows that button as not found. Bad items are skipped,
        never fatal, so one damaged entry cannot block the rest."""
        if not isinstance(data, dict) or data.get("format") != "hpbackup":
            raise ValueError("not a HomePanel backup file")
        done = {"devices": 0, "panels": 0, "pictures": 0, "skipped": 0}
        for name, b64 in (data.get("assets") or {}).items():
            try:
                self.save_asset(name, base64.b64decode(b64))
                done["pictures"] += 1
            except Exception:
                done["skipped"] += 1
        for rec in data.get("designs") or []:
            try:
                did = SAFE_NAME.sub("", str(rec["id"]))
                if not did or not isinstance(rec["design"].get("pages"), list):
                    raise ValueError
                self._write(self._design_path(did), {"id": did, "name": str(rec.get("name") or "Untitled"),
                                                     "version": int(rec.get("version") or 1), "design": rec["design"]})
                done["panels"] += 1
            except Exception:
                done["skipped"] += 1
        for tid, t in (data.get("tablets") or {}).items():
            if isinstance(t, dict) and t.get("id") == tid:
                self.tablets[tid] = t
                done["devices"] += 1
            else:
                done["skipped"] += 1
        self._save_tablets()
        try:
            self.save_library(data.get("library") or {})
        except ValueError:
            done["skipped"] += 1
        if isinstance(data.get("settings"), dict):
            self._write(self._settings_file, data["settings"])
        return done
