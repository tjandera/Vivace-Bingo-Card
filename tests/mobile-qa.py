"""
mobile-qa.py — Mobile / cross-engine visual QA for the 12 stamps.

Boots the local dev server, then drives three device profiles in parallel:
    - Pixel 5      (Chromium engine — Chrome, Edge, Samsung Internet, ...)
    - iPhone 12    (WebKit — the only cross-engine case worth testing)
    - Small phone  (320x568 on Chromium — hits the <360px CSS breakpoint)

For each profile it logs in as "qa", waits for the 11 CCA slots to hydrate,
screenshots the full card, and dumps each stamp's applied classes
(`is-opaque` / `is-light` / `is-square`) + inline stamp-circle background.

Emits tests/mobile-qa-report.html: 3 screenshots side-by-side plus a diff
table so any stamp classified differently across profiles jumps out.  If
that happens, either a random-CCA-pick fluke (re-run and it stabilises)
or a real cross-engine issue in refineIcon().

Install:
    pip install playwright
    playwright install chromium webkit

Run:
    python3 tests/mobile-qa.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from html import escape
from pathlib import Path
from typing import Any, Dict, List

from playwright.sync_api import Browser, Page, sync_playwright


ROOT       = Path(__file__).resolve().parent.parent
REPORT_DIR = ROOT / "tests"
BASE_URL   = "http://localhost:8000"

PROFILES = [
    {"name": "pixel5",   "engine": "chromium", "device": "Pixel 5"},
    {"name": "iphone12", "engine": "webkit",   "device": "iPhone 12"},
    {"name": "small",    "engine": "chromium", "device": None,
     "viewport": {"width": 320, "height": 568},
     "user_agent": ("Mozilla/5.0 (Linux; Android 10; SM-G970F) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0 Mobile Safari/537.36")},
]


def wait_for_server(url: str, timeout: float = 30.0) -> None:
    import urllib.request, urllib.error
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.5)
    raise RuntimeError(f"Server did not come up at {url} within {timeout}s")


def capture_profile(pw: Any, profile: Dict[str, Any]) -> Dict[str, Any]:
    engine: Browser = getattr(pw, profile["engine"]).launch()
    ctx_kwargs: Dict[str, Any] = {}
    if profile.get("device"):
        ctx_kwargs = dict(pw.devices[profile["device"]])
    if profile.get("viewport"):
        ctx_kwargs["viewport"] = profile["viewport"]
    if profile.get("user_agent"):
        ctx_kwargs["user_agent"] = profile["user_agent"]
    ctx = engine.new_context(**ctx_kwargs)
    page: Page = ctx.new_page()
    try:
        page.goto(BASE_URL, wait_until="networkidle")
        page.fill("#loginInput", "qa")
        page.evaluate("window.handleLogin()")
        # Wait for slot 0 to hydrate (data-id gets set by initCcaSlots)
        page.wait_for_selector('.checkpoint-slot[data-slot="0"][data-id]',
                               timeout=5000)
        # Give refineIcon() a beat to run against each loaded image
        page.wait_for_timeout(800)

        shot_path = REPORT_DIR / f"mobile-qa-{profile['name']}.png"
        page.screenshot(path=str(shot_path), full_page=True)

        stamps: List[Dict[str, Any]] = page.evaluate("""
            () => Array.from(document.querySelectorAll('.checkpoint-card')).map(c => ({
                id:       c.dataset.id      || '',
                name:     c.dataset.name    || '',
                iconCls:  Array.from(c.querySelector('.checkpoint-icon')?.classList || []),
                circleCls:Array.from(c.querySelector('.stamp-circle')?.classList    || []),
                circleBg: c.querySelector('.stamp-circle')?.style.background         || '',
            }))
        """)
        return {"profile": profile["name"], "screenshot": shot_path.name,
                "stamps": stamps}
    finally:
        ctx.close()
        engine.close()


def render_report(results: List[Dict[str, Any]]) -> str:
    # Union of stamp ids across profiles so the diff table lines up when
    # different profiles happen to pick different random CCAs.
    stamp_index: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for r in results:
        for s in r["stamps"]:
            sid = s["id"] or f"(slot-{s['name']})"
            stamp_index.setdefault(sid, {})[r["profile"]] = s

    def cls_summary(s: Dict[str, Any] | None) -> str:
        if not s:
            return "—"
        tags: List[str] = []
        for c in s["iconCls"]:
            if c in ("is-opaque", "is-square"):
                tags.append(c)
        for c in s["circleCls"]:
            if c == "is-light":
                tags.append(c)
        if s["circleBg"]:
            tags.append(f"bg:{s['circleBg']}")
        return ", ".join(tags) if tags else "(default)"

    rows = []
    for sid, per_profile in sorted(stamp_index.items()):
        cells = []
        vals = set()
        for prof in ("pixel5", "iphone12", "small"):
            cell = cls_summary(per_profile.get(prof))
            vals.add(cell)
            cells.append(f"<td>{escape(cell)}</td>")
        diff = "diff" if len(vals - {"—"}) > 1 else ""
        name = next((s["name"] for s in per_profile.values() if s["name"]),
                    "(no name)")
        rows.append(
            f'<tr class="{diff}"><th>{escape(sid)}</th>'
            f'<td class="name">{escape(name)}</td>'
            f'{"".join(cells)}</tr>'
        )

    shots_html = "".join(
        f'<figure><figcaption>{escape(r["profile"])}</figcaption>'
        f'<img src="{escape(r["screenshot"])}" alt=""></figure>'
        for r in results
    )

    return f"""<!doctype html>
<meta charset="utf-8">
<title>Vivace — mobile QA report</title>
<style>
    body {{ font: 14px/1.4 -apple-system, system-ui, sans-serif; margin: 24px; }}
    h1 {{ margin: 0 0 6px; }}
    .shots {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0 24px; }}
    figure {{ margin: 0; }}
    figcaption {{ font-weight: 600; margin-bottom: 4px; }}
    img {{ width: 100%; border: 1px solid #ddd; border-radius: 4px; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 12px; }}
    th, td {{ border: 1px solid #ddd; padding: 4px 8px; text-align: left; vertical-align: top; }}
    th {{ background: #f6f6f6; }}
    tr.diff {{ background: #fff3cd; }}
    tr.diff th {{ background: #ffe69c; }}
    td.name {{ color: #666; }}
</style>
<h1>Vivace — mobile QA report</h1>
<p>Rows highlighted in yellow classify differently across profiles.  Re-run
first (random CCA selection may differ per session).  If it persists, likely
a cross-engine issue in <code>refineIcon()</code>.</p>
<div class="shots">{shots_html}</div>
<table>
    <thead><tr><th>Stamp id</th><th>Name</th><th>Pixel&nbsp;5</th><th>iPhone&nbsp;12</th><th>Small&nbsp;phone</th></tr></thead>
    <tbody>{"".join(rows)}</tbody>
</table>
"""


def main() -> int:
    server = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
        env={**os.environ, "PORT": "8000"},
    )
    try:
        wait_for_server(BASE_URL)
        with sync_playwright() as pw:
            results = [capture_profile(pw, p) for p in PROFILES]
        (REPORT_DIR / "mobile-qa-report.html").write_text(render_report(results))
        (REPORT_DIR / "mobile-qa-raw.json").write_text(json.dumps(results, indent=2))
        print(f"Report → {REPORT_DIR / 'mobile-qa-report.html'}")
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
