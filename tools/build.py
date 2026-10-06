#!/usr/bin/env python3
"""
Shorecrest Studio build: photographs, trip data and the route maps.

  python tools/build.py            # process anything new or changed
  python tools/build.py --force    # re-process every photograph
  python tools/build.py --routes   # re-fetch every road route (normally cached)

Reads:
  tools/trips.json            the two trips: stops, stories, photo placement
  tools/photo-notes.json      titles, captions and alt text for the 2019 photographs
  tools/scene-notes.json      captions and alt text for the 45-day photographs (shared with the store)
  tools/us-states.json        state outlines (U.S. Census Bureau, via BLM)
  ../Shorecrest               the 45-day masters and their catalog
  ../road trip 2019           the 2019 photographs

Writes assets/img/photo/*.webp, assets/js/data.js and assets/js/geo.js.
Road routes come from the public OSRM server (OpenStreetMap data) and are cached in tools/.route-cache.json,
so a normal build never touches the network unless a stop changes.

Requires Python 3.9+ with:  pip install pillow numpy
"""
import base64
import io
import json
import math
import sys
import time
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None

SITE = Path(__file__).resolve().parent.parent
MASTER = SITE.parent
TOOLS = SITE / "tools"
IMG = SITE / "assets" / "img" / "photo"
JS = SITE / "assets" / "js"
SRC_45 = MASTER / "Shorecrest"
SRC_2019 = MASTER / "road trip 2019" / "trip 1 - 2019"
CACHE_FILE = TOOLS / ".build-cache.json"
ROUTE_CACHE = TOOLS / ".route-cache.json"

LADDER = [480, 960, 1600, 2400]
OSRM = "https://router.project-osrm.org/route/v1/driving/"
USER_AGENT = "ShorecrestStudioBuild/1.0 (+https://shorecrest.studio)"


# --------------------------------------------------------------------------- photographs
def fresh(out, src):
    return out.exists() and out.stat().st_mtime >= src.stat().st_mtime


def widths_for(native, ladder):
    ws = [w for w in ladder if w < native]
    ws.append(min(native, ladder[-1]))
    return sorted(set(ws))


def fit_width(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def trim_bars(im):
    """The 2019 photos are phone screenshots with black bars. Trim any run of near-black rows/columns at the edges."""
    a = np.asarray(im.convert("L"), dtype=np.int16)
    dark_r = a.max(axis=1) < 14
    dark_c = a.max(axis=0) < 14
    top = int(np.argmax(~dark_r)) if (~dark_r).any() else 0
    bottom = len(dark_r) - int(np.argmax(~dark_r[::-1]))
    left = int(np.argmax(~dark_c)) if (~dark_c).any() else 0
    right = len(dark_c) - int(np.argmax(~dark_c[::-1]))
    pad = 2 if (top or left or bottom < a.shape[0] or right < a.shape[1]) else 0
    box = (left + (pad if left else 0), top + (pad if top else 0),
           right - (pad if right < a.shape[1] else 0), bottom - (pad if bottom < a.shape[0] else 0))
    return im.crop(box) if box != (0, 0, a.shape[1], a.shape[0]) else im


def process(job):
    pid, src, kind, force = job
    src = Path(src)
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    if kind == "shot":
        im = trim_bars(im)
    ws = widths_for(im.width, LADDER)
    for w in ws:
        dest = IMG / f"{pid}-{w}.webp"
        if force or not fresh(dest, src):
            r = fit_width(im, w)
            if kind == "shot":
                q = 80 if w > 480 else 82
                if w <= 480:
                    r = r.filter(ImageFilter.UnsharpMask(radius=0.6, percent=30, threshold=2))
            elif w >= 1600:
                # The masters were sharpened for print; a whisper of smoothing removes pixel noise WebP can't compress.
                r = r.filter(ImageFilter.GaussianBlur(0.6))
                q = 68
            elif w > 480:
                q = 74
            else:
                r = r.filter(ImageFilter.UnsharpMask(radius=0.6, percent=35, threshold=2))
                q = 78
            r.save(dest, "WEBP", quality=q, method=6)
    small = im.copy()
    small.thumbnail((24, 24))
    buf = io.BytesIO()
    small.save(buf, "WEBP", quality=45)
    return {"id": pid, "w": im.width, "h": im.height, "s": ws,
            "c": "#{:02x}{:02x}{:02x}".format(*im.resize((1, 1), Image.BOX).getpixel((0, 0))),
            "q": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()}


def load_sources(trips):
    """Every photograph on the site, with where it came from and what it shows."""
    scenes = []
    for part in ("Catalog1", "Catalog2", "Catalog3"):
        scenes += json.loads((SRC_45 / part / "catalog.json").read_text(encoding="utf-8"))
    scene_notes = json.loads((TOOLS / "scene-notes.json").read_text(encoding="utf-8"))
    notes_2019 = json.loads((TOOLS / "photo-notes.json").read_text(encoding="utf-8"))
    photos = {}
    for s in scenes:
        master = next(a for a in s["assets"] if a["kind"] == "Photo master")
        n = scene_notes.get(s["id"], {})
        photos[s["id"]] = {"src": SRC_45 / "Masters" / Path(master["file"]).name, "kind": "master",
                           "title": s["title"], "place": s["collection"], "line": n.get("line", ""),
                           "alt": n.get("alt", f"{s['title']}, {s['collection']}.")}
    for p in sorted(SRC_2019.glob("*.png")):
        pid = "2019-" + p.stem.lower()
        n = notes_2019.get(pid, {})
        photos[pid] = {"src": p, "kind": "shot", "title": n.get("title", p.stem), "place": n.get("place", ""),
                       "line": n.get("line", ""), "alt": n.get("alt", n.get("title", p.stem))}
    return photos


# --------------------------------------------------------------------------- projection (Albers equal-area conic, centred on the West)
R_EARTH = 6371.0088
PHI1, PHI2, PHI0, LAM0 = math.radians(29.5), math.radians(45.5), math.radians(37.5), math.radians(-108.0)
_N = (math.sin(PHI1) + math.sin(PHI2)) / 2
_C = math.cos(PHI1) ** 2 + 2 * _N * math.sin(PHI1)
_RHO0 = R_EARTH * math.sqrt(_C - 2 * _N * math.sin(PHI0)) / _N


def project(lng, lat):
    """lon/lat in degrees -> x east, y south, in kilometres (screen orientation)."""
    rho = R_EARTH * math.sqrt(_C - 2 * _N * math.sin(math.radians(lat))) / _N
    theta = _N * (math.radians(lng) - LAM0)
    return rho * math.sin(theta), -(_RHO0 - rho * math.cos(theta))


def rdp(pts, eps):
    """Douglas-Peucker on a list of (x, y); keeps the endpoints."""
    if len(pts) < 3:
        return list(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        idx, dmax = -1, 0.0
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm if norm > 1e-12 else math.hypot(px - ax, py - ay)
            if d > dmax:
                idx, dmax = i, d
        if dmax > eps and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def delta_ints(pts, unit):
    """[(x, y)...] -> [x0, y0, dx1, dy1, ...] as integers of `unit` km."""
    out, px, py = [], 0, 0
    for i, (x, y) in enumerate(pts):
        qx, qy = round(x / unit), round(y / unit)
        if i and qx == px and qy == py:
            continue
        out += [qx - px, qy - py] if i else [qx, qy]
        px, py = qx, qy
    return out


# --------------------------------------------------------------------------- road routes
class Router:
    def __init__(self, refetch=False):
        self.cache = {} if refetch or not ROUTE_CACHE.exists() else json.loads(ROUTE_CACHE.read_text(encoding="utf-8"))
        self.used, self.fetched, self.last = set(), 0, 0.0

    def route(self, pts):
        """pts: [(lat, lng), ...] -> (list of (lng, lat), metres)."""
        key = ";".join(f"{lng:.5f},{lat:.5f}" for lat, lng in pts)
        self.used.add(key)
        if key not in self.cache:
            wait = 1.1 - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            url = OSRM + key + "?overview=full&geometries=geojson&continue_straight=false"
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(req, timeout=40) as r:
                        data = json.loads(r.read().decode())
                    break
                except Exception as e:  # network hiccup or rate limit: back off and retry
                    if attempt == 3:
                        raise
                    print(f"    retrying ({e})")
                    time.sleep(3 * (attempt + 1))
            self.last = time.time()
            self.fetched += 1
            if data.get("code") != "Ok":
                raise RuntimeError(f"OSRM could not route {key}: {data.get('code')}")
            rt = data["routes"][0]
            self.cache[key] = {"g": [[round(x, 5), round(y, 5)] for x, y in rt["geometry"]["coordinates"]], "d": round(rt["distance"])}
            ROUTE_CACHE.write_text(json.dumps(self.cache, separators=(",", ":")), encoding="utf-8")
        c = self.cache[key]
        return [tuple(p) for p in c["g"]], c["d"]

    def prune(self):
        stale = [k for k in self.cache if k not in self.used]
        for k in stale:
            del self.cache[k]
        if stale:
            ROUTE_CACHE.write_text(json.dumps(self.cache, separators=(",", ":")), encoding="utf-8")


def pt(p):
    return (p["lat"], p["lng"])


def build_trip_geo(trip, router, eps):
    stops = trip["stops"]
    legs, labels, distances = [None], [], [0]
    prev_end = pt(stops[0])
    xs, ys = [], []
    for st in stops[1:]:
        a_pts = [prev_end] + [pt(v) for v in st.get("via", [])] + [pt(st)]
        geo_a, dist = router.route(a_pts)
        proj_a = rdp([project(*g) for g in geo_a], eps)
        proj = list(proj_a)
        marker_i = len(proj_a) - 1
        if st.get("after"):
            geo_b, dist_b = router.route([pt(st)] + [pt(v) for v in st["after"]])
            proj += rdp([project(*g) for g in geo_b], eps)[1:]
            dist += dist_b
        enc = delta_ints(proj, 0.01)
        legs.append({"p": enc, "m": marker_i, "d": dist})
        distances.append(dist)
        xs += [p[0] for p in proj]
        ys += [p[1] for p in proj]
        prev_end = pt(st["after"][-1]) if st.get("after") else pt(st)
        for v in st.get("via", []) + st.get("after", []):
            if v.get("label"):
                x, y = project(v["lng"], v["lat"])
                labels.append({"n": v["label"], "x": round(x, 2), "y": round(y, 2), "k": "via"})
    for lm in trip.get("landmarks", []):
        x, y = project(lm["lng"], lm["lat"])
        labels.append({"n": lm["name"], "x": round(x, 2), "y": round(y, 2), "k": "peak"})
    markers = []
    for st in stops:
        x, y = project(st["lng"], st["lat"])
        markers.append([round(x, 2), round(y, 2)])
        xs.append(x)
        ys.append(y)
    spots = {}
    for st in stops:
        for ph in st.get("photos", []):
            if isinstance(ph, dict) and ph.get("at"):
                x, y = project(ph["at"][1], ph["at"][0])
                spots[ph["id"]] = [round(x, 2), round(y, 2)]
    bounds = [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]
    return {"color": trip["color"], "bounds": bounds, "legs": legs, "stops": markers, "labels": labels, "spots": spots}, distances


def build_states(eps):
    gj = json.loads((TOOLS / "us-states.json").read_text(encoding="utf-8"))
    out = []
    for f in gj["features"]:
        code = f["properties"].get("code", "")
        if code in ("AK", "HI", "PR"):
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings, best, best_area = [], None, 0
        for poly in polys:
            for k, ring in enumerate(poly):
                proj = [project(x, y) for x, y in ring]
                simp = rdp(proj, eps)
                if len(simp) < 4:
                    continue
                area = 0.5 * sum(simp[i][0] * simp[i - 1][1] - simp[i - 1][0] * simp[i][1] for i in range(len(simp)))
                if k == 0 and abs(area) > best_area:
                    best_area, best = abs(area), simp
                rings.append(delta_ints(simp, 0.1))
        if not rings:
            continue
        # label point: area-weighted centroid of the largest outer ring
        cx = cy = a6 = 0.0
        for i in range(len(best)):
            x0, y0 = best[i - 1]
            x1, y1 = best[i]
            cr = x0 * y1 - x1 * y0
            a6 += cr
            cx += (x0 + x1) * cr
            cy += (y0 + y1) * cr
        a6 *= 3
        out.append({"n": f["properties"]["name"], "c": code, "l": [round(cx / a6, 1), round(cy / a6, 1)], "r": rings})
    return out


def build_graticule():
    lines = []
    for lng in range(-130, -64, 5):
        lines.append(delta_ints([project(lng, lat / 2) for lat in range(48, 103)], 1))
    for lat in range(25, 55, 5):
        lines.append(delta_ints([project(lng / 2, lat) for lng in range(-264, -127)], 1))
    return lines


# --------------------------------------------------------------------------- main
def build_metadata():
    """Rebuild published photo/trip metadata without reprocessing images or roads."""
    cfg = json.loads((TOOLS / "trips.json").read_text(encoding="utf-8"))
    photos = json.loads((TOOLS / "photo-catalog.json").read_text(encoding="utf-8"))
    collections = json.loads((TOOLS / "collections.json").read_text(encoding="utf-8"))
    raw = (JS / "geo.js").read_text(encoding="utf-8")
    geo = json.loads(raw.split("window.ST_GEO=", 1)[1].rstrip().removesuffix(";"))
    by_id = {p["id"]: p for p in photos}
    if len(by_id) != len(photos):
        raise SystemExit("Duplicate photo IDs in photo-catalog.json")
    for collection in collections:
        for pid in collection["photos"]:
            if pid not in by_id:
                raise SystemExit(f"Unknown collection photo {pid}")
    for p in photos:
        p["trip"], p["stop"] = None, None
    rows = []
    for trip in cfg["trips"]:
        g = geo["trips"][trip["id"]]
        if len(g["stops"]) != len(trip["stops"]):
            raise SystemExit("Route stops changed; rebuild routes from the original sources.")
        stops, distances = [], []
        for i, st in enumerate(trip["stops"]):
            x, y = project(st["lng"], st["lat"])
            if [round(x, 2), round(y, 2)] != g["stops"][i]:
                raise SystemExit("Route coordinates changed; rebuild routes from the original sources.")
            dist = g["legs"][i]["d"] if g["legs"][i] else 0
            distances.append(dist)
            ids = []
            for ph in st.get("photos", []):
                pid = ph if isinstance(ph, str) else ph["id"]
                p = by_id[pid]
                p["trip"], p["stop"] = trip["id"], st["id"]
                if isinstance(ph, dict) and ph.get("place"):
                    p["place"] = ph["place"]
                ids.append(pid)
            stops.append({"id": st["id"], "name": st["name"], "region": st.get("region", ""),
                          "stay": st.get("stay", ""), "story": st.get("story", ""), "dist": dist,
                          "distNote": st.get("distanceNote", ""), "photos": ids})
        for pid in trip.get("unpinned", []):
            by_id[pid]["trip"] = trip["id"]
        rows.append({**{k: trip[k] for k in ("id", "page", "name", "title", "subtitle", "story", "color", "cover")},
                     "days": trip.get("days", False), "miles": round(sum(distances) / 1609.344),
                     "stops": stops, "unpinned": trip.get("unpinned", [])})
    (JS / "data.js").write_text(
        "/* Generated by tools/build.py from tools/trips.json, photo-catalog.json and collections.json. */\n"
        "window.ST_PHOTOS=" + json.dumps(photos, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.ST_TRIPS=" + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.ST_COLLECTIONS=" + json.dumps(collections, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print(f"Done: {len(photos)} photographs in {len(collections)} collections; existing roads preserved.")


def main():
    if (TOOLS / "photo-catalog.json").exists() and not any(a in sys.argv for a in ("--force", "--routes")):
        build_metadata()
        return
    force = "--force" in sys.argv
    IMG.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((TOOLS / "trips.json").read_text(encoding="utf-8"))
    trips = cfg["trips"]
    sources = load_sources(trips)

    # which photographs appear, in route order
    order, placement = [], {}
    for trip in trips:
        for si, st in enumerate(trip["stops"]):
            for ph in st.get("photos", []):
                pid = ph if isinstance(ph, str) else ph["id"]
                if pid not in sources:
                    raise SystemExit(f"Unknown photo {pid} at {trip['id']}/{st['id']}")
                order.append(pid)
                placement[pid] = {"trip": trip["id"], "stop": st["id"],
                                  "place": (ph.get("place") if isinstance(ph, dict) else None)}
        for pid in trip.get("unpinned", []):
            order.append(pid)
            placement[pid] = {"trip": trip["id"], "stop": None, "place": None}
    missing = [p for p in sources if p not in placement]
    if missing:
        print("Note: not placed on either trip, so not on the site:", ", ".join(missing))

    # images
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() and not force else {}
    jobs = []
    for pid in order:
        s = sources[pid]
        key = f"{s['src'].stat().st_mtime:.0f}-{s['kind']}-{LADDER[-1]}"
        if force or cache.get(pid, {}).get("_key") != key:
            jobs.append((pid, str(s["src"]), s["kind"], force))
    print(f"Photographs: {len(jobs)} of {len(order)} to process")
    if jobs:
        with ProcessPoolExecutor() as ex:
            for res in ex.map(process, jobs):
                s = sources[res["id"]]
                res["_key"] = f"{s['src'].stat().st_mtime:.0f}-{s['kind']}-{LADDER[-1]}"
                cache[res["id"]] = res
                print("  " + res["id"])
        CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")

    # routes and map
    print("Routes")
    router = Router(refetch="--routes" in sys.argv)
    geo = {"v": 1, "unit": "km", "trips": {}}
    dist_by_trip = {}
    for trip in trips:
        g, dists = build_trip_geo(trip, router, eps=0.05)
        geo["trips"][trip["id"]] = g
        dist_by_trip[trip["id"]] = dists
        pts = sum(len(l["p"]) // 2 for l in g["legs"] if l)
        print(f"  {trip['id']}: {len(trip['stops'])} stops, {sum(dists) / 1609.344:,.0f} miles, {pts:,} route points")
    router.prune()
    if router.fetched:
        print(f"  fetched {router.fetched} new routes from OSRM")
    geo["states"] = build_states(eps=0.35)
    geo["grat"] = build_graticule()
    geo["regions"] = []
    for r in cfg.get("regions", []):
        x, y = project(r["lng"], r["lat"])
        geo["regions"].append({"n": r["name"], "x": round(x, 1), "y": round(y, 1), "r": r.get("rotate", 0), "s": r.get("size", 15)})
    (JS / "geo.js").write_text(
        "/* Generated by tools/build.py. Map geometry in km (Albers equal-area, centred on the West).\n"
        "   Roads: OpenStreetMap contributors via OSRM. State outlines: U.S. Census Bureau. */\n"
        "window.ST_GEO=" + json.dumps(geo, separators=(",", ":")) + ";\n", encoding="utf-8")

    # data for the pages
    photos = []
    for pid in order:
        s, c, pl = sources[pid], cache[pid], placement[pid]
        stop = None
        trip = next(t for t in trips if t["id"] == pl["trip"])
        if pl["stop"]:
            stop = next(st for st in trip["stops"] if st["id"] == pl["stop"])
        place = pl["place"] or s["place"]
        if s["kind"] == "master" and stop and not pl["place"]:
            place = stop["name"] + (", " + stop["region"] if stop.get("region") else "")
        photos.append({"id": pid, "trip": pl["trip"], "stop": pl["stop"], "title": s["title"], "place": place,
                       "line": s["line"], "alt": s["alt"], "w": c["w"], "h": c["h"], "s": c["s"], "c": c["c"], "q": c["q"]})
    trip_rows = []
    for trip in trips:
        dists = dist_by_trip[trip["id"]]
        stops = []
        for i, st in enumerate(trip["stops"]):
            stops.append({"id": st["id"], "name": st["name"], "region": st.get("region", ""), "stay": st.get("stay", ""),
                          "story": st.get("story", ""), "dist": dists[i], "distNote": st.get("distanceNote", ""),
                          "photos": [p if isinstance(p, str) else p["id"] for p in st.get("photos", [])]})
        trip_rows.append({"id": trip["id"], "page": trip["page"], "name": trip["name"], "title": trip["title"],
                          "subtitle": trip["subtitle"], "story": trip["story"], "color": trip["color"], "cover": trip["cover"],
                          "days": trip.get("days", False), "miles": round(sum(dists) / 1609.344),
                          "stops": stops, "unpinned": trip.get("unpinned", [])})
    (JS / "data.js").write_text(
        "/* Generated by tools/build.py from tools/trips.json and the photo notes. Edit those, then rebuild. */\n"
        "window.ST_PHOTOS=" + json.dumps(photos, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.ST_TRIPS=" + json.dumps(trip_rows, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    kb = lambda p: p.stat().st_size / 1024
    print(f"Done: {len(photos)} photographs. data.js {kb(JS / 'data.js'):.0f} KB, geo.js {kb(JS / 'geo.js'):.0f} KB")


if __name__ == "__main__":
    main()
